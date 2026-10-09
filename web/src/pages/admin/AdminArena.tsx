import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, DoorClosed, Gem, Loader2, RefreshCw, Save, Search, Swords, UserX, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { formatMs, LiveDot, MiniStat, PlayerAvatar } from "@/components/arena/ArenaBits";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { closeArenaRoom, fetchArenaAdminState, kickArenaPlayer, saveArenaExclusions } from "@/lib/arena/api";
import type { ArenaExclusions, ArenaRoomSummary } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type PendingAction = { kind: "close"; room: ArenaRoomSummary } | { kind: "kick"; room: ArenaRoomSummary; userId: string; name: string };

const PHASE_LABEL: Record<string, string> = {
  lobby: "Lobby",
  countdown: "Starting",
  question: "Live",
  reveal: "Live",
  sudden: "Sudden death",
  sudden_reveal: "Sudden death",
  jackpot: "Jackpot",
  results: "Results",
};

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** Admin Arena console: live rooms, recent matches, and question-pool exclusions. */
export default function AdminArena() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [search, setSearch] = useState<string>("");
  const [draft, setDraft] = useState<ArenaExclusions | null>(null);
  const [questionInput, setQuestionInput] = useState<string>("");

  const query = useQuery({ queryKey: ["arena-admin"], queryFn: fetchArenaAdminState, refetchInterval: 5_000 });
  const data = query.data;

  useEffect(() => {
    if (data && draft === null) setDraft(data.exclusions);
  }, [data, draft]);

  const action = useMutation({
    mutationFn: async (p: PendingAction) => (p.kind === "close" ? closeArenaRoom(p.room.roomId) : kickArenaPlayer(p.room.roomId, p.userId)),
    onSuccess: (_d, p) => {
      toast.success(p.kind === "close" ? "Room closed." : `${p.name} removed.`);
      void queryClient.invalidateQueries({ queryKey: ["arena-admin"] });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setPending(null),
  });

  const save = useMutation({
    mutationFn: saveArenaExclusions,
    onSuccess: (saved) => {
      setDraft(saved);
      toast.success("Arena pool updated. New matches use it right away.");
      void queryClient.invalidateQueries({ queryKey: ["arena-admin"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const dirty = useMemo(() => {
    if (!data || !draft) return false;
    const norm = (e: ArenaExclusions) => JSON.stringify({ e: [...e.episodes].sort(), q: [...e.questions].sort() });
    return norm(data.exclusions) !== norm(draft);
  }, [data, draft]);

  const episodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.episodes ?? []).filter((e) => !term || e.id.toLowerCase().includes(term) || e.title.toLowerCase().includes(term));
  }, [data, search]);

  const toggleEpisode = (id: string) =>
    setDraft((d) => (d ? { ...d, episodes: d.episodes.includes(id) ? d.episodes.filter((x) => x !== id) : [...d.episodes, id] } : d));

  const addQuestions = () => {
    const ids = questionInput.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return;
    setDraft((d) => (d ? { ...d, questions: [...new Set([...d.questions, ...ids])] } : d));
    setQuestionInput("");
  };

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-vault-muted" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-vault-neon" aria-hidden="true" /> Loading the Arena…
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="neon-card mx-auto max-w-md p-7 text-center" role="alert">
        <p className="text-vault-ice/80">{query.error?.message ?? "Couldn't load the Arena."}</p>
        <button type="button" onClick={() => query.refetch()} className="neon-button mt-4 h-11">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const live = data.rooms.filter((r) => !["lobby", "countdown"].includes(r.phase)).length;
  const online = data.rooms.reduce((n, r) => n + r.playerCount + r.spectators, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vault-kicker text-[11px]">Admin hub</p>
          <h1 className="mt-1 font-display text-[36px] font-medium text-vault-ice">Arena</h1>
          <p className="mt-1 text-[14.5px] text-vault-ice/65">Live rooms refresh every 5 seconds.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Online" value={`${online}`} />
          <MiniStat label="Live matches" value={`${live}`} />
          <MiniStat label="Public jackpot" value={formatMoney(data.publicJackpot)} />
        </div>
      </header>

      <section className="neon-card p-5" aria-labelledby="rooms-title">
        <h2 id="rooms-title" className="flex items-center gap-2 font-display text-xl text-vault-ice">
          <LiveDot /> Live rooms
        </h2>
        {data.rooms.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-vault-line px-4 py-8 text-center text-[14px] text-vault-muted">No one's in the Arena right now.</p>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {data.rooms.map((room) => (
              <li key={room.roomId} className="rounded-lg border border-vault-line bg-vault-ink/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[13px] text-vault-neon">{room.kind === "private" ? room.roomId : room.roomId}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-vault-muted">
                      {room.kind} · {PHASE_LABEL[room.phase] ?? room.phase} · {room.playerCount} in · {room.spectators} watching · {timeAgo(room.updatedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "close", room })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-vault-danger/40 px-2.5 text-[12.5px] text-vault-danger transition-colors hover:bg-vault-danger/10"
                  >
                    <DoorClosed className="h-3.5 w-3.5" aria-hidden="true" /> Close
                  </button>
                </div>
                <ul className="mt-3 flex flex-col gap-1">
                  {room.playerIds.map((id, i) => (
                    <li key={id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1">
                      <PlayerAvatar name={room.playerNames[i] ?? "Player"} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-vault-ice">{room.playerNames[i] ?? "Player"}</span>
                      <button
                        type="button"
                        onClick={() => setPending({ kind: "kick", room, userId: id, name: room.playerNames[i] ?? "Player" })}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-vault-muted transition-colors hover:bg-vault-danger/10 hover:text-vault-danger"
                        aria-label={`Remove ${room.playerNames[i] ?? "player"}`}
                      >
                        <UserX className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <section className="neon-card p-5" aria-labelledby="matches-title">
          <h2 id="matches-title" className="flex items-center gap-2 font-display text-xl text-vault-ice">
            <Swords className="h-5 w-5 text-vault-neon" aria-hidden="true" /> Recent matches
          </h2>
          {data.matches.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-vault-line px-4 py-8 text-center text-[14px] text-vault-muted">No matches played yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {data.matches.map((m) => (
                <li key={m.matchId} className="rounded-lg border border-vault-line bg-vault-ink/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14.5px] text-vault-ice">
                      <span className="font-medium">{m.winnerName ?? "No winner"}</span>
                      <span className="text-vault-muted"> won · {m.standings.length} players</span>
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                        m.jackpotCracked ? "border-vault-success/50 text-vault-success" : "border-vault-line text-vault-muted",
                      )}
                    >
                      <Gem className="h-3 w-3" aria-hidden="true" />
                      {m.jackpotCracked ? `Cracked ${formatMoney(m.jackpotAmount)}` : "Sealed"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] text-vault-muted">
                    {m.kind} · {m.winReason ?? "—"} · vault {m.vaultEpisodeId ?? "—"} · {timeAgo(m.endedAt)}
                  </p>
                  <p className="mt-1.5 truncate text-[12.5px] text-vault-ice/60">
                    {m.standings.map((s) => `${s.placement}. ${s.name} ${s.score.toLocaleString("en-US")} (${formatMs(s.fastestMs)})`).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="neon-card p-5" aria-labelledby="pool-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="pool-title" className="flex items-center gap-2 font-display text-xl text-vault-ice">
              <Ban className="h-5 w-5 text-vault-neon" aria-hidden="true" /> Question pool
            </h2>
            <button type="button" disabled={!dirty || save.isPending || !draft} onClick={() => draft && save.mutate(draft)} className="neon-button h-10 px-4 text-[13.5px]">
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save pool
            </button>
          </div>
          <p className="mt-1 text-[13px] text-vault-muted">Released episodes feed the Arena. Untick an episode or add question IDs to keep them out of new matches.</p>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vault-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter episodes"
              className="h-10 w-full rounded-md border border-vault-line bg-vault-ink/60 pl-9 pr-3 text-[14px] text-vault-ice placeholder:text-vault-muted focus:border-vault-neon/60 focus:outline-none"
            />
          </label>
          <ul className="mt-3 max-h-72 overflow-y-auto pr-1">
            {episodes.map((e) => {
              const excluded = draft?.episodes.includes(e.id) ?? false;
              return (
                <li key={e.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-white/[0.03]">
                    <input type="checkbox" checked={!excluded} onChange={() => toggleEpisode(e.id)} className="h-4 w-4 accent-[#CFAB5C]" />
                    <span className="w-12 font-mono text-[12px] text-vault-neon">{e.id}</span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", excluded ? "text-vault-muted line-through" : "text-vault-ice/85")}>{e.title}</span>
                    <span className="font-mono text-[10.5px] text-vault-muted tabular">{e.questionCount} q</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-vault-line pt-4">
            <p className="eyebrow-muted">Excluded questions</p>
            <div className="mt-2 flex gap-2">
              <input
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addQuestions())}
                placeholder="Question ID, e.g. EP004-R2-Q3"
                className="h-10 min-w-0 flex-1 rounded-md border border-vault-line bg-vault-ink/60 px-3 font-mono text-[13px] text-vault-ice placeholder:text-vault-muted focus:border-vault-neon/60 focus:outline-none"
              />
              <button type="button" onClick={addQuestions} className="ghost-neon-button h-10 px-3 text-[13px]">
                Add
              </button>
            </div>
            {draft && draft.questions.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {draft.questions.map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full border border-vault-line bg-vault-ink/60 py-1 pl-2.5 pr-1 font-mono text-[11.5px] text-vault-ice/80">
                    {id}
                    <button
                      type="button"
                      onClick={() => setDraft((d) => (d ? { ...d, questions: d.questions.filter((q) => q !== id) } : d))}
                      className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/10"
                      aria-label={`Allow ${id} again`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent className="border-vault-neon/20 bg-vault-panel text-vault-ice">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{pending?.kind === "close" ? "Close this room?" : `Remove ${pending?.kind === "kick" ? pending.name : ""}?`}</AlertDialogTitle>
            <AlertDialogDescription className="text-vault-ice/70">
              {pending?.kind === "close"
                ? "Everyone in the room is sent back to the Arena lobby. A match in progress ends without results."
                : "They're removed from this room and can't rejoin it. They can still play in other rooms."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-vault-line bg-transparent text-vault-ice hover:bg-white/5">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pending) action.mutate(pending);
              }}
              className="bg-vault-danger text-vault-ink hover:bg-vault-danger/90"
            >
              {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : pending?.kind === "close" ? "Close room" : "Remove player"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
