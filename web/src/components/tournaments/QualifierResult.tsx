import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, Timer, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { formatMs, MiniStat } from "@/components/arena/ArenaBits";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { startQualifierRun } from "@/lib/arena/api";
import { FINAL_MAX_PLAYERS, type ArenaSnapshot } from "@/lib/arena/protocol";
import { cn } from "@/lib/utils";

/** End of a qualifier run: the score, where it landed on the board, and another run. */
export function QualifierResult({ snapshot }: { snapshot: ArenaSnapshot }) {
  const navigate = useNavigate();
  const row = snapshot.standings?.[0] ?? null;
  const t = snapshot.tournament;
  const [target, setTarget] = useState<number>(0);
  useEffect(() => {
    // Count up from zero once the run lands.
    const id = window.setTimeout(() => setTarget(row?.score ?? 0), 120);
    return () => window.clearTimeout(id);
  }, [row?.score]);
  const score = useAnimatedNumber(target, 1200);
  const rank = t?.rank ?? null;
  const inFinal = rank !== null && rank <= FINAL_MAX_PLAYERS;
  const runsLeft = t?.runsLeft ?? null;

  const again = useMutation({
    mutationFn: () => startQualifierRun(t?.id ?? ""),
    onSuccess: ({ roomId }) => navigate(`/arena/room/${roomId}`),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-5">
      <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel px-6 py-10 text-center sm:py-12" aria-labelledby="qr-title">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-[520px] -translate-x-1/2 rounded-full bg-vault-neon/[0.1] blur-3xl" />
        <div className="relative flex flex-col items-center">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-vault-neon">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {t?.name ?? "Qualifier"} · run complete
          </p>
          <p id="qr-title" className="vault-display mt-4 text-[64px] leading-none tabular text-vault-neonhi sm:text-[84px]">
            {Math.round(score).toLocaleString("en-US")}
          </p>
          <p className="mt-2 text-[15px] text-vault-ice/70">points this run</p>
          {rank !== null ? (
            <p
              className={cn(
                "mt-5 inline-flex animate-pop-in items-center gap-2 rounded-full border px-4 py-1.5 text-[15px]",
                inFinal ? "border-vault-neon/60 bg-vault-neon/15 text-vault-neonhi" : "border-vault-line bg-vault-ink/60 text-vault-ice/85",
              )}
            >
              {inFinal ? "Inside the top 8" : "Outside the top 8"} · your best ranks #{rank}
              {t?.entrants ? ` of ${t.entrants}` : ""}
            </p>
          ) : snapshot.notice ? (
            <p className="mt-5 max-w-md rounded-lg border border-vault-danger/40 bg-vault-danger/10 px-4 py-2 text-[14px] text-vault-ice/85">{snapshot.notice}</p>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-[14px] text-vault-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Posting to the qualifier board…
            </p>
          )}
        </div>
      </section>

      {row && (
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Correct" value={`${row.correct}/10`} sub="answers" />
          <MiniStat label="Fastest" value={formatMs(row.fastestMs)} />
          <MiniStat label="Total time" value={formatMs(row.totalTimeMs)} sub="tiebreaker" />
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {runsLeft !== null && runsLeft > 0 && (
          <button type="button" onClick={() => again.mutate()} disabled={again.isPending} className="neon-button h-14 flex-1 text-lg">
            {again.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
            Play another run · {runsLeft} left
          </button>
        )}
        {t && (
          <Link to={`/arena/tournaments/${t.id}`} className="ghost-neon-button h-14 flex-1">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Qualifier board
          </Link>
        )}
      </div>
      <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-vault-muted">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" /> Only your best run counts. Ties go to the faster total time.
      </p>
    </div>
  );
}
