import { getAddress, type Address } from "viem";
import { EASSCAN, karmaSbtAbi } from "@karma/shared";
import { log } from "../lib/logger";
import { fetchJson } from "../lib/retry";
import { publicClient, sbtAddress, schemaUids } from "./client";

export const EAS_GRAPHQL = `${EASSCAN}/graphql`;

export interface ChainSkill {
  tokenId: string;
  skill: string;
  tier: number;
  score: number;
  evidenceHash: string;
  issuedAt: number;
  updatedAt: number;
}

export interface Attestation {
  uid: string;
  schema: "ClientReview" | "InterviewResult" | "other";
  attester: string;
  recipient: string;
  time: number;
  revoked: boolean;
  txid: string;
  data: Record<string, unknown>;
  url: string;
}

// ---- small TTL cache so profile pages don't hammer the RPC / GraphQL
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
export const invalidateReader = (address: string) => {
  for (const k of cache.keys()) if (k.includes(address.toLowerCase())) cache.delete(k);
};

/** Returns null when the contract isn't deployed or the RPC is unreachable. */
export async function getSkills(address: string): Promise<ChainSkill[] | null> {
  const sbt = sbtAddress();
  if (!sbt) return null;
  const owner = getAddress(address);
  try {
    return await cached(`skills:${owner.toLowerCase()}`, async () => {
      const rows = await publicClient.readContract({
        address: sbt,
        abi: karmaSbtAbi,
        functionName: "getSkills",
        args: [owner],
      });
      return rows.map((r) => ({
        tokenId: String(r.tokenId),
        skill: r.name,
        tier: Number(r.tier),
        score: Number(r.score),
        evidenceHash: r.evidenceHash.toLowerCase(),
        issuedAt: Number(r.issuedAt),
        updatedAt: Number(r.updatedAt),
      }));
    });
  } catch (err) {
    log.warn("getSkills failed", { err });
    return null;
  }
}

interface GqlAttestation {
  id: string;
  attester: string;
  recipient: string;
  schemaId: string;
  decodedDataJson: string;
  time: number;
  revoked: boolean;
  txid: string;
}

function decode(json: string): Record<string, unknown> {
  try {
    const items = JSON.parse(json) as { name: string; value: { value: unknown } }[];
    return Object.fromEntries(
      items.map((i) => {
        const v = i.value?.value;
        // BigNumber-ish values come back as {type, hex}
        if (v && typeof v === "object" && "hex" in v) return [i.name, Number(BigInt((v as { hex: string }).hex))];
        return [i.name, v];
      }),
    );
  } catch {
    return {};
  }
}

/** Our schema attestations for a recipient, via the public EAS GraphQL API. */
export async function getAttestations(address: string): Promise<Attestation[] | null> {
  const { clientReview, interviewResult } = schemaUids();
  const schemas = [clientReview, interviewResult].filter((s) => s && !/^0x0+$/.test(s));
  if (schemas.length === 0) return [];
  const recipient = getAddress(address);
  try {
    return await cached(`att:${recipient.toLowerCase()}`, async () => {
      const res = await fetchJson<{ data?: { attestations: GqlAttestation[] }; errors?: unknown }>(EAS_GRAPHQL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        timeoutMs: 10_000,
        body: JSON.stringify({
          query: `query A($recipient: String!, $schemas: [String!]) {
            attestations(where: { recipient: { equals: $recipient }, schemaId: { in: $schemas } }, orderBy: [{ time: desc }], take: 50) {
              id attester recipient schemaId decodedDataJson time revoked txid
            }
          }`,
          variables: { recipient, schemas },
        }),
      });
      if (!res.data) throw new Error("EAS GraphQL returned no data");
      return res.data.attestations.map((a) => ({
        uid: a.id,
        schema:
          a.schemaId.toLowerCase() === clientReview.toLowerCase()
            ? "ClientReview"
            : a.schemaId.toLowerCase() === interviewResult.toLowerCase()
              ? "InterviewResult"
              : "other",
        attester: a.attester,
        recipient: a.recipient,
        time: a.time,
        revoked: a.revoked,
        txid: a.txid,
        data: decode(a.decodedDataJson),
        url: `${EASSCAN}/attestation/view/${a.id}`,
      }));
    });
  } catch (err) {
    log.warn("getAttestations failed", { err });
    return null;
  }
}

/** Number of transactions sent by an address; used to flag fresh reviewer wallets. */
export async function walletTxCount(address: Address): Promise<number | null> {
  try {
    return await cached(`txc:${address.toLowerCase()}`, () => publicClient.getTransactionCount({ address }));
  } catch {
    return null;
  }
}
