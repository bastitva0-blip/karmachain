/**
 * Seeds 10 clearly labelled demo profiles (is_demo = true, handle prefix "demo-").
 * Scores are produced by the real scoring code from synthetic repo signals, so evidence is
 * internally consistent. `--mint` also mints the first few to real testnet SBTs.
 *
 *   pnpm --filter @karma/api seed           # DB only
 *   pnpm --filter @karma/api seed --mint    # + mint 3 tokens via the relayer
 */
import { eq, inArray } from "drizzle-orm";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { closeDb, getDb, schema } from "../db/client";
import { buildEvidence, evidenceHash, repoFingerprint } from "../analysis/evidence";
import type { RepoSignals, Signals } from "../analysis/github-signals";
import { scoreLanguages } from "../analysis/scoring";
import { mintAnalysis } from "../chain/mint";
import { refreshProfile } from "../profile";

const DAY = 864e5;
const now = Date.now();
const ago = (d: number) => new Date(now - d * DAY).toISOString();

interface RepoSpec {
  name: string;
  lang: string;
  stars: number;
  files: number;
  tests: boolean;
  ci: boolean;
  commits: number;
  ageDays: number;
  pushedDaysAgo: number;
}

interface Demo {
  handle: string;
  name: string;
  accountAgeDays: number;
  repos: RepoSpec[];
  prs: { lang: string; stars: number; count: number }[];
  strengths: Record<string, string[]>;
  substance: Record<string, number>;
}

const r = (name: string, lang: string, stars: number, files: number, tests: boolean, ci: boolean, commits: number, ageDays: number, pushedDaysAgo: number): RepoSpec => ({
  name,
  lang,
  stars,
  files,
  tests,
  ci,
  commits,
  ageDays,
  pushedDaysAgo,
});

