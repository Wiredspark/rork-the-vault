import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronRight,
  CloudAlert,
  Crown,
  Disc3,
  Flame,
  Gauge,
  History,
  KeyRound,
  ListOrdered,
  Loader2,
  Share2,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  Vault,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShareRankDialog } from "@/components/vault/ShareRankDialog";
import { ACTIVE_MODULE } from "@/data/modules";
import { supabase } from "@/integrations/supabase/client";
import { computeCareerStats, formatAccuracy, weekStartMs, type CareerStats } from "@/lib/careerStats";
import { getEpisode, getEpisodesForModule } from "@/lib/episode";
import { runStatus, totalPayout } from "@/lib/gameEngine";
import { formatMoney } from "@/lib/scoring";
import type { ShareCardData } from "@/lib/shareCard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useGame } from "@/providers/GameProvider";
import { useShellUI, type BoardScope, type BoardSection } from "@/providers/ShellUIProvider";

interface Standing {
  rank: number;
  userId: string;
  displayName: string;
  totalVc: number;
  runsCount: number;
  crackedCount: number;
  isMe: boolean;
  totalPlayers: number;
}

const SCOPES: { id: BoardScope; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "All Time", icon: History },
  { id: "week", label: "This Week", icon: CalendarDays },
  { id: "episode", label: "By Episode", icon: Disc3 },
];

const TOP_RANK_STYLES = [
  "border-vault-neon/70 bg-vault-neon/20 text-vault-neonhi",
  "border-vault-ice/40 bg-white/10 text-vault-ice",
  "border-[#B08D57]/60 bg-[#B08D57]/15 text-[#E5C9A6]",
] as const;

function scopeNoun(scope: BoardScope, episodeId: string): string {
  if (scope === "week") return "this week";
  if (scope === "episode") return `in ${episodeId}`;
  return "all time";
}

async function fetchStandings(scope: BoardScope, episodeId: string): Promise<Standing[]> {
  const { data, error } = await supabase.rpc("leaderboard_standings", {
    p_scope: scope === "week" ? "week" : "all",
    ...(scope === "episode" ? { p_episode_id: episodeId } : {}),
  });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    rank: row.rank,
    userId: row.user_id,
    displayName: row.display_name || "Player",
    totalVc: row.total_vc,
    runsCount: row.runs_count,
    crackedCount: row.cracked_count,
    isMe: row.is_me,
    totalPlayers: row.total_players,
  }));
}

const RankBadge = memo(function RankBadge({ rank }: { rank: number }) {
  const topStyle = rank <= 3 ? TOP_RANK_STYLES[rank - 1] : undefined;
  return (
    <span
      className={cn(
        "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border px-1.5 font-mono text-[13px] font-medium tabular",
        topStyle ?? "border-vault-line bg-vault-raised text-vault-ice/70",
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  );
});

const StandingRow = memo(function StandingRow({ entry }: { entry: Standing }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        entry.isMe ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-transparent",
      )}
      aria-label={`Rank ${entry.rank}: ${entry.displayName}${entry.isMe ? " (you)" : ""}, ${formatMoney(entry.totalVc)}`}
    >
      <RankBadge rank={entry.rank} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5 text-[15px] font-medium text-vault-ice">
          <span className="truncate">{entry.displayName}</span>
          {entry.isMe && (
            <span className="shrink-0 rounded-sm bg-vault-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">
              You
            </span>
          )}
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-vault-muted tabular">
          {entry.runsCount} {entry.runsCount === 1 ? "run" : "runs"} · {entry.crackedCount} cracked
        </span>
      </span>
      <span className="vault-display shrink-0 text-[15px] tabular text-vault-neonhi">{formatMoney(entry.totalVc)}</span>
    </li>
  );
});

function Notice({ icon: Icon, title, body, tone = "neutral" }: { icon: LucideIcon; title: string; body: string; tone?: "neutral" | "error" }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center"
      role={tone === "error" ? "alert" : undefined}
    >
      <Icon className={cn("h-6 w-6", tone === "error" ? "text-vault-danger" : "text-vault-neon/70")} aria-hidden="true" />
      <p className="text-[15px] text-vault-ice/80">{title}</p>
      <p className="text-[13px] text-vault-muted">{body}</p>
    </div>
  );
}

