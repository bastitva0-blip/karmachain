import { ImageResponse } from "next/og";
import type { Tier } from "@karma/shared";
import type { Profile } from "@/lib/types";

export const alt = "KarmaChain verified developer profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  ground: "#0B0A10",
  ink: "#EDEAF5",
  muted: "#B4AEC4",
  soft: "#C9C4D6",
  karma: "#B9A6FF",
  karmaHover: "#D6CBFF",
};
const TIER: Record<Tier, { bg: string; ink: string; label: string }> = {
  top: { bg: "#F5C66B", ink: "#2A1C00", label: "Top" },
  medium: { bg: "#8FB8FF", ink: "#04122B", label: "Medium" },
  basic: { bg: "#3A3550", ink: "#EDEAF5", label: "Basic" },
};

const API = (process.env.API_INTERNAL_URL ?? "http://localhost:8787").replace(/\/$/, "");

async function loadProfile(handle: string): Promise<Profile | null> {
  if (!/^[A-Za-z0-9-]{1,39}$|^0x[0-9a-fA-F]{40}$/.test(handle)) return null;
  try {
    const res = await fetch(`${API}/profile/${encodeURIComponent(handle)}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as Profile;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s-]/gu, "").split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "K";
}

function Seal({ px, stroke, fill = C.karma }: { px: number; stroke: number; fill?: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill={fill} />
      <path d="M24 17v30M24 35l15-18M30 29l11 18" stroke={C.ground} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function Frame({ right, children }: { right: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        backgroundColor: C.ground,
        backgroundImage: "radial-gradient(70% 90% at 85% 20%, #3B2A7A, #0B0A10 65%)",
        color: C.ink,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", right: -90, bottom: -120, opacity: 0.14, display: "flex" }}>
        <Seal px={520} stroke={5} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Seal px={48} stroke={6.5} />
          <span style={{ fontWeight: 700, fontSize: 32, letterSpacing: "-0.03em" }}>KarmaChain</span>
        </div>
        <span style={{ fontSize: 20, color: C.muted }}>{right}</span>
      </div>
      {children}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const profile = await loadProfile(handle);

  if (!profile) {
    return new ImageResponse(
      (
        <Frame right="Verified on Base">
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <span style={{ fontSize: 76, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.03em" }}>Proof of work, sealed.</span>
            <span style={{ fontSize: 28, color: C.karma }}>@{handle.slice(0, 39)}</span>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: C.soft }}>Soulbound skill tokens backed by public evidence.</div>
        </Frame>
      ),
      size,
    );
  }

  const { user, skills, trustSignals } = profile;
  const name = user.name?.trim() || user.githubHandle;
  const shown = [...skills]
    .filter((s) => s.verified !== false)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const stats = [
    `${trustSignals.externalMergedPrs} merged PR${trustSignals.externalMergedPrs === 1 ? "" : "s"}`,
    `${trustSignals.reviewCount} signed review${trustSignals.reviewCount === 1 ? "" : "s"}`,
  ].join(" · ");

  return new ImageResponse(
    (
      <Frame right={user.isDemo ? "Demo profile · Base Sepolia" : "Verified on Base"}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              width: 168,
              height: 168,
              borderRadius: 999,
              backgroundImage: "linear-gradient(135deg, #3A2A6A, #2A2340)",
              border: `4px solid ${C.karma}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 64,
              fontWeight: 800,
              color: C.karmaHover,
              flexShrink: 0,
            }}
          >
            {initials(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
            <span style={{ fontSize: name.length > 18 ? 60 : 76, fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.03em" }}>
              {name.slice(0, 32)}
            </span>
            <span style={{ fontSize: 26, color: C.karma }}>@{user.githubHandle}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
          <div style={{ display: "flex", gap: 14 }}>
            {shown.length === 0 ? (
              <span style={{ fontSize: 24, color: C.muted }}>No skills sealed yet</span>
            ) : (
              shown.map((s, i) => {
                const t = TIER[s.tier] ?? TIER.basic;
                return (
                  <span
                    key={s.skill}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      fontWeight: 700,
                      padding: "8px 18px",
                      borderRadius: 999,
                      fontSize: 24,
                      backgroundColor: t.bg,
                      color: t.ink,
                    }}
                  >
                    {`${s.language} · ${t.label}${i === 0 ? ` ${s.score}` : ""}`}
                  </span>
                );
              })
            )}
          </div>
          <span style={{ fontSize: 24, color: C.soft }}>{stats}</span>
        </div>
      </Frame>
    ),
    size,
  );
}
