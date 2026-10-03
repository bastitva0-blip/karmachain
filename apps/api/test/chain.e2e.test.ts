/**
 * End-to-end mint flow against a local anvil chain (chainId 84532 so the Base Sepolia
 * client config works unchanged). Skipped when Foundry isn't installed.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const FOUNDRY_BIN = join(homedir(), ".foundry", "bin");
process.env.PATH = `${FOUNDRY_BIN}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
const hasAnvil = spawnSync("anvil", ["--version"], { shell: true }).status === 0;

const PORT = 18545;
const RPC = `http://127.0.0.1:${PORT}`;
// Well-known anvil dev keys (public, test-only).
const RELAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const ADMIN_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const DEV_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9ad4c2a8d2a0f";

const contractsDir = resolve(__dirname, "../../../packages/contracts");
const artifactPath = join(contractsDir, "out/KarmaSBT.sol/KarmaSBT.json");

describe.skipIf(!hasAnvil)("mint pipeline on anvil", () => {
  let anvil: ChildProcess;
  let sbt: Hex;

  beforeAll(async () => {
    if (!existsSync(artifactPath)) spawnSync("forge", ["build"], { cwd: contractsDir, shell: true, stdio: "ignore" });
    anvil = spawn("anvil", ["--port", String(PORT), "--chain-id", "84532", "--silent"], { shell: true });
    const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    for (let i = 0; i < 50; i++) {
      try {
        await pc.getChainId();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown[]; bytecode: { object: Hex } };
    const relayer = privateKeyToAccount(RELAYER_KEY);
    const admin = privateKeyToAccount(ADMIN_KEY);
    const wc = createWalletClient({ account: relayer, chain: baseSepolia, transport: http(RPC) });
    const hash = await wc.deployContract({
      abi: art.abi,
      bytecode: art.bytecode.object,
      args: [admin.address, relayer.address, "http://localhost:3000"],
    });
    const rc = await pc.waitForTransactionReceipt({ hash });
    sbt = rc.contractAddress!;

    // env is parsed once (the setup file already loaded it), so patch the parsed object
    // before any chain module is imported.
    const { env } = await import("../src/env");
    Object.assign(env, { RPC_URL: RPC, SBT_ADDRESS: sbt, RELAYER_PRIVATE_KEY: RELAYER_KEY, MAX_GAS_PRICE_GWEI: 1000 });
  }, 120_000);

  afterAll(() => {
    anvil?.kill();
    if (process.platform === "win32" && anvil?.pid) spawnSync("taskkill", ["/pid", String(anvil.pid), "/T", "/F"]);
  });

  it("login → link wallet → analysis → mint → profile, idempotent", async () => {
    const { getDb, schema } = await import("../src/db/client");
    const { mintAnalysis } = await import("../src/chain/mint");
    const { buildProfile } = await import("../src/profile");
    const { buildEvidence, evidenceHash } = await import("../src/analysis/evidence");
    const { scoreLanguages } = await import("../src/analysis/scoring");
    const { strongAccount, FIXTURE_NOW } = await import("./fixtures");

    const dev = privateKeyToAccount(DEV_KEY);
    const db = await getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ githubId: "e2e-1", githubHandle: "e2edev", walletAddress: dev.address.toLowerCase() })
      .returning();

    const lang = scoreLanguages(strongAccount, { TypeScript: 7 }, FIXTURE_NOW)[0]!;
    const rubric = { substance: 7, strengths: [], concerns: [], files: [], llmUnavailable: false };
    const ev = buildEvidence("e2edev", lang, rubric, "2026-09-01T00:00:00.000Z");
    const hash = evidenceHash(ev);
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
        evidenceHash: hash,
        repoFingerprint: "fp",
      })
      .returning();

    const first = await mintAnalysis(user!, a!.id);
    expect(first.status).toBe("minted");
    expect(first.tokenId).toBe("1");

    const [fresh] = await db.select().from(schema.users).where((await import("drizzle-orm")).eq(schema.users.id, user!.id));
    const again = await mintAnalysis(fresh!, a!.id);
    expect(again.status).toBe("unchanged");

    const profile = await buildProfile(fresh!);
    const skill = profile.skills.find((s) => s.skill === "typescript")!;
    expect(skill.onchain?.tokenId).toBe("1");
    expect(skill.onchain?.hashMatches).toBe(true);
    expect(profile.trustSignals.onchainSkills).toBe(1);

    // Soulbound: owner transfer reverts on-chain.
    const { karmaSbtAbi } = await import("@karma/shared");
    const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    await expect(
      pc.simulateContract({
        account: dev,
        address: sbt,
        abi: karmaSbtAbi,
        functionName: "transferFrom",
        args: [dev.address, "0x000000000000000000000000000000000000dEaD", 1n],
      }),
    ).rejects.toThrow(/Soulbound/);
  }, 120_000);
});
