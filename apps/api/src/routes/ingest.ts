import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { skillIdFor } from "@karma/shared";
import { getDb, schema } from "../db/client";
import { requireUser } from "../auth/session";
import { getAttestations } from "../chain/reader";
import { buildEvidence, evidenceHash, repoFingerprint } from "../analysis/evidence";
import { scoreSubstance } from "../analysis/llm-rubric";
import { scoreLanguages } from "../analysis/scoring";
import { sha256Hex } from "../lib/crypto";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors";
import { log } from "../lib/logger";
import { rateLimit } from "../lib/ratelimit";
import { safeFetch, SsrfError, validateUrl } from "../lib/ssrf";
import { body } from "../lib/validate";
import { extractPortfolio, htmlToText, PortfolioSchema, type Portfolio } from "../ingest/extract";
import { isPdf, MAX_PDF_BYTES, pdfToText } from "../ingest/pdf";
import { portfolioEvidence, portfolioTier } from "../ingest/portfolio";
import { newVerifyCode, pdfContainsCode, verifyUrlOwnership } from "../ingest/verify";
import { readZip, ZipRejectedError, ZIP_LIMITS, zipToSignals } from "../ingest/zip";
import type { AppEnv } from "../types";

export const ingest = new Hono<AppEnv>();

const tooLarge = (msg: string) => (c: { json: (b: unknown, s: 413) => Response }) =>
  c.json({ error: { code: "too_large", message: msg } }, 413);

async function ownIngestion(id: string, userId: string) {
  const db = await getDb();
  const [row] = await db.select().from(schema.ingestions).where(eq(schema.ingestions.id, id)).limit(1);
  if (!row) throw notFound("Import not found");
  if (row.userId !== userId) throw forbidden();
  return row;
}

const publicIngestion = (r: typeof schema.ingestions.$inferSelect) => ({
  id: r.id,
  kind: r.kind,
  source: r.source,
  verifyCode: r.verifyCode,
  verified: r.verified,
  label: r.verified ? "Verified" : "Self-declared",
  extracted: r.extractedJson as (Portfolio & { llmUnavailable?: boolean; confirmed?: boolean }) | null,
});

// ---------------------------------------------------------------- URL portfolio

ingest.post("/ingest/url", rateLimit("ingest", 10, 10 * 60_000), bodyLimit({ maxSize: 16 * 1024, onError: tooLarge("Too large") }), async (c) => {
  const user = requireUser(c);
  const { url } = await body(c, z.object({ url: z.string().min(8).max(500) }));
  try {
    validateUrl(url);
    const page = await safeFetch(url);
    const { text, title } = htmlToText(page.body.toString("utf8"));
    const extracted = await extractPortfolio(`${title}\n${text}`);
    const db = await getDb();
    const [row] = await db
      .insert(schema.ingestions)
      .values({ userId: user.id, kind: "url", source: page.url, verifyCode: newVerifyCode(), extractedJson: extracted })
      .returning();
    return c.json(publicIngestion(row!), 201);
  } catch (err) {
    if (err instanceof SsrfError) throw badRequest(err.message);
    throw err;
  }
});

ingest.post("/ingest/:id/verify", rateLimit("ingest-verify", 20, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const row = await ownIngestion(c.req.param("id"), user.id);
  if (row.kind !== "url") throw badRequest("Only URL imports are verified this way; re-upload the PDF with the code inside");
  const r = await verifyUrlOwnership(row.source, row.verifyCode);
  if (r.verified) {
    const db = await getDb();
    const [u] = await db.update(schema.ingestions).set({ verified: true }).where(eq(schema.ingestions.id, row.id)).returning();
    return c.json({ ...publicIngestion(u!), verifiedVia: r.where });
  }
  return c.json({ ...publicIngestion(row), verifiedVia: null, message: `Could not find ${row.verifyCode} on the page yet.` });
});

// ---------------------------------------------------------------- PDF portfolio

/** Step 1: get a code to put inside the PDF. */
ingest.post("/ingest/pdf/start", rateLimit("ingest", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const db = await getDb();
  const [row] = await db
    .insert(schema.ingestions)
    .values({ userId: user.id, kind: "pdf", source: "pending-upload", verifyCode: newVerifyCode() })
    .returning();
  return c.json(publicIngestion(row!), 201);
});

/** Step 2: upload. Verified only if the code appears in the PDF text. */
ingest.post(
  "/ingest/pdf/:id",
  rateLimit("ingest-pdf", 10, 10 * 60_000),
  bodyLimit({ maxSize: MAX_PDF_BYTES + 64 * 1024, onError: tooLarge("PDF is larger than 10 MB") }),
  async (c) => {
    const user = requireUser(c);
    const row = await ownIngestion(c.req.param("id"), user.id);
    if (row.kind !== "pdf") throw badRequest("Not a PDF import");
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw badRequest("Missing file");
    if (file.size > MAX_PDF_BYTES) throw new HttpError(413, "too_large", "PDF is larger than 10 MB");
    const buf = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(buf)) throw badRequest("That file is not a PDF");
    let text: string;
    try {
      text = await pdfToText(buf);
    } catch {
      throw badRequest("Could not read text from this PDF");
    }
    const verified = pdfContainsCode(text, row.verifyCode);
    const extracted = await extractPortfolio(text);
    const db = await getDb();
    const name = file instanceof File ? file.name.slice(0, 120) : "portfolio.pdf";
    const [u] = await db
      .update(schema.ingestions)
      .set({ source: `pdf:${name}#${sha256Hex(buf).slice(0, 16)}`, verified, extractedJson: extracted })
      .where(eq(schema.ingestions.id, row.id))
      .returning();
    return c.json(publicIngestion(u!));
  },
);

