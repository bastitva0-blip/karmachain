import { z } from "zod";
import type { CallTool } from "./client";
import { VakhToolError } from "./client";
import { kvGet, kvSet } from "./store";

/**
 * The two Vakh forms KarmaChain owns or creates. Field ids are immutable once saved in Vakh,
 * so treat these as a public schema: add fields, never rename them.
 */

// Stable option ids (Vakh stores the option id, and views group on it).
export const TIER_OPTION = {
  basic: "6a1f2c0e-4b7d-4f61-9e2a-0b5c1d7e3a01",
  medium: "6a1f2c0e-4b7d-4f61-9e2a-0b5c1d7e3a02",
  top: "6a1f2c0e-4b7d-4f61-9e2a-0b5c1d7e3a03",
} as const;

export const STAGE_OPTION = {
  shortlisted: "9c3e1b7a-2d4f-4a8e-8b1c-5f6a7d8e9b01",
  contacted: "9c3e1b7a-2d4f-4a8e-8b1c-5f6a7d8e9b02",
  interviewing: "9c3e1b7a-2d4f-4a8e-8b1c-5f6a7d8e9b03",
  offer: "9c3e1b7a-2d4f-4a8e-8b1c-5f6a7d8e9b04",
  passed: "9c3e1b7a-2d4f-4a8e-8b1c-5f6a7d8e9b05",
} as const;

const view = (v: Record<string, unknown>) => ({ filters: null, sort_by: null, search_fields: [], group_by: null, is_default: false, ...v });
const newestFirst = { system_field: "created_at", dir: "desc" };

/** Public directory of minted, non-revoked proofs, published by KarmaChain's studio account. */
export const PROOFS_FORM = {
  name: "KarmaChain · Verified Developers",
  description:
    "A public directory of developers whose skills were verified from real work, not CVs. KarmaChain reads a developer's public GitHub (repositories and merged pull requests to other people's projects), scores each language out of 100 (90 points from deterministic signals, at most 10 from a bounded AI rubric) and mints a soulbound token (ERC-5192) on Base Sepolia carrying the hash of that evidence. Every post is written by KarmaChain at mint time and links to the token, the evidence (anyone can rehash it) and the profile. Only developers who opted in are listed; revoked proofs and opt-outs are archived automatically. Recruiters shortlisting on KarmaChain get these posts linked from their own Vakh pipeline.",
  fields: [
    { field_id: "developer", name: "Developer", description: "Name and GitHub handle of the verified developer.", type: "string", required: true, metadata: { inputType: "single" } },
    { field_id: "skill", name: "Skill", description: "The language or skill this proof covers. One post per skill.", type: "string", required: true, metadata: { inputType: "single" } },
    {
      field_id: "tier",
      name: "Tier",
      description: "Basic, Medium or Top. Top needs merged pull requests to other people's repositories, not just volume.",
      type: "option",
      required: true,
      metadata: {
        max: 1,
        allowCustom: false,
        displayStyle: "pills",
        showColors: true,
        options: [
          { id: TIER_OPTION.basic, label: "Basic", value: "basic", color: "#8a8f98" },
          { id: TIER_OPTION.medium, label: "Medium", value: "medium", color: "#3b82f6" },
          { id: TIER_OPTION.top, label: "Top", value: "top", color: "#d4a017" },
        ],
      },
    },
    { field_id: "score", name: "Score", description: "KarmaChain score out of 100: 90 points from deterministic GitHub signals, at most 10 from the AI rubric.", type: "number", metadata: { allowDecimal: false, min: 0, max: 100, suffix: "/100" } },
    { field_id: "summary", name: "What the evidence shows", description: "Plain-language summary built only from the stored evidence. No AI writing, nothing invented.", type: "longform" },
    { field_id: "profile", name: "KarmaChain profile", description: "Public profile with every token, attestation and interview result.", type: "url" },
    { field_id: "evidence", name: "Evidence", description: "The exact evidence that was scored. Rehash it in the browser and compare with the hash on the token.", type: "url" },
    { field_id: "token", name: "Soulbound token", description: "Mint transaction of the non-transferable token on Base Sepolia.", type: "url" },
    { field_id: "verified_on", name: "Verified on", description: "Day the proof was minted.", type: "datetime", metadata: { precision: "day" } },
    { field_id: "github", name: "GitHub", description: "The public GitHub profile the evidence was read from.", type: "url" },
  ],
  layout: {
    views: [
      view({ id: "feed", name: "Latest proofs", type: "feed", is_default: true, sort_by: newestFirst, search_fields: ["developer", "skill"], card_fields: ["developer", "skill", "tier", "score", "summary"] }),
      view({ id: "table", name: "Directory", type: "table", sort_by: { field_id: "score", dir: "desc" }, search_fields: ["developer", "skill"], columns: ["developer", "skill", "tier", "score", "verified_on", "profile", "github"] }),
      view({ id: "by_tier", name: "By tier", type: "kanban", group_by: { field_id: "tier" }, search_fields: ["developer", "skill"], card_fields: ["developer", "skill", "score"] }),
      view({
        id: "stats",
        name: "Stats",
        type: "dashboard",
        cards: [
          { id: "total", title: "Verified proofs", metric: { agg: "count" }, group_by: null, filter: null, render: "stat" },
          { id: "avg", title: "Average score", metric: { agg: "avg", field_id: "score" }, group_by: null, filter: null, render: "stat" },
          { id: "tiers", title: "By tier", metric: { agg: "count" }, group_by: { field_id: "tier" }, filter: null, render: "donut" },
          { id: "skills", title: "By skill", metric: { agg: "count" }, group_by: { field_id: "skill" }, filter: null, render: "bar" },
        ],
      }),
    ],
    post: { inline_fields: ["developer", "skill", "tier", "score", "summary"], meta_fields: ["verified_on", "token", "evidence", "profile", "github"] },
    entry: { mode: "sequential", sections: [], conditions: [] },
    submission: {
      rules:
        "Posts here are written by KarmaChain when a soulbound skill token is minted, so please don't post directly. To get listed: sign in to KarmaChain with GitHub, run an analysis, mint your proof and turn on discovery in your dashboard. To leave: turn discovery off or delete your data, and your posts are archived. To check a proof: open Evidence, rehash it and compare with the hash on the token.",
      moderationMode: "manual",
    },
  },
};

