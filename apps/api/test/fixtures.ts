import type { GithubApi } from "../src/analysis/github-client";
import type { RepoSignals, Signals } from "../src/analysis/github-signals";

const NOW = Date.parse("2026-09-01T00:00:00Z");
export const FIXTURE_NOW = NOW;
const daysAgo = (d: number) => new Date(NOW - d * 864e5).toISOString();

export function repo(over: Partial<RepoSignals> = {}): RepoSignals {
  return {
    fullName: "dev/app",
    owner: "dev",
    name: "app",
    url: "https://github.com/dev/app",
    primaryLanguage: "TypeScript",
    languages: { TypeScript: 90_000, CSS: 5_000 },
    sizeKb: 800,
    stars: 3,
    forks: 0,
    createdAt: daysAgo(400),
    pushedAt: daysAgo(20),
    defaultBranch: "main",
    headSha: "a".repeat(40),
    sourceFileCount: 40,
    maxDepth: 3,
    hasTests: false,
    hasCi: false,
    readmeLength: 300,
    license: null,
    lintConfigs: [],
    authoredCommits: 20,
    sampleCandidates: [{ path: "src/index.ts", size: 4000 }],
    ...over,
  };
}

export const emptyAccount: Signals = {
  account: { handle: "newbie", createdAt: daysAgo(10), publicRepos: 0 },
  repos: [],
  externalPrs: [],
  collectedAt: new Date(NOW).toISOString(),
};

export const tinyAccount: Signals = {
  account: { handle: "tiny", createdAt: daysAgo(30), publicRepos: 1 },
  repos: [
    repo({
      fullName: "tiny/hello",
      name: "hello",
      sourceFileCount: 2,
      sizeKb: 5,
      maxDepth: 0,
      authoredCommits: 3,
      readmeLength: 20,
      createdAt: daysAgo(30),
      pushedAt: daysAgo(29),
    }),
  ],
  externalPrs: [],
  collectedAt: new Date(NOW).toISOString(),
};

const strongRepo = (name: string, stars: number) =>
  repo({
    fullName: `pro/${name}`,
    owner: "pro",
    name,
    url: `https://github.com/pro/${name}`,
    languages: { TypeScript: 500_000, JavaScript: 60_000, Shell: 40_000 },
    sizeKb: 9_000,
    stars,
    forks: Math.round(stars / 5),
    createdAt: daysAgo(1200),
    pushedAt: daysAgo(5),
    sourceFileCount: 320,
    maxDepth: 6,
    hasTests: true,
    hasCi: true,
    readmeLength: 6000,
    license: "MIT",
    lintConfigs: ["eslint", "prettier", "tsconfig"],
    authoredCommits: 400,
  });

export const strongAccount: Signals = {
  account: { handle: "pro", createdAt: daysAgo(3000), publicRepos: 40 },
  repos: [strongRepo("framework", 900), strongRepo("cli", 300), strongRepo("plugin", 120)],
  externalPrs: Array.from({ length: 8 }, (_, i) => ({
    repoFullName: `big/oss${i}`,
    url: `https://github.com/big/oss${i}/pull/${i + 1}`,
    title: `Fix ${i}`,
    mergedAt: daysAgo(30 + i),
    targetStars: 20_000,
    targetLanguage: "TypeScript",
  })),
  collectedAt: new Date(NOW).toISOString(),
};

/** Fake GitHub API serving a Signals-shaped account. */
export function fakeGithub(files: Record<string, string> = {}, handle = "fixture"): GithubApi {
  return {
    async get<T>(path: string): Promise<{ data: T; headers: Headers; status: number }> {
      const h = new Headers();
      const ok = (data: unknown) => ({ data: data as T, headers: h, status: 200 });
      if (path === `/users/${handle}`) return ok({ login: handle, created_at: daysAgo(2000), public_repos: 1 });
      if (path === `/users/${handle}/repos`)
        return ok([
          {
            name: "svc",
            full_name: `${handle}/svc`,
            html_url: `https://github.com/${handle}/svc`,
            fork: false,
            owner: { login: handle },
            language: "TypeScript",
            size: 500,
            stargazers_count: 10,
            forks_count: 2,
            created_at: daysAgo(500),
            pushed_at: daysAgo(3),
            default_branch: "main",
            license: { spdx_id: "MIT" },
          },
        ]);
      if (path.endsWith("/languages")) return ok({ TypeScript: 100_000 });
      if (path.endsWith("/commits")) return ok([{ sha: "b".repeat(40) }]);
      if (path.includes("/git/trees/"))
        return ok({
          truncated: false,
          tree: [
            { path: "README.md", type: "blob", size: 2500 },
            { path: ".github/workflows/ci.yml", type: "blob", size: 300 },
            { path: "tsconfig.json", type: "blob", size: 200 },
            { path: "src/evil.ts", type: "blob", size: 5000 },
            { path: "src/a/b/c.ts", type: "blob", size: 1000 },
            { path: "test/a.test.ts", type: "blob", size: 800 },
            { path: "node_modules/x/index.js", type: "blob", size: 99999 },
          ],
        });
      if (path === "/search/issues") return ok({ items: [] });
      throw new Error(`unexpected path ${path}`);
    },
    async getRaw(_o, _r, _ref, path) {
      return files[path] ?? null;
    },
  };
}
