type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEYS = /api_?key|private_?key|secret|password|authorization|cookie|signature|^token$|access_?token|refresh_?token|github_?token/i;

function scrub(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== "object") return v;
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => scrub(x, depth + 1));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, val]) => [
      k,
      SECRET_KEYS.test(k) ? "[redacted]" : scrub(val, depth + 1),
    ]),
  );
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...((scrub(fields) as object | undefined) ?? {}),
  });
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
};