/** A recruiter's hiring board, created in the recruiter's own Vakh account. */
export function pipelineForm(proofsFormId: string | null) {
  return {
    name: "KarmaChain Pipeline",
    description:
      "Your hiring board for candidates KarmaChain shortlisted from verified skill proofs. Each card links to the candidate's public proof posts. Move a card to Interviewing and KarmaChain creates an AI voice interview for that role and writes the link back on the card. When the candidate finishes, the report link and score appear here too. Hiring decisions stay with you.",
    fields: [
      { field_id: "candidate", name: "Candidate", description: "Name and GitHub handle. Written by KarmaChain, please don't edit.", type: "string", required: true, metadata: { inputType: "single" } },
      { field_id: "role", name: "Role", description: "The job this candidate was matched to.", type: "string", required: true, metadata: { inputType: "single" } },
      {
        field_id: "stage",
        name: "Stage",
        description: "Move to Interviewing and KarmaChain creates the AI interview for this candidate.",
        type: "option",
        required: true,
        metadata: {
          max: 1,
          allowCustom: false,
          displayStyle: "pills",
          showColors: true,
          options: [
            { id: STAGE_OPTION.shortlisted, label: "Shortlisted", value: "shortlisted", color: "#8a8f98" },
            { id: STAGE_OPTION.contacted, label: "Contacted", value: "contacted", color: "#3b82f6" },
            { id: STAGE_OPTION.interviewing, label: "Interviewing", value: "interviewing", color: "#a855f7" },
            { id: STAGE_OPTION.offer, label: "Offer", value: "offer", color: "#16a34a" },
            { id: STAGE_OPTION.passed, label: "Passed", value: "passed", color: "#ef4444" },
          ],
        },
      },
      { field_id: "match", name: "Match", description: "How well verified skills fit the role: embedding similarity, tier fit and external validation.", type: "number", metadata: { allowDecimal: false, min: 0, max: 100, suffix: "%" } },
      { field_id: "why", name: "Why this match", description: "Reasons that cite the candidate's evidence.", type: "longform" },
      { field_id: "skills", name: "Verified skills", description: "Minted skills and tiers.", type: "string", metadata: { inputType: "single" } },
      ...(proofsFormId
        ? [{ field_id: "proof", name: "Verified proof", description: "The candidate's posts in the public Verified Developers directory.", type: "reference", metadata: { allowedForms: [proofsFormId], max: 5 } }]
        : []),
      { field_id: "profile", name: "KarmaChain profile", description: "Public profile with tokens, attestations and interview results.", type: "url" },
      { field_id: "job_ref", name: "KarmaChain job", description: "The KarmaChain job this card came from. Used to avoid duplicates, please don't edit.", type: "string", metadata: { inputType: "single" } },
      { field_id: "interview", name: "AI interview", description: "Written by KarmaChain when the card reaches Interviewing. Send this link to the candidate.", type: "url" },
      { field_id: "report", name: "Interview report", description: "Written by KarmaChain when the interview is scored. Every score quotes the transcript.", type: "url" },
      { field_id: "karma_status", name: "KarmaChain status", description: "What KarmaChain last did with this card.", type: "string", metadata: { inputType: "single" } },
    ],
    layout: {
      views: [
        view({ id: "board", name: "Pipeline", type: "kanban", is_default: true, group_by: { field_id: "stage" }, search_fields: ["candidate", "role"], card_fields: ["candidate", "role", "match", "skills", "karma_status"] }),
        view({ id: "table", name: "All candidates", type: "table", sort_by: { field_id: "match", dir: "desc" }, search_fields: ["candidate", "role", "skills"], columns: ["candidate", "role", "stage", "match", "skills", "karma_status", "interview", "report", "profile"] }),
        view({
          id: "stats",
          name: "Funnel",
          type: "dashboard",
          cards: [
            { id: "total", title: "Candidates", metric: { agg: "count" }, group_by: null, filter: null, render: "stat" },
            { id: "stages", title: "By stage", metric: { agg: "count" }, group_by: { field_id: "stage" }, filter: null, render: "bar" },
            { id: "avg", title: "Average match", metric: { agg: "avg", field_id: "match" }, group_by: null, filter: null, render: "stat" },
          ],
        }),
      ],
      post: { inline_fields: ["candidate", "role", "stage", "match", "why"], meta_fields: ["skills", "karma_status", "interview", "report", "proof", "profile"] },
      entry: { mode: "sequential", sections: [], conditions: [] },
    },
    accepts_references: proofsFormId ? [proofsFormId] : [],
  };
}

