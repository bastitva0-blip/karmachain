import { keccak256, toBytes } from "viem";

/** RFC 8785-style canonical JSON (sorted keys; numbers/strings via JSON.stringify). Matches the API. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export async function verifyEvidenceHash(evidence: unknown, expected: string): Promise<boolean> {
  return keccak256(toBytes(canonical(evidence))).toLowerCase() === expected.toLowerCase();
}
