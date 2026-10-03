import type { Hex } from "viem";

export interface ServerTypedData {
  domain: { name: string; version: string; chainId: number; verifyingContract: Hex };
  types: Record<string, { name: string; type: string }[]>;
  primaryType: "Attest";
  message: Record<string, unknown>;
}

const BIGINT_FIELDS = ["expirationTime", "value", "nonce", "deadline"];

/** The API sends bigints as strings; wagmi's signTypedData wants bigints back. */
export function reviveTyped(t: ServerTypedData) {
  const message = { ...t.message };
  for (const k of BIGINT_FIELDS) if (typeof message[k] === "string") message[k] = BigInt(message[k] as string);
  return { domain: t.domain, types: t.types, primaryType: t.primaryType, message };
}
