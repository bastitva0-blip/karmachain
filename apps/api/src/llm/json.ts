/**
 * Pull the first JSON object/array out of a model reply (handles code fences and prose).
 * Returns undefined when nothing parses.
 */
export function extractJson(raw: string): unknown {
  // Reasoning models may prefix a <think>…</think> block.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text];
  for (const cand of candidates) {
    if (!cand) continue;
    const trimmed = cand.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to bracket scan
    }
    const start = trimmed.search(/[[{]/);
    if (start < 0) continue;
    const open = trimmed[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

/** Wrap untrusted text for prompts. Neutralises attempts to close the block early. */
export function dataBlock(tag: string, content: string, attrs: Record<string, string> = {}): string {
  const safe = content.replaceAll(`</${tag}`, `<\\/${tag}`);
  const a = Object.entries(attrs)
    .map(([k, v]) => ` ${k}="${v.replace(/"/g, "'")}"`)
    .join("");
  return `<${tag}${a}>\n${safe}\n</${tag}>`;
}
