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
    "Soulbound skill proofs minted on Base Sepolia by KarmaChain. Each post links to the on-chain token and the evidence it was scored from. Revoked proofs are archived. Only developers who opted in to discovery are listed.",
  fields: [
    { field_id: "developer", name: "Developer", type: "string", required: true, metadata: { inputType: "single" } },
    { field_id: "skill", name: "Skill", type: "string", required: true, metadata: { inputType: "single" } },
    {
      field_id: "tier",
      name: "Tier",
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
    { field_id: "score", name: "Score", type: "number", metadata: { allowDecimal: false, min: 0, max: 100, suffix: "/100" } },
    { field_id: "summary", name: "What the evidence shows", type: "longform" },
    { field_id: "profile", name: "KarmaChain profile", type: "url" },
    { field_id: "evidence", name: "Evidence", type: "url" },
    { field_id: "token", name: "Soulbound token", type: "url" },
    { field_id: "verified_on", name: "Verified on", type: "datetime", metadata: { precision: "day" } },
  ],
  layout: {
    views: [
      view({ id: "feed", name: "Latest proofs", type: "feed", is_default: true, sort_by: newestFirst, search_fields: ["developer", "skill"], card_fields: ["developer", "skill", "tier", "score", "summary"] }),
      view({ id: "table", name: "Directory", type: "table", sort_by: { field_id: "score", dir: "desc" }, search_fields: ["developer", "skill"], columns: ["developer", "skill", "tier", "score", "verified_on", "profile"] }),
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
    post: { inline_fields: ["developer", "skill", "tier", "score", "summary"], meta_fields: ["verified_on", "token", "evidence", "profile"] },
    entry: { mode: "sequential", sections: [], conditions: [] },
    submission: { rules: "Posts here are written by KarmaChain when a soulbound skill token is minted. Please don't post directly.", moderationMode: "manual" },
  },
};

/** A recruiter's hiring board, created in the recruiter's own Vakh account. */
export function pipelineForm(proofsFormId: string | null) {
  return {
    name: "KarmaChain Pipeline",
    description: "Candidates shortlisted from KarmaChain's verified-proof matching. Move cards across stages as you go.",
    fields: [
      { field_id: "candidate", name: "Candidate", type: "string", required: true, metadata: { inputType: "single" } },
      { field_id: "role", name: "Role", type: "string", required: true, metadata: { inputType: "single" } },
      {
        field_id: "stage",
        name: "Stage",
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
      { field_id: "match", name: "Match", type: "number", metadata: { allowDecimal: false, min: 0, max: 100, suffix: "%" } },
      { field_id: "why", name: "Why this match", type: "longform" },
      { field_id: "skills", name: "Verified skills", type: "string", metadata: { inputType: "single" } },
      ...(proofsFormId
        ? [{ field_id: "proof", name: "Verified proof", type: "reference", metadata: { allowedForms: [proofsFormId], max: 5 } }]
        : []),
      { field_id: "profile", name: "KarmaChain profile", type: "url" },
      { field_id: "job_ref", name: "KarmaChain job", type: "string", metadata: { inputType: "single" } },
    ],
    layout: {
      views: [
        view({ id: "board", name: "Pipeline", type: "kanban", is_default: true, group_by: { field_id: "stage" }, search_fields: ["candidate", "role"], card_fields: ["candidate", "role", "match", "skills"] }),
        view({ id: "table", name: "All candidates", type: "table", sort_by: { field_id: "match", dir: "desc" }, search_fields: ["candidate", "role", "skills"], columns: ["candidate", "role", "stage", "match", "skills", "profile"] }),
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
      post: { inline_fields: ["candidate", "role", "stage", "match", "why"], meta_fields: ["skills", "proof", "profile"] },
      entry: { mode: "sequential", sections: [], conditions: [] },
    },
    accepts_references: proofsFormId ? [proofsFormId] : [],
  };
}

const FormRef = z.object({ id: z.string(), int_id: z.union([z.string(), z.number()]).optional(), archived: z.boolean().optional() });
export type VakhForm = { id: string; sqid?: string };

/**
 * Returns the stored form if it still exists in Vakh (optionally re-applying its layout), otherwise creates it.
 * Safe to re-run: the stored id is checked before anything is created.
 */
export async function ensureForm(
  call: CallTool,
  kvKey: string,
  definition: Record<string, unknown>,
  opts: { syncLayout?: boolean } = {},
): Promise<string> {
  const stored = await kvGet<{ id: string }>(kvKey);
  if (stored) {
    try {
      const got = FormRef.parse(unwrapForm(await call("get_form", { id: stored.id })));
      if (got.archived) await call("unarchive_form", { id: got.id });
      if (opts.syncLayout) {
        // Fields stay as saved (ids are immutable); name, description and views follow the code.
        const { name, description, layout } = definition;
        await call("update_form", { id: got.id, name, description, layout });
      }
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
