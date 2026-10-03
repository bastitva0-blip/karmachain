import { ApiError } from "./api";

export interface SseEvent {
  event: string;
  data: string;
}

/** POST that returns an SSE stream (EventSource can't POST). Yields parsed events. */
export async function* postSse(
  path: string,
  json: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): AsyncGenerator<SseEvent> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...headers },
    body: JSON.stringify(json),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    let code = "http_error";
    try {
      const j = (await res.json()) as { error?: { message?: string; code?: string } };
      msg = j.error?.message ?? msg;
      code = j.error?.code ?? code;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, code, msg);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
  }
}