/** Your global position for the active scope — always shown, even when you're outside the top 10. */
function YourRankCard({
  me,
  totalPlayers,
  isPending,
  scope,
  episodeId,
  onShare,
}: {
  me: Standing | null;
  totalPlayers: number;
  isPending: boolean;
  scope: BoardScope;
  episodeId: string;
  onShare: () => void;
}) {
  const percentile = me && totalPlayers > 0 ? Math.max(1, Math.ceil((me.rank / totalPlayers) * 100)) : null;
  return (
    <div className="relative overflow-hidden rounded-xl border border-vault-neon/30 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(207,171,92,0.16),transparent_60%)] px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-vault-neon/50 bg-vault-ink/60">
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin text-vault-neon" aria-hidden="true" />
          ) : me ? (
            <span className="vault-display text-[18px] tabular text-vault-neonhi">#{me.rank}</span>
          ) : (
            <UserRound className="h-6 w-6 text-vault-neon/70" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="vault-kicker text-[10px]">Your global rank · {scopeNoun(scope, episodeId)}</p>
          {isPending ? (
            <p className="mt-1 text-[15px] text-vault-ice/70">Locating you on the board…</p>
          ) : me ? (
            <>
              <p className="mt-1 font-display text-[19px] font-medium leading-tight text-vault-ice">
                #{me.rank} <span className="text-vault-ice/50">of {totalPlayers.toLocaleString("en-US")}</span>
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-vault-muted tabular">
                {formatMoney(me.totalVc)}
                {percentile !== null && <span className="text-vault-neon"> · Top {percentile}%</span>}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-[17px] font-medium leading-tight text-vault-ice">Unranked</p>
              <p className="mt-0.5 text-[12.5px] text-vault-muted">
                {scope === "week" ? "Play a run this week to get on the board." : "Answer a question to claim your spot."}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onShare}
          disabled={isPending}
          aria-label="Share your rank and stats"
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-vault-neon/45 bg-vault-neon/10 px-3 text-[13px] font-medium text-vault-neonhi transition-[transform,background-color] hover:bg-vault-neon/20 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Share
        </button>
      </div>
    </div>
  );
}

function Standings({ rows, me }: { rows: Standing[]; me: Standing | null }) {
  const top = rows.slice(0, 10);
  const meOutside = me && !top.includes(me) ? me : null;
  return (
    <ol className="flex flex-col gap-1" aria-label="Top 10 players">
      {top.map((entry) => (
        <StandingRow key={entry.userId} entry={entry} />
      ))}
      {meOutside && (
        <>
          <li aria-hidden="true" className="flex items-center gap-3 px-3 py-1">
            <span className="h-px flex-1 bg-vault-line" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-muted">
              {meOutside.rank - 11 > 0 ? `${meOutside.rank - 11} more` : "···"}
            </span>
            <span className="h-px flex-1 bg-vault-line" />
          </li>
          <StandingRow entry={meOutside} />
        </>
      )}
    </ol>
  );
}

const StatTile = memo(function StatTile({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-vault-line bg-vault-panel/80 px-3 py-3">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-vault-neon/80" aria-hidden="true" />
        <span className="hud-label text-[9.5px]">{label}</span>
      </div>
      <p className="vault-display mt-1.5 text-[17px] leading-tight tabular text-vault-ice">{value}</p>
      {sub && <p className="mt-0.5 truncate font-mono text-[10.5px] text-vault-muted tabular">{sub}</p>}
    </div>
  );
});

function StatGrid({ stats, scope }: { stats: CareerStats; scope: BoardScope }) {
  const best = stats.bestRun ? getEpisode(stats.bestRun.episodeId) : undefined;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <StatTile icon={Trophy} label="Total VC" value={formatMoney(stats.totalVc)} sub={`${stats.runs} ${stats.runs === 1 ? "run" : "runs"} played`} />
      <StatTile
        icon={Vault}
        label="Vaults cracked"
        value={`${stats.cracked}`}
        sub={stats.sealed ? `${stats.sealed} sealed` : stats.runs ? "none sealed" : "—"}
      />
      <StatTile icon={Target} label="Accuracy" value={formatAccuracy(stats.accuracy)} sub={`${stats.correct}/${stats.answered} correct`} />
      <StatTile icon={Flame} label="Peak streak" value={`${stats.peakStreak}`} sub={stats.peakStreak >= 5 ? "2.00× reached" : "5 for 2.00×"} />
      <StatTile icon={KeyRound} label="Digits earned" value={`${stats.digitsEarned}`} sub="from bonus questions" />
      {scope === "episode" ? (
        <StatTile icon={Crown} label="Perfect run" value={stats.perfectRuns ? "Yes" : "Not yet"} sub="every VC claimed" />
      ) : (
        <StatTile
          icon={Crown}
          label="Best run"
          value={stats.bestRun ? formatMoney(stats.bestRun.vc) : "—"}
          sub={best ? `${best.id} · ${best.title}` : "play to set one"}
        />
      )}
    </div>
  );
}

