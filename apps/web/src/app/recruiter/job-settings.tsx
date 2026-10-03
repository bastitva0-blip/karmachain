"use client";

import { useState } from "react";
import { MAX_INTERVIEW_MINUTES, styleToText, type InterviewerStyle, type JobSpec, type Track } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function emptySpec(): JobSpec {
  return {
    title: "",
    seniority: "mid",
    mustHaveSkills: [],
    niceToHave: [],
    minTier: "basic",
    softSkills: [],
    interview: { tracks: ["technical", "behavioural"], difficulty: "medium", durationMinutes: 3, customQuestions: [], tone: "friendly" },
  };
}

const TRACKS: { id: Track; label: string }[] = [
  { id: "technical", label: "Technical" },
  { id: "system_design", label: "System design" },
  { id: "behavioural", label: "Behavioural" },
  { id: "role_specific", label: "Role-specific" },
];

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** Role + interview settings, pre-filled from the chat, all editable. Also the manual path when the AI is offline. */
export function JobSettings({
  spec,
  style,
  useStyle,
  onUseStyle,
  onStyle,
  onSave,
  open,
  onToggle,
}: {
  spec: JobSpec;
  style: InterviewerStyle | null;
  useStyle: boolean;
  onUseStyle: (v: boolean) => void;
  onStyle: (s: InterviewerStyle | null) => void;
  onSave: (s: JobSpec) => Promise<void>;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<JobSpec>(spec);
  const [skills, setSkills] = useState(spec.mustHaveSkills.join(", "));
  const [nice, setNice] = useState(spec.niceToHave.join(", "));
  const [questions, setQuestions] = useState(spec.interview.customQuestions.join("\n"));
  const [saving, setSaving] = useState(false);

  const iv = draft.interview;
  const setIv = (p: Partial<JobSpec["interview"]>) => setDraft((d) => ({ ...d, interview: { ...d.interview, ...p } }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    await onSave({
      ...draft,
      mustHaveSkills: list(skills),
      niceToHave: list(nice),
      interview: {
        ...iv,
        tracks: iv.tracks.length ? iv.tracks : ["technical"],
        customQuestions: questions
          .split("\n")
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 5),
      },
    });
    setSaving(false);
  }

  return (
    <Card className="p-6">
      <details open={open} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="display cursor-pointer text-xl font-bold">Role &amp; interview settings</summary>
        <form onSubmit={save} className="mt-5 flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-3">
            <Label>
              Role
              <Input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Senior Backend Engineer" />
            </Label>
            <Label>
              Min tier
              <Select value={draft.minTier} onChange={(e) => setDraft({ ...draft, minTier: e.target.value as JobSpec["minTier"] })}>
                <option value="basic">Basic</option>
                <option value="medium">Medium</option>
                <option value="top">Top</option>
              </Select>
            </Label>
            <Label>
              Must-have skills
              <Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="TypeScript, Go" />
            </Label>
            <Label>
              Seniority
              <Select value={draft.seniority} onChange={(e) => setDraft({ ...draft, seniority: e.target.value as JobSpec["seniority"] })}>
                {["junior", "mid", "senior", "lead"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Label>
          </div>
          <Label>
            Nice to have
            <Input value={nice} onChange={(e) => setNice(e.target.value)} placeholder="Kubernetes, Postgres" />
          </Label>

          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 text-[13px] text-ink-muted">Tracks</legend>
            <div className="flex flex-wrap gap-2">
              {TRACKS.map((t) => {
                const on = iv.tracks.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setIv({ tracks: on ? iv.tracks.filter((x) => x !== t.id) : [...iv.tracks, t.id] })}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full border px-3.5 text-sm",
                      on ? "border-karma bg-surface-2 text-ink" : "border-border-strong text-ink-muted hover:text-ink",
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-3 gap-3">
            <Label>
              Difficulty
              <Select value={iv.difficulty} onChange={(e) => setIv({ difficulty: e.target.value as JobSpec["interview"]["difficulty"] })}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Label>
            <Label>
              Duration
              <Select value={iv.durationMinutes} onChange={(e) => setIv({ durationMinutes: Number(e.target.value) })}>
                {Array.from({ length: MAX_INTERVIEW_MINUTES }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            </Label>
            <Label>
              Tone
              <Select value={iv.tone} onChange={(e) => setIv({ tone: e.target.value as JobSpec["interview"]["tone"] })}>
                <option value="friendly">Friendly</option>
                <option value="neutral">Neutral</option>
                <option value="strict">Strict</option>
              </Select>
            </Label>
          </div>
          <Label>
            Custom questions (one per line)
            <Textarea rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} placeholder="How would you make a payment webhook idempotent?" />
          </Label>

          <div className="flex items-center justify-between gap-3">
            <label htmlFor="mirror" className="flex flex-col gap-1">
              <span className="font-semibold">Mirror my style</span>
              <span className="text-[13px] text-ink-dim">
                {style ? styleToText(style) : "Learned from your chat messages once the role is set."} A persona, not voice cloning.
              </span>
            </label>
            <Switch id="mirror" checked={useStyle && !!style} disabled={!style} onCheckedChange={onUseStyle} />
          </div>
          {style && useStyle && (
            <Label>
              Style notes
              <Input maxLength={200} value={style.notes} onChange={(e) => onStyle({ ...style, notes: e.target.value })} />
            </Label>
          )}
          <Button type="submit" className="self-start" disabled={saving || !draft.title.trim()}>
            {saving ? "Saving…" : "Save and update matches"}
          </Button>
        </form>
      </details>
    </Card>
  );
}