// ---------------------------------------------------------------- shared: edit, list, mint

ingest.get("/ingest", async (c) => {
  const user = requireUser(c);
  const db = await getDb();
  const rows = await db.select().from(schema.ingestions).where(eq(schema.ingestions.userId, user.id));
  return c.json({ ingestions: rows.filter((r) => r.kind !== "zip").map(publicIngestion) });
});

ingest.put("/ingest/:id/projects", async (c) => {
  const user = requireUser(c);
  const row = await ownIngestion(c.req.param("id"), user.id);
  const p = await body(c, PortfolioSchema);
  const db = await getDb();
  const [u] = await db
    .update(schema.ingestions)
    .set({ extractedJson: { ...p, confirmed: true } })
    .where(eq(schema.ingestions.id, row.id))
    .returning();
  return c.json(publicIngestion(u!));
});

/** Verified portfolios become an analysis (source 'portfolio') that /mint accepts; tiers are capped. */
ingest.post("/ingest/:id/analysis", rateLimit("ingest-analysis", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const row = await ownIngestion(c.req.param("id"), user.id);
  if (!row.verified) throw badRequest("Self-declared imports stay private and can't be minted. Verify ownership first.");
  const p = row.extractedJson as (Portfolio & { confirmed?: boolean }) | null;
  if (!p?.confirmed || p.projects.length === 0) throw badRequest("Review and confirm your projects first");
  const atts = user.walletAddress ? ((await getAttestations(user.walletAddress)) ?? []) : [];
  const reviews = atts.filter((a) => a.schema === "ClientReview" && !a.revoked).length;
  const t = portfolioTier(p, reviews);
  const { evidence, hash } = portfolioEvidence(user.githubHandle, row.source, p, t, row.kind === "url" ? "url" : "pdf");
  const db = await getDb();
  const [a] = await db
    .insert(schema.analyses)
    .values({
      userId: user.id,
      skill: skillIdFor(`portfolio:${p.discipline}`),
      tier: t.tier,
      score: t.score,
      source: "portfolio",
      verified: true,
      evidenceJson: evidence,
      evidenceHash: hash,
      repoFingerprint: sha256Hex(`${row.id}|${hash}`),
    })
    .returning();
  return c.json({ analysisId: a!.id, tier: t.tier, score: t.score, reason: t.reason });
});

// ---------------------------------------------------------------- zip (self-declared, never minted)

ingest.post(
  "/ingest/zip",
  rateLimit("ingest-zip", 5, 10 * 60_000),
  bodyLimit({ maxSize: ZIP_LIMITS.maxZipBytes + 64 * 1024, onError: tooLarge("Zip is larger than 20 MB") }),
  async (c) => {
    const user = requireUser(c);
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) throw badRequest("Missing file");
    let buf: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
    try {
      let files: ReturnType<typeof readZip> | null = readZip(buf);
      buf = null; // drop the archive as soon as it is parsed
      const name = (file instanceof File ? file.name : "upload.zip").replace(/\.zip$/i, "").slice(0, 60) || "upload";
      const repo = zipToSignals(files, name);
      if (!repo.primaryLanguage) throw badRequest("No recognisable source code found in the zip");

      const signals = { account: { handle: user.githubHandle, createdAt: null, publicRepos: 0 }, repos: [repo], externalPrs: [], collectedAt: new Date().toISOString() };
      const byPath = new Map(files.filter((f) => f.text).map((f) => [f.path, f.text!]));
      const sampled = repo.sampleCandidates.slice(0, 3).map((f) => ({ repo: repo.fullName, path: f.path, content: byPath.get(f.path) ?? "" }));
      files = null;
      byPath.clear();

      const rubric = await scoreSubstance(repo.primaryLanguage, sampled.filter((s) => s.content));
      sampled.length = 0;
      const [base] = scoreLanguages(signals, { [repo.primaryLanguage]: rubric.substance });
      if (!base) throw badRequest("No recognisable source code found in the zip");
      // No stars, PRs or authorship data: cap at Medium and label self-declared.
      const score = Math.min(base.score, 69);
      const result = { ...base, score, tier: score >= 40 ? ("medium" as const) : ("basic" as const), gates: [...base.gates, "Self-declared upload: capped at Medium, never minted"] };
      const ev = { ...buildEvidence(user.githubHandle, result, rubric), verified: false, source: "zip" as const };
      const db = await getDb();
      const [a] = await db
        .insert(schema.analyses)
        .values({
          userId: user.id,
          skill: result.skill,
          tier: result.tier,
          score,
          source: "zip",
          verified: false,
          evidenceJson: ev,
          evidenceHash: evidenceHash(ev),
          repoFingerprint: repoFingerprint(result),
        })
        .returning();
      return c.json({
        analysisId: a!.id,
        language: result.language,
        tier: result.tier,
        score,
        label: "Self-declared, unverified",
        note: "Your code was analysed in memory and discarded. This result is private to you and cannot be minted.",
      });
    } catch (err) {
      if (err instanceof ZipRejectedError) throw badRequest(err.message);
      log.warn("zip analysis failed", { err: err instanceof Error ? err.message : "unknown" });
      throw err;
    } finally {
      buf = null;
    }
  },
);

ingest.get("/ingest/zip/results", async (c) => {
  const user = requireUser(c);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.analyses)
    .where(and(eq(schema.analyses.userId, user.id), eq(schema.analyses.source, "zip")));
  return c.json({
    results: rows.map((r) => ({ id: r.id, skill: r.skill, tier: r.tier, score: r.score, label: "Self-declared, unverified", createdAt: r.createdAt })),
  });
});
