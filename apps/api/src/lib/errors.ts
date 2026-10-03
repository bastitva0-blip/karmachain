import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Sign in first") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const tooMany = (message = "Too many requests, slow down") =>
  new HttpError(429, "rate_limited", message);
export const unavailable = (code: string, message: string) => new HttpError(503, code, message);