export const DEMOS: Demo[] = [
  {
    handle: "priya-builds",
    name: "Priya Sharma",
    accountAgeDays: 1900,
    repos: [r("fieldnotes", "TypeScript", 640, 280, true, true, 470, 1100, 2), r("sync-kit", "TypeScript", 210, 120, true, true, 230, 700, 9), r("ui-tokens", "TypeScript", 60, 45, true, true, 80, 420, 30), r("notebook-ml", "Python", 75, 70, true, true, 120, 600, 25), r("scrapers", "Python", 20, 30, false, true, 50, 400, 80)],
    prs: [{ lang: "TypeScript", stars: 4_000, count: 12 }, { lang: "Python", stars: 9_000, count: 6 }],
    strengths: { TypeScript: ["Offline-first sync with CRDTs", "Conflict tests replay real logs"], Python: ["Clean notebooks-to-package path"] },
    substance: { TypeScript: 8, Python: 6 },
  },
  {
    handle: "arjun-dev",
    name: "Arjun Mehra",
    accountAgeDays: 2480,
    repos: [r("payments-core", "TypeScript", 520, 260, true, true, 420, 1300, 4), r("webhook-relay", "TypeScript", 140, 80, true, true, 150, 600, 18), r("ledger-py", "Python", 90, 60, true, true, 100, 500, 40)],
    prs: [{ lang: "TypeScript", stars: 25_000, count: 14 }],
    strengths: { TypeScript: ["Idempotent payment flows", "78% of files have tests"], Python: ["Readable data scripts"] },
    substance: { TypeScript: 8, Python: 6 },
  },
  {
    handle: "demo-ananya",
    name: "Ananya Rao (demo)",
    accountAgeDays: 2400,
    repos: [r("ledger-api", "TypeScript", 820, 310, true, true, 520, 900, 3), r("form-kit", "TypeScript", 240, 140, true, true, 210, 600, 12), r("edge-cache", "TypeScript", 95, 60, true, false, 90, 300, 40)],
    prs: [{ lang: "TypeScript", stars: 40_000, count: 6 }],
    strengths: { TypeScript: ["Clear module boundaries", "Typed error handling", "Thorough integration tests"] },
    substance: { TypeScript: 8 },
  },
  {
    handle: "demo-rahul",
    name: "Rahul Verma (demo)",
    accountAgeDays: 1800,
    repos: [r("etl-flow", "Python", 310, 180, true, true, 340, 700, 8), r("ml-serving", "Python", 120, 90, true, true, 160, 400, 20), r("notebook-tools", "Python", 30, 25, false, false, 40, 200, 90)],
    prs: [{ lang: "Python", stars: 25_000, count: 3 }],
    strengths: { Python: ["Idiomatic data pipelines", "Good use of typing"] },
    substance: { Python: 7 },
  },
  {
    handle: "demo-mei",
    name: "Mei Lin (demo)",
    accountAgeDays: 3100,
    repos: [r("raft-kv", "Go", 1400, 260, true, true, 610, 1200, 5), r("grpc-gateway-lite", "Go", 380, 120, true, true, 230, 800, 15), r("tracing-kit", "Go", 150, 70, true, true, 120, 500, 30)],
    prs: [{ lang: "Go", stars: 60_000, count: 9 }],
    strengths: { Go: ["Careful concurrency", "Excellent test coverage", "Readable interfaces"] },
    substance: { Go: 9 },
  },
  {
    handle: "demo-omar",
    name: "Omar Haddad (demo)",
    accountAgeDays: 900,
    repos: [r("tiny-db", "Rust", 60, 70, true, true, 150, 420, 10), r("wasm-img", "Rust", 25, 30, true, false, 60, 200, 45)],
    prs: [{ lang: "Rust", stars: 8_000, count: 1 }],
    strengths: { Rust: ["Safe ownership patterns", "Good error types"] },
    substance: { Rust: 7 },
  },
  {
    handle: "demo-sara",
    name: "Sara Nilsson (demo)",
    accountAgeDays: 500,
    repos: [r("spring-shop", "Java", 8, 80, true, false, 70, 300, 60), r("kata-java", "Java", 1, 15, true, false, 25, 200, 150)],
    prs: [],
    strengths: { Java: ["Consistent structure"] },
    substance: { Java: 5 },
  },
  {
    handle: "demo-kofi",
    name: "Kofi Mensah (demo)",
    accountAgeDays: 1200,
    repos: [r("react-dashboards", "JavaScript", 140, 160, true, true, 260, 700, 7), r("chart-hooks", "TypeScript", 70, 50, true, true, 110, 350, 14), r("css-lab", "JavaScript", 12, 40, false, false, 50, 500, 200)],
    prs: [{ lang: "JavaScript", stars: 90_000, count: 2 }],
    strengths: { JavaScript: ["Accessible components", "Good hooks design"], TypeScript: ["Strict typing"] },
    substance: { JavaScript: 7, TypeScript: 6 },
  },
  {
    handle: "demo-lena",
    name: "Lena Fischer (demo)",
    accountAgeDays: 1000,
    repos: [r("vault-contracts", "Solidity", 90, 45, true, true, 180, 500, 9), r("merkle-drop", "Solidity", 40, 20, true, true, 70, 300, 30)],
    prs: [{ lang: "Solidity", stars: 12_000, count: 2 }],
    strengths: { Solidity: ["Checks-effects-interactions", "Fuzz tests"] },
    substance: { Solidity: 8 },
  },
  {
    handle: "demo-arjun",
    name: "Arjun Mehta (demo)",
    accountAgeDays: 200,
    repos: [r("android-notes", "Kotlin", 3, 30, false, false, 35, 150, 20)],
    prs: [],
    strengths: { Kotlin: ["Simple, readable code"] },
    substance: { Kotlin: 4 },
  },
  {
    handle: "demo-diego",
    name: "Diego Alvarez (demo)",
    accountAgeDays: 2800,
    repos: [r("physics-engine", "C++", 2100, 420, true, true, 800, 1500, 4), r("simd-math", "C++", 600, 110, true, true, 300, 900, 25), r("asset-pipeline", "C++", 180, 90, true, true, 150, 600, 60)],
    prs: [{ lang: "C++", stars: 30_000, count: 5 }],
    strengths: { "C++": ["Cache-aware data layout", "Benchmarks alongside tests"] },
    substance: { "C++": 9 },
  },
  {
    handle: "demo-priya",
    name: "Priya Nair (demo)",
    accountAgeDays: 700,
    repos: [r("design-tokens", "TypeScript", 35, 40, true, true, 90, 400, 11), r("figma-sync", "TypeScript", 15, 25, false, true, 50, 250, 35)],
    prs: [{ lang: "TypeScript", stars: 5_000, count: 1 }],
    strengths: { TypeScript: ["Well-documented APIs"] },
    substance: { TypeScript: 6 },
  },
];

