import { env } from "../env";
import { embed } from "../llm/client";
import { log } from "../lib/logger";

export const embeddingsConfigured = () => Boolean(env.NVIDIA_API_KEY && env.NVIDIA_EMBED_MODEL);

export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Returns null (not an error) when embeddings aren't configured or the call fails. */
export async function embedPassage(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  try {
    const [v] = await embed([text], "passage");
    return v ?? null;
  } catch (err) {
    log.warn("embed passage failed", { err });
    return null;
  }
}

export async function embedPassages(texts: string[]): Promise<(number[] | null)[]> {
  if (!embeddingsConfigured() || texts.length === 0) return texts.map(() => null);
  try {
    return await embed(texts, "passage");
  } catch (err) {
    log.warn("embed passages failed", { err });
    return texts.map(() => null);
  }
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  try {
    const [v] = await embed([text], "query");
    return v ?? null;
  } catch (err) {
    log.warn("embed query failed", { err });
    return null;
  }
}

/** Keyword fallback when embeddings are unavailable: Jaccard overlap of word sets. */
export function keywordSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9+#.]{2,}/g) ?? []);
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
