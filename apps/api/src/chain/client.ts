import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Address,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { deployments, isDeployed } from "@karma/shared";
import { env } from "../env";
import { unavailable } from "../lib/errors";

const transport = () => http(env.RPC_URL, { timeout: 15_000, retryCount: 2, retryDelay: 400 });

export const publicClient = createPublicClient({ chain: baseSepolia, transport: transport() });

let relayer: { account: Account; wallet: WalletClient } | null = null;

export function getRelayer() {
  if (!env.RELAYER_PRIVATE_KEY)
    throw unavailable("relayer_missing", "Minting isn't configured on the server yet.");
  if (!relayer) {
    const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY as `0x${string}`);
    relayer = {
      account,
      wallet: createWalletClient({ account, chain: baseSepolia, transport: transport() }),
    };
  }
  return relayer;
}

export const relayerAddress = (): Address | null =>
  env.RELAYER_PRIVATE_KEY
    ? privateKeyToAccount(env.RELAYER_PRIVATE_KEY as `0x${string}`).address
    : null;

/** Env overrides deployments.json so a redeploy doesn't need a code change. */
export function sbtAddress(): Address | null {
  const a = env.SBT_ADDRESS ?? deployments.sbt;
  return isDeployed(a) ? (a as Address) : null;
}

export function easAddress(): Address {
  return (env.EAS_ADDRESS ?? deployments.eas) as Address;
}

export function schemaUids() {
  return {
    clientReview: (env.EAS_SCHEMA_REVIEW_UID ?? deployments.schemaClientReview) as `0x${string}`,
    interviewResult: (env.EAS_SCHEMA_INTERVIEW_UID ??
      deployments.schemaInterviewResult) as `0x${string}`,
  };
}

/** Serialises relayer transactions so nonces never collide. */
let queue: Promise<unknown> = Promise.resolve();
export function enqueueTx<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

export const txUrl = (hash: string) => `https://sepolia.basescan.org/tx/${hash}`;