function toRepo(handle: string, s: RepoSpec): RepoSignals {
  return {
    fullName: `${handle}/${s.name}`,
    owner: handle,
    name: s.name,
    url: `https://github.com/${handle}/${s.name}`,
    primaryLanguage: s.lang,
    languages: { [s.lang]: s.files * 3000 },
    sizeKb: s.files * 12,
    stars: s.stars,
    forks: Math.round(s.stars / 6),
    createdAt: ago(s.ageDays),
    pushedAt: ago(s.pushedDaysAgo),
    defaultBranch: "main",
    headSha: keccak256(toBytes(`${handle}/${s.name}`)).slice(2, 42),
    sourceFileCount: s.files,
    maxDepth: Math.min(6, 1 + Math.floor(Math.log2(s.files + 1) / 2)),
    hasTests: s.tests,
    hasCi: s.ci,
    readmeLength: s.stars > 50 ? 4000 : 800,
    license: s.stars > 20 ? "MIT" : null,
    lintConfigs: s.ci ? ["eslint", "prettier"] : [],
    authoredCommits: s.commits,
    sampleCandidates: [],
  };
}

export const demoWallet = (handle: string) => privateKeyToAccount(keccak256(toBytes(`karmachain-demo-wallet:${handle}`))).address;

/** Idempotent: re-seeding replaces demo analyses only. Exported so the API can seed on boot. */
export async function seedDemos({
  mint = false,
  log = console.log,
  onlyMissing = false,
}: { mint?: boolean; log?: (m: string) => void; onlyMissing?: boolean } = {}) {
  const db = await getDb();

  const existing = await db.select({ id: schema.users.id, handle: schema.users.githubHandle }).from(schema.users).where(eq(schema.users.isDemo, true));
  const have = new Set(existing.map((e) => e.handle));
  const todo = onlyMissing ? DEMOS.filter((d) => !have.has(d.handle)) : DEMOS;
  if (!onlyMissing && existing.length) {
    await db.delete(schema.analyses).where(inArray(schema.analyses.userId, existing.map((e) => e.id)));
  }
  if (todo.length === 0) return log("demo seed: nothing missing");

  let minted = 0;
  for (const d of todo) {
    const wallet = demoWallet(d.handle).toLowerCase();
    const [user] = await db
      .insert(schema.users)
      .values({
        githubId: `demo:${d.handle}`,
        githubHandle: d.handle,
        name: d.name,
        avatarUrl: null,
        githubCreatedAt: new Date(now - d.accountAgeDays * DAY),
        walletAddress: wallet,
        consentSearchable: true,
        isDemo: true,
      })
      .onConflictDoUpdate({
        target: schema.users.githubId,
        set: { name: d.name, walletAddress: wallet, consentSearchable: true, isDemo: true, githubCreatedAt: new Date(now - d.accountAgeDays * DAY) },
      })
      .returning();

    const signals: Signals = {
      account: { handle: d.handle, createdAt: ago(d.accountAgeDays), publicRepos: d.repos.length },
      repos: d.repos.map((x) => toRepo(d.handle, x)),
      externalPrs: d.prs.flatMap((p) =>
        Array.from({ length: p.count }, (_, i) => ({
          repoFullName: `oss-${p.lang.toLowerCase().replace(/[^a-z]/g, "")}/project-${i}`,
          url: `https://github.com/oss-${p.lang.toLowerCase().replace(/[^a-z]/g, "")}/project-${i}/pull/${100 + i}`,
          title: `Improve ${p.lang} module ${i}`,
          mergedAt: ago(20 + i * 7),
          targetStars: p.stars,
          targetLanguage: p.lang,
        })),
      ),
      collectedAt: new Date().toISOString(),
    };

    for (const lang of scoreLanguages(signals, d.substance)) {
      const rubric = {
        substance: lang.components.substance,
        strengths: d.strengths[lang.language] ?? [],
        concerns: [],
        files: [],
        llmUnavailable: false,
      };
      const ev = buildEvidence(d.handle, lang, rubric);
      const [a] = await db
        .insert(schema.analyses)
        .values({
          userId: user!.id,
          skill: lang.skill,
          tier: lang.tier,
          score: lang.score,
          source: "github",
          verified: true,
          evidenceJson: ev,
          evidenceHash: evidenceHash(ev),
          repoFingerprint: repoFingerprint(lang),
        })
        .returning();
      if (mint && minted < 3 && lang === scoreLanguages(signals, d.substance)[0]) {
        try {
          const out = await mintAnalysis(user!, a!.id);
          minted++;
          log(`  minted ${d.handle} ${lang.skill}: ${out.status} ${out.txUrl ?? ""}`);
        } catch (err) {
          log(`  mint skipped for ${d.handle}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    const p = await refreshProfile(user!);
    log(`${d.handle}: ${p.embedded ? "embedded" : "no embedding (NVIDIA_EMBED_MODEL unset)"}`);
  }
  log(`Seeded ${todo.length} demo profiles (all labelled "Demo profile").`);
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed.ts");
if (isCli) {
  seedDemos({ mint: process.argv.includes("--mint") })
    .then(() => seedFeed())
    .then(() => closeDb())
    .catch(async (err: unknown) => {
      console.error(err);
      await closeDb();
      process.exit(1);
    });
}

/** Demo feed posts. Proofs are resolved from each demo user's own records, like real posts. */
export async function seedFeed(log: (m: string) => void = console.log) {
  const db = await getDb();
  const [any] = await db.select({ id: schema.posts.id }).from(schema.posts).limit(1);
  if (any) return;
  const { attachableProofs } = await import("../routes/feed");
  const byHandle = async (h: string) => (await db.select().from(schema.users).where(eq(schema.users.githubHandle, h)).limit(1))[0];
  const plan: { handle: string; text: string; kinds: ("pr" | "token")[]; hoursAgo: number; hiring?: boolean }[] = [
    { handle: "priya-builds", text: "Got my offline-sync PR merged into a 4k★ repo. Three lessons: tombstones need TTLs, clocks lie, and tests should replay real conflict logs.", kinds: ["pr", "token"], hoursAgo: 2 },
    { handle: "arjun-dev", text: "Rebuilt a payment webhook pipeline so a double-fire can never double-charge. Unique constraint on the event ID before anything else.", kinds: ["token"], hoursAgo: 4 },
    { handle: "demo-mei", text: "Raft KV store passed 10k randomized partition tests last night. Linearizability checker caught two bugs that unit tests never would.", kinds: ["pr"], hoursAgo: 6 },
    { handle: "demo-kofi", text: "Hiring a frontend engineer who cares about accessibility. TypeScript at Medium or above. #hiring", kinds: [], hoursAgo: 7, hiring: true },
    { handle: "demo-arjun", text: "10x engineer, built 40 startups, DM for collabs.", kinds: [], hoursAgo: 8 },
  ];
  for (const p of plan) {
    const u = await byHandle(p.handle);
    if (!u) continue;
    const proofs = await attachableProofs(u);
    const chosen = p.kinds.map((k) => proofs.find((x) => x.type === k)).filter((x): x is NonNullable<typeof x> => !!x);
    await db.insert(schema.posts).values({
      userId: u.id,
      text: p.text,
      proofs: chosen,
      hiring: !!p.hiring,
      createdAt: new Date(Date.now() - p.hoursAgo * 36e5),
    });
  }
  log("Seeded demo feed posts.");
}
