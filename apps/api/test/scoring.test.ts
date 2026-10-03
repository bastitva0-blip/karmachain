import { describe, expect, it } from "vitest";
import { tierFor } from "@karma/shared";
import { scoreLanguages } from "../src/analysis/scoring";
import { summarizeTree } from "../src/analysis/github-signals";
import { FIXTURE_NOW, emptyAccount, repo, strongAccount, tinyAccount } from "./fixtures";

describe("tiers", () => {
  it("cutoffs", () => {
    expect(tierFor(0)).toBe("basic");
    expect(tierFor(39)).toBe("basic");
    expect(tierFor(40)).toBe("medium");
    expect(tierFor(69)).toBe("medium");
    expect(tierFor(70)).toBe("top");
    expect(tierFor(100)).toBe("top");
  });
});

describe("scoreLanguages", () => {
  it("empty account yields no languages (nothing to mint, Basic at best)", () => {
    expect(scoreLanguages(emptyAccount, {}, FIXTURE_NOW)).toEqual([]);
  });

  it("tiny account is Basic", () => {
    const [ts] = scoreLanguages(tinyAccount, { TypeScript: 10 }, FIXTURE_NOW);
    expect(ts!.tier).toBe("basic");
    expect(ts!.score).toBeLessThan(40);
  });

  it("strong account is Top", () => {
    const [ts] = scoreLanguages(strongAccount, { TypeScript: 8 }, FIXTURE_NOW);
    expect(ts!.language).toBe("TypeScript");
    expect(ts!.tier).toBe("top");
    expect(ts!.score).toBeGreaterThanOrEqual(70);
    expect(ts!.topRepos).toHaveLength(3);
  });

  it("deterministic components never exceed 90 and substance never exceeds 10", () => {
    const [ts] = scoreLanguages(strongAccount, { TypeScript: 999 }, FIXTURE_NOW);
    const c = ts!.components;
    expect(c.complexity + c.hygiene + c.authorship + c.external).toBeLessThanOrEqual(90);
    expect(c.substance).toBe(10);
    expect(ts!.score).toBeLessThanOrEqual(100);
  });

  it("single repo without external PRs is capped below Medium", () => {
    const s = { ...strongAccount, repos: [strongAccount.repos[0]!], externalPrs: [] };
    const [ts] = scoreLanguages(s, { TypeScript: 10 }, FIXTURE_NOW);
    expect(ts!.score).toBe(39);
    expect(ts!.gates.join()).toMatch(/Medium needs/);
  });

  it("brand-new account cannot reach Top", () => {
    const s = { ...strongAccount, account: { ...strongAccount.account, createdAt: new Date(FIXTURE_NOW - 30 * 864e5).toISOString() } };
    const [ts] = scoreLanguages(s, { TypeScript: 10 }, FIXTURE_NOW);
    expect(ts!.tier).toBe("medium");
    expect(ts!.gates.join()).toMatch(/older than/);
  });

  it("groups by primary language", () => {
    const s = {
      ...tinyAccount,
      repos: [repo({ primaryLanguage: "Rust", fullName: "d/r" }), repo({ primaryLanguage: "Go", fullName: "d/g" })],
    };
    const langs = scoreLanguages(s, {}, FIXTURE_NOW).map((r) => r.skill).sort();
    expect(langs).toEqual(["go", "rust"]);
  });
});

describe("summarizeTree", () => {
  it("detects hygiene signals and skips generated code", () => {
    const t = summarizeTree([
      { path: "README.md", type: "blob", size: 1200 },
      { path: ".github/workflows/ci.yml", type: "blob", size: 1 },
      { path: "eslint.config.js", type: "blob", size: 1 },
      { path: "tsconfig.json", type: "blob", size: 1 },
      { path: "src/app.ts", type: "blob", size: 900 },
      { path: "src/app.test.ts", type: "blob", size: 900 },
      { path: "dist/app.js", type: "blob", size: 90000 },
      { path: "node_modules/a/b.js", type: "blob", size: 90000 },
      { path: "pnpm-lock.yaml", type: "blob", size: 90000 },
      { path: "src", type: "tree" },
    ]);
    expect(t).toMatchObject({ hasTests: true, hasCi: true, readmeLength: 1200, sourceFileCount: 2 });
    expect(t.lintConfigs).toEqual(["eslint", "tsconfig"]);
    expect(t.sampleCandidates.map((f) => f.path)).not.toContain("dist/app.js");
  });
});
