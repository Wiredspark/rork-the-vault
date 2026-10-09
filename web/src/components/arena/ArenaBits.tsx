import { Crown, WifiOff } from "lucide-react";
import { memo } from "react";

import { cn } from "@/lib/utils";
import { initialsFor } from "@/providers/AuthProvider";

/** Pulsing green dot used for "live" states. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2 w-2 animate-live-dot rounded-full bg-vault-success", className)} />;
}

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
  dimmed?: boolean;
  away?: boolean;
  host?: boolean;
  className?: string;
}

/** Initials avatar with a gold ring; dims for away players and wears a crown for the host. */
export const PlayerAvatar = memo(function PlayerAvatar({ name, size = "md", highlight, dimmed, away, host, className }: AvatarProps) {
  const dims = size === "lg" ? "h-16 w-16 text-[18px]" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-11 w-11 text-[13px]";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "flex items-center justify-center rounded-full border font-mono font-medium tabular transition-all",
          dims,
          highlight ? "border-vault-neon bg-vault-neon/20 text-vault-neonhi shadow-[0_0_18px_-4px_rgba(207,171,92,0.8)]" : "border-vault-neon/35 bg-vault-raised text-vault-ice/85",
          (dimmed || away) && "opacity-40",
        )}
      >
        {initialsFor(name)}
      </span>
      {host && (
        <span className="absolute -right-1 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-vault-neon/50 bg-vault-ink">
          <Crown className="h-3 w-3 text-vault-neon" aria-hidden="true" />
        </span>
      )}
      {away && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-vault-danger/50 bg-vault-ink">
          <WifiOff className="h-3 w-3 text-vault-danger" aria-hidden="true" />
        </span>
      )}
    </span>
  );
});

/** Small labelled stat used across lobby, results and admin. */
export function MiniStat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-vault-line bg-vault-panel/80 px-3.5 py-3", className)}>
      <p className="hud-label text-[9.5px]">{label}</p>
      <p className="vault-display mt-1 text-[19px] leading-tight tabular text-vault-ice">{value}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[10.5px] text-vault-muted tabular">{sub}</p>}
    </div>
  );
}

export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toFixed(2)}s`;
}

export function winRate(wins: number, matches: number): string {
  return matches ? `${Math.round((wins / matches) * 100)}%` : "—";
}
