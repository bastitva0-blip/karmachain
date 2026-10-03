import { z } from "zod";

export const HealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  time: z.string(),
  checks: z.record(z.string(), z.object({ ok: z.boolean(), detail: z.string().optional() })).optional(),
});
export type Health = z.infer<typeof HealthSchema>;

export const TierSchema = z.enum(["basic", "medium", "top"]);
export type Tier = z.infer<typeof TierSchema>;

export const MAX_INTERVIEW_MINUTES = 5;

export const TrackSchema = z.enum(["technical", "system_design", "behavioural", "role_specific"]);
export type Track = z.infer<typeof TrackSchema>;

const str = (max: number) => z.string().trim().min(1).max(max);

export const InterviewSettingsSchema = z.object({
  tracks: z.array(TrackSchema).min(1).max(4).default(["technical", "behavioural"]),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  durationMinutes: z.coerce.number().int().min(1).max(MAX_INTERVIEW_MINUTES).default(3),
  customQuestions: z.array(str(300)).max(5).default([]),
  tone: z.enum(["friendly", "neutral", "strict"]).default("friendly"),
});
export type InterviewSettings = z.infer<typeof InterviewSettingsSchema>;

export const JobSpecSchema = z.object({
  title: str(120),
  seniority: z.enum(["junior", "mid", "senior", "lead"]).default("mid"),
  mustHaveSkills: z.array(str(40)).max(10).default([]),
  niceToHave: z.array(str(40)).max(10).default([]),
  minTier: TierSchema.default("basic"),
  softSkills: z.array(str(60)).max(8).default([]),
  domain: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  interview: InterviewSettingsSchema.default({
    tracks: ["technical", "behavioural"],
    difficulty: "medium",
    durationMinutes: 3,
    customQuestions: [],
    tone: "friendly",
  }),
});
export type JobSpec = z.infer<typeof JobSpecSchema>;

export const InterviewerStyleSchema = z.object({
  formality: z.enum(["casual", "neutral", "formal"]).catch("neutral"),
  warmth: z.enum(["low", "medium", "high"]).catch("medium"),
  directness: z.enum(["gentle", "balanced", "blunt"]).catch("balanced"),
  followUpDepth: z.enum(["light", "moderate", "deep"]).catch("moderate"),
  notes: z.string().max(200).catch(""),
});
export type InterviewerStyle = z.infer<typeof InterviewerStyleSchema>;

export const styleToText = (s: InterviewerStyle | null | undefined) =>
  s
    ? `${s.formality} formality, ${s.warmth} warmth, ${s.directness} directness, ${s.followUpDepth} follow-ups.${s.notes ? ` ${s.notes}` : ""}`
    : "Neutral, professional, balanced follow-ups.";

export interface MatchCandidate {
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  isDemo: boolean;
  score: number;
  parts: { similarity: number; tierFit: number; externalValidation: number };
  skills: { skill: string; language: string; tier: Tier; score: number }[];
  reasons: string[];
  reasonsSource: "llm" | "template";
}

export interface ReportQuote {
  text: string;
  t: number;
}
export interface ReportCriterion {
  score: number | null;
  quotes: ReportQuote[];
  note: string;
}
export const CRITERIA = ["technical_depth", "problem_solving", "communication_clarity", "role_fit"] as const;
export type Criterion = (typeof CRITERIA)[number];

export interface InterviewReport {
  scores: Record<Criterion, ReportCriterion>;
  strengths: string[];
  concerns: string[];
  follow_up_questions: string[];
  summary: string;
  overall: number | null;
  droppedQuotes: number;
  disclaimer: string;
  generatedAt: string;
  mode: "voice" | "text";
}

export interface TranscriptTurn {
  role: "agent" | "user";
  message: string;
  t: number;
}
