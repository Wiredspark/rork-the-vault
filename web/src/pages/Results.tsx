import { ArrowRight, Flame, Lock, LockOpen, RotateCcw, Share2, Target } from "lucide-react";
import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { RoundDot } from "@/components/play/RoundDot";
import { PageHeader } from "@/components/shell/PageHeader";
import { IMAGES } from "@/data/assets";
import { ACTIVE_MODULE } from "@/data/modules";
import { roundProgress, roundStats } from "@/lib/gameEngine";
import { formatMoney, formatMoneyPlus, getRanks, rankIndexForScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

/** Results: rank, score breakdown, vault status, accuracy, peak streak. */
export default function Results() {
  const { episode, state, total, status, knownDigits, resetRun } = useGame();
  const navigate = useNavigate();
  const ranks = getRanks(episode.maxScore);
  const rankIndex = rankIndexForScore(total, episode.maxScore);
  const rank = ranks[rankIndex];
  const next = ranks[rankIndex + 1] ?? null;
  const cracked = state.vaultOutcome === "cracked";
  const final = status === "complete";

  const answered = state.answers.length;
  const correct = state.answers.filter((a) => a.correct).length;
  const accuracy = answered ? Math.round((correct / answered) * 100) : 0;
  const digitsHeld = state.vaultOutcome !== "pending" && cracked ? episode.vaultCode.length : knownDigits.length;

  const share = useCallback(async () => {
    const text = `I scored ${formatMoney(total)} in ${ACTIVE_MODULE.name} ${episode.id} — rank: ${rank.name}${
      cracked ? ` · Vault cracked (${episode.vaultYear})` : ""
    }. Know the music. Unlock more.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "The Vault", text, url: window.location.origin });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success("Results copied to clipboard");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("Couldn't share right now", { description: "Try again in a moment." });
    }
  }, [cracked, episode.id, episode.vaultYear, rank.name, total]);

  const banner = final
    ? cracked
      ? { label: "Vault Cracked", detail: `+${formatMoney(episode.vaultPrize)}` }
      : { label: "Vault Sealed", detail: `Code was ${episode.vaultYear}` }
    : { label: "Run in progress", detail: next ? `${formatMoney(next.min - total)} to ${next.name}` : "Top rank reached" };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumb="Results"
        title="Results"
        subtitle={`Here's how you ${final ? "did" : "are doing"} in ${ACTIVE_MODULE.name}.`}
        action={
          <button type="button" onClick={share} className="ghost-neon-button h-12 self-start sm:self-auto" disabled={answered === 0}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Share Results
          </button>
        }
      />

      <section className="neon-frame relative animate-rise-in overflow-hidden bg-vault-ink" aria-labelledby="rank-title">
        <img
          src={cracked ? IMAGES.vaultOpen : IMAGES.vaultDoor}
          alt=""
          className="absolute inset-y-0 right-0 h-full w-full object-cover object-[70%_50%] opacity-50 sm:w-[70%] sm:opacity-100"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#0E0D12_0%,#0E0D12_32%,rgba(14,13,18,0.7)_55%,rgba(14,13,18,0.05)_85%)]" />
        <div className="relative px-6 py-8 sm:px-9 sm:py-10">
          <div className="flex items-center gap-3">
            <span className="eyebrow">{final ? "Your rank" : "Current rank"}</span>
            <span className="h-px w-8 bg-vault-neon/70" />
          </div>
          <h2 id="rank-title" className="mt-3 font-display text-5xl font-medium leading-none text-vault-ice sm:text-7xl">
            {rank.name}
          </h2>
          <p className="mt-3 font-display text-6xl font-semibold text-vault-neonhi tabular sm:text-[84px] sm:leading-none">{formatMoney(total)}</p>
          <p className={cn("mt-4 flex items-center gap-2 text-xl sm:text-3xl", cracked ? "text-vault-neonhi" : "text-vault-ice/80")}>
            {cracked ? <LockOpen className="h-6 w-6" aria-hidden="true" /> : <Lock className="h-6 w-6" aria-hidden="true" />}
            {banner.label} <span className="text-vault-neon">·</span> {banner.detail}
          </p>
          {cracked && <p className="mt-4 max-w-xl text-vault-ice/75">{episode.vaultStory}</p>}
        </div>
      </section>

      <section className="neon-card overflow-x-auto p-5 sm:p-7" aria-labelledby="breakdown-title">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Score breakdown</caption>
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th id="breakdown-title" scope="col" className="pb-3">
                <span className="flex items-center gap-3">
                  <span className="eyebrow">Score breakdown</span>
                  <span className="h-px w-8 bg-vault-neon/70" />
                </span>
              </th>
              <th scope="col" className="eyebrow-muted pb-3">Questions</th>
              <th scope="col" className="eyebrow-muted pb-3">Correct</th>
              <th scope="col" className="eyebrow-muted pb-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {episode.rounds.map((round) => {
              const stats = roundStats(state, episode, round.index);
              const progress = roundProgress(state, round.index);
              return (
                <tr key={round.number} className="border-b border-white/[0.07]">
                  <th scope="row" className="py-3.5 font-display text-xl font-medium text-vault-ice">
                    <RoundDot roundIndex={round.index} className="mr-2.5 align-middle" />
                    Round {round.number}: {round.name}
                    {progress !== "done" && (
                      <span className="ml-2 align-middle font-sans text-xs font-normal text-vault-muted">
                        {progress === "locked" ? "not started" : "in progress"}
                      </span>
                    )}
                  </th>
                  <td className="py-3.5 text-lg text-vault-ice/85">{round.standard.length} + bonus</td>
                  <td className="py-3.5 text-lg text-vault-ice/85 tabular">
                    {stats.correct} / {stats.total}
                  </td>
                  <td className="py-3.5 text-right font-display text-xl text-vault-ice tabular">{formatMoney(stats.score)}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="pt-3.5 font-display text-xl font-medium text-vault-ice">Vault bonus</th>
              <td className="pt-3.5 text-lg text-vault-ice/50">—</td>
              <td className="pt-3.5 text-lg text-vault-ice/50">{cracked ? episode.vaultYear : "—"}</td>
              <td className={cn("pt-3.5 text-right font-display text-xl tabular", cracked ? "text-vault-neonhi" : "text-vault-ice/50")}>
                {formatMoney(cracked ? episode.vaultPrize : 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="grid gap-5 md:grid-cols-3" aria-label="Run stats">
        {[
          {
            Icon: Target,
            label: "Accuracy",
            value: `${accuracy}%`,
            note: `You got ${correct} of ${answered} answered questions correct.`,
          },
          { Icon: Flame, label: "Peak streak", value: String(state.peakStreak), note: "Your longest streak this game." },
          {
            Icon: cracked ? LockOpen : Lock,
            label: "Digits",
            value: `${digitsHeld}/${episode.vaultCode.length}`,
            note: cracked ? "You entered the full vault code." : `${episode.vaultCode.length - digitsHeld} digit(s) still scrambled.`,
          },
        ].map(({ Icon, label, value, note }, i) => (
          <article key={label} className="neon-card animate-rise-in p-6" style={{ animationDelay: `${120 + i * 70}ms` }}>
            <div className="flex items-start gap-5">
              <Icon className="h-11 w-11 shrink-0 text-vault-neon" aria-hidden="true" />
              <div className="flex-1">
                <p className="eyebrow">{label}</p>
                <p className="mt-1 font-display text-5xl font-medium text-vault-ice tabular">{value}</p>
                <div className="hairline mt-3 opacity-50" />
              </div>
            </div>
            <p className="mt-4 text-vault-ice/70">{note}</p>
          </article>
        ))}
      </section>

      <section className="neon-card p-5 sm:p-7" aria-labelledby="ladder-title">
        <h2 id="ladder-title" className="eyebrow">Rank ladder</h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ranks.map((r, i) => (
            <li
              key={r.name}
              className={cn(
                "flex items-center justify-between rounded-md border px-4 py-3",
                i === rankIndex ? "border-vault-neon bg-vault-neon/10" : i < rankIndex ? "border-vault-neon/20" : "border-white/[0.06] opacity-60",
              )}
            >
              <span className={cn("font-medium", i === rankIndex ? "text-vault-neonhi" : "text-vault-ice/85")}>{r.name}</span>
              <span className="text-sm text-vault-ice/60 tabular">
                {r.max === null ? formatMoney(r.min) : formatMoneyPlus(r.min)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-4">
        {status === "playing" || status === "fresh" ? (
          <Link to="/play" className="neon-button h-12">
            {status === "fresh" ? "Start playing" : "Continue playing"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : status === "vault" ? (
          <Link to="/vault" className="neon-button h-12">
            Open the Vault Chamber <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            className="neon-button h-12"
            onClick={() => {
              resetRun();
              navigate("/play");
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Play {episode.id} again
          </button>
        )}
        <Link to="/" className="ghost-neon-button h-12">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
