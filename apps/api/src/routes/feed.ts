import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { z } from "zod";
import { BASESCAN, TIER_NUM, type Tier } from "@karma/shared";
import { getDb, schema } from "../db/client";
import type { FeedProof } from "../db/schema";
import { requireUser } from "../auth/session";
import { latestAnalyses, type Analysis } from "../analysis/jobs";
import type { Evidence } from "../analysis/evidence";
import { getAttestations } from "../chain/reader";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors";
import { rateLimit } from "../lib/ratelimit";
import { body } from "../lib/validate";
import type { AppEnv, User } from "../types";

export const feed = new Hono<AppEnv>();

const TIER_WEIGHT: Record<Tier | "none", number> = { top: 3, medium: 2, basic: 1, none: 0.5 };
const TIER_LABEL: Record<Tier, string> = { basic: "Basic", medium: "Medium", top: "Top" };

export const endorseMessage = (postId: string, handle: string) => `KarmaChain: endorse post ${postId} as @${handle}`;

function evidenceOf(a: Analysis): Evidence | null {
  const e = a.evidenceJson as Partial<Evidence>;
  return e?.kind === "karmachain.evidence" ? (e as Evidence) : null;
}

async function verifiedAnalyses(userId: string) {
  return (await latestAnalyses(userId)).filter((a) => a.verified && !a.revokedAt);
}

export async function bestTier(userId: string): Promise<{ tier: Tier | "none"; label: string | null }> {
  const list = await verifiedAnalyses(userId);
  const top = [...list].sort((a, b) => TIER_NUM[b.tier] - TIER_NUM[a.tier] || b.score - a.score)[0];
  if (!top) return { tier: "none", label: null };
  return { tier: top.tier, label: `${evidenceOf(top)?.language ?? top.skill} · ${TIER_LABEL[top.tier]}` };
}

const prLabel = (url: string) => {
  const m = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/.exec(url);
  return m ? `Merged PR · ${m[1]} #${m[2]}` : "Merged PR";
};

