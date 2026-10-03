"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Tier } from "@karma/shared";
import { Button } from "@/components/ui/button";
import { Card, Eyebrow, StateCard } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { GithubIcon } from "@/components/icons";
import { TierBadge, TIER_LABEL } from "@/components/tier-badge";
import { TxLink } from "@/components/tx-link";
import { useMe } from "@/hooks/use-me";
import { api, errorMessage } from "@/lib/api";
import type { MintOutcome } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Project {
  title: string;
  role: string | null;
  year: number | null;
  description: string;
  links: string[];
  skills: string[];
}
interface Ingestion {
  id: string;
  kind: "url" | "pdf";
  source: string;
  verifyCode: string;
  verified: boolean;
  label: string;
  extracted: { discipline: "design" | "architecture" | "other"; projects: Project[]; llmUnavailable?: boolean; confirmed?: boolean } | null;
  message?: string;
}

type Tab = "url" | "pdf" | "zip";
const TABS: [Tab, string][] = [
  ["url", "Portfolio URL"],
  ["pdf", "PDF"],
  ["zip", "Code zip"],
];

async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(`/api${path}`, { method: "POST", body: form, credentials: "include" });
  const j = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(j.error?.message ?? `Upload failed (${res.status})`);
  return j;
}

export function ImportView() {
  const { me, loading } = useMe();
  const [tab, setTab] = useState<Tab>("url");
  const [ing, setIng] = useState<Ingestion | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-7 px-6 pb-24 pt-12">
      <div className="flex flex-col gap-2">
        <Eyebrow>Import</Eyebrow>
        <h1 className="display m-0 text-[40px] font-extrabold leading-tight">Bring work that isn&apos;t on GitHub</h1>
        <p className="m-0 text-ink-muted">Designers, architects and private codebases. Prove it&apos;s yours to mint.</p>
      </div>

      {loading ? null : !me ? (
        <StateCard
          className="max-w-md"
          label="Signed out"
          title="Sign in to import"
          action={
            <Button asChild>
              <a href="/api/auth/github">
                <GithubIcon className="size-[18px]" /> Continue with GitHub
              </a>
            </Button>
          }
        />
      ) : (
        <>
          <div role="tablist" aria-label="Source" className="flex border-b border-border">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                id={`tab-${id}`}
                onClick={() => {
                  setTab(id);
                  setIng(null);
                }}
                className={cn(
                  "-mb-px h-12 border-b-2 px-5 text-[15px] font-medium",
                  tab === id ? "border-karma text-ink" : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-5">
            {tab === "url" && <UrlProof ing={ing} onChange={setIng} />}
            {tab === "pdf" && <PdfProof ing={ing} onChange={setIng} />}
            {tab === "zip" && <ZipImport />}
            {ing && tab !== "zip" && <Projects key={ing.id} ing={ing} onChange={setIng} />}
          </div>
        </>
      )}
    </div>
  );
}

function CodeBox({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-karma bg-ground px-4 py-3.5">
      <span className="flex-1 break-all font-mono text-base text-karma">{code}</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          toast.success("Copied");
        }}
      >
        Copy
      </Button>
    </div>
  );
}

