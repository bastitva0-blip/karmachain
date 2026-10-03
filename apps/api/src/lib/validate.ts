import type { Context } from "hono";
import type { z } from "zod";
import { badRequest } from "./errors";

/** Parse a JSON body with zod; throws a 400 with field issues on failure. */
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Body must be valid JSON");
  }
  return parse(schema, raw);
}

export function parse<T extends z.ZodType>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    throw badRequest(
      "Invalid input",
      r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return r.data;
}