/** Every proof this user may attach. Proofs are always derived server-side from their own records. */
export async function attachableProofs(user: User): Promise<FeedProof[]> {
  const db = await getDb();
  const out: FeedProof[] = [];
  const analyses = await verifiedAnalyses(user.id);
  for (const a of analyses) {
    if (!a.tokenId) continue;
    const ev = evidenceOf(a);
    out.push({
      type: "token",
      ref: a.id,
      label: `${ev?.language ?? a.skill} · ${TIER_LABEL[a.tier]}`,
      detail: `SBT #${a.tokenId.padStart(4, "0")} · ${a.score}/100`,
      url: a.mintTx ? `${BASESCAN}/tx/${a.mintTx}` : null,
    });
  }
  const seen = new Set<string>();
  for (const a of analyses) {
    for (const p of evidenceOf(a)?.mergedExternalPrs ?? []) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      out.push({
        type: "pr",
        ref: p.url,
        label: prLabel(p.url),
        detail: `${p.mergedAt ? `merged ${new Date(p.mergedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ` : ""}verified via GitHub`,
        url: p.url,
      });
    }
  }
  if (user.walletAddress) {
    for (const att of (await getAttestations(user.walletAddress)) ?? []) {
      if (att.schema !== "ClientReview" || att.revoked) continue;
      const rating = typeof att.data.rating === "number" ? att.data.rating : 0;
      out.push({
        type: "review",
        ref: att.uid,
        label: `Client review · ${rating}/5${typeof att.data.skillTag === "string" ? ` · ${att.data.skillTag}` : ""}`,
        detail: `EAS · attester ${att.attester.slice(0, 6)}…${att.attester.slice(-4)}`,
        url: att.url,
      });
    }
  }
  const ivs = await db
    .select()
    .from(schema.interviews)
    .where(and(eq(schema.interviews.candidateUserId, user.id), sql`${schema.interviews.attestationUid} is not null`));
  for (const iv of ivs) {
    const report = iv.reportJson as { overall?: number | null } | null;
    const role = (iv.planJson as { roleTitle?: string }).roleTitle ?? "role";
    out.push({
      type: "interview",
      ref: iv.id,
      label: `Voice interview · ${role}${report?.overall != null ? ` · ${report.overall}/5` : ""}`,
      detail: "anchored on EAS",
      url: `https://base-sepolia.easscan.org/attestation/view/${iv.attestationUid}`,
    });
  }
  return out;
}

const author = (u: User, best: { tier: Tier | "none"; label: string | null }) => ({
  handle: u.githubHandle,
  name: u.name,
  avatarUrl: u.avatarUrl,
  isDemo: u.isDemo,
  tier: best.tier,
  tierLabel: best.label,
});

/** Evidence-first ranking: proofs and tier-weighted signed endorsements, decayed by age. No proof, no boost. */
export function rankScore(p: { proofs: number; endorseWeight: number; ageHours: number }) {
  const base = p.proofs > 0 ? 10 + p.proofs * 6 + p.endorseWeight * 3 : 1 + p.endorseWeight * 0.5;
  return base / Math.pow(p.ageHours + 2, 0.8);
}

async function hydrate(rows: (typeof schema.posts.$inferSelect)[], viewer: User | null) {
  if (rows.length === 0) return [];
  const db = await getDb();
  const ids = rows.map((r) => r.repostOf ?? r.id);
  const originals = await db.select().from(schema.posts).where(inArray(schema.posts.id, ids));
  const byId = new Map(originals.map((o) => [o.id, o]));
  const userIds = [...new Set([...rows.map((r) => r.userId), ...originals.map((o) => o.userId)])];
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, userIds));
  const userById = new Map(users.map((u) => [u.id, u]));
  const bestById = new Map(await Promise.all(userIds.map(async (id) => [id, await bestTier(id)] as const)));

  const ends = await db.select().from(schema.endorsements).where(inArray(schema.endorsements.postId, ids));
  const replies = await db
    .select({ parentId: schema.posts.parentId, n: sql<number>`count(*)::int` })
    .from(schema.posts)
    .where(inArray(schema.posts.parentId, ids))
    .groupBy(schema.posts.parentId);
  const reposts = await db
    .select({ repostOf: schema.posts.repostOf, n: sql<number>`count(*)::int` })
    .from(schema.posts)
    .where(inArray(schema.posts.repostOf, ids))
    .groupBy(schema.posts.repostOf);

  return rows.map((r) => {
    const o = r.repostOf ? (byId.get(r.repostOf) ?? r) : r;
    const pe = ends.filter((e) => e.postId === o.id);
    const ageHours = (Date.now() - o.createdAt.getTime()) / 36e5;
    const endorseWeight = pe.reduce((a, e) => a + e.weight, 0);
    return {
      id: o.id,
      rowId: r.id,
      repostedBy: r.repostOf ? author(userById.get(r.userId)!, bestById.get(r.userId)!) : null,
      author: author(userById.get(o.userId)!, bestById.get(o.userId)!),
      text: o.text,
      proofs: o.proofs,
      hiring: o.hiring,
      createdAt: o.createdAt,
      endorsements: pe.length,
      topTierEndorsements: pe.filter((e) => e.endorserTier === "top").length,
      viewerEndorsed: viewer ? pe.some((e) => e.userId === viewer.id) : false,
      replies: replies.find((x) => x.parentId === o.id)?.n ?? 0,
      reposts: reposts.find((x) => x.repostOf === o.id)?.n ?? 0,
      score: rankScore({ proofs: o.proofs.length, endorseWeight, ageHours }),
    };
  });
}

