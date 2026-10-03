# Architecture

```mermaid
flowchart LR
  subgraph Browser
    W[Next.js web<br/>wagmi · RainbowKit · ElevenLabs React]
  end

  subgraph Railway
    WEB[web service<br/>Next.js, rewrites /api/* → api]
    API[api service<br/>Hono + zod]
    DB[(Postgres<br/>Neon / Supabase<br/>Drizzle)]
  end

  subgraph External
    GH[GitHub REST<br/>read:user token]
    NV[NVIDIA API<br/>LLM + embeddings]
    EL[ElevenLabs<br/>Agents · Scribe · TTS]
    RPC[Base Sepolia RPC]
    SBT[[KarmaSBT<br/>ERC-5192]]
    EAS[[EAS predeploy<br/>ClientReview · InterviewResult]]
    GQL[EAS GraphQL<br/>easscan]
  end

  W -- same-origin /api/* --> WEB --> API
  W -- signed URL + dynamic vars --> EL
  EL -- server tool get_developer_trust<br/>X-Karma-Tool-Secret --> API
  API --> DB
  API --> GH
  API --> NV
  API -- signed URL, transcripts, TTS, STT --> EL
  API -- relayer: mintOrUpdate / attestByDelegation --> RPC
  RPC --- SBT
  RPC --- EAS
  API -- getSkills --> RPC
  API -- attestations by recipient --> GQL
  W -- EIP-191 link / EIP-712 attest signatures --> W
```

## Pipeline

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant Web
  participant API
  participant GH as GitHub
  participant LLM as NVIDIA LLM
  participant Chain as Base Sepolia

  Dev->>Web: Sign in with GitHub
  Web->>API: /auth/github → callback (state check)
  Dev->>Web: Sign link message (EIP-191)
  Web->>API: /wallet/link (nonce single-use, 5 min)
  Dev->>Web: Analyse
  API->>GH: repos, languages, trees, authored commits, merged external PRs
  API->>API: deterministic score (90 pts) + gates
  API->>LLM: 3 sampled files in <untrusted_code> (≤10 pts, zod, clamped)
  API->>API: canonical evidence JSON → keccak256
  Dev->>Web: Mint
  API->>Chain: mintOrUpdate(to, skill, tier, score, evidenceHash) (relayer pays)
  Web->>API: /profile/:handle → SBT.getSkills + EAS GraphQL
```

## Key decisions

- **Scoring is mostly deterministic.** Complexity 25, hygiene 25, authorship 20, external validation 20, and a bounded LLM substance rubric of 10. Prompt injection in code can move a score by 10 points at most, and a test proves it (`apps/api/test/analysis.test.ts`).
- **Evidence is content-addressed.** The evidence JSON is canonicalised (RFC 8785) and hashed with keccak256. The hash is stored in the token; `GET /evidence/:hash` serves the JSON; the profile page rehashes it in the browser.
- **Soulbound, but revocable.** `KarmaSBT` blocks every transfer and approval, allows one token per (owner, skill), lets the minter raise or refresh it, and lets the admin revoke (burn) on fraud. Admin and minter are different keys.
- **Attestations use EAS delegation.** Clients and candidates sign EIP-712 typed data in their own wallet. The relayer submits `attestByDelegation`, so the attester recorded on-chain is the signer, not us. The API rebuilds the attestation data server-side, so a signature can only cover what we submit.
- **Voice is driven by dynamic variables.** One private ElevenLabs agent; the API returns a signed URL plus `question_plan`, `tone`, `interviewer_style`, etc. No per-call overrides.
- **Reports quote the transcript.** Every quote the evaluator returns is checked as a substring of a candidate turn. Unverifiable quotes are dropped, and a criterion without quotes loses its score. No personality, accent or tone scores.
- **Everything degrades.** No DB URL → embedded PGlite. No NVIDIA → template plans, template match reasons, deterministic text interviewer. No ElevenLabs → text interview + browser speech. No chain → profile still shows analyses, labelled not minted.
- **Vectors without pgvector.** Fewer than 200 profiles, so embeddings live in `jsonb` and cosine runs in TypeScript. Keyword similarity is the fallback.

## Services

| Service | Path | Runtime |
|---|---|---|
| web | `apps/web` | Next.js 16 (App Router), Railway |
| api | `apps/api` | Node 22 + Hono, run with `tsx`, Railway |
| contracts | `packages/contracts` | Foundry, Solidity 0.8.28, OZ 5.6 |
| shared | `packages/shared` | zod schemas, rubric, ABI, deployments (TS source, no build step) |

## Security notes

See the checklist in the README. Highlights: secrets only in the API service; httpOnly SameSite=Lax session cookie; OAuth `state`; GitHub token AES-256-GCM at rest and deleted on logout; single-use nonces; zod on every route; per-IP and per-user rate limits; 1 MB default body cap; constant-time tool secret compare; SSRF guard validates DNS before and at connect time; zip parser rejects traversal, symlinks and bombs.
