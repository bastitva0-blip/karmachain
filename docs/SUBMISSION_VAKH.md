# Build with Vakh — submission

## 1. Project name

KarmaChain

## 2. Project description

KarmaChain turns a developer's real GitHub work into a soulbound skill proof on Base Sepolia. Each verified proof is published to a public Vakh directory, "KarmaChain · Verified Developers". Recruiters send AI-ranked shortlists to a pipeline board in their own Vakh, and that board runs the hiring process: moving a card to Interviewing makes KarmaChain create an AI voice interview, and the report is written back to the card when the interview is scored.

## 3. Working project / demo link

- App: https://karmachain.up.railway.app
- Guided demo: https://karmachain.up.railway.app/demo
- Health: https://api-production-a5e7.up.railway.app/health

## 4. Vakh build / form / board link

- Public directory: https://vakh.com/form/1f5f244c-9fda-4baa-9392-9c62afdc072e
- Recruiter pipeline board: created in each recruiter's own Vakh when they first export a shortlist (link shown on `/recruiter`).

## 5. Demo video

See `docs/VIDEO_SCRIPT.md` (Vakh section 3:30–4:20). Link: _add after upload_

## 6. Vakh integration explanation

**What problem does it solve?** Hiring developers relies on CVs and claims nobody can check. Developers with real, verifiable work have no neutral place to be found, and recruiters re-type candidate details across tools.

**Who is it built for?** Developers looking for work, especially early-career and open-source contributors, and the recruiters and small teams hiring them.

**How is Vakh used?**

1. **Collect and structure.** When a developer mints a proof (opted-in only), KarmaChain writes a structured post over Vakh MCP: developer, skill, tier, score, an evidence summary, and links to the token, the evidence and GitHub.
2. **Publish and discover.** The directory has Latest, Directory (table), By tier (kanban) and Stats (dashboard) views. Revoked proofs and opt-outs are archived automatically.
3. **Act on it.** A recruiter's shortlist becomes cards on a "KarmaChain Pipeline" board in their own Vakh. Each card links by reference to the candidate's public proof posts.
4. **Close the loop (Vakh → KarmaChain).** When the recruiter moves a card to **Interviewing** in Vakh, KarmaChain creates the AI voice interview and writes the link and status back on the card. When the interview is scored, the report link and overall score are written back too.

**Why Vakh?** It gives us structured, shareable views (feed, table, kanban, dashboard) that people browse and that any assistant can query over MCP. Recruiters keep working in a tool they own rather than another dashboard, and we didn't have to build a CRM.

**How does Vakh contribute to the core workflow?** Vakh is where proof becomes discoverable and where the hiring pipeline lives. Interviews are started from the Vakh board, so removing Vakh would remove the public directory, the recruiter pipeline and the interview trigger.

**Flow:** Developer mints proof → Vakh directory post → recruiter shortlist → Vakh pipeline card → stage moved in Vakh → AI interview created → report written back to Vakh.