feed.get("/feed", rateLimit("feed", 120, 60_000), async (c) => {
  const sort = z.enum(["proven", "latest", "hiring", "following", "endorsed"]).catch("proven").parse(c.req.query("sort"));
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const viewer = c.get("user");
  const db = await getDb();

  let where = isNull(schema.posts.parentId);
  if (q) {
    const matchUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(or(ilike(schema.users.githubHandle, `%${q}%`), ilike(schema.users.name, `%${q}%`)));
    where = and(
      where,
      or(ilike(schema.posts.text, `%${q}%`), matchUsers.length ? inArray(schema.posts.userId, matchUsers.map((u) => u.id)) : sql`false`),
    )!;
  }
  if (sort === "hiring") where = and(where, eq(schema.posts.hiring, true))!;
  if ((sort === "following" || sort === "endorsed") && viewer) {
    const mine = await db.select().from(schema.endorsements).where(eq(schema.endorsements.userId, viewer.id));
    if (sort === "endorsed") where = and(where, mine.length ? inArray(schema.posts.id, mine.map((e) => e.postId)) : sql`false`)!;
    else {
      const endorsedPosts = mine.length ? await db.select({ userId: schema.posts.userId }).from(schema.posts).where(inArray(schema.posts.id, mine.map((e) => e.postId))) : [];
      const authors = [...new Set(endorsedPosts.map((p) => p.userId))];
      where = and(where, authors.length ? inArray(schema.posts.userId, authors) : sql`false`)!;
    }
  }
  const rows = await db.select().from(schema.posts).where(where).orderBy(desc(schema.posts.createdAt)).limit(150);
  const items = await hydrate(rows, viewer);
  if (sort !== "latest") items.sort((a, b) => b.score - a.score);
  return c.json({ items: items.slice(0, 60) });
});

feed.get("/feed/my-proofs", async (c) => {
  const user = requireUser(c);
  return c.json({ proofs: await attachableProofs(user) });
});

const ProofRef = z.object({ type: z.enum(["token", "pr", "review", "interview"]), ref: z.string().min(1).max(300) });

