import { Inflate } from "fflate";
import type { RepoSignals } from "../analysis/github-signals";
import { LANGUAGE_EXTENSIONS, isGenerated, summarizeTree } from "../analysis/github-signals";

/**
 * In-memory zip reader with strict limits. We parse the central directory ourselves so we can
 * see external attributes (symlinks) and names before inflating anything, then inflate each
 * entry with a streaming counter so a lying size header can't blow up memory.
 */
export const ZIP_LIMITS = {
  maxZipBytes: 20 * 1024 * 1024,
  maxFiles: 3000,
  maxTotalUncompressed: 100 * 1024 * 1024,
  maxFileUncompressed: 5 * 1024 * 1024,
  maxRatio: 100,
};

export class ZipRejectedError extends Error {}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  isDir: boolean;
  isSymlink: boolean;
}

function readEntries(buf: Uint8Array): Entry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: search backwards for 0x06054b50.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipRejectedError("Not a valid zip file");
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipRejectedError("ZIP64 archives are not supported");
  if (count > ZIP_LIMITS.maxFiles) throw new ZipRejectedError(`Too many files (max ${ZIP_LIMITS.maxFiles})`);

  const entries: Entry[] = [];
  let p = cdOffset;
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new ZipRejectedError("Corrupt zip directory");
    const versionMadeBy = dv.getUint16(p + 4, true);
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const externalAttrs = dv.getUint32(p + 38, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (flags & 0x1) throw new ZipRejectedError("Encrypted zips are not supported");
    const unixMode = versionMadeBy >> 8 === 3 ? externalAttrs >>> 16 : 0;
    entries.push({
      name,
      method,
      compressedSize,
      size,
      localOffset,
      isDir: name.endsWith("/"),
      isSymlink: (unixMode & 0o170000) === 0o120000,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function validateEntryName(name: string) {
  if (name.includes("\0")) throw new ZipRejectedError("Invalid file name");
  const n = name.replace(/\\/g, "/");
  if (n.startsWith("/") || /^[A-Za-z]:/.test(n)) throw new ZipRejectedError(`Absolute path in zip: ${name}`);
  if (n.split("/").some((seg) => seg === "..")) throw new ZipRejectedError(`Path traversal in zip: ${name}`);
}

function inflateLimited(data: Uint8Array, limit: number): Uint8Array {
  const out: Uint8Array[] = [];
  let total = 0;
  const inf = new Inflate((chunk) => {
    total += chunk.length;
    if (total > limit) throw new ZipRejectedError("A file expands beyond the allowed size (zip bomb guard)");
    out.push(chunk);
  });
  inf.push(data, true);
  const res = new Uint8Array(total);
  let o = 0;
  for (const c of out) {
    res.set(c, o);
    o += c.length;
  }
  return res;
}

const looksBinary = (b: Uint8Array) => b.subarray(0, 8000).includes(0);

export interface ZipFile {
  path: string;
  size: number;
  text: string | null; // null for binaries / skipped
}

/** Returns text files in memory. Throws ZipRejectedError on any safety violation. */
export function readZip(buf: Uint8Array): ZipFile[] {
  if (buf.length > ZIP_LIMITS.maxZipBytes) throw new ZipRejectedError("Zip is larger than 20 MB");
  const entries = readEntries(buf);
  let declaredTotal = 0;
  for (const e of entries) {
    validateEntryName(e.name);
    if (e.isSymlink) throw new ZipRejectedError(`Symlinks are not allowed: ${e.name}`);
    declaredTotal += e.size;
    if (e.compressedSize > 0 && e.size / e.compressedSize > ZIP_LIMITS.maxRatio) {
      throw new ZipRejectedError("Suspicious compression ratio (zip bomb guard)");
    }
  }
  if (declaredTotal > ZIP_LIMITS.maxTotalUncompressed) throw new ZipRejectedError("Uncompressed size exceeds 100 MB");

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const dec = new TextDecoder("utf-8", { fatal: false });
  const files: ZipFile[] = [];
  let actualTotal = 0;
  for (const e of entries) {
    if (e.isDir) continue;
    const path = e.name.replace(/\\/g, "/");
    if (isGenerated(path) || e.size > ZIP_LIMITS.maxFileUncompressed) {
      files.push({ path, size: e.size, text: null });
      continue;
    }
    const lh = e.localOffset;
    if (dv.getUint32(lh, true) !== 0x04034b50) throw new ZipRejectedError("Corrupt zip entry");
    const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
    const raw = buf.subarray(start, start + e.compressedSize);
    const limit = Math.min(ZIP_LIMITS.maxFileUncompressed, ZIP_LIMITS.maxTotalUncompressed - actualTotal);
    let data: Uint8Array;
    if (e.method === 0) data = raw;
    else if (e.method === 8) data = inflateLimited(raw, limit);
    else {
      files.push({ path, size: e.size, text: null });
      continue;
    }
    actualTotal += data.length;
    if (actualTotal > ZIP_LIMITS.maxTotalUncompressed) throw new ZipRejectedError("Uncompressed size exceeds 100 MB");
    files.push({ path, size: data.length, text: looksBinary(data) ? null : dec.decode(data) });
  }
  return stripCommonRoot(files);
}

/** GitHub-style zips wrap everything in one folder; drop it so depth/README checks work. */
function stripCommonRoot(files: ZipFile[]): ZipFile[] {
  const firsts = new Set(files.map((f) => f.path.split("/")[0]));
  if (firsts.size !== 1 || files.every((f) => !f.path.includes("/"))) return files;
  const root = `${[...firsts][0]}/`;
  return files.map((f) => ({ ...f, path: f.path.startsWith(root) ? f.path.slice(root.length) : f.path }));
}

const EXT_TO_LANG = new Map<string, string>();
for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) for (const e of exts) if (!EXT_TO_LANG.has(e)) EXT_TO_LANG.set(e, lang);

/** Build a RepoSignals from local files. No stars, PRs or commit authorship exist here. */
export function zipToSignals(files: ZipFile[], name: string): RepoSignals {
  const languages: Record<string, number> = {};
  for (const f of files) {
    if (f.text === null) continue;
    const ext = f.path.slice(f.path.lastIndexOf(".")).toLowerCase();
    const lang = EXT_TO_LANG.get(ext);
    if (lang) languages[lang] = (languages[lang] ?? 0) + f.size;
  }
  const primary = Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const tree = summarizeTree(files.map((f) => ({ path: f.path, type: "blob", size: f.size })));
  const now = new Date().toISOString();
  return {
    fullName: `upload/${name}`,
    owner: "upload",
    name,
    url: "",
    primaryLanguage: primary,
    languages,
    sizeKb: Math.round(files.reduce((a, f) => a + f.size, 0) / 1024),
    stars: 0,
    forks: 0,
    createdAt: now,
    pushedAt: now,
    defaultBranch: "upload",
    headSha: null,
    license: files.some((f) => /^licen[cs]e(\.[a-z]+)?$/i.test(f.path)) ? "present" : null,
    authoredCommits: 0,
    ...tree,
  };
}
