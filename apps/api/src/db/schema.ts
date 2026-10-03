import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  githubId: text("github_id").notNull().unique(),
  githubHandle: text("github_handle").notNull(),
  avatarUrl: text("avatar_url"),
  name: text("name"),
  githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
  walletAddress: text("wallet_address").unique(), // lowercase hex
  consentSearchable: boolean("consent_searchable").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_handle_lower").on(sql`lower(${t.githubHandle})`)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256(cookie value)
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  encGithubToken: text("enc_github_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const walletNonces = pgTable("wallet_nonces", {
  nonce: text("nonce").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
});

export type Tier = "basic" | "medium" | "top";

export const analyses = pgTable(
  "analyses",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skill: text("skill").notNull(),
    tier: text("tier").$type<Tier>().notNull(),
    score: integer("score").notNull(),
    source: text("source").$type<"github" | "zip" | "portfolio">().notNull(),
    verified: boolean("verified").notNull(),
    evidenceJson: jsonb("evidence_json").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    repoFingerprint: text("repo_fingerprint").notNull(),
    tokenId: text("token_id"),
    mintTx: text("mint_tx"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    index("analyses_cache").on(t.userId, t.skill, t.repoFingerprint),
    index("analyses_hash").on(t.evidenceHash),
  ],
);

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  skillsJson: jsonb("skills_json").notNull(),
  embedding: jsonb("embedding").$type<number[] | null>(),
  externalValidation: real("external_validation").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobSpecs = pgTable("job_specs", {
  id: id(),
  sessionId: text("session_id").notNull(), // recruiter chat session id
  // Anonymous recruiter identity (random key kept in the recruiter's browser) for /recruiter/interviews.
  recruiterKey: text("recruiter_key"),
  specJson: jsonb("spec_json").notNull(),
  styleJson: jsonb("style_json"),
  createdAt: createdAt(),
});

export const interviews = pgTable("interviews", {
  id: id(),
  jobSpecId: text("job_spec_id")
    .notNull()
    .references(() => jobSpecs.id, { onDelete: "cascade" }),
  candidateUserId: text("candidate_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id"),
  mode: text("mode").$type<"voice" | "text">().notNull().default("voice"),
  status: text("status")
    .$type<"created" | "live" | "processing" | "done" | "failed">()
    .notNull()
    .default("created"),
  planJson: jsonb("plan_json").notNull(),
  transcriptJson: jsonb("transcript_json"),
  reportJson: jsonb("report_json"),
  reportHash: text("report_hash"),
  attestationUid: text("attestation_uid"),
  error: text("error"),
  createdAt: createdAt(),
});

export const testimonials = pgTable("testimonials", {
  id: id(),
  devUserId: text("dev_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  clientAddress: text("client_address").notNull(),
  audioTranscript: text("audio_transcript").notNull(),
  structuredJson: jsonb("structured_json").notNull(),
  attestationUid: text("attestation_uid"),
  createdAt: createdAt(),
});

export const ingestions = pgTable("ingestions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"url" | "pdf" | "zip">().notNull(),
  source: text("source").notNull(),
  verifyCode: text("verify_code").notNull(),
  verified: boolean("verified").notNull().default(false),
  extractedJson: jsonb("extracted_json"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- proof feed

export type FeedProof =
  | { type: "token"; ref: string; label: string; detail: string; url: string | null }
  | { type: "pr"; ref: string; label: string; detail: string; url: string }
  | { type: "review"; ref: string; label: string; detail: string; url: string }
  | { type: "interview"; ref: string; label: string; detail: string; url: string | null };

export const posts = pgTable(
  "posts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    proofs: jsonb("proofs").$type<FeedProof[]>().notNull().default([]),
    parentId: text("parent_id"), // reply to
    repostOf: text("repost_of"),
    hiring: boolean("hiring").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("posts_created").on(t.createdAt), index("posts_parent").on(t.parentId)],
);

export const endorsements = pgTable(
  "endorsements",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    signature: text("signature").notNull(),
    weight: real("weight").notNull(),
    endorserTier: text("endorser_tier").$type<Tier | "none">().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("endorse_once").on(t.postId, t.userId)],
);

// ---------------------------------------------------------------- admin flags

export const flags = pgTable("flags", {
  id: id(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  analysisId: text("analysis_id").references(() => analyses.id, { onDelete: "set null" }),
  tokenId: text("token_id"),
  signal: text("signal").notNull(),
  details: jsonb("details").$type<string[]>().notNull().default([]),
  source: text("source").$type<"system" | "report">().notNull(),
  status: text("status").$type<"open" | "dismissed" | "revoked">().notNull().default("open"),
  reason: text("reason"),
  revokeTx: text("revoke_tx"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
