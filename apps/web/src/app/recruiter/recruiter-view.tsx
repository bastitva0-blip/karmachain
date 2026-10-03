"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { TIER_ORDER, type InterviewerStyle, type JobSpec, type MatchCandidate } from "@karma/shared";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Card, StateCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TierBadge, TIER_LABEL } from "@/components/tier-badge";
import { AskKarma } from "@/components/voice/ask-karma";
import { api, ApiError, errorMessage } from "@/lib/api";
import { recruiterHeaders } from "@/lib/recruiter-key";
import { postSse } from "@/lib/sse";
import { cn } from "@/lib/utils";
import { JobSettings, emptySpec } from "./job-settings";

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
}

const GREETING = "Hi! What role are you hiring for, and how senior?";

const newChatId = () => crypto.randomUUID().replace(/-/g, "");

export function RecruiterView() {
  const router = useRouter();
  const [chatId, setChatId] = useState<string>(() => newChatId());
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: "assistant", text: GREETING }]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [offline, setOffline] = useState(false);
  const [jobSpecId, setJobSpecId] = useState<string | null>(null);
  const [spec, setSpec] = useState<JobSpec | null>(null);
  const [style, setStyle] = useState<InterviewerStyle | null>(null);
  const [useStyle, setUseStyle] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const matches = useQuery({
    queryKey: ["matches", jobSpecId],
    queryFn: () => api<{ matches: MatchCandidate[] }>(`/recruiter/jobs/${jobSpecId}/matches`, { headers: recruiterHeaders() }).then((r) => r.matches),
    enabled: !!jobSpecId,
  });

  const userTurns = msgs.filter((m) => m.role === "user").length;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }, { role: "assistant", text: "" }]);
    setStreaming(true);
    try {
      for await (const ev of postSse("/recruiter/chat", { chatId, message: text }, undefined, recruiterHeaders())) {
        if (ev.event === "token") {
          const { text: t } = JSON.parse(ev.data) as { text: string };
          setMsgs((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", text: copy[copy.length - 1]!.text + t };
            return copy;
          });
        } else if (ev.event === "spec") {
          const d = JSON.parse(ev.data) as { jobSpecId: string; spec: JobSpec; style: InterviewerStyle | null };
          setJobSpecId(d.jobSpecId);
          setSpec(d.spec);
          setStyle(d.style);
          setSettingsOpen(true);
          setMsgs((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = {
              role: "assistant",
              text: `${last.text ? `${last.text}\n\n` : ""}Got it: ${d.spec.seniority} ${d.spec.title}. Here are the best verified matches. Tweak the interview settings any time.`,
            };
            return copy;
          });
        } else if (ev.event === "error") {
          toast.error((JSON.parse(ev.data) as { message: string }).message);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setOffline(true);
        setSettingsOpen(true);
      } else toast.error(errorMessage(err));
    } finally {
      setStreaming(false);
      setMsgs((m) => (m[m.length - 1]?.role === "assistant" && m[m.length - 1]?.text === "" ? m.slice(0, -1) : m));
    }
  }

  async function saveSpec(next: JobSpec) {
    try {
      const r = await api<{ jobSpecId: string }>("/recruiter/jobs", {
        method: "POST",
        headers: recruiterHeaders(),
        json: { chatId, spec: next, style: useStyle ? style : null },
      });
      setSpec(next);
      setJobSpecId(r.jobSpecId);
      toast.success("Settings saved. Matches updated.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function lowerTier() {
    if (!spec) return;
    const idx = TIER_ORDER.indexOf(spec.minTier);
    if (idx <= 0) return;
    await saveSpec({ ...spec, minTier: TIER_ORDER[idx - 1]! });
  }

  async function interview(handle: string) {
    if (!jobSpecId) return;
    setLaunching(handle);
    try {
      const r = await api<{ id: string }>("/interviews", {
        method: "POST",
        headers: recruiterHeaders(),
        json: { jobSpecId, candidateHandle: handle, useStyle },
      });
      router.push(`/interview/${r.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setLaunching(null);
    }
  }

  function reset() {
    void api("/recruiter/chat/reset", { method: "POST", headers: recruiterHeaders(), json: { chatId } }).catch(() => undefined);
    setChatId(newChatId());
    setMsgs([{ role: "assistant", text: GREETING }]);
    setJobSpecId(null);
    setSpec(null);
    setStyle(null);
  }

  const lower = spec && spec.minTier !== "basic" ? TIER_ORDER[TIER_ORDER.indexOf(spec.minTier) - 1]! : null;

  return (
    <div className="mx-auto grid w-full max-w-[1360px] items-start gap-6 p-6 lg:grid-cols-2">
      <Card className="flex min-h-[600px] flex-col lg:sticky lg:top-[92px] lg:h-[calc(100dvh-116px)]" aria-labelledby="chat-h">
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <h1 id="chat-h" className="display m-0 text-[22px] font-bold">
            Karma
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-ink-dim">{spec ? "Role ready" : `Step ${Math.min(userTurns + 1, 6)} of ~6`}</span>
            <Button variant="ghost" size="sm" onClick={reset}>
              New chat
            </Button>
          </div>
        </div>
        <div ref={feedRef} className="flex flex-1 flex-col gap-4 overflow-y-auto p-6" aria-live="polite" aria-busy={streaming}>
          {msgs.map((m, i) => {
            const typing = streaming && i === msgs.length - 1 && m.role === "assistant";
            return (
              <div
                key={i}
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap px-4 py-3.5 leading-normal",
                  m.role === "user"
                    ? "self-end rounded-[14px_14px_4px_14px] bg-karma text-ground"
                    : "self-start rounded-[14px_14px_14px_4px] bg-surface-2",
                )}
              >
                <span className="sr-only">{m.role === "user" ? "You: " : "Karma: "}</span>
                {m.text}
                {typing && <span aria-hidden className="ml-1 inline-block h-4 w-2 animate-pulse bg-karma align-middle" />}
              </div>
            );
          })}
        </div>
        {offline ? (
          <div className="border-t border-border p-4">
            <StateCard
              tone="warning"
              label="AI offline"
              title="Karma is unavailable"
              body="Fill the role form directly. Matching still works."
              action={
                <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                  Use the form
                </Button>
              }
            />
          </div>
        ) : (
          <form onSubmit={send} className="flex gap-2.5 border-t border-border p-4">
            <label htmlFor="msg" className="sr-only">
              Message Karma
            </label>
            <Input
              id="msg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the role, or say “go”"
              disabled={streaming}
              autoComplete="off"
            />
            <Button type="submit" disabled={streaming || !input.trim()}>
              {streaming ? <Loader2 className="animate-spin" aria-label="Sending" /> : "Send"}
            </Button>
          </form>
        )}
      </Card>

      <div className="flex flex-col gap-5">
        <JobSettings
          key={jobSpecId ?? "draft"}
          spec={spec ?? emptySpec()}
          style={style}
          useStyle={useStyle}
          onUseStyle={setUseStyle}
          onStyle={setStyle}
          onSave={saveSpec}
          open={settingsOpen}
          onToggle={setSettingsOpen}
        />

        <section aria-labelledby="mt-h" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="mt-h" className="display m-0 text-[22px] font-bold">
              Top matches
            </h2>
            <span className="text-[13px] text-ink-dim">Opted-in profiles only</span>
          </div>

          {!jobSpecId ? (
            <StateCard label="No role yet" title="Matches appear here" body="Tell Karma about the role to start." />
          ) : matches.isLoading || (!matches.data && !matches.error) ? (
            <>
              <Skeleton className="h-44" />
              <Skeleton className="h-44" />
            </>
          ) : matches.error ? (
            <StateCard
              tone="error"
              label="Couldn't load"
              title="Matches didn't load"
              body={errorMessage(matches.error)}
              action={
                <Button variant="outline" onClick={() => matches.refetch()}>
                  Retry
                </Button>
              }
            />
          ) : matches.data!.length === 0 ? (
            <StateCard
              label="No matches"
              title={`No one meets ${TIER_LABEL[spec?.minTier ?? "basic"]}${spec?.mustHaveSkills.length ? ` in ${spec.mustHaveSkills.join(", ")}` : ""}`}
              body={lower ? `Try ${TIER_LABEL[lower]}, or move a skill to nice-to-have.` : "Try fewer must-have skills."}
              action={
                lower ? (
                  <Button variant="outline" onClick={lowerTier}>
                    Lower to {TIER_LABEL[lower]}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {matches.data!.map((m, i) => (
                <motion.li key={m.handle} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <MatchCard m={m} rank={i + 1} launching={launching} onInterview={interview} />
                </motion.li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <AskKarma />
    </div>
  );
}

function MatchCard({
  m,
  rank,
  launching,
  onInterview,
}: {
  m: MatchCandidate;
  rank: number;
  launching: string | null;
  onInterview: (handle: string) => void;
}) {
  return (
    <Card className="flex flex-col gap-3.5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] text-karma">#{rank}</span>
          <Avatar src={m.avatarUrl} name={m.handle} size={40} tone={rank % 2 ? "karma" : "blue"} />
          <div className="flex flex-col gap-0.5">
            <strong>@{m.handle}</strong>
            {m.isDemo && <span className="text-xs text-ink-dim">Demo profile</span>}
          </div>
        </div>
        <span
          className="font-mono text-sm"
          title={`similarity ${m.parts.similarity} · tier fit ${m.parts.tierFit} · external ${m.parts.externalValidation}`}
        >
          {m.score.toFixed(2)} fit
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {m.skills.slice(0, 4).map((s) => (
          <TierBadge key={s.skill} tier={s.tier} label={`${s.language} · ${TIER_LABEL[s.tier]}`} />
        ))}
      </div>
      <ul className="m-0 list-disc pl-[18px] text-sm leading-[1.55] text-ink-muted">
        {m.reasons.map((r, j) => (
          <li key={j}>{r}</li>
        ))}
      </ul>
      <div className="flex gap-2.5">
        <Button asChild variant="outline" className="grow">
          <Link href={`/u/${m.handle}`}>View profile</Link>
        </Button>
        <Button className="grow" onClick={() => onInterview(m.handle)} disabled={launching !== null}>
          {launching === m.handle && <Loader2 className="animate-spin" aria-hidden />} Interview
        </Button>
      </div>
    </Card>
  );
}
