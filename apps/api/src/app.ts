import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { requestId } from "hono/request-id";
import type { Health } from "@karma/shared";
import { ConfigMissingError } from "./env";
import { healthChecks } from "./lib/health";
import { githubAuth } from "./auth/github";
import { sessionMiddleware } from "./auth/session";
import { HttpError } from "./lib/errors";
import { log } from "./lib/logger";
import { me } from "./routes/me";
import { analysis } from "./routes/analysis";
import { chain } from "./routes/chain";
import { recruiter } from "./routes/recruiter";
import { feed } from "./routes/feed";
import { admin } from "./routes/admin";
import { verify } from "./routes/verify";
import { interviews } from "./routes/interviews";
import { voice } from "./routes/voice";
import { reviews } from "./routes/reviews";
import { ingest } from "./routes/ingest";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

app.use("*", requestId());
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  log.info("request", {
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms: Date.now() - start,
  });
});
// Default 1 MB body cap. Upload routes set their own higher limit.
app.use("*", async (c, next) => {
  if (/^\/(ingest\/zip|ingest\/pdf\/(?!start)|voice\/scribe)/.test(c.req.path)) return next();
  return bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: { code: "too_large", message: "Request body too large" } }, 413),
  })(c, next);
});
app.use("*", sessionMiddleware);

app.get("/health", async (c) => {
  // Process liveness is `ok`; dependency status is informational (cached 60 s) so a missing
  // optional integration never fails the Railway health check.
  const checks = c.req.query("deep") === "0" ? undefined : await healthChecks();
  const body: Health = { ok: true, service: "karma-api", time: new Date().toISOString(), checks };
  return c.json(body);
});

app.route("/auth", githubAuth);
app.route("/", me);
app.route("/", analysis);
app.route("/", chain);
app.route("/", recruiter);
app.route("/", feed);
app.route("/", admin);
app.route("/", verify);
app.route("/", interviews);
app.route("/", voice);
app.route("/", reviews);
app.route("/", ingest);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  if (err instanceof ConfigMissingError) {
    log.warn("feature not configured", { missing: err.keys.join(",") });
    return c.json(
      { error: { code: "not_configured", message: "This feature isn't configured on the server yet." } },
      503,
    );
  }
  log.error("unhandled", { requestId: c.get("requestId"), path: c.req.path, err });
  return c.json({ error: { code: "internal", message: "Something went wrong. Please retry." } }, 500);
});
