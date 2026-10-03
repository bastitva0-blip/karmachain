import { HttpStatusError } from "../lib/retry";
import { log } from "../lib/logger";
import { type GithubApi, lastPageFromLink } from "./github-client";

export interface RepoFile {
  path: string;
  size: number;
}

export interface RepoSignals {
  fullName: string;
  owner: string;
  name: string;
  url: string;
  primaryLanguage: string | null;
  languages: Record<string, number>;
  sizeKb: number;
  stars: number;
  forks: number;
  createdAt: string;
  pushedAt: string;
  defaultBranch: string;
  headSha: string | null;
  sourceFileCount: number;
  maxDepth: number;
  hasTests: boolean;
  hasCi: boolean;
  readmeLength: number;
  license: string | null;
  lintConfigs: string[];
  authoredCommits: number;
  /** Largest non-generated source files (for LLM sampling). */
  sampleCandidates: RepoFile[];
}

export interface ExternalPr {
  repoFullName: string;
  url: string;
  title: string;
  mergedAt: string | null;
  targetStars: number;
  targetLanguage: string | null;
}

export interface Signals {
  account: { handle: string; createdAt: string | null; publicRepos: number };
  repos: RepoSignals[];
  externalPrs: ExternalPr[];
  collectedAt: string;
}

export type Progress = (step: string) => void;

const MAX_LISTED_REPOS = 30;
const MAX_DEEP_REPOS = 15;
const MAX_PR_REPOS = 15;
const CONCURRENCY = 4;

// ---------------------------------------------------------------- file classification

const GENERATED =
  /(^|\/)(node_modules|vendor|dist|build|out|target|coverage|third_party|\.next|__generated__|generated|venv|\.venv|Pods)\/|\.min\.(js|css)$|\.d\.ts$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock)$|\.pb\.go$|_pb2\.py$/i;

export const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  TypeScript: [".ts", ".tsx", ".mts", ".cts"],
  JavaScript: [".js", ".jsx", ".mjs", ".cjs"],
  Python: [".py"],
  Go: [".go"],
  Rust: [".rs"],
  Java: [".java"],
  Kotlin: [".kt", ".kts"],
  Ruby: [".rb"],
  PHP: [".php"],
  "C#": [".cs"],
  "C++": [".cpp", ".cc", ".cxx", ".hpp", ".hh"],
  C: [".c", ".h"],
  Swift: [".swift"],
  Dart: [".dart"],
  Scala: [".scala"],
  Solidity: [".sol"],
  Vue: [".vue"],
  Svelte: [".svelte"],
  Elixir: [".ex", ".exs"],
  Haskell: [".hs"],
  Lua: [".lua"],
  Shell: [".sh", ".bash"],
};
const ALL_SOURCE_EXT = new Set(Object.values(LANGUAGE_EXTENSIONS).flat());

const ext = (p: string) => {
  const i = p.lastIndexOf(".");
  return i < 0 ? "" : p.slice(i).toLowerCase();
};

export const isGenerated = (p: string) => GENERATED.test(p);
const CONFIG_FILE = /(^|\/)[^/]*\.config\.[cm]?[jt]s$|(^|\/)\.[a-z]+rc\.[cm]?js$/i;
export const isSource = (p: string) => ALL_SOURCE_EXT.has(ext(p)) && !isGenerated(p) && !CONFIG_FILE.test(p);

