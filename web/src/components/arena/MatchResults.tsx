import { ArrowLeft, Crown, DoorOpen, Gem, Loader2, RotateCcw, Skull, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { formatMs, PlayerAvatar } from "@/components/arena/ArenaBits";
import type { ArenaSnapshot, ArenaStanding, ClientMessage } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHT = ["h-40", "h-28", "h-20"];

function PodiumColumn({ s, rank, cracked, isMe }: { s: ArenaStanding; rank: number; cracked: boolean | null; isMe: boolean }) {
  return (
    <div className="flex w-full max-w-[180px] flex-col items-center">
      <div className="relative mb-3 flex flex-col items-center">
        {rank === 0 && (
          <span className="mb-1.5 flex items-center gap-1 rounded-full border border-vault-neon/60 bg-vault-neon/15 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-vault-neonhi">
            <Crown className="h-3 w-3" aria-hidden="true" />
            {cracked ? "Cracked" : "Sealed"}
          </span>
        )}
        <PlayerAvatar name={s.name} size={rank === 0 ? "lg" : "md"} highlight={rank === 0 || isMe} />
        <span className="mt-2 max-w-full truncate text-[14px] font-medium text-vault-ice">{s.name}</span>
        <span className="vault-display text-[15px] tabular text-vault-neonhi">{s.score.toLocaleString("en-US")}</span>
      </div>
      <div
        className={cn(
          "flex w-full origin-bottom animate-podium-rise items-start justify-center rounded-t-lg border border-b-0 pt-3",
          PODIUM_HEIGHT[rank],
          rank === 0 ? "border-vault-neon/60 bg-[linear-gradient(180deg,rgba(207,171,92,0.35),rgba(207,171,92,0.05))]" : "border-vault-line bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.01))]",
        )}
        style={{ animationDelay: `${(2 - rank) * 140}ms` }}
      >
        <span className={cn("font-display text-[28px]", rank === 0 ? "text-vault-neonhi" : "text-vault-ice/60")}>{rank + 1}</span>
      </div>
    </div>
  );
}

/** Post-match podium, full standings and the rematch / next-match actions. */
export function MatchResults({ snapshot, remaining, send }: { snapshot: ArenaSnapshot; remaining: number; send: (msg: ClientMessage) => void }) {
  const standings = snapshot.standings ?? [];
  const meId = snapshot.me.userId;
  const mine = standings.find((s) => s.userId === meId) ?? null;
  const cracked = snapshot.jackpot ? snapshot.jackpot.status === "cracked" : null;
  const isHost = snapshot.hostId === meId;
  const top = standings.slice(0, 3);
  const isPublic = snapshot.kind === "public";

  return (
    <div className="flex flex-col gap-5">
      <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel px-5 pb-0 pt-7 sm:px-9" aria-labelledby="results-title">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-10 h-64 w-[520px] -translate-x-1/2 rounded-full bg-vault-neon/[0.1] blur-3xl" />
        <div className="relative text-center">
          <p className="flex items-center justify-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.26em] text-vault-neon">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Match {snapshot.matchNumber} · final
          </p>
          <h2 id="results-title" className="mt-2 font-display text-[32px] font-medium text-vault-ice sm:text-[44px]">
            {mine?.placement === 1 ? "You took the room" : mine ? `You finished #${mine.placement}` : "Final standings"}
          </h2>
          {mine && (
            <p className="mt-1.5 text-[15px] text-vault-ice/70">
              {formatMoney(mine.vcEarned)} earned · {mine.correct}/{mine.answered || 0} correct · fastest {formatMs(mine.fastestMs)}
            </p>
          )}
          {snapshot.jackpot && (
            <p className={cn("mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px]", cracked ? "border-vault-success/50 text-vault-success" : "border-vault-danger/40 text-vault-danger/90")}>
              {cracked ? <Gem className="h-3.5 w-3.5" aria-hidden="true" /> : <Skull className="h-3.5 w-3.5" aria-hidden="true" />}
              {cracked ? `Jackpot cracked · ${formatMoney(snapshot.jackpot.amount)}` : `Vault sealed · code was ${snapshot.jackpot.code ?? "????"}`}
            </p>
          )}
        </div>
        <div className="relative mx-auto mt-8 flex max-w-xl items-end justify-center gap-3">
          {PODIUM_ORDER.filter((i) => top[i]).map((i) => (
            <PodiumColumn key={top[i].userId} s={top[i]} rank={i} cracked={i === 0 ? cracked : null} isMe={top[i].userId === meId} />
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="neon-card p-4 sm:p-5" aria-labelledby="standings-title">
          <h3 id="standings-title" className="eyebrow-muted pb-3">
            Full standings
          </h3>
          <ol className="flex flex-col gap-1.5">
            {standings.map((s) => (
              <li
                key={s.userId}
                className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", s.userId === meId ? "border-vault-neon/50 bg-vault-neon/[0.07]" : "border-transparent bg-white/[0.02]")}
              >
                <span className={cn("w-6 text-center font-mono text-[13px] tabular", s.placement === 1 ? "text-vault-neonhi" : "text-vault-muted")}>{s.placement}</span>
                <PlayerAvatar name={s.name} size="sm" away={s.left} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[14.5px] font-medium text-vault-ice">{s.name}</span>
                  <span className="font-mono text-[10.5px] text-vault-muted tabular">
                    {s.correct}/{s.answered} correct · fastest {formatMs(s.fastestMs)}
                    {s.left ? " · left" : ""}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="vault-display text-[14.5px] tabular text-vault-neonhi">{formatMoney(s.vcEarned)}</span>
                  {s.vcEarned > s.score && <span className="font-mono text-[10px] text-vault-success">incl. jackpot</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="neon-card flex flex-col gap-3 p-5">
          <p className="eyebrow-muted">What's next</p>
          {isPublic ? (
            <>
              <button type="button" onClick={() => send({ type: "ready" })} disabled={snapshot.me.ready} className="neon-button h-14 text-lg">
                {snapshot.me.ready ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <DoorOpen className="h-5 w-5" aria-hidden="true" />}
                {snapshot.me.ready ? "Waiting for the room" : "Next match"}
              </button>
              <p className="text-[13px] text-vault-muted">The room resets in {Math.ceil(remaining)}s, or as soon as everyone's ready.</p>
            </>
          ) : isHost ? (
            <>
              <button type="button" onClick={() => send({ type: "rematch" })} className="neon-button h-14 text-lg">
                <RotateCcw className="h-5 w-5" aria-hidden="true" />
                Rematch
              </button>
              <p className="text-[13px] text-vault-muted">Keeps everyone together in this room.</p>
            </>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-vault-line bg-vault-ink/50 px-4 py-3 text-[14px] text-vault-ice/70">
              <Loader2 className="h-4 w-4 animate-spin text-vault-neon" aria-hidden="true" />
              Waiting for the host to call a rematch…
            </p>
          )}
          <Link to="/arena" className="ghost-neon-button h-12">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Leave to the Arena lobby
          </Link>
        </aside>
      </div>
    </div>
  );
}
