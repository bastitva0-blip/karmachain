import type { InterviewReport, TranscriptTurn } from "@karma/shared";

export interface InterviewView {
  id: string;
  status: "created" | "live" | "processing" | "done" | "failed";
  mode: "voice" | "text";
  candidateHandle: string;
  roleTitle: string;
  maxMinutes: number;
  maxSeconds: number;
  questions: { track: string; text: string }[];
  tone: string;
  transcript: TranscriptTurn[] | null;
  report: InterviewReport | null;
  reportHash: string | null;
  attestationUid: string | null;
  error: string | null;
  createdAt: string;
}

export interface SessionInfo {
  fallback: boolean;
  reason?: string;
  signedUrl?: string;
  dynamicVariables: Record<string, string | number>;
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