feed.post("/feed", rateLimit("feed-post", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const input = await body(c, z.object({ text: z.string().trim().min(1).max(1000), proofs: z.array(ProofRef).max(4).default([]) }));
  const allowed = await attachableProofs(user);
  const proofs: FeedProof[] = [];
  for (const p of input.proofs) {
    const match = allowed.find((a) => a.type === p.type && a.ref === p.ref);
    if (!match) throw badRequest(p.type === "pr" ? "That PR isn't yours. Only proofs linked to your GitHub can be attached." : "Only proofs linked to your account can be attached.");
    proofs.push(match);
  }
  const db = await getDb();
  const [row] = await db
    .insert(schema.posts)
    .values({ userId: user.id, text: input.text, proofs, hiring: /#hiring\b/i.test(input.text) })
    .returning();
  return c.json({ id: row!.id }, 201);
});

feed.get("/feed/:id/replies", async (c) => {
  const db = await getDb();
  const rows = await db.select().from(schema.posts).where(eq(schema.posts.parentId, c.req.param("id"))).orderBy(schema.posts.createdAt).limit(50);
  return c.json({ items: await hydrate(rows, c.get("user")) });
});

feed.post("/feed/:id/reply", rateLimit("feed-post", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const { text } = await body(c, z.object({ text: z.string().trim().min(1).max(500) }));
  const db = await getDb();
  const [parent] = await db.select().from(schema.posts).where(eq(schema.posts.id, c.req.param("id"))).limit(1);
  if (!parent) throw notFound("Post not found");
  const [row] = await db.insert(schema.posts).values({ userId: user.id, text, parentId: parent.id }).returning();
  return c.json({ id: row!.id }, 201);
});

feed.post("/feed/:id/repost", rateLimit("feed-post", 10, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  const db = await getDb();
  const [orig] = await db.select().from(schema.posts).where(eq(schema.posts.id, c.req.param("id"))).limit(1);
  if (!orig) throw notFound("Post not found");
  const [dupe] = await db
    .select({ id: schema.posts.id })
    .from(schema.posts)
    .where(and(eq(schema.posts.userId, user.id), eq(schema.posts.repostOf, orig.id)))
    .limit(1);
  if (dupe) throw conflict("Already reposted");
  await db.insert(schema.posts).values({ userId: user.id, text: "", repostOf: orig.id });
  return c.json({ ok: true }, 201);
});

/** Endorsements are wallet signatures, weighted by the endorser's best verified tier. */
feed.post("/feed/:id/endorse", rateLimit("endorse", 30, 10 * 60_000), async (c) => {
  const user = requireUser(c);
  if (!user.walletAddress) throw badRequest("Link a wallet to endorse. Endorsements are signatures, so they can't be botted.");
  const { signature, address } = await body(c, z.object({ signature: z.string().regex(/^0x[0-9a-fA-F]+$/), address: z.string().refine(isAddress) }));
  const db = await getDb();
  const postId = c.req.param("id");
  const [post] = await db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
  if (!post) throw notFound("Post not found");
  if (post.userId === user.id) throw forbidden("You can't endorse your own post");
  if (getAddress(address) !== getAddress(user.walletAddress)) throw badRequest("Sign with the wallet linked to your account");
  const ok = await verifyMessage({ address: getAddress(address), message: endorseMessage(postId, user.githubHandle), signature: signature as Hex }).catch(() => false);
  if (!ok) throw badRequest("Signature does not match your linked wallet");
  const best = await bestTier(user.id);
  try {
    await db.insert(schema.endorsements).values({
      postId,
      userId: user.id,
      address: address.toLowerCase(),
      signature,
      weight: TIER_WEIGHT[best.tier],
      endorserTier: best.tier,
    });
  } catch {
    throw conflict("You already endorsed this post");
  }
  return c.json({ ok: true, weight: TIER_WEIGHT[best.tier] });
});

feed.get("/feed/sidebar", async (c) => {
  const viewer = c.get("user");
  const db = await getDb();
  let you: { skills: { language: string; tier: Tier }[]; received: number; given: number } | null = null;
  let roles: { jobSpecId: string; title: string; need: string }[] = [];
  if (viewer) {
    const list = await verifiedAnalyses(viewer.id);
    const skills = list.map((a) => ({ language: evidenceOf(a)?.language ?? a.skill, tier: a.tier, skill: a.skill }));
    const myPosts = await db.select({ id: schema.posts.id }).from(schema.posts).where(eq(schema.posts.userId, viewer.id));
    const received = myPosts.length
      ? (await db.select({ n: sql<number>`count(*)::int` }).from(schema.endorsements).where(inArray(schema.endorsements.postId, myPosts.map((p) => p.id))))[0]!.n
      : 0;
    const given = (await db.select({ n: sql<number>`count(*)::int` }).from(schema.endorsements).where(eq(schema.endorsements.userId, viewer.id)))[0]!.n;
    you = { skills: skills.map(({ language, tier }) => ({ language, tier })), received, given };
    const specs = await db.select().from(schema.jobSpecs).orderBy(desc(schema.jobSpecs.createdAt)).limit(40);
    const seen = new Set<string>();
    for (const j of specs) {
      const spec = j.specJson as { title?: string; mustHaveSkills?: string[]; minTier?: Tier };
      if (!spec.title || seen.has(spec.title.toLowerCase())) continue;
      const need = (spec.mustHaveSkills ?? []).map((s) => s.toLowerCase());
      const hit = skills.find((s) => need.some((n) => s.skill.includes(n) || n.includes(s.skill)) && TIER_NUM[s.tier] >= TIER_NUM[spec.minTier ?? "basic"]);
      if (!hit) continue;
      seen.add(spec.title.toLowerCase());
      roles.push({ jobSpecId: j.id, title: spec.title, need: `Needs ${hit.language} · ${TIER_LABEL[spec.minTier ?? "basic"]} · you qualify` });
      if (roles.length >= 3) break;
    }
  }
  const recent = await db
    .select()
    .from(schema.analyses)
    .where(and(eq(schema.analyses.verified, true), sql`${schema.analyses.tokenId} is not null`, isNull(schema.analyses.revokedAt)))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(300);
  const bySkill = new Map<string, { language: string; tokens: number; top: number; prs: number }>();
  for (const a of recent) {
    const ev = evidenceOf(a);
    const k = ev?.language ?? a.skill;
    const cur = bySkill.get(k) ?? { language: k, tokens: 0, top: 0, prs: 0 };
    cur.tokens++;
    if (a.tier === "top") cur.top++;
    cur.prs += ev?.mergedExternalPrs?.length ?? 0;
    bySkill.set(k, cur);
  }
  const trending = [...bySkill.values()].sort((a, b) => b.tokens + b.prs / 4 - (a.tokens + a.prs / 4)).slice(0, 3);
  roles = roles.slice(0, 3);
  return c.json({ you, trending, roles });
});
