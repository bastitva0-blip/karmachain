import { decodeEventLog, formatEther, keccak256, parseEther, parseGwei, toBytes, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { TIER_NUM, karmaSbtAbi, type Tier } from "@karma/shared";
import { env } from "../env";
import { unavailable } from "../lib/errors";
import { log } from "../lib/logger";
import { enqueueTx, getRelayer, publicClient, sbtAddress } from "./client";

// Base Sepolia gas is ~0.006 gwei: a mint costs ~0.000002 ETH, so 0.00002 leaves room for ~10.
export const MIN_RELAYER_BALANCE = parseEther(process.env.MIN_RELAYER_BALANCE_ETH ?? "0.00002");

export class RelayerLowBalanceError extends Error {
  constructor(public readonly balance: string) {
    super(`Relayer balance is low (${balance} ETH). Minting is paused until it's topped up.`);
  }
}

export function requireSbt(): Address {
  const a = sbtAddress();
  if (!a) throw unavailable("sbt_not_deployed", "The KarmaSBT contract isn't deployed yet.");
  return a;
}

export interface MintResult {
  tokenId: string;
  txHash: Hex;
  action: "minted" | "updated";
}

/** Safety checks before spending relayer gas. */
export async function relayerPreflight() {
  const { account } = getRelayer();
  const [balance, gasPrice] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
    publicClient.getGasPrice(),
  ]);
  if (balance < MIN_RELAYER_BALANCE) throw new RelayerLowBalanceError(formatEther(balance));
  if (gasPrice > parseGwei(String(env.MAX_GAS_PRICE_GWEI))) {
    throw unavailable("gas_too_high", "Network gas price is unusually high. Please retry in a few minutes.");
  }
  return { balance, gasPrice };
}

export async function onchainTokenFor(owner: Address, skill: string) {
  const sbt = requireSbt();
  const skillId = keccak256(toBytes(skill));
  const tokenId = await publicClient.readContract({
    address: sbt,
    abi: karmaSbtAbi,
    functionName: "tokenOf",
    args: [owner, skillId],
  });
  if (tokenId === 0n) return null;
  const s = await publicClient.readContract({ address: sbt, abi: karmaSbtAbi, functionName: "skills", args: [tokenId] });
  // skills() returns [skillId, tier, score, evidenceHash, issuedAt, updatedAt]
  return { tokenId, tier: Number(s[1]), score: Number(s[2]), evidenceHash: s[3] };
}

export async function mintOrUpdate(
  to: Address,
  skill: string,
  tier: Tier,
  score: number,
  evidenceHash: Hex,
): Promise<MintResult> {
  const sbt = requireSbt();
  return enqueueTx(async () => {
    await relayerPreflight();
    const { account, wallet } = getRelayer();
    const { request } = await publicClient.simulateContract({
      account,
      address: sbt,
      abi: karmaSbtAbi,
      functionName: "mintOrUpdate",
      args: [to, skill, TIER_NUM[tier], score, evidenceHash],
      chain: baseSepolia,
    });
    const txHash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`Mint transaction reverted: ${txHash}`);

    for (const l of receipt.logs) {
      if (l.address.toLowerCase() !== sbt.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: karmaSbtAbi, data: l.data, topics: l.topics });
        if (ev.eventName === "SkillMinted" || ev.eventName === "SkillUpdated") {
          const tokenId = String(ev.args.tokenId);
          log.info("sbt tx", { action: ev.eventName, tokenId, txHash });
          return { tokenId, txHash, action: ev.eventName === "SkillMinted" ? "minted" : "updated" };
        }
      } catch {
        // other events (Transfer, Locked) — ignore
      }
    }
    throw new Error("Mint succeeded but no SkillMinted/SkillUpdated event was found");
  });
}
