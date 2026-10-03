# Vakh integration

KarmaChain talks to [Vakh](https://vakh.com) over its MCP server (`https://xo.vakh.com/mcp`, Streamable HTTP, OAuth 2.1 with dynamic client registration). The API is the MCP client; no Vakh credential ever reaches the browser.

## What it does

| Flow | Vakh account | MCP tools | Trigger |
|---|---|---|---|
| **Public proof directory**: every minted, non-revoked proof of a developer who opted in to discovery becomes a post in "KarmaChain · Verified Developers" (feed, directory table, by-tier board, stats dashboard) | KarmaChain studio | `get_form`, `create_form`, `unarchive_form`, `create_post` | After a successful mint (`chain/mint.ts`), when a developer opts in, or "Publish waiting proofs" in `/admin` |
| **Revocation and opt-out**: the post is archived (reversible in Vakh) | KarmaChain studio | `archive_post` | Admin revoke (`/admin/flags/:id/revoked`), opt-out, account deletion |
| **Recruiter pipeline**: the shortlist becomes cards on a "KarmaChain Pipeline" kanban (Shortlisted → Contacted → Interviewing → Offer / Passed) in the recruiter's own Vakh, each linked by `reference` to the candidate's public proof posts | Recruiter's own | `create_form`, `query_view` (dedupe), `create_post` | "Send shortlist to Vakh" on `/recruiter` |

Because both forms are ordinary Vakh forms, people can follow the directory, and the recruiter's own assistant can read or update the pipeline over the same MCP server (`query_view`, `aggregate_view`, `update_post` to move stages).

## Setup

1. Deploy with the migration `0002_vakh.sql` (runs automatically on boot).
2. Set `VAKH_CALLBACK_URL` to `<web origin>/api/vakh/callback` (the default suits local dev).
3. Sign in to `/admin` → **Vakh directory** → **Connect studio account** and approve on Vakh.
4. **Create directory form**, then **Publish waiting proofs** to backfill.
5. In Vakh, make the directory form public (sharing is human-only in Vakh, not available over MCP). Until then, recruiter pipelines are still created, just without proof links.

## Design notes

- **Tokens.** Refresh tokens rotate on every refresh, so they are stored encrypted (AES-GCM, `vakh_kv`) and refreshes are serialised per account. Pending PKCE state lives 10 minutes and is single-use.
- **Failure isolation.** Vakh calls have a 20 s timeout and retry on network or 5xx errors, plus one retry with a forced refresh on 401. Publishing is fire-and-forget after a mint: a Vakh outage never blocks or fails a mint, and "Publish waiting proofs" catches up later.
- **Idempotency.** `analyses.vakh_post_id` is re-checked inside each retried unit; pipeline export skips candidates already on the board for that job (`query_view` on `job_ref`).
- **Consent.** Only `consent_searchable` developers are listed. Post text is built from stored evidence fields only (no LLM), so it cannot claim anything the evidence doesn't contain.
- **Schema stability.** Vakh field ids are immutable. Add fields in `vakh/forms.ts`; never rename them.
