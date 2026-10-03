import { describe, expect, it } from "vitest";
import { app } from "../src/app";

describe("http", () => {
  it("health ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("me is null when signed out", async () => {
    const res = await app.request("/me");
    expect(await res.json()).toEqual({ user: null });
  });

  it("protected routes need a session", async () => {
    const res = await app.request("/wallet/nonce", {
      method: "POST",
      body: JSON.stringify({ address: "0x0000000000000000000000000000000000000001" }),
      headers: { "content-type": "application/json" },
    });
    expect(res.status).toBe(401);
  });

  it("oauth start reports missing config readably", async () => {
    const res = await app.request("/auth/github");
    expect([302, 503]).toContain(res.status);
  });

  it("callback rejects bad state", async () => {
    process.env.GITHUB_CLIENT_ID ??= "x";
    const res = await app.request("/auth/github/callback?code=a&state=b");
    expect([400, 503]).toContain(res.status);
  });
});
