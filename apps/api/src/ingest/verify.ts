import { randomToken } from "../lib/crypto";
import { safeFetch, SsrfError } from "../lib/ssrf";
import { htmlToText } from "./extract";

export const newVerifyCode = () => `karma-verify-${randomToken(8)}`;

/**
 * Ownership proof for a URL: the code must appear in the page body, in
 * <meta name="karmachain-verify" content="…">, or in /.well-known/karmachain.txt.
 */
export async function verifyUrlOwnership(url: string, code: string): Promise<{ verified: boolean; where: string | null }> {
  try {
    const page = await safeFetch(url);
    const html = page.body.toString("utf8");
    const { text, metas } = htmlToText(html);
    if (metas["karmachain-verify"] === code) return { verified: true, where: "meta tag" };
    if (text.includes(code) || html.includes(code)) return { verified: true, where: "page body" };
  } catch (err) {
    if (!(err instanceof SsrfError)) throw err;
  }
  try {
    const wk = new URL("/.well-known/karmachain.txt", url).toString();
    const r = await safeFetch(wk, { allowTypes: /^text\/(plain|html)\b/i, maxBytes: 64 * 1024 });
    if (r.body.toString("utf8").includes(code)) return { verified: true, where: "/.well-known/karmachain.txt" };
  } catch {
    // not present
  }
  return { verified: false, where: null };
}

export const pdfContainsCode = (text: string, code: string) => text.replace(/\s+/g, "").includes(code);