const TEST_PATH = /(^|\/)(test|tests|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$|_test\.(go|py|rs)$|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt|cs|swift)$/i;
const CI_PATH = /^\.github\/workflows\/[^/]+\.ya?ml$|^\.gitlab-ci\.yml$|^\.circleci\/config\.ya?ml$|^azure-pipelines\.yml$/i;
const LINT_FILES: [RegExp, string][] = [
  [/^(eslint\.config\.[cm]?[jt]s|\.eslintrc(\.[a-z]+)?)$/i, "eslint"],
  [/^biome\.jsonc?$/i, "biome"],
  [/^\.prettierrc(\.[a-z]+)?$|^prettier\.config\.[cm]?js$/i, "prettier"],
  [/^tsconfig(\.[a-z]+)?\.json$/i, "tsconfig"],
  [/^ruff\.toml$|^\.ruff\.toml$/i, "ruff"],
  [/^mypy\.ini$|^\.mypy\.ini$/i, "mypy"],
  [/^\.flake8$/i, "flake8"],
  [/^\.golangci\.ya?ml$/i, "golangci"],
  [/^(rustfmt|\.rustfmt|clippy)\.toml$/i, "rustfmt"],
  [/^\.editorconfig$/i, "editorconfig"],
  [/^\.rubocop\.yml$/i, "rubocop"],
  [/^(checkstyle|detekt)\.xml$|^detekt\.yml$/i, "jvm-lint"],
];

export interface TreeSummary {
  sourceFileCount: number;
  maxDepth: number;
  hasTests: boolean;
  hasCi: boolean;
  readmeLength: number;
  lintConfigs: string[];
  sampleCandidates: RepoFile[];
}

/** Pure: summarise a git tree listing. Exported for tests. */
export function summarizeTree(entries: { path: string; type: string; size?: number }[]): TreeSummary {
  let sourceFileCount = 0;
  let maxDepth = 0;
  let hasTests = false;
  let hasCi = false;
  let readmeLength = 0;
  const lint = new Set<string>();
  const sources: RepoFile[] = [];

  for (const e of entries) {
    if (e.type !== "blob") continue;
    const p = e.path;
    if (isGenerated(p)) continue;
    const depth = p.split("/").length - 1;
    if (TEST_PATH.test(p)) hasTests = true;
    if (CI_PATH.test(p)) hasCi = true;
    if (depth === 0 && /^readme(\.[a-z]+)?$/i.test(p)) readmeLength = Math.max(readmeLength, e.size ?? 0);
    const base = p.split("/").pop()!;
    if (depth <= 1) for (const [re, name] of LINT_FILES) if (re.test(base)) lint.add(name);
    if (isSource(p)) {
      sourceFileCount++;
      maxDepth = Math.max(maxDepth, depth);
      sources.push({ path: p, size: e.size ?? 0 });
    }
  }
  sources.sort((a, b) => b.size - a.size);
  return {
    sourceFileCount,
    maxDepth,
    hasTests,
    hasCi,
    readmeLength,
    lintConfigs: [...lint].sort(),
    // Skip huge files (likely data/generated) and keep a handful per repo.
    sampleCandidates: sources.filter((f) => f.size > 400 && f.size < 200_000).slice(0, 8),
  };
}

// ---------------------------------------------------------------- collection

interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  fork: boolean;
  archived?: boolean;
  owner: { login: string };
  language: string | null;
  size: number;
  stargazers_count: number;
  forks_count: number;
  created_at: string;
  pushed_at: string;
  default_branch: string;
  license: { spdx_id: string | null } | null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

const is409or404 = (e: unknown) => e instanceof HttpStatusError && (e.status === 409 || e.status === 404);

async function deepRepo(gh: GithubApi, r: GhRepo, handle: string): Promise<RepoSignals> {
  const [owner, name] = [r.owner.login, r.name];
  const languages = await gh
    .get<Record<string, number>>(`/repos/${owner}/${name}/languages`)
    .then((x) => x.data)
    .catch(() => ({}));

  let headSha: string | null = null;
  try {
    const c = await gh.get<{ sha: string }[]>(`/repos/${owner}/${name}/commits`, { per_page: 1 });
    headSha = c.data[0]?.sha ?? null;
  } catch (e) {
    if (!is409or404(e)) throw e;
  }

  let authoredCommits = 0;
  if (headSha) {
    try {
      const c = await gh.get<unknown[]>(`/repos/${owner}/${name}/commits`, { author: handle, per_page: 1 });
      authoredCommits = lastPageFromLink(c.headers.get("link")) ?? c.data.length;
    } catch (e) {
      if (!is409or404(e)) throw e;
    }
  }

  let tree: TreeSummary = summarizeTree([]);
  if (headSha) {
    try {
      const t = await gh.get<{ tree: { path: string; type: string; size?: number }[]; truncated: boolean }>(
        `/repos/${owner}/${name}/git/trees/${headSha}`,
        { recursive: 1 },
      );
      tree = summarizeTree(t.data.tree);
    } catch (e) {
      if (!is409or404(e)) throw e;
    }
  }

  return {
    fullName: r.full_name,
    owner,
    name,
    url: r.html_url,
    primaryLanguage: r.language,
    languages,
    sizeKb: r.size,
    stars: r.stargazers_count,
    forks: r.forks_count,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    defaultBranch: r.default_branch,
    headSha,
    license: r.license?.spdx_id && r.license.spdx_id !== "NOASSERTION" ? r.license.spdx_id : null,
    authoredCommits,
    ...tree,
  };
}

