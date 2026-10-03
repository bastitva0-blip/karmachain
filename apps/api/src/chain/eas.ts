import {
  decodeEventLog,
  encodeAbiParameters,
  hexToSignature,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { unavailable } from "../lib/errors";
import { log } from "../lib/logger";
import { easAddress, enqueueTx, getRelayer, publicClient, schemaUids } from "./client";
import { relayerPreflight } from "./sbt";

/**
 * EAS v1.2.0 delegated attestations (Base Sepolia predeploy). The attester signs EIP-712
 * typed data in their own wallet; our relayer submits `attestByDelegation` and pays gas.
 * The on-chain attester is the signer's address, which is what gives the review its weight.
 */
export const easAbi = [
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "getNonce", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getAttestTypeHash", stateMutability: "pure", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function",
    name: "attestByDelegation",
    stateMutability: "payable",
    inputs: [
      {
        name: "delegatedRequest",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
          {
            name: "signature",
            type: "tuple",
            components: [
              { name: "v", type: "uint8" },
              { name: "r", type: "bytes32" },
              { name: "s", type: "bytes32" },
            ],
          },
          { name: "attester", type: "address" },
          { name: "deadline", type: "uint64" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "uid", type: "bytes32", indexed: false },
      { name: "schemaUID", type: "bytes32", indexed: true },
    ],
  },
] as const;

/** EAS v1.2.0 Attest type (no attester field). Verified against getAttestTypeHash() on Base Sepolia. */
export const ATTEST_TYPES = {
  Attest: [
    { name: "schema", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "expirationTime", type: "uint64" },
    { name: "revocable", type: "bool" },
    { name: "refUID", type: "bytes32" },
    { name: "data", type: "bytes" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

const ZERO32 = `0x${"0".repeat(64)}` as Hex;

export const encodeClientReview = (v: {
  developer: Address;
  rating: number;
  skillTag: string;
  summary: string;
  transcriptHash: Hex;
}) =>
  encodeAbiParameters(parseAbiParameters("address, uint8, string, string, bytes32"), [
    v.developer,
    v.rating,
    v.skillTag,
    v.summary,
    v.transcriptHash,
  ]);

export const encodeInterviewResult = (v: { candidate: Address; reportHash: Hex; overall: number; role: string }) =>
  encodeAbiParameters(parseAbiParameters("address, bytes32, uint8, string"), [v.candidate, v.reportHash, v.overall, v.role]);

export type SchemaKey = "clientReview" | "interviewResult";

function requireSchema(key: SchemaKey): Hex {
  const uid = schemaUids()[key];
  if (!uid || /^0x0+$/.test(uid)) throw unavailable("eas_schema_missing", "Attestation schemas aren't registered yet.");
  return uid;
}

let versionCache: string | null = null;
async function easVersion() {
  versionCache ??= await publicClient.readContract({ address: easAddress(), abi: easAbi, functionName: "version" });
  return versionCache;
}

/** Typed data the attester's wallet signs (wagmi `signTypedData`). BigInts are sent as strings. */
export async function prepareDelegated(key: SchemaKey, attester: Address, recipient: Address, data: Hex) {
  const schema = requireSchema(key);
  const nonce = await publicClient.readContract({ address: easAddress(), abi: easAbi, functionName: "getNonce", args: [attester] });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60);
  const message = {
    schema,
    recipient,
    expirationTime: 0n,
    revocable: true,
    refUID: ZERO32,
    data,
    value: 0n,
    nonce,
    deadline,
  };
  return {
    domain: { name: "EAS", version: await easVersion(), chainId: baseSepolia.id, verifyingContract: easAddress() },
    types: ATTEST_TYPES,
    primaryType: "Attest" as const,
    message,
  };
}

export type PreparedDelegated = Awaited<ReturnType<typeof prepareDelegated>>;

/** JSON-safe form for the browser. */
export function serializeTyped(p: PreparedDelegated) {
  return JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;
}

export async function submitDelegated(
  key: SchemaKey,
  attester: Address,
  recipient: Address,
  data: Hex,
  deadline: bigint,
  signature: Hex,
): Promise<{ uid: Hex; txHash: Hex }> {
  const schema = requireSchema(key);
  const sig = hexToSignature(signature);
  const v = Number(sig.v ?? BigInt(27 + (sig.yParity ?? 0)));
  return enqueueTx(async () => {
    await relayerPreflight();
    const { account, wallet } = getRelayer();
    const { request } = await publicClient.simulateContract({
      account,
      address: easAddress(),
      abi: easAbi,
      functionName: "attestByDelegation",
      chain: baseSepolia,
      args: [
        {
          schema,
          data: { recipient, expirationTime: 0n, revocable: true, refUID: ZERO32, data, value: 0n },
          signature: { v, r: sig.r, s: sig.s },
          attester,
          deadline,
        },
      ],
    });
    const txHash = await wallet.writeContract(request);
    const rc = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 90_000 });
    if (rc.status !== "success") throw new Error("Attestation transaction reverted");
    for (const l of rc.logs) {
      try {
        const ev = decodeEventLog({ abi: easAbi, data: l.data, topics: l.topics });
        if (ev.eventName === "Attested") {
          log.info("attested", { uid: ev.args.uid, txHash });
          return { uid: ev.args.uid, txHash };
        }
      } catch {
        // not an EAS event
      }
    }
    throw new Error("No Attested event in receipt");
  });
}
