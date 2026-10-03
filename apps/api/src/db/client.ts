import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "../env";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

let dbPromise: Promise<Db> | null = null;
let closeFn: (() => Promise<void>) | null = null;

/**
 * Postgres (Neon/Supabase) when DATABASE_URL is set; otherwise an embedded PGlite
 * database so the API runs locally with zero setup. Migrations run on first use.
 */
export function getDb(): Promise<Db> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<Db> {
  if (env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(env.DATABASE_URL, { max: 5, prepare: false, connect_timeout: 10 });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder });
    closeFn = () => client.end();
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!env.PGLITE_DIR.includes("://")) mkdirSync(env.PGLITE_DIR, { recursive: true });
  const client = new PGlite(env.PGLITE_DIR);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  closeFn = () => client.close();
  return db as unknown as Db;
}

export async function closeDb(): Promise<void> {
  await closeFn?.();
  dbPromise = null;
  closeFn = null;
}

export { schema };
