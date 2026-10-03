import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { isBlockedIp, safeFetch, SsrfError, validateUrl } from "../src/lib/ssrf";
import { readZip, validateEntryName, ZipRejectedError, zipToSignals } from "../src/ingest/zip";
import { htmlToText } from "../src/ingest/extract";
import { portfolioTier } from "../src/ingest/portfolio";
import { pdfContainsCode } from "../src/ingest/verify";

describe("ssrf guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["8.8.8.8", "140.82.112.3", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it("rejects bad schemes, ports and credentials", () => {
    expect(() => validateUrl("file:///etc/passwd")).toThrow(SsrfError);
    expect(() => validateUrl("http://example.com:8080/")).toThrow(/ports/);
    expect(() => validateUrl("http://user:pw@example.com/")).toThrow(/Credentials/);
  });

  it("blocks metadata and localhost requests before any connection", async () => {
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(SsrfError);
    await expect(safeFetch("http://localhost/")).rejects.toThrow(SsrfError);
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(SsrfError);
    await expect(safeFetch("http://[::1]/")).rejects.toThrow(SsrfError);
  });
});

describe("zip safety", () => {
  it("reads a normal zip and strips the common root", () => {
    const zip = zipSync({
      "proj/README.md": strToU8("# hi\n".repeat(50)),
      "proj/src/index.ts": strToU8("export const a = 1;\n".repeat(40)),
      "proj/src/index.test.ts": strToU8("test('x', () => {});\n"),
      "proj/tsconfig.json": strToU8("{}"),
    });
    const files = readZip(zip);
    expect(files.map((f) => f.path).sort()).toEqual(["README.md", "src/index.test.ts", "src/index.ts", "tsconfig.json"]);
    const s = zipToSignals(files, "proj");
    expect(s.primaryLanguage).toBe("TypeScript");
    expect(s.hasTests).toBe(true);
    expect(s.stars).toBe(0);
  });

  it("rejects path traversal and absolute paths", () => {
    expect(() => validateEntryName("../../etc/passwd")).toThrow(ZipRejectedError);
    expect(() => validateEntryName("/etc/passwd")).toThrow(ZipRejectedError);
    expect(() => validateEntryName("C:\\Windows\\x")).toThrow(ZipRejectedError);
    const zip = zipSync({ "../../etc/passwd": strToU8("root:x:0:0") });
    expect(() => readZip(zip)).toThrow(/traversal/);
  });

  it("rejects a zip bomb (compression ratio)", () => {
    const zip = zipSync({ "bomb.txt": new Uint8Array(4 * 1024 * 1024) }, { level: 9 });
    expect(() => readZip(zip)).toThrow(/zip bomb/);
  });

  it("rejects garbage", () => {
    expect(() => readZip(strToU8("not a zip at all"))).toThrow(ZipRejectedError);
  });
});

describe("portfolio", () => {
  it("extracts text and meta from html", () => {
    const r = htmlToText(
      `<html><head><title>Jane</title><meta name="karmachain-verify" content="karma-verify-abc"></head><body><script>evil()</script><h1>Projects</h1><p>Tower &amp; bridge</p></body></html>`,
    );
    expect(r.title).toBe("Jane");
    expect(r.metas["karmachain-verify"]).toBe("karma-verify-abc");
    expect(r.text).toContain("Tower & bridge");
    expect(r.text).not.toContain("evil");
  });

  it("caps tiers without client reviews", () => {
    const proj = (i: number) => ({ title: `P${i}`, role: null, year: 2024, description: "A detailed description of the work done here.", links: ["https://x.com"], skills: [] });
    const p = { discipline: "design" as const, projects: [proj(1), proj(2), proj(3)] };
    expect(portfolioTier(p, 0).tier).toBe("medium");
    expect(portfolioTier(p, 2).tier).toBe("top");
    expect(portfolioTier({ ...p, projects: [proj(1)] }, 5).tier).toBe("basic");
  });

  it("finds the verify code in PDF text even with line breaks", () => {
    expect(pdfContainsCode("footer karma-verify-\nab12cd34", "karma-verify-ab12cd34")).toBe(true);
    expect(pdfContainsCode("nothing here", "karma-verify-ab12cd34")).toBe(false);
  });
});
