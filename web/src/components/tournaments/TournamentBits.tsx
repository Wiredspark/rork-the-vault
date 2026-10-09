import { Award, Coins, Crown, Gift, Lock, Medal, Star, Ticket, Trophy } from "lucide-react";
import { memo, useEffect, useState } from "react";

import type { TournamentStatus, TournamentSummary, TrophyCounts } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  draft: "Draft",
  scheduled: "Upcoming",
  qualifying: "Qualifiers open",
  locking: "Finalists locked",
  checkin: "Check-in open",
  final: "Final live",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The next milestone a player cares about, and how to phrase it. */
export function nextMilestone(t: TournamentSummary): { label: string; at: number } | null {
  const c = t.config;
  switch (t.status) {
    case "scheduled":
      return { label: "Qualifiers open in", at: c.qualStart };
    case "qualifying":
      return { label: "Qualifiers close in", at: c.qualEnd };
    case "locking":
      return { label: "Check-in opens in", at: t.checkinAt };
    case "checkin":
      return { label: "Final starts in", at: c.finalsAt };
    default:
      return null;
  }
}

/** Ticks once a second; returns ms remaining (never negative). */
export function useTicker(at: number | null): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [at]);
  return at === null ? 0 : Math.max(0, at - now);
}

export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Big tabular countdown to the next phase. */
export function PhaseCountdown({ t, size = "md", className }: { t: TournamentSummary; size?: "md" | "lg"; className?: string }) {
  const milestone = nextMilestone(t);
  const left = useTicker(milestone?.at ?? null);
  if (!milestone) return null;
  return (
    <div className={cn("flex flex-col", className)}>
      <span className="hud-label text-[9.5px]">{milestone.label}</span>
      <span className={cn("vault-display tabular leading-none text-vault-neonhi", size === "lg" ? "mt-1.5 text-[34px] sm:text-[44px]" : "mt-1 text-[22px]")} aria-live="off">
        {left > 0 ? formatClock(left) : "Any moment"}
      </span>
    </div>
  );
}

export function StatusPill({ status, paused, className }: { status: TournamentStatus; paused?: boolean; className?: string }) {
  const live = status === "qualifying" || status === "checkin" || status === "final";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em]",
        paused
          ? "border-vault-danger/50 text-vault-danger"
          : live
            ? "border-vault-success/50 bg-vault-success/[0.08] text-vault-success"
            : status === "completed"
              ? "border-vault-neon/50 text-vault-neonhi"
              : status === "cancelled"
                ? "border-vault-line text-vault-muted line-through"
                : "border-vault-neon/35 text-vault-neon",
        className,
      )}
    >
      {live && !paused && <span aria-hidden="true" className="h-1.5 w-1.5 animate-live-dot rounded-full bg-vault-success" />}
      {paused ? "Paused" : STATUS_LABEL[status]}
    </span>
  );
}

export function EntryChips({ t, className }: { t: TournamentSummary; className?: string }) {
  const c = t.config;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="inline-flex items-center gap-1 rounded-full border border-vault-line bg-vault-ink/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-ice/75">
        {c.entryType === "invite" ? <Lock className="h-3 w-3 text-vault-neon" aria-hidden="true" /> : <Star className="h-3 w-3 text-vault-neon" aria-hidden="true" />}
        {c.entryType === "invite" ? "Invite-only" : "Open"}
      </span>
      {c.entryFee > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-vault-neon/40 bg-vault-neon/[0.08] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-neonhi">
          <Ticket className="h-3 w-3" aria-hidden="true" /> Entry {formatMoney(c.entryFee)}
        </span>
      )}
      {c.cap !== null && (
        <span className="inline-flex items-center gap-1 rounded-full border border-vault-line bg-vault-ink/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-ice/75 tabular">
          {t.entrants}/{c.cap} seats
        </span>
      )}
    </div>
  );
}

/** VC pool, badges, title, custom prize — stacked like chips in a vault drawer. */
export function PrizeStack({ t, compact, className }: { t: TournamentSummary; compact?: boolean; className?: string }) {
  const p = t.config.prizes;
  const growing = t.config.entryFee > 0 && ["scheduled", "qualifying"].includes(t.status);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-vault-neon/40 bg-vault-neon/10">
          <Coins className="h-5 w-5 text-vault-neon" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="hud-label text-[9.5px]">Prize pool{growing ? " · growing" : ""}</p>
          <p className={cn("vault-display tabular leading-none text-vault-neonhi", compact ? "mt-1 text-[20px]" : "mt-1 text-[26px]")}>{formatMoney(t.prizePool)}</p>
        </div>
      </div>
      {!compact && <p className="font-mono text-[10.5px] text-vault-muted tabular">Split {p.split.map((s, i) => `${ordinal(i + 1)} ${s}%`).join(" · ")}</p>}
      <div className="flex flex-wrap gap-1.5">
        {p.badges && (
          <span className="inline-flex items-center gap-1 rounded-md border border-vault-line bg-vault-ink/60 px-2 py-1 text-[12px] text-vault-ice/80">
            <Medal className="h-3.5 w-3.5 text-vault-neon" aria-hidden="true" /> Trophy badges
          </span>
        )}
        {p.title && (
          <span className="inline-flex items-center gap-1 rounded-md border border-vault-neon/40 bg-vault-neon/[0.07] px-2 py-1 text-[12px] text-vault-neonhi">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" /> “{p.title}”
          </span>
        )}
        {p.custom && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-vault-line bg-vault-ink/60 px-2 py-1 text-[12px] text-vault-ice/80">
            <Gift className="h-3.5 w-3.5 shrink-0 text-vault-neon" aria-hidden="true" /> <span className="truncate">{p.custom}</span>
          </span>
        )}
      </div>
    </div>
  );
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Compact trophy row for leaderboards and stats: champion / finalist / qualifier counts. */
export const TrophyBadges = memo(function TrophyBadges({ trophies, title, className }: { trophies?: TrophyCounts; title?: string | null; className?: string }) {
  if (!trophies && !title) return null;
  const items = [
    { n: trophies?.champion ?? 0, icon: Trophy, label: "Champion", tone: "text-vault-neonhi border-vault-neon/60 bg-vault-neon/15" },
    { n: trophies?.finalist ?? 0, icon: Award, label: "Finalist", tone: "text-vault-ice border-vault-ice/30 bg-white/[0.06]" },
    { n: trophies?.qualifier ?? 0, icon: Medal, label: "Qualifier", tone: "text-[#E5C9A6] border-[#B08D57]/50 bg-[#B08D57]/10" },
  ].filter((i) => i.n > 0);
  if (!items.length && !title) return null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {title && (
        <span className="inline-flex items-center gap-1 rounded-full border border-vault-neon/60 bg-vault-neon/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-vault-neonhi" title={title}>
          <Crown className="h-2.5 w-2.5" aria-hidden="true" />
          <span className="max-w-[120px] truncate">{title}</span>
        </span>
      )}
      {items.map(({ n, icon: Icon, label, tone }) => (
        <span key={label} className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] tabular", tone)} title={`${n} × ${label}`}>
          <Icon className="h-2.5 w-2.5" aria-hidden="true" />
          {n > 1 ? n : ""}
          <span className="sr-only">{`${n} ${label}`}</span>
        </span>
      ))}
    </span>
  );
});
