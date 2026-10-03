/**
 * Validates the EAS delegated-attestation flow against the real Base Sepolia EAS predeploy,
 * using an anvil fork. Skipped when Foundry is missing or the network is unreachable.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, encodePacked, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

process.env.PATH = `${join(homedir(), ".foundry", "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`;
const hasAnvil = spawnSync("anvil", ["--version"], { shell: true }).status === 0;
const FORK = process.env.EAS_FORK_RPC ?? "https://sepolia.base.org";
const PORT = 18546;
const RPC = `http://127.0.0.1:${PORT}`;
const RELAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const CLIENT_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6";
const DEV = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const REGISTRY = "0x4200000000000000000000000000000000000020";

const regAbi = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ type: "bytes32" }],
  },
] as const;

describe.skipIf(!hasAnvil)("EAS delegated attestation (Base Sepolia fork)", () => {
  let anvil: ChildProcess;
  let ready = false;

  beforeAll(async () => {
    anvil = spawn("anvil", ["--port", String(PORT), "--fork-url", FORK, "--chain-id", "84532", "--silent"], { shell: true });
    const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    for (let i = 0; i < 100 && !ready; i++) {
      try {
        await pc.getBlockNumber();
        ready = true;
      } catch {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }, 60_000);

  afterAll(() => {
    anvil?.kill();
    if (process.platform === "win32" && anvil?.pid) spawnSync("taskkill", ["/pid", String(anvil.pid), "/T", "/F"]);
  });

  it("typed data matches EAS and attestByDelegation succeeds", async (ctx) => {
    if (!ready) ctx.skip();
    const schema = "address developer,uint8 rating,string skillTag,string summary,bytes32 transcriptHash";
    const relayer = privateKeyToAccount(RELAYER_KEY);
    const pc = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
    const wc = createWalletClient({ account: relayer, chain: baseSepolia, transport: http(RPC) });
    // Register (or reuse) the schema on the fork.
    const schemaUid = keccak256(encodePacked(["string", "address", "bool"], [schema, "0x0000000000000000000000000000000000000000", true]));
    try {
      const h = await wc.writeContract({ address: REGISTRY, abi: regAbi, functionName: "register", args: [schema, "0x0000000000000000000000000000000000000000", true] });
      await pc.waitForTransactionReceipt({ hash: h });
    } catch {
      // already registered on Base Sepolia: fine
    }

    const { env } = await import("../src/env");
    Object.assign(env, { RPC_URL: RPC, RELAYER_PRIVATE_KEY: RELAYER_KEY, EAS_SCHEMA_REVIEW_UID: schemaUid, MAX_GAS_PRICE_GWEI: 1000 });
    const { easAbi, encodeClientReview, prepareDelegated, submitDelegated, ATTEST_TYPES } = await import("../src/chain/eas");
    const { easAddress } = await import("../src/chain/client");

    // Our EIP-712 type string must hash to EAS's own ATTEST_TYPEHASH.
    const typeString = `Attest(${ATTEST_TYPES.Attest.map((f) => `${f.type} ${f.name}`).join(",")})`;
    const onchain = await pc.readContract({ address: easAddress(), abi: easAbi, functionName: "getAttestTypeHash" });
    expect(keccak256(toBytes(typeString))).toBe(onchain);

    const client = privateKeyToAccount(CLIENT_KEY);
    const data = encodeClientReview({ developer: DEV, rating: 5, skillTag: "go", summary: "Great to work with.", transcriptHash: keccak256(toBytes("t")) });
    const typed = await prepareDelegated("clientReview", client.address, DEV, data);
    const signature = await client.signTypedData(typed);
    const r = await submitDelegated("clientReview", client.address, DEV, data, typed.message.deadline, signature);
    expect(r.uid).toMatch(/^0x[0-9a-f]{64}$/);

    // A signature over different data must fail.
    const tampered = encodeClientReview({ developer: DEV, rating: 1, skillTag: "go", summary: "Changed.", transcriptHash: keccak256(toBytes("t")) });
    await expect(submitDelegated("clientReview", client.address, DEV, tampered, typed.message.deadline, signature)).rejects.toThrow();
  }, 180_000);
});
