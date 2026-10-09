import { useQuery } from "@tanstack/react-query";
import { CloudAlert, Gem, Loader2, Swords, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { MiniStat, winRate } from "@/components/arena/ArenaBits";
import { TrophyBadges } from "@/components/tournaments/TournamentBits";
import { fetchArenaLeaderboard } from "@/lib/arena/api";
import type { ArenaLeaderboardRow } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const TOP = [
  "border-vault-neon/70 bg-vault-neon/20 text-vault-neonhi",
  "border-vault-ice/40 bg-white/10 text-vault-ice",
  "border-[#B08D57]/60 bg-[#B08D57]/15 text-[#E5C9A6]",
] as const;

function Row({ row }: { row: ArenaLeaderboardRow }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", row.isMe ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-transparent")}>
      <span
        className={cn(
          "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border px-1.5 font-mono text-[13px] font-medium tabular",
          TOP[row.rank - 1] ?? "border-vault-line bg-vault-raised text-vault-ice/70",
        )}
      >
        {row.rank}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5 text-[15px] font-medium text-vault-ice">
          <span className="truncate">{row.name}</span>
          {row.isMe && <span className="shrink-0 rounded-sm bg-vault-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">You</span>}
          <TrophyBadges trophies={row.trophies} title={row.title} className="shrink-0" />
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-vault-muted tabular">
          {row.wins}W · {row.matches} played · {winRate(row.wins, row.matches)}
          {row.jackpots > 0 && <span className="text-vault-neon"> · {row.jackpots} jackpot{row.jackpots === 1 ? "" : "s"}</span>}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="vault-display text-[15px] tabular text-vault-neonhi">{row.rating}</span>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-vault-muted">rating</span>
      </span>
    </li>
  );
}

/** Arena tab of the Leaderboard window: skill-rating board plus your Arena career. */
export function ArenaBoard({ enabled, onNavigate }: { enabled: boolean; onNavigate?: () => void }) {
  const query = useQuery({ queryKey: ["arena-leaderboard"], queryFn: fetchArenaLeaderboard, enabled, staleTime: 20_000 });
  const board = query.data;
  const me = board?.me ?? null;

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-vault-line bg-vault-panel py-10 text-vault-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="vault-kicker text-[11px]">Loading the Arena board</span>
      </div>
    );
  }
  if (query.isError || !board) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center" role="alert">
        <CloudAlert className="h-6 w-6 text-vault-danger" aria-hidden="true" />
        <p className="text-[15px] text-vault-ice/80">The Arena board is unavailable.</p>
        <p className="text-[13px] text-vault-muted">{query.error?.message ?? "Try again shortly."}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Your rank" value={me ? `#${me.rank}` : "—"} sub={me ? `of ${board.totalPlayers}` : "play a match"} />
        <MiniStat label="Rating" value={`${me?.rating ?? 1000}`} sub={me ? `best ${me.bestScore.toLocaleString("en-US")}` : "starts at 1000"} />
        <MiniStat label="Wins" value={`${me?.wins ?? 0}`} sub={winRate(me?.wins ?? 0, me?.matches ?? 0)} />
        <MiniStat label="Arena VC" value={formatMoney(me?.arenaVc ?? 0)} sub={`${me?.jackpots ?? 0} jackpots`} />
      </div>

      {me && (me.title || me.trophies.champion + me.trophies.finalist + me.trophies.qualifier > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-vault-neon/30 bg-vault-neon/[0.05] px-3.5 py-2.5">
          <span className="hud-label text-[9.5px]">Your trophy case</span>
          <span className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-vault-ice/80 tabular">
            <span>{me.trophies.champion} champion</span>
            <span>{me.trophies.finalist} finalist</span>
            <span>{me.trophies.qualifier} qualifier</span>
            {me.title && <TrophyBadges title={me.title} />}
          </span>
        </div>
      )}

      {board.rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center">
          <Swords className="h-6 w-6 text-vault-neon/70" aria-hidden="true" />
          <p className="text-[15px] text-vault-ice/80">No Arena matches on the board yet.</p>
          <Link to="/arena" onClick={onNavigate} className="text-link mt-1">
            Be the first <Trophy className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-1" aria-label="Arena top 10">
          {board.rows.map((row) => (
            <Row key={row.userId} row={row} />
          ))}
          {me && !board.rows.some((r) => r.isMe) && (
            <>
              <li aria-hidden="true" className="flex items-center gap-3 px-3 py-1">
                <span className="h-px flex-1 bg-vault-line" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-muted">···</span>
                <span className="h-px flex-1 bg-vault-line" />
              </li>
              <Row row={me} />
            </>
          )}
        </ol>
      )}
      <p className="flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-vault-muted">
        <Gem className="h-3 w-3" aria-hidden="true" />
        Rated matches need 2+ players · tracked separately from solo VC
      </p>
    </div>
  );
}
