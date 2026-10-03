# Demo script (target 4 minutes)

Before going on stage: `/health` on the API shows every dependency green (or knowingly in fallback), the relayer is funded, `pnpm seed --mint` has run on the deployed DB, and one real account has already been analysed (cached).

| Time | Beat | What to click / say |
|---|---|---|
| 0:00–0:30 | **Problem** | "Resumes are easy to fake, and reputation is locked inside platforms. We turn verified work into portable proof." |
| 0:30–1:30 | **Proof** | `/dashboard` → Sign in with GitHub → Connect wallet → *Sign link message* → *Start analysis* (live progress). Show tiers and the score ring. *Mint* one → click the tx link → Basescan shows the token. Say: "It's soulbound: a transfer reverts." (Show `pnpm --filter contracts demo:soulbound` output or the failed tx.) |
| 1:30–2:00 | **Profile** | Open `/u/<you>`: soulbound skills, *View evidence* → "Rehashed in your browser: it matches." Point at trust signals and attestations. |
| 2:00–3:30 | **Recruiter + voice** | `/recruiter`: type "Senior Go engineer for distributed storage, must have Go at medium or above". Answer 2–3 questions, say "go". Show ranked matches with cited reasons (demo profiles are labelled). Open *Interview settings*, point at tone and style mirroring. Click *Interview* on `demo-mei` → consent → *Start voice interview*. Talk for 60–90 s; show live captions and the timer. End → report: scores with verbatim quotes, click a quote to jump to the transcript, disclaimer. |
| 3:30–4:00 | **P1 (if ready)** | *Ask Karma* on a profile: "Is demo-mei legit?", or *Leave a review* → speak → edit → sign. |
| 4:00–4:30 | **Close** | Limitations: testnet, farming mitigated not prevented, self-declared vs verified. Roadmap: zip, portfolios, freelance platforms, mainnet. ElevenLabs: Agents (interviewer + verify tool), Scribe (reviews), TTS (briefings). |

## Fallbacks

| Failure | Fallback |
|---|---|
| ElevenLabs quota or key | Interview auto-switches to text mode with browser speech (`?fallback=1` forces it). Ask Karma and reviews have typed modes. |
| NVIDIA slow or down | Template question plan, template match reasons, deterministic text interviewer. Recruiter chat shows the manual job form. |
| GitHub rate limit | Use the pre-analysed (cached) account. The job shows the reset time. |
| Relayer low / RPC down | Profile still shows analyses as "Not minted". Show a pre-minted demo profile (`demo-ananya`, `demo-rahul`, `demo-mei`). |
| Venue Wi-Fi | Backup video of the full flow, recorded the night before. |

Rehearse with fallback mode, keep real ElevenLabs minutes for the final run, and use short test calls only.
