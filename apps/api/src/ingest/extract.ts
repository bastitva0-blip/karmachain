import { z } from "zod";
import { chatJson, llmConfigured, truncateToTokens } from "../llm/client";
import { dataBlock } from "../llm/json";
import { PORTFOLIO_SYSTEM } from "../llm/prompts";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Readable text from HTML without a DOM: drop scripts/styles/nav chrome, strip tags, decode entities. */
export function htmlToText(html: string): { title: string; text: string; metas: Record<string, string> } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const metas: Record<string, string> = {};
  for (const m of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const name = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (name && content !== undefined) metas[name.toLowerCase()] = content;
  }
  const text = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, e: string) => {
      if (e[0] === "#") {
        const code = e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? " ";
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { title, text, metas };
}

export const ProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  role: z.string().trim().max(120).nullable().catch(null),
  year: z.coerce.number().int().min(1950).max(2100).nullable().catch(null),
  description: z.string().trim().max(300).catch(""),
  links: z.array(z.string().url().max(500)).max(10).catch([]),
  skills: z.array(z.string().trim().min(1).max(40)).max(12).catch([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export const PortfolioSchema = z.object({
  discipline: z.enum(["design", "architecture", "other"]).catch("other"),
  projects: z.array(ProjectSchema).max(12).catch([]),
});
export type Portfolio = z.infer<typeof PortfolioSchema>;

export async function extractPortfolio(text: string): Promise<Portfolio & { llmUnavailable: boolean }> {
  if (!llmConfigured() || text.trim().length < 20) return { discipline: "other", projects: [], llmUnavailable: true };
  try {
    const r = await chatJson(
      PortfolioSchema,
      [
        { role: "system", content: PORTFOLIO_SYSTEM },
        { role: "user", content: dataBlock("untrusted_content", truncateToTokens(text, 6000)) },
      ],
      { maxTokens: 1800 },
    );
    return { ...r, llmUnavailable: false };
  } catch {
    return { discipline: "other", projects: [], llmUnavailable: true };
  }
}