const FormRef = z.object({ id: z.string(), int_id: z.union([z.string(), z.number()]).optional(), archived: z.boolean().optional() });
const SavedFields = z.object({ fields: z.array(z.object({ field_id: z.string() }).passthrough()) });
export type VakhForm = { id: string; sqid?: string };

/** Code fields first (same ids keep their data), then any saved field the code doesn't list. */
function mergeFields(codeFields: unknown, saved: unknown): unknown[] | null {
  if (!Array.isArray(codeFields)) return null;
  const parsed = SavedFields.safeParse(saved);
  if (!parsed.success) return null; // can't see what's saved: leave fields alone
  const ids = new Set(codeFields.map((f: { field_id: string }) => f.field_id));
  return [...codeFields, ...parsed.data.fields.filter((f) => !ids.has(f.field_id))];
}

/**
 * Returns the stored form if it still exists in Vakh (optionally re-applying its definition), otherwise
 * creates it. `seedId` adopts an existing form when nothing is stored yet. Safe to re-run.
 */
export async function ensureForm(
  call: CallTool,
  kvKey: string,
  definition: Record<string, unknown>,
  opts: { syncLayout?: boolean; seedId?: string } = {},
): Promise<string> {
  const saved = await kvGet<{ id: string }>(kvKey);
  const stored = saved ?? (opts.seedId ? { id: opts.seedId } : null);
  if (stored) {
    try {
      const raw = unwrapForm(await call("get_form", { id: stored.id }));
      const got = FormRef.parse(raw);
      if (got.archived) await call("unarchive_form", { id: got.id });
      if (opts.syncLayout) {
        // Name, description, fields and views follow the code. Vakh replaces `fields` wholesale,
        // so saved fields the code no longer lists are carried over unchanged.
        const { name, description, layout, accepts_references } = definition;
        const fields = mergeFields(definition.fields, raw);
        await call("update_form", { id: got.id, name, description, layout, ...(fields ? { fields } : {}), ...(accepts_references ? { accepts_references } : {}) });
      }
      if (!saved) await kvSet(kvKey, { id: got.id });
      return got.id;
    } catch (err) {
      if (!(err instanceof VakhToolError)) throw err;
      // Deleted or no longer readable: fall through and create a fresh one.
    }
  }
  const created = FormRef.parse(unwrapForm(await call("create_form", definition)));
  await kvSet(kvKey, { id: created.id });
  return created.id;
}

/** Tools return either `{ form }` or the form itself. */
export function unwrapForm(raw: unknown): unknown {
  return raw && typeof raw === "object" && "form" in raw ? (raw as { form: unknown }).form : raw;
}
export function unwrapPost(raw: unknown): unknown {
  return raw && typeof raw === "object" && "post" in raw ? (raw as { post: unknown }).post : raw;
}
