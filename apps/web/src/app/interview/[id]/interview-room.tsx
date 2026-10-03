"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConversationProvider } from "@elevenlabs/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/api";
import type { InterviewView, SessionInfo } from "@/lib/interview-types";
import { cn } from "@/lib/utils";
import { MicCheck, type MicState } from "./mic-check";
import { VoiceCall } from "./voice-call";
import { TextInterview } from "./text-interview";

type Phase = "pre" | "voice" | "text";

export function InterviewRoom({ id, forceFallback }: { id: string; forceFallback: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pre");
  const [chosenMode, setMode] = useState<"voice" | "text">(forceFallback ? "text" : "voice");
  const [consent, setConsent] = useState(false);
  const [mic, setMic] = useState<MicState>("unknown");
  const mode = mic === "denied" ? "text" : chosenMode;
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const q = useQuery({ queryKey: ["interview", id], queryFn: () => api<InterviewView>(`/interviews/${id}`) });

  const finished = q.data?.status === "done" || q.data?.status === "processing";
  useEffect(() => {
    if (finished) router.replace(`/interview/${id}/report`);
  }, [finished, id, router]);


  async function start() {
    setStarting(true);
    try {
      const s = await api<SessionInfo>(`/interviews/${id}/session${mode === "text" ? "?fallback=1" : ""}`);
      setSession(s);
      if (mode === "voice" && s.fallback) {
        setNotice(
          s.reason === "quota" ? "Voice quota reached. Switching to text, nothing lost." : "Voice is unavailable right now. Switching to text, nothing lost.",
        );
        setPhase("text");
      } else setPhase(s.fallback ? "text" : "voice");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStarting(false);
    }
  }

  if (q.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-6 py-16" aria-busy>
        <Skeleton className="mb-4 h-10 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div className="mx-auto w-full max-w-[960px] px-6 py-16">
        <StateCard
          label="Not found"
          title="This interview link has expired or doesn't exist"
          body={q.error ? errorMessage(q.error) : undefined}
          action={
            <Button asChild variant="outline">
              <Link href="/">Back to KarmaChain</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const iv = q.data;
  if (finished) return null;

  if (phase === "voice" && session?.signedUrl) {
    return (
      <ConversationProvider>
        <VoiceCall
          iv={iv}
          session={session}
          onFallback={(msg) => {
            setNotice(msg);
            setPhase("text");
          }}
          onDone={() => router.push(`/interview/${id}/report`)}
        />
      </ConversationProvider>
    );
  }
  if (phase === "text" && session) {
    return <TextInterview iv={iv} notice={notice} onDone={() => router.push(`/interview/${id}/report`)} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-2.5">
        <Eyebrow>Interview · {iv.roleTitle}</Eyebrow>
        <h1 className="display m-0 text-[clamp(32px,5vw,44px)] font-extrabold leading-tight">Ready when you are, @{iv.candidateHandle}</h1>
        <p className="m-0 text-[17px] text-ink-muted">
          About {iv.maxMinutes} minute{iv.maxMinutes === 1 ? "" : "s"} with Karma, a voice interviewer. One question at a time.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="flex flex-col gap-3.5 p-6" aria-labelledby="q-h">
          <h2 id="q-h" className="display m-0 text-xl font-bold">
            What we&apos;ll cover
          </h2>
          <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 leading-normal text-ink-muted">
            {iv.questions.map((qq, i) => (
              <li key={i}>{qq.text}</li>
            ))}
          </ol>
        </Card>
        <Card className="flex flex-col gap-4 p-6" aria-labelledby="mc-h">
          <h2 id="mc-h" className="display m-0 text-xl font-bold">
            Mic check
          </h2>
          <MicCheck onState={setMic} />
        </Card>
      </div>

      <fieldset className="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
        <legend className="display mb-3 text-xl font-bold">How do you want to answer?</legend>
        {(
          [
            ["voice", "Voice", "Talk naturally. Live captions on screen."],
            ["text", "Text", "Type answers. Questions can be read aloud."],
          ] as const
        ).map(([value, label, hint]) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer flex-col gap-1.5 rounded-[14px] border p-[18px]",
              mode === value ? "border-karma bg-surface-2" : "border-border-strong",
              value === "voice" && mic === "denied" && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="flex items-center gap-2.5">
              <input
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                disabled={value === "voice" && mic === "denied"}
                onChange={() => setMode(value)}
                className="accent-[var(--karma)]"
              />
              <strong>{label}</strong>
            </span>
            <span className="text-sm text-ink-dim">{hint}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 rounded-[14px] border border-border p-[18px] leading-normal">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--karma)]"
        />
        <span>
          I agree this call is recorded and transcribed. An AI drafts a report; a human makes the decision. No accent, tone or
          personality scoring.
        </span>
      </label>

      <Button size="lg" className="self-start" onClick={start} disabled={!consent || starting}>
        {starting && <Loader2 className="animate-spin" aria-hidden />} Start interview
      </Button>
    </div>
  );
}
