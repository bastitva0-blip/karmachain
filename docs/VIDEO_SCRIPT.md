# KarmaChain: 5-minute video script

**Format:** screen recording with voice-over, plus a face-cam open and close if you have one. Total 5:00.
**Tone:** calm, confident, concrete. Show, don't claim.
**Before recording:** API `/health` is green, the relayer is funded, demo profiles are seeded and minted, one real account is already analysed (cached), the Vakh studio account is connected, and the directory has posts. Use browser zoom at 110%, close other tabs and turn notifications off.

---

## 0:00–0:25 · Hook (face-cam or landing page)

**Screen:** `/` landing, slow scroll.

> "Anyone can write 'senior TypeScript engineer' on a resume. Recruiters can't check it, and your real reputation is locked inside GitHub, Upwork and LinkedIn.
> KarmaChain turns verified work into portable proof that you own and can't buy, then lets recruiters find you and interview you by voice, based on that proof."

**On-screen text:** `Proof → Profile → Match → Interview`

---

## 0:25–1:25 · Proof (developer side)

**Screen:** `/dashboard`

1. Click **Sign in with GitHub**.
   > "I sign in with GitHub, read-only and public data only."
2. **Connect wallet**, then **Sign link message**.
   > "I link a wallet with a free signature. No gas, no transaction."
3. **Start analysis**, and let the live progress run (cached, so it's fast).
   > "KarmaChain reads my repos and the pull requests I've merged into other people's projects. Ninety points come from hard signals: merged PRs, tests, CI, activity. An AI rubric can add at most ten. The AI can't make you Top tier on its own."
4. Show the tier cards and score ring, then click **Mint** on one skill.
   > "My tier is minted as a soulbound token on Base. The relayer pays the gas."
5. Click the tx link to open Basescan.
   > "It's soulbound: a transfer reverts on-chain. You can't buy reputation or sell it."

**On-screen text:** `ERC-5192 · Base Sepolia · gasless`

---

## 1:25–1:55 · Profile and verifiable evidence

**Screen:** `/u/<handle>`

1. Show the skill cards, trust signals and attestations.
   > "This is my public profile. Every skill comes from the chain, not from our database."
2. Click **View evidence** and wait for "matches".
   > "The token stores a hash of the evidence. Your browser re-hashes the evidence JSON and checks it against the chain. You don't have to trust us."
3. Hover the **Vakh ↗** button.
   > "And the proof is already listed in a public directory on Vakh. More on that in a minute."

---

## 1:55–3:30 · Recruiter, matching and voice interview (the flagship)

**Screen:** `/recruiter`

1. Type: *"Senior TypeScript engineer for a payments API, TypeScript at medium or above."* Answer 2–3 questions, then say "go".
   > "Now I'm a recruiter. I just describe the role. Karma asks one question at a time and builds a structured job spec."
2. Show the ranked matches.
   > "Candidates are ranked by meaning, tier fit and outside validation. Every reason cites real evidence. Only people who opted in appear, and demo profiles are labelled."
3. Open **Interview settings** and point at tone and style.
   > "The interviewer adopts my communication style from how I typed. That's a persona prompt, not voice cloning."
4. Click **Interview** on a demo candidate, accept consent, then **Start voice interview**. Speak for about 45 seconds and show the live captions and timer.
   > *(Let the ElevenLabs agent talk. Answer one question naturally.)*
5. End the call and show the report.
   > "The report scores four criteria, and every score is backed by verbatim quotes. Click a quote and it jumps to that moment. No accent or tone scoring, and a human always makes the decision."

**On-screen text:** `ElevenLabs Agents · evidence-quoted report`

---

## 3:30–4:20 · Vakh: proof that travels (MCP)

**Screen:** back on `/recruiter` with the matches visible.

1. In **Track this shortlist in Vakh**, click **Send shortlist to Vakh** (connected beforehand).
   > "Recruiters don't live in our app. With one click the shortlist lands in my own Vakh account as a hiring pipeline."
2. Click **Open pipeline**, which opens the Vakh kanban (Shortlisted → Contacted → Interviewing → Offer).
   > "Each card links back to the candidate's public proof post. Drag a card to move a candidate through stages."
3. Open the **KarmaChain · Verified Developers** directory, then its **Stats** dashboard.
   > "Every minted proof is published here automatically, over MCP. If a token is revoked, or a developer opts out, the post is archived. Because it's MCP, any AI assistant can read this structured data with the same permissions a person has."

**On-screen text:** `Vakh MCP · OAuth · public directory + recruiter pipeline`

---

## 4:20–4:45 · Trust and honesty

**Screen:** `/admin` (flags and revocation), then the README "Honest limitations" section.

> "Admins can revoke a token on-chain with a public reason. Soulbound stops buying reputation, not farming it, so we weight merged PRs into other people's repos, gate Top tier on account age and activity, and cap the AI's influence. It runs on a testnet today, and self-declared uploads are never minted."

---

## 4:45–5:00 · Close (face-cam or landing page)

> "KarmaChain: proof you own, matches that cite evidence, interviews you can audit, and a pipeline that travels with you.
> Proof, Profile, Match, Interview."

**End card:** logo · `karmachain.up.railway.app` · `github.com/bastitva0-blip/karmachain` · "Built with ElevenLabs, Base, EAS, NVIDIA NIM and Vakh MCP"

---

## Recording checklist

| Item | Done |
|---|---|
| Real account analysed and cached; one skill not yet minted (to mint live) | ☐ |
| Relayer funded, `/health` green | ☐ |
| Vakh studio connected and directory has posts; recruiter Vakh connected | ☐ |
| ElevenLabs minutes available (keep one clean take) | ☐ |
| Fallback: `?fallback=1` text interview if voice fails | ☐ |
| Record each section separately and cut together; add on-screen text in editing | ☐ |

**Timing tip:** if you run long, cut the Basescan click (1:15) and the admin shot (4:20). Never cut the voice interview or the Vakh pipeline.
