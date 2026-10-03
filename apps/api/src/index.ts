import { serve } from "@hono/node-server";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { env } from "./env";
import { getDb, schema } from "./db/client";
import { log } from "./lib/logger";
import { startPipelineSync } from "./vakh/pipeline";

startPipelineSync();

serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`karma-api listening on :${info.port}`);
});

/**
 * SEED_DEMO_ON_BOOT=true seeds the labelled demo profiles once (skipped when they already
 * exist). Handy on hosts where the database isn't reachable from a laptop.
 */
if (process.env.SEED_DEMO_ON_BOOT === "true") {
  void (async () => {
    try {
      const db = await getDb();
      const existing = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isDemo, true)).limit(1);
      const { seedDemos } = await import("./scripts/seed");
      await seedDemos({ log: (m) => log.info(m), onlyMissing: existing.length > 0 });
      // SEED_DEMO_MINT=true mints the top skill of three demo profiles to real testnet tokens (once).
      if (process.env.SEED_DEMO_MINT === "true") {
        const { latestAnalyses } = await import("./analysis/jobs");
        const { mintAnalysis } = await import("./chain/mint");
        for (const handle of ["priya-builds", "arjun-dev", "demo-ananya", "demo-rahul", "demo-mei"]) {
          const [u] = await db.select().from(schema.users).where(eq(schema.users.githubHandle, handle)).limit(1);
          if (!u) continue;
          const [top] = (await latestAnalyses(u.id)).filter((a) => a.source === "github").sort((a, b) => b.score - a.score);
          if (!top || top.tokenId) continue;
          const out = await mintAnalysis(u, top.id).catch((err: unknown) => ({ status: "error", message: String(err) }));
          log.info("demo mint", { handle, skill: top.skill, ...out });
        }
      }
      const { seedFeed } = await import("./scripts/seed");
      await seedFeed((m) => log.info(m));
    } catch (err) {
      log.error("demo seed failed", { err });
    }
  })();
}
