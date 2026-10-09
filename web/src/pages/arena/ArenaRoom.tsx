import { ArrowLeft, ChevronRight, Loader2, LogOut, ShieldAlert, Wifi, WifiOff } from "lucide-react";
import { useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { LiveDot } from "@/components/arena/ArenaBits";
import { JackpotRound } from "@/components/arena/JackpotRound";
import { LiveStandings } from "@/components/arena/LiveStandings";
import { MatchResults } from "@/components/arena/MatchResults";
import { MatchSidebar, MatchStage } from "@/components/arena/MatchStage";
import { ReactionBar } from "@/components/arena/ReactionBar";
import { WaitingRoom } from "@/components/arena/WaitingRoom";
import { useArenaRoom, useServerCountdown, type ConnectionStatus } from "@/hooks/use-arena-room";
import type { ArenaSnapshot } from "@/lib/arena/protocol";
import { cn } from "@/lib/utils";

function ConnectionPill({ status }: { status: ConnectionStatus }) {
  if (status === "open") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-vault-success">
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> Live
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-vault-danger" role="status">
      {status === "closed" ? <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {status === "closed" ? "Offline" : status === "connecting" ? "Connecting" : "Reconnecting"}
    </span>
  );
}

function headline(s: ArenaSnapshot): string {
  if (s.phase === "lobby" || s.phase === "countdown") return s.kind === "private" ? `Room ${s.code}` : "Public room";
  if (s.phase === "sudden" || s.phase === "sudden_reveal") return "Sudden death";
  if (s.phase === "jackpot") return "Winner's Jackpot";
  if (s.phase === "results") return "Results";
  return `Question ${s.questionIndex + 1} of ${s.totalQuestions}`;
}

/** One live Arena room. The server's phase decides which screen shows. */
export default function ArenaRoom() {
  const { roomId: rawId = "" } = useParams<{ roomId: string }>();
  const roomId = rawId.toLowerCase().startsWith("pub-") ? rawId.toLowerCase() : rawId.toUpperCase();
  const valid = /^pub-[a-z0-9]{6}$/.test(roomId) || /^[A-HJ-NP-Z2-9]{6}$/.test(roomId);
  const navigate = useNavigate();
  const { snapshot, status, fatal, reactions, send, serverNow } = useArenaRoom(valid ? roomId : "");
  const remaining = useServerCountdown(snapshot?.phaseEndsAt ?? null, serverNow);

  useEffect(() => {
    const onError = (event: Event) => toast.error((event as CustomEvent<string>).detail);
    window.addEventListener("arena:error", onError);
    return () => window.removeEventListener("arena:error", onError);
  }, []);

  if (!valid) return <Navigate to="/arena" replace />;

  if (fatal) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="neon-card w-full max-w-md p-7 text-center" role="alert">
          <ShieldAlert className="mx-auto h-8 w-8 text-vault-danger" aria-hidden="true" />
          <h1 className="mt-4 font-display text-2xl font-medium text-vault-ice">You're out of this room</h1>
          <p className="mt-2 text-[14.5px] text-vault-ice/70">{fatal}</p>
          <button type="button" onClick={() => navigate("/arena")} className="neon-button mt-6 h-12">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the Arena
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-vault-muted" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-vault-neon" aria-hidden="true" />
        <span className="vault-kicker text-[11px]">{status === "reconnecting" ? "Reconnecting to the room" : "Entering the room"}</span>
      </div>
    );
  }

  const phase = snapshot.phase;
  const inLobby = phase === "lobby" || phase === "countdown";
  const inQuestion = phase === "question" || phase === "reveal" || phase === "sudden" || phase === "sudden_reveal";
  const isReveal = phase === "reveal" || phase === "sudden_reveal";
  const suddenIds = phase === "sudden" || phase === "sudden_reveal" ? snapshot.sudden?.playerIds : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px]">
            <Link to="/arena" className="inline-flex items-center gap-2 font-medium text-vault-neon hover:text-vault-neonhi">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Arena
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-vault-muted" aria-hidden="true" />
            <span className="text-vault-ice/70" aria-current="page">
              {snapshot.kind === "private" ? `Room ${snapshot.code}` : "Public room"}
            </span>
          </nav>
          <h1 className={cn("mt-1.5 font-display text-[32px] font-medium leading-none sm:text-[40px]", phase.startsWith("sudden") ? "text-vault-danger" : "text-vault-ice")}>
            {headline(snapshot)}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <ConnectionPill status={status} />
          {snapshot.spectators > 0 && (
            <span className="inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-vault-muted">
              <LiveDot className="bg-vault-neon" /> {snapshot.spectators} watching
            </span>
          )}
          <Link to="/arena" className="inline-flex h-10 items-center gap-2 rounded-md border border-vault-line px-3 text-[13px] text-vault-ice/70 transition-colors hover:border-vault-danger/50 hover:text-vault-danger">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Leave
          </Link>
        </div>
      </header>

      {status !== "open" && (
        <p className="rounded-lg border border-vault-danger/40 bg-vault-danger/10 px-4 py-2.5 text-[13.5px] text-vault-ice/85" role="status">
          Connection lost. Reconnecting… your seat and score are held for 30 seconds.
        </p>
      )}

      {inLobby && <WaitingRoom snapshot={snapshot} remaining={remaining} send={send} />}

      {inQuestion && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-5">
            <MatchStage snapshot={snapshot} remaining={remaining} send={send} />
            <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} disabled={!isReveal} className="mx-auto w-full max-w-sm" />
          </div>
          <div className="flex flex-col gap-4">
            <LiveStandings players={snapshot.players} meId={snapshot.me.userId} showDelta={phase === "reveal"} highlightIds={suddenIds} />
            <MatchSidebar snapshot={snapshot} send={send} />
          </div>
        </div>
      )}

      {phase === "jackpot" && (
        <div className="flex flex-col gap-5">
          <JackpotRound snapshot={snapshot} remaining={remaining} send={send} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </div>
      )}

      {phase === "results" && (
        <>
          <MatchResults snapshot={snapshot} remaining={remaining} send={send} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </>
      )}
    </div>
  );
}
