import { z } from "zod";
import { chatJson, llmConfigured } from "../llm/client";
import { dataBlock } from "../llm/json";
import { PROFILE_BRIEF_SYSTEM, TRUST_SUMMARY_SYSTEM } from "../llm/prompts";
import { log } from "../lib/logger";
import { buildProfile, findUserByHandleOrAddress, type Profile } from "../profile";

/** Accepts "octocat", "@octocat", "github.com/octocat", "https://github.com/octocat/". */
export function normalizeHandle(input: string): string | null {
  const s = input.trim().replace(/^@/, "");
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})\/?$/i.exec(s);
  const h = m ? m[1]! : s;
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(h) ? h : null;
}

export interface TrustData {
  found: true;
  handle: string;
  demo_profile: boolean;
  wallet: string | null;
  skills: { skill: string; tier: string; score: number; on_chain: boolean }[];
  attestations: { client_reviews: number; interview_results: number };
  external_merged_prs: number;
  account_age_days: number | null;
  caveats: string[];
}

export function compactTrust(p: Profile): TrustData {
  const caveats: string[] = [];
  if (p.user.isDemo) caveats.push("demo profile with seeded data");
  if (p.trustSignals.attestationCount === 0) caveats.push("no attestations yet");
  if (p.trustSignals.externalMergedPrs === 0) caveats.push("no merged pull requests to other projects found");
  if (!p.skills.some((s) => s.onchain)) caveats.push("no skills minted on-chain yet");
  return {
    found: true,
    handle: p.user.githubHandle,
    demo_profile: p.user.isDemo,
    wallet: p.user.walletAddress,
    skills: p.skills.slice(0, 6).map((s) => ({ skill: s.language, tier: s.tier, score: s.score, on_chain: !!s.onchain })),
    attestations: { client_reviews: p.trustSignals.reviewCount, interview_results: p.trustSignals.interviewCount },
    external_merged_prs: p.trustSignals.externalMergedPrs,
    account_age_days: p.trustSignals.accountAgeDays,
    caveats,
  };
}

/** Deterministic fallback; also the ground truth the LLM version must not contradict. */
export function templateTrustSummary(d: TrustData): string {
  const onchain = d.skills.filter((s) => s.on_chain);
  const skills = (onchain.length ? onchain : d.skills)
    .slice(0, 3)
    .map((s) => `${s.skill} at ${s.tier} tier`)
    .join(", ");
  const s1 = skills
    ? `@${d.handle} has ${onchain.length ? "verified on-chain" : "analysed but not yet minted"} skills: ${skills}.`
    : `@${d.handle} has no verified skills yet.`;
  const att = d.attestations.client_reviews + d.attestations.interview_results;
  const s2 = `${att === 0 ? "No" : att} attestation${att === 1 ? "" : "s"} and ${d.external_merged_prs} merged pull request${d.external_merged_prs === 1 ? "" : "s"} to other projects.`;
  const s3 = d.demo_profile ? "Note: this is a demo profile." : "Verified work is not a guarantee of character.";
  return `${s1} ${s2} ${s3}`;
}

const SpokenSchema = z.object({ spoken_summary: z.string().min(10).max(500) });

export async function spokenTrustSummary(d: TrustData): Promise<string> {
  if (!llmConfigured()) return templateTrustSummary(d);
  try {
    const r = await chatJson(
      SpokenSchema,
      [
        { role: "system", content: TRUST_SUMMARY_SYSTEM },
        { role: "user", content: dataBlock("trust_data", JSON.stringify(d)) },
      ],
      { maxTokens: 200, timeoutMs: 15_000, retries: 0 },
    );
    // Guard: every number spoken must exist in the data.
    const allowed = new Set(JSON.stringify(d).match(/\d+/g) ?? []);
    if ((r.spoken_summary.match(/\d+/g) ?? []).some((n) => !allowed.has(n))) return templateTrustSummary(d);
    return r.spoken_summary;
  } catch (err) {
    log.warn("trust summary llm failed", { err });
    return templateTrustSummary(d);
  }
}

export async function getDeveloperTrust(handleInput: string): Promise<(TrustData & { spoken_summary: string }) | { found: false; spoken_summary: string }> {
  const handle = normalizeHandle(handleInput);
  const user = handle ? await findUserByHandleOrAddress(handle) : null;
  if (!user) return { found: false, spoken_summary: "I couldn't find that profile on KarmaChain." };
  const data = compactTrust(await buildProfile(user));
  return { ...data, spoken_summary: await spokenTrustSummary(data) };
}

const BriefSchema = z.object({ text: z.string().min(10).max(600) });

export function templateBrief(p: Profile): string {
  const top = p.skills.slice(0, 3);
  if (!top.length) return `@${p.user.githubHandle} has not verified any skills yet.`;
  const first = top[0]!;
  const repo = first.topRepos[0]?.fullName.split("/")[1];
  return `@${p.user.githubHandle}. Top skill: ${first.language}, ${first.tier} tier with a score of ${first.score}.${
    top.length > 1 ? ` Also ${top.slice(1).map((s) => `${s.language} at ${s.tier}`).join(" and ")}.` : ""
  }${repo ? ` Key evidence: the ${repo} project.` : ""} ${p.trustSignals.attestationCount} attestation${p.trustSignals.attestationCount === 1 ? "" : "s"} on record.${
    p.user.isDemo ? " This is a demo profile." : ""
  }`;
}

export async function profileBriefText(p: Profile): Promise<string> {
  if (!llmConfigured()) return templateBrief(p);
  try {
    const data = { ...compactTrust(p), top_repos: p.skills.slice(0, 2).map((s) => s.topRepos[0]?.fullName).filter(Boolean) };
    const r = await chatJson(
      BriefSchema,
      [
        { role: "system", content: PROFILE_BRIEF_SYSTEM },
        { role: "user", content: dataBlock("profile_data", JSON.stringify(data)) },
      ],
      { maxTokens: 200, timeoutMs: 15_000, retries: 0 },
    );
    return r.text;
  } catch {
    return templateBrief(p);
  }
}
