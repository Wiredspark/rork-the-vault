import { Flame, Lock, Zap } from "lucide-react";
import { memo, useMemo } from "react";

import { PlayerAvatar } from "@/components/arena/ArenaBits";
import type { ArenaPlayerView } from "@/lib/arena/protocol";
import { cn } from "@/lib/utils";

const ROW_H = 58;

interface LiveStandingsProps {
  players: ArenaPlayerView[];
  meId: string;
  /** Show the last question's points pop (during reveal). */
  showDelta: boolean;
  highlightIds?: string[];
  className?: string;
}

/** Live leaderboard whose rows glide into their new order after every reveal. */
export const LiveStandings = memo(function LiveStandings({ players, meId, showDelta, highlightIds, className }: LiveStandingsProps) {
  const ranked = useMemo(
    () => [...players].sort((a, b) => Number(a.eliminatedAfter !== null) - Number(b.eliminatedAfter !== null) || b.score - a.score || a.name.localeCompare(b.name)),
    [players],
  );
  const positions = useMemo(() => new Map(ranked.map((p, i) => [p.userId, i])), [ranked]);
  // Stable DOM order (by id) so rows animate their transform instead of remounting.
  const stable = useMemo(() => [...players].sort((a, b) => a.userId.localeCompare(b.userId)), [players]);

  return (
    <div className={cn("neon-card p-4", className)}>
      <div className="flex items-center justify-between pb-3">
        <p className="eyebrow-muted">Live standings</p>
        <p className="font-mono text-[10.5px] text-vault-muted tabular">{players.filter((p) => p.connected && !p.left && p.eliminatedAfter === null).length} live</p>
      </div>
      <ol className="relative" style={{ height: ranked.length * ROW_H }} aria-label="Live standings">
        {stable.map((p) => {
          const pos = positions.get(p.userId) ?? 0;
          const isMe = p.userId === meId;
          const lit = highlightIds?.includes(p.userId);
          return (
            <li
              key={p.userId}
              className="absolute inset-x-0 transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transform: `translateY(${pos * ROW_H}px)`, height: ROW_H - 6 }}
              aria-label={`${pos + 1}. ${p.name}${isMe ? " (you)" : ""}: ${p.score.toLocaleString("en-US")} VC`}
            >
              <div
                className={cn(
                  "flex h-full items-center gap-2.5 rounded-lg border px-2.5",
                  isMe ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-transparent bg-white/[0.02]",
                  lit && "border-vault-danger/50 bg-vault-danger/[0.06]",
                  highlightIds && !lit && "opacity-45",
                  p.eliminatedAfter !== null && "border-transparent bg-transparent opacity-40 grayscale",
                )}
              >
                <span className={cn("w-5 shrink-0 text-center font-mono text-[12px] tabular", pos === 0 ? "text-vault-neonhi" : "text-vault-muted")}>
                  {pos + 1}
                </span>
                <PlayerAvatar name={p.name} size="sm" away={!p.connected || p.left} highlight={pos === 0 && p.score > 0} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-vault-ice">{p.name}</span>
                    {isMe && <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-vault-neon">You</span>}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[10px] text-vault-muted tabular">
                    {p.eliminatedAfter !== null ? (
                      <span className="inline-flex items-center gap-1 text-vault-danger/80">
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" /> Sealed after Q{p.eliminatedAfter}
                      </span>
                    ) : p.left ? (
                      <span className="text-vault-danger/80">Left</span>
                    ) : !p.connected ? (
                      <span className="text-vault-danger/80">Away · can rejoin</span>
                    ) : (
                      <>
                        <span>
                          {p.correctCount}/{p.answeredCount} right
                        </span>
                        {p.streak >= 2 && (
                          <span className="inline-flex items-center gap-0.5 text-vault-neon">
                            <Flame className="h-3 w-3" aria-hidden="true" />
                            {p.streak}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </span>
                <span className="relative flex flex-col items-end">
                  <span className="vault-display text-[14px] tabular text-vault-neonhi">{p.score.toLocaleString("en-US")}</span>
                  {showDelta && p.lastPoints > 0 && (
                    <span key={`${p.userId}-${p.score}`} className="animate-pop-in inline-flex items-center gap-0.5 font-mono text-[10px] text-vault-success tabular">
                      +{p.lastPoints.toLocaleString("en-US")}
                      {p.lastSpeedBonus > 0 && <Zap className="h-2.5 w-2.5" aria-label="speed bonus" />}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