export async function collectSignals(gh: GithubApi, handle: string, progress: Progress = () => {}): Promise<Signals> {
  progress("Reading your GitHub profile");
  const acct = await gh.get<{ login: string; created_at: string; public_repos: number }>(`/users/${handle}`);

  progress("Listing public repositories");
  const listed = await gh.get<GhRepo[]>(`/users/${handle}/repos`, {
    type: "owner",
    sort: "pushed",
    per_page: 100,
  });
  const own = listed.data.filter((r) => !r.fork && !r.archived && r.size > 0).slice(0, MAX_LISTED_REPOS);

  // Cheap pre-rank so the deep scan spends its budget on the most meaningful repos.
  const now = Date.now();
  const preScore = (r: GhRepo) =>
    Math.log10(r.stargazers_count + r.forks_count + 1) * 2 +
    Math.log10(r.size + 1) +
    (now - Date.parse(r.pushed_at) < 365 * 864e5 ? 1 : 0);
  const deepList = [...own].sort((a, b) => preScore(b) - preScore(a)).slice(0, MAX_DEEP_REPOS);

  progress(`Analysing ${deepList.length} repositories`);
  let done = 0;
  const repos = await mapLimit(deepList, CONCURRENCY, async (r) => {
    const s = await deepRepo(gh, r, handle);
    done++;
    progress(`Analysed ${done}/${deepList.length}: ${r.name}`);
    return s;
  });

  progress("Checking merged pull requests to other projects");
  const externalPrs: ExternalPr[] = [];
  try {
    const q = `is:pr is:merged author:${handle} -user:${handle}`;
    const search = await gh.get<{
      items: { html_url: string; title: string; repository_url: string; pull_request?: { merged_at: string | null } }[];
    }>("/search/issues", { q, per_page: 50, sort: "updated" });
    const byRepo = new Map<string, typeof search.data.items>();
    for (const it of search.data.items) {
      const full = it.repository_url.replace("https://api.github.com/repos/", "");
      if (!byRepo.has(full)) byRepo.set(full, []);
      byRepo.get(full)!.push(it);
    }
    const targets = [...byRepo.keys()].slice(0, MAX_PR_REPOS);
    const meta = await mapLimit(targets, CONCURRENCY, (full) =>
      gh
        .get<{ stargazers_count: number; language: string | null }>(`/repos/${full}`)
        .then((x) => x.data)
        .catch(() => ({ stargazers_count: 0, language: null })),
    );
    targets.forEach((full, i) => {
      for (const it of byRepo.get(full)!) {
        externalPrs.push({
          repoFullName: full,
          url: it.html_url,
          title: it.title.slice(0, 200),
          mergedAt: it.pull_request?.merged_at ?? null,
          targetStars: meta[i]!.stargazers_count,
          targetLanguage: meta[i]!.language,
        });
      }
    });
  } catch (e) {
    // Search has a tighter rate limit; scoring still works without it.
    log.warn("external PR search failed", { err: e });
  }

  return {
    account: { handle: acct.data.login, createdAt: acct.data.created_at ?? null, publicRepos: acct.data.public_repos },
    repos,
    externalPrs,
    collectedAt: new Date().toISOString(),
  };
}
