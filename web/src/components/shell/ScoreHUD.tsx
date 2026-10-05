import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StreakLadderDialog } from "@/components/vault/StreakLadderDialog";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { formatMoney, formatMultiplier, getRanks, nextRankForScore, rankForScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

function RankDetails() {
  const { episode, total, status, state } = useGame();
  const rank = rankForScore(total, episode.maxScore);
  const next = nextRankForScore(total, episode.maxScore);
  const floor = rank.min;
  const pct = next ? Math.min(100, ((total - floor) / Math.max(1, next.min - floor)) * 100) : 100;
  const tier = getRanks(episode.maxScore).findIndex((r) => r.name === rank.name) + 1;

  return (
    <div>
      <div className="border-b border-vault-line p-4">
        <span className="vault-kicker">Rank {tier}/7</span>
        <p className="mt-2 font-display text-lg font-medium leading-tight text-vault-neonhi">{rank.name}</p>
        <p className="mt-1 font-mono text-[11px] text-vault-muted tabular">
          {formatMoney(total)} of {formatMoney(episode.maxScore)} max
        </p>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="hud-label">{next ? `Next · ${next.name}` : "Top of the ladder"}</span>
          {next && <span className="font-mono text-[11px] text-vault-ice/70 tabular">{formatMoney(next.min - total)} to go</span>}
        </div>
        <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full bg-vault-neon transition-[width] duration-1000 ease-out" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-vault-line px-4 py-3">
        <span className="font-mono text-[11px] text-vault-muted tabular">Peak streak {state.peakStreak}</span>
        {status === "fresh" ? (
          <span className="text-[12px] text-vault-muted">Play to rank up</span>
        ) : (
          <Link to="/results" className="text-link text-sm">
            {status === "complete" ? "Final results" : "Results"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Score readout: total payout (opens rank details) and streak multiplier (opens the ladder). */
export function ScoreHUD({ compact = false }: { compact?: boolean }) {
  const { episode, state, total, multiplier } = useGame();
  const animatedTotal = useAnimatedNumber(total);
  const isHot = state.streak >= 3;
  const rank = rankForScore(total, episode.maxScore);

  return (
    <div className="flex items-center divide-x divide-vault-neon/15">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Total payout ${formatMoney(total)}, rank ${rank.name}. Show rank details`}
            className={cn(
              "flex flex-col rounded-md pr-4 text-left outline-none transition-opacity hover:opacity-90 focus-visible:ring-1 focus-visible:ring-vault-neon/60 sm:pr-6",
              compact && "pr-3",
            )}
          >
            <span className="hud-label text-[9px] sm:text-[10px]">
              Total payout<span className="hidden text-vault-neon/80 sm:inline"> · {rank.name}</span>
            </span>
            <span className="vault-display text-lg text-vault-neonhi tabular sm:text-[26px] sm:leading-tight">{formatMoney(animatedTotal)}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={12} className="w-72 border-vault-neon/20 bg-vault-panel p-0 text-vault-ice">
          <RankDetails />
        </PopoverContent>
      </Popover>

      <StreakLadderDialog currentStreak={state.streak}>
        <button
          type="button"
          aria-label={`Streak ${state.streak}, multiplier ${formatMultiplier(multiplier)}. How streaks work`}
          className="flex flex-col items-start rounded-md pl-4 outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60 sm:pl-6"
        >
          <span className="hud-label text-[9px] sm:text-[10px]">Streak {state.streak}</span>
          <span
            key={isHot ? `pop-${state.streak}` : "calm"}
            className={cn(
              "mt-1 rounded-full border px-2.5 py-0.5 font-mono text-sm font-medium tabular sm:px-3 sm:text-base",
              isHot ? "animate-streak-pop border-vault-neonhi bg-vault-neon/15 text-vault-neonhi" : "border-vault-neon/50 text-vault-ice",
            )}
          >
            {formatMultiplier(multiplier)}
          </span>
        </button>
      </StreakLadderDialog>
    </div>
  );
}