/** Per-episode breakdown of the player's own runs; tapping a row switches to that episode's view. */
function EpisodeBreakdown({ onPick }: { onPick: (id: string) => void }) {
  const { runs } = useGame();
  const rows = useMemo(
    () =>
      Object.entries(runs)
        .flatMap(([id, run]) => {
          const ep = getEpisode(id);
          if (!ep || runStatus(run) === "fresh") return [];
          return [{ ep, run, vc: totalPayout(run, ep) }];
        })
        .sort((a, b) => b.vc - a.vc),
    [runs],
  );
  if (!rows.length) return null;
  return (
    <div className="mt-4">
      <p className="eyebrow-muted px-1 pb-2">By episode</p>
      <ul className="flex flex-col gap-1">
        {rows.map(({ ep, run, vc }) => (
          <li key={ep.id}>
            <button
              type="button"
              onClick={() => onPick(ep.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.04]"
            >
              <span className="w-12 shrink-0 font-mono text-[12px] text-vault-neon tabular">{ep.id}</span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-vault-ice/85">{ep.title}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em]",
                  run.vaultOutcome === "cracked" ? "text-vault-success" : run.vaultOutcome === "sealed" ? "text-vault-danger/80" : "text-vault-muted",
                )}
              >
                {run.vaultOutcome === "cracked" ? "Cracked" : run.vaultOutcome === "sealed" ? "Sealed" : "Open"}
              </span>
              <span className="w-[86px] shrink-0 text-right font-mono text-[12px] text-vault-neonhi tabular">{formatMoney(vc)}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-vault-ice/30" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TAB_TRIGGER =
  "flex-1 gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-vault-ice/60 transition-colors data-[state=active]:bg-vault-raised data-[state=active]:text-vault-ice data-[state=active]:shadow-[inset_0_-2px_0_#CFAB5C]" as const;

/** Leaderboard + career stats: top 10, your true global rank, and All Time / This Week / By Episode views. */
export function LeaderboardDialog() {
  const { user, displayName } = useAuth();
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const { episode, runs, runUpdatedAt } = useGame();
  const { boardOpen, setBoardOpen, boardScope, setBoardScope, boardSection, openLeaderboard } = useShellUI();
  const [episodeId, setEpisodeId] = useState<string>(episode.id);
  const episodes = useMemo(() => getEpisodesForModule(ACTIVE_MODULE.id), []);

  const query = useQuery({
    queryKey: ["leaderboard", boardScope, boardScope === "episode" ? episodeId : null],
    queryFn: () => fetchStandings(boardScope, episodeId),
    enabled: boardOpen && Boolean(user),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const rows = query.data ?? [];
  const me = rows.find((r) => r.isMe) ?? null;
  const totalPlayers = rows[0]?.totalPlayers ?? 0;

  const stats = useMemo(() => {
    const weekStart = weekStartMs();
    const include =
      boardScope === "week"
        ? (id: string) => (runUpdatedAt[id] ?? 0) >= weekStart
        : boardScope === "episode"
          ? (id: string) => id === episodeId
          : undefined;
    return computeCareerStats(runs, include);
  }, [boardScope, episodeId, runUpdatedAt, runs]);

  const shareData = useMemo<ShareCardData>(() => {
    const ep = getEpisode(episodeId);
    const scopeLabel = boardScope === "week" ? "This Week" : boardScope === "episode" ? `${episodeId}${ep ? ` · ${ep.title}` : ""}` : "All Time";
    return {
      playerName: me?.displayName ?? displayName ?? "Player",
      moduleName: ACTIVE_MODULE.name,
      scopeLabel,
      rank: me?.rank ?? null,
      totalPlayers,
      stats,
      isEpisodeScope: boardScope === "episode",
      bestRunEpisodeId: stats.bestRun?.episodeId ?? null,
      url: window.location.origin,
    };
  }, [boardScope, displayName, episodeId, me, stats, totalPlayers]);

  const pickEpisode = (id: string) => {
    setEpisodeId(id);
    setBoardScope("episode");
  };

  return (
    <Dialog open={boardOpen} onOpenChange={setBoardOpen}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden border-vault-neon/20 bg-[linear-gradient(180deg,#141D19,#0F1613)] p-0 text-vault-ice">
        <DialogHeader className="gap-1.5 border-b border-vault-neon/15 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2.5 font-display text-xl font-medium text-vault-ice">
            <Trophy className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            Leaderboard & Career
          </DialogTitle>
          <DialogDescription className="vault-kicker text-[11px]">Global standings · lifetime VC · your stats</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-5 pt-4">
          <div role="radiogroup" aria-label="Time range" className="grid grid-cols-3 gap-1 rounded-lg border border-vault-line bg-vault-ink/60 p-1">
            {SCOPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={boardScope === id}
                onClick={() => setBoardScope(id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-[12.5px] font-medium transition-colors",
                  boardScope === id ? "bg-vault-neon/15 text-vault-neonhi shadow-[inset_0_0_0_1px_rgba(207,171,92,0.45)]" : "text-vault-ice/60 hover:text-vault-ice",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {boardScope === "episode" && (
            <Select value={episodeId} onValueChange={setEpisodeId}>
              <SelectTrigger aria-label="Episode" className="mt-2 h-11 border-vault-line bg-vault-panel text-vault-ice focus:ring-vault-neon/40 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72 border-vault-neon/20 bg-vault-panel text-vault-ice">
                {episodes.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id} className="focus:bg-vault-neon/10 focus:text-vault-ice">
                    <span className="font-mono text-[12px] text-vault-neon">{ep.id}</span>
                    <span className="ml-2 text-vault-ice/85">{ep.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="mt-3">
            <YourRankCard me={me} totalPlayers={totalPlayers} isPending={Boolean(user) && query.isPending} scope={boardScope} episodeId={episodeId} onShare={() => setShareOpen(true)} />
          </div>

          <Tabs value={boardSection} onValueChange={(v) => openLeaderboard(v as BoardSection)} className="mt-4">
            <TabsList className="flex h-auto w-full gap-1 rounded-lg bg-vault-ink/60 p-1">
              <TabsTrigger value="standings" className={TAB_TRIGGER}>
                <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
                Top 10
              </TabsTrigger>
              <TabsTrigger value="stats" className={TAB_TRIGGER}>
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                My career
              </TabsTrigger>
            </TabsList>

            <TabsContent value="standings" className="mt-3">
              {!user ? (
                <Notice icon={UserRound} title="Sign in to see the board." body="Your total VC counts once you're signed in." />
              ) : query.isPending ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-vault-line bg-vault-panel py-10 text-vault-muted" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span className="vault-kicker text-[11px]">Counting the vault</span>
                </div>
              ) : query.isError ? (
                <Notice icon={CloudAlert} tone="error" title="The leaderboard is sealed right now." body="Check your connection and reopen it." />
              ) : rows.length === 0 ? (
                <Notice
                  icon={Sparkles}
                  title={boardScope === "week" ? "No scores this week yet." : "No scores on the board yet."}
                  body="Play a run and claim the top spot."
                />
              ) : (
                <Standings rows={rows} me={me} />
              )}
            </TabsContent>

            <TabsContent value="stats" className="mt-3">
              {stats.runs === 0 ? (
                <Notice
                  icon={Gauge}
                  title={boardScope === "week" ? "No runs this week." : boardScope === "episode" ? `You haven't played ${episodeId} yet.` : "Your career starts with one run."}
                  body="Stats appear here as soon as you answer a question."
                />
              ) : (
                <StatGrid stats={stats} scope={boardScope} />
              )}
              {boardScope === "all" && <EpisodeBreakdown onPick={pickEpisode} />}
              <p className="mt-3 px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-vault-muted">
                {boardScope === "week" ? "Week resets Monday 00:00 UTC" : "Synced to your account"}
              </p>
            </TabsContent>
          </Tabs>
        </div>
        <ShareRankDialog open={shareOpen} onOpenChange={setShareOpen} data={shareData} />
      </DialogContent>
    </Dialog>
  );
}
