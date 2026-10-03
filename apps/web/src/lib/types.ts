import type { Tier } from "@karma/shared";

export interface Me {
  id: string;
  githubHandle: string;
  name: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  consentSearchable: boolean;
  isDemo: boolean;
}

export interface AnalysisSummary {
  id: string;
  skill: string;
  language: string;
  tier: Tier;
  score: number;
  evidenceHash: string;
  cached: boolean;
  tokenId: string | null;
  mintTx: string | null;
  source?: string;
  verified?: boolean;
}

export interface Job {
  id: string;
  status: "running" | "done" | "failed";
  steps: { label: string; at: string }[];
  results: AnalysisSummary[];
  error: string | null;
}

export interface MintOutcome {
  status: "minted" | "updated" | "unchanged" | "kept_higher";
  tokenId: string | null;
  txHash: string | null;
  txUrl: string | null;
  message: string;
}

export interface Components {
  complexity: number;
  hygiene: number;
  authorship: number;
  external: number;
  substance: number;
}

export interface ProfileSkill {
  skill: string;
  language: string;
  tier: Tier;
  score: number;
  evidenceHash: string;
  evidenceUrl: string;
  verified: boolean;
  source: string;
  onchain: { tokenId: string; tier: Tier; score: number; hashMatches: boolean; txUrl: string | null; updatedAt: number } | null;
  components: Components | null;
  topRepos: { fullName: string; url: string; commitSha: string | null; stars: number; hasTests: boolean; hasCi: boolean; sourceFiles: number }[];
  mergedExternalPrs: number;
}

export interface Attestation {
  uid: string;
  schema: "ClientReview" | "InterviewResult" | "other";
  attester: string;
  recipient: string;
  time: number;
  revoked: boolean;
  txid: string;
  data: Record<string, unknown>;
  url: string;
  freshAttester?: boolean;
}

export interface Profile {
  user: { githubHandle: string; name: string | null; avatarUrl: string | null; walletAddress: string | null; isDemo: boolean; githubUrl: string | null };
  skills: ProfileSkill[];
  attestations: Attestation[];
  trustSignals: {
    externalMergedPrs: number;
    attestationCount: number;
    reviewCount: number;
    interviewCount: number;
    tierDistribution: Record<Tier, number>;
    accountAgeDays: number | null;
    onchainSkills: number;
    isDemo: boolean;
    chainAvailable: boolean;
  };
  attestationsAvailable: boolean;
}
