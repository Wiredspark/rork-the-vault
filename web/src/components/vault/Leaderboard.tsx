import { useQuery } from "@tanstack/react-query";
import { CloudAlert, Loader2, Trophy, UserRound } from "lucide-react";
import { memo } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalVc: number;
  runsCount: number;
}

const TOP_RANK_STYLES = [
  "border-vault-neon/70 bg-vault-neon/20 text-vault-neonhi",
  "border-vault-ice/40 bg-white/10 text-vault-ice",
  "border-[#B08D57]/60 bg-[#B08D57]/15 text-[#E5C9A6]",
] as const;

const RankBadge = memo(function RankBadge({ rank }: { rank: number }) {
  const topStyle = rank <= 3 ? TOP_RANK_STYLES[rank - 1] : undefined;
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-display text-sm font-semibold tabular-nums",
        topStyle ?? "border-vault-line bg-vault-raised text-vault-ice/70",
      )}
      aria-hidden="true"
    >
      {rank}
    </span>
  );
});

const LeaderboardRow = memo(function LeaderboardRow({
  entry,
  rank,
  isCurrentUser,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2.5",
        isCurrentUser ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-transparent",
      )}
    >
      <RankBadge rank={rank} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5 truncate text-[15px] font-medium text-vault-ice">
          {entry.displayName}
          {isCurrentUser && (
            <span className="shrink-0 rounded-sm bg-vault-neon/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">
              You
            </span>
          )}
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-vault-muted">
          {entry.runsCount} {entry.runsCount === 1 ? "run" : "runs"}
        </span>
      </span>
      <span className="vault-display shrink-0 text-[15px] tabular text-vault-neonhi">{formatMoney(entry.totalVc)}</span>
    </li>
  );
});

function BoardBody() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      const { data, error } = await supabase
        .from("leaderboard")
        .select("user_id, display_name, total_vc, runs_count")
        .order("total_vc", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        userId: row.user_id ?? "",
        displayName: row.display_name ?? "Player",
        totalVc: row.total_vc ?? 0,
        runsCount: row.runs_count ?? 0,
      }));
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center">
        <UserRound className="h-6 w-6 text-vault-neon/70" aria-hidden="true" />
        <p className="text-[15px] text-vault-ice/80">Sign in to see the top 10 players.</p>
        <p className="text-[13px] text-vault-muted">Your total VC counts once you're signed in.</p>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-vault-line bg-vault-panel py-10 text-vault-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="vault-kicker text-[11px]">Counting the vault</span>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center" role="alert">
        <CloudAlert className="h-6 w-6 text-vault-danger" aria-hidden="true" />
        <p className="text-[15px] text-vault-ice/80">The leaderboard is sealed right now.</p>
        <p className="text-[13px] text-vault-muted">Check your connection and reopen it.</p>
      </div>
    );
  }

  const entries = query.data;
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-vault-line bg-vault-panel px-4 py-8 text-center">
        <Trophy className="h-6 w-6 text-vault-neon/70" aria-hidden="true" />
        <p className="text-[15px] text-vault-ice/80">No scores on the board yet.</p>
        <p className="text-[13px] text-vault-muted">Play an episode and claim the top spot.</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-1">
      {entries.map((entry, index) => (
        <LeaderboardRow key={entry.userId} entry={entry} rank={index + 1} isCurrentUser={entry.userId === user.id} />
      ))}
    </ol>
  );
}

/** Top 10 players by lifetime VC, fetched from the `leaderboard` view. */
export function LeaderboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md gap-0 border-vault-neon/20 bg-[linear-gradient(180deg,#141D19,#0F1613)] p-0 text-vault-ice"
        aria-describedby="leaderboard-desc"
      >
        <DialogHeader className="gap-1.5 border-b border-vault-neon/15 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2.5 font-display text-xl font-medium text-vault-ice">
            <Trophy className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            The Leaderboard
          </DialogTitle>
          <DialogDescription id="leaderboard-desc" className="vault-kicker text-[11px]">
            Top 10 players · lifetime VC
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-3 py-3">
          <BoardBody />
        </div>
      </DialogContent>
    </Dialog>
  );
}
