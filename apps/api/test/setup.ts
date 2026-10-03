import { beforeAll } from "vitest";
import { getDb } from "../src/db/client";

// PGlite + migrations take a few seconds on a cold start; do it outside test timeouts.
beforeAll(async () => {
  await getDb();
}, 120_000);