function UrlProof({ ing, onChange }: { ing: Ingestion | null; onChange: (i: Ingestion) => void }) {
  const [url, setUrl] = useState(ing?.source ?? "");
  const [busy, setBusy] = useState<"fetch" | "check" | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);

  async function fetchUrl(e: React.FormEvent) {
    e.preventDefault();
    setBusy("fetch");
    try {
      onChange(await api<Ingestion>("/ingest/url", { method: "POST", json: { url } }));
      setMissing(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function check() {
    if (!ing) return;
    setBusy("check");
    try {
      const r = await api<Ingestion>(`/ingest/${ing.id}/verify`, { method: "POST" });
      onChange(r);
      setCheckedAt(Date.now());
      setMissing(!r.verified);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-[18px] p-7">
        <Eyebrow>1 · Prove ownership</Eyebrow>
        <form onSubmit={fetchUrl} className="flex flex-wrap gap-2.5">
          <label htmlFor="pf-url" className="sr-only">
            Portfolio URL
          </label>
          <Input id="pf-url" type="url" required placeholder="https://your-portfolio.com" value={url} onChange={(e) => setUrl(e.target.value)} className="min-w-[220px] flex-1" />
          <Button type="submit" variant="outline" disabled={busy !== null}>
            {busy === "fetch" && <Loader2 className="animate-spin" aria-hidden />} Fetch
          </Button>
        </form>
        {ing && (
          <>
            <p className="m-0 leading-normal text-ink-muted">
              Add this code to your page body, a <span className="font-mono">&lt;meta name=&quot;karmachain-verify&quot;&gt;</span> tag, or{" "}
              <span className="font-mono">/.well-known/karmachain.txt</span>:
            </p>
            <CodeBox code={ing.verifyCode} />
            <div className="flex flex-wrap items-center gap-3" aria-live="polite">
              <Button onClick={check} disabled={busy !== null || ing.verified}>
                {busy === "check" && <Loader2 className="animate-spin" aria-hidden />} Check now
              </Button>
              {ing.verified && (
                <span className="text-sm text-verified">
                  ✓ Verified{checkedAt ? " just now" : ""}
                </span>
              )}
            </div>
          </>
        )}
      </Card>
      {missing && ing && !ing.verified && (
        <StateCard tone="warning" label="Unverified" title="Code not found on page" body="Saved privately as self-declared. Add the code and check again." />
      )}
    </>
  );
}

function PdfProof({ ing, onChange }: { ing: Ingestion | null; onChange: (i: Ingestion) => void }) {
  const [pending, setPending] = useState<Ingestion | null>(ing);
  const [busy, setBusy] = useState(false);

  async function start() {
    try {
      setPending(await api<Ingestion>("/ingest/pdf/start", { method: "POST" }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  async function send(file: File) {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await upload<Ingestion>(`/ingest/pdf/${pending.id}`, file);
      setPending(r);
      onChange(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-[18px] p-7">
        <Eyebrow>1 · Prove ownership</Eyebrow>
        {!pending ? (
          <>
            <p className="m-0 text-ink-muted">We&apos;ll give you a code to put inside your PDF (a footer works). Without it, the import stays self-declared.</p>
            <Button className="self-start" onClick={start}>
              Get my verification code
            </Button>
          </>
        ) : (
          <>
            <p className="m-0 text-ink-muted">Add this code anywhere in your PDF, export it, then upload (max 10 MB):</p>
            <CodeBox code={pending.verifyCode} />
            <Label>
              PDF file
              <input
                type="file"
                accept="application/pdf"
                disabled={busy}
                onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])}
                className="text-sm text-ink file:mr-3 file:h-11 file:rounded-[10px] file:border file:border-border-strong file:bg-transparent file:px-4 file:text-ink"
              />
            </Label>
            {busy && (
              <span className="flex items-center gap-2 text-sm text-ink-dim" aria-live="polite">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Reading your PDF…
              </span>
            )}
            {pending.source !== "pending-upload" && (
              <span className={cn("text-sm", pending.verified ? "text-verified" : "text-warning")}>
                {pending.verified ? "✓ Code found. Ownership verified." : "Code not found in the PDF. Saved privately as self-declared."}
              </span>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Projects({ ing, onChange }: { ing: Ingestion; onChange: (i: Ingestion) => void }) {
  const [projects, setProjects] = useState<Project[]>(ing.extracted?.projects ?? []);
  const [discipline, setDiscipline] = useState(ing.extracted?.discipline ?? "other");
  const [busy, setBusy] = useState(false);
  const [minted, setMinted] = useState<{ tier: Tier; tx: string | null } | null>(null);

  const update = (i: number, p: Partial<Project>) => setProjects((ps) => ps.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const add = () => setProjects((ps) => [...ps, { title: "New project", role: null, year: null, description: "", links: [], skills: [] }]);

  async function confirmAndMint() {
    setBusy(true);
    try {
      const saved = await api<Ingestion>(`/ingest/${ing.id}/projects`, { method: "PUT", json: { discipline, projects } });
      onChange(saved);
      if (!saved.verified) {
        toast.success("Projects saved privately as self-declared.");
        return;
      }
      const a = await api<{ analysisId: string; tier: Tier }>(`/ingest/${ing.id}/analysis`, { method: "POST" });
      const m = await api<MintOutcome>("/mint", { method: "POST", json: { analysisId: a.analysisId } });
      setMinted({ tier: a.tier, tx: m.txHash });
      toast.success(m.message);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {ing.extracted?.llmUnavailable && projects.length === 0 && (
        <StateCard
          tone="error"
          label="Extraction offline"
          title="Add projects by hand"
          action={
            <Button variant="outline" onClick={add}>
              Add project
            </Button>
          }
        />
      )}
      <Card className="flex flex-col gap-4 p-7">
        <Eyebrow>2 · Check extracted projects</Eyebrow>
        <Label className="max-w-xs">
          Discipline
          <Select value={discipline} onChange={(e) => setDiscipline(e.target.value as typeof discipline)}>
            <option value="design">Design</option>
            <option value="architecture">Architecture</option>
            <option value="other">Other</option>
          </Select>
        </Label>
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {projects.map((p, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl border border-[#2A2638] p-[18px]">
              <div className="flex items-end gap-2">
                <Label className="flex-1 text-xs text-ink-dim">
                  Title
                  <Input value={p.title} onChange={(e) => update(i, { title: e.target.value })} />
                </Label>
                <Button variant="ghost" size="icon" aria-label={`Remove ${p.title}`} onClick={() => setProjects((ps) => ps.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <Input aria-label="Role" placeholder="Role" value={p.role ?? ""} onChange={(e) => update(i, { role: e.target.value || null })} />
                <Input aria-label="Year" placeholder="Year" type="number" value={p.year ?? ""} onChange={(e) => update(i, { year: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <Textarea aria-label="Description" rows={2} maxLength={300} value={p.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="What you did" />
              <Input
                aria-label="Links (comma separated)"
                placeholder="Links, comma separated"
                value={p.links.join(", ")}
                onChange={(e) => update(i, { links: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              />
              {p.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {p.skills.map((s) => (
                    <span key={s} className="rounded-md border border-border-strong px-2 py-[3px] font-mono text-xs text-ink-dim">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
        <Button variant="outline" className="self-start" onClick={add}>
          Add project
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-ink-dim">Portfolio tokens cap at Medium. Top needs 2+ client attestations.</span>
          <Button onClick={confirmAndMint} disabled={busy || projects.length === 0}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {ing.verified ? "Confirm & mint portfolio token" : "Save as self-declared"}
          </Button>
        </div>
        {minted && (
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
            Minted at <TierBadge tier={minted.tier} /> tier {minted.tx && <TxLink hash={minted.tx} />}
          </p>
        )}
      </Card>
    </>
  );
}

function ZipImport() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ language: string; tier: Tier; score: number; label: string; note: string } | null>(null);

  async function send(file: File) {
    setBusy(true);
    setResult(null);
    try {
      setResult(await upload("/ingest/zip", file));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card className="flex flex-col gap-[18px] p-7">
        <Eyebrow>Private code</Eyebrow>
        <p className="m-0 leading-normal text-ink-muted">
          Your code is analysed in memory and discarded. Results are self-declared, capped at Medium, private to you and never minted.
        </p>
        <Label>
          Zip archive (max 20 MB)
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])}
            className="text-sm text-ink file:mr-3 file:h-11 file:rounded-[10px] file:border file:border-border-strong file:bg-transparent file:px-4 file:text-ink"
          />
        </Label>
        {busy && (
          <span className="flex items-center gap-2 text-sm text-ink-dim" aria-live="polite">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Analysing in memory…
          </span>
        )}
      </Card>
      {result && (
        <StateCard
          role="status"
          label="Zip result"
          title={`${result.language} · ${TIER_LABEL[result.tier]} · ${result.score}`}
          body={
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-warning">Self-declared, unverified. Never mints.</span>
              <span className="text-[13px] text-ink-dim">Analysed in memory and discarded.</span>
            </div>
          }
        />
      )}
    </>
  );
}
