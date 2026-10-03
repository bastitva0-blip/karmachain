import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const isPdf = (buf: Uint8Array) =>
  buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d; // %PDF-

/** Text of the first 30 pages. The file is never written to disk. */
export async function pdfToText(buf: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(buf);
  const { text } = await extractText(doc, { mergePages: true });
  const t = Array.isArray(text) ? text.join("\n") : text;
  return t.slice(0, 200_000);
}
