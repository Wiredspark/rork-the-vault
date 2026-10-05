import { getEpisode } from "@/lib/episode";
import { runStatus, totalPayout, type GameState } from "@/lib/gameEngine";

/** Aggregate career numbers across a set of runs. */
export interface CareerStats {
  totalVc: number;
  runs: number;
  cracked: number;
  sealed: number;
  answered: number;
  correct: number;
  /** 0–1, or null when nothing has been answered yet. */
  accuracy: number | null;
  peakStreak: number;
  digitsEarned: number;
  perfectRuns: number;
  bestRun: { episodeId: string; vc: number } | null;
}

/** Monday 00:00 UTC of the current week — matches Postgres `date_trunc('week', …)` used by the leaderboard. */
export function weekStartMs(now: Date = new Date()): number {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday);
}

/** Computes career stats over the player's runs that pass `include`. Untouched (fresh) runs never count. */
export function computeCareerStats(
  runs: Record<string, GameState>,
  include: (episodeId: string) => boolean = () => true,
): CareerStats {
  const stats: CareerStats = {
    totalVc: 0,
    runs: 0,
    cracked: 0,
    sealed: 0,
    answered: 0,
    correct: 0,
    accuracy: null,
    peakStreak: 0,
    digitsEarned: 0,
    perfectRuns: 0,
    bestRun: null,
  };

  Object.entries(runs).forEach(([id, run]) => {
    const episode = getEpisode(id);
    if (!episode || !include(id) || runStatus(run) === "fresh") return;
    const vc = totalPayout(run, episode);
    stats.totalVc += vc;
    stats.runs += 1;
    if (run.vaultOutcome === "cracked") stats.cracked += 1;
    if (run.vaultOutcome === "sealed") stats.sealed += 1;
    stats.answered += run.answers.length;
    stats.correct += run.answers.filter((a) => a.correct).length;
    stats.peakStreak = Math.max(stats.peakStreak, run.peakStreak);
    stats.digitsEarned += run.revealed.length;
    if (vc >= episode.maxScore) stats.perfectRuns += 1;
    if (!stats.bestRun || vc > stats.bestRun.vc) stats.bestRun = { episodeId: id, vc };
  });

  stats.accuracy = stats.answered > 0 ? stats.correct / stats.answered : null;
  return stats;
}

export function formatAccuracy(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}
