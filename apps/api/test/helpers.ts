import { getDb, schema } from "../src/db/client";

let n = 0;
export async function makeUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  const db = await getDb();
  n++;
  const [u] = await db
    .insert(schema.users)
    .values({ githubId: `gh-${n}-${Date.now()}`, githubHandle: `user${n}x${Date.now()}`, ...overrides })
    .returning();
  return u!;
}
