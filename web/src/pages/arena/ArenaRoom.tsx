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
import { QualifierResult } from "@/components/tournaments/QualifierResult";
import { CheckpointBanner, CheckpointReveal, ChampionReveal, FinalLobby, VaultRace } from "@/components/tournaments/FinalScreens";
import { useArenaRoom, useServerCountdown, type ConnectionStatus } from "@/hooks/use-arena-room";
import { isValidRoomId, normalizeRoomId } from "@/lib/arena/api";
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

function roomLabel(s: ArenaSnapshot): string {
  if (s.kind === "qualifier") return "Qualifier run";
  if (s.kind === "final") return "Live final";
  return s.kind === "private" ? `Room ${s.code}` : "Public room";
}

function headline(s: ArenaSnapshot): string {
  if (s.phase === "lobby" || s.phase === "countdown") return s.kind === "qualifier" ? "Get ready" : roomLabel(s);
  if (s.phase === "sudden" || s.phase === "sudden_reveal") return s.sudden?.purpose === "cut" ? "Cut-line sudden death" : "Sudden death";
  if (s.phase === "checkpoint") return "Checkpoint";
  if (s.phase === "race") return "The vault race";
  if (s.phase === "jackpot") return "Winner's Jackpot";
  if (s.phase === "results") return s.kind === "final" ? "Champion" : s.kind === "qualifier" ? "Run complete" : "Results";
  return `Question ${s.questionIndex + 1} of ${s.totalQuestions}`;
}

/** One live Arena room. The server's phase decides which screen shows. */
export default function ArenaRoom() {
  const { roomId: rawId = "" } = useParams<{ roomId: string }>();
  const roomId = normalizeRoomId(rawId);
  const valid = isValidRoomId(roomId);
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
  const isFinal = snapshot.kind === "final";
  const isQualifier = snapshot.kind === "qualifier";
  const backTo = snapshot.tournament ? `/arena/tournaments/${snapshot.tournament.id}` : "/arena";
  const inLobby = phase === "lobby" || phase === "countdown";
  const inQuestion = phase === "question" || phase === "reveal" || phase === "sudden" || phase === "sudden_reveal";
  const isReveal = phase === "reveal" || phase === "sudden_reveal";
  const suddenIds = phase === "sudden" || phase === "sudden_reveal" ? snapshot.sudden?.playerIds : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px]">
            <Link to={backTo} className="inline-flex items-center gap-2 font-medium text-vault-neon hover:text-vault-neonhi">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {snapshot.tournament ? snapshot.tournament.name : "Arena"}
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-vault-muted" aria-hidden="true" />
            <span className="text-vault-ice/70" aria-current="page">
              {roomLabel(snapshot)}
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
          <Link to={backTo} className="inline-flex h-10 items-center gap-2 rounded-md border border-vault-line px-3 text-[13px] text-vault-ice/70 transition-colors hover:border-vault-danger/50 hover:text-vault-danger">
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

      {inLobby && isFinal && <FinalLobby snapshot={snapshot} remaining={remaining} />}
      {inLobby && isQualifier && (
        <div className="neon-frame flex flex-col items-center gap-3 bg-vault-panel px-6 py-14 text-center">
          <p className="vault-kicker text-[11px]">{snapshot.tournament?.name}</p>
          <p className="font-display text-[64px] leading-none tabular text-vault-neonhi">{phase === "countdown" ? Math.max(1, Math.ceil(remaining)) : "…"}</p>
          <p className="max-w-md text-[15px] text-vault-ice/70">10 questions, 15 seconds each. Faster correct answers score more, and streaks multiply. Your best run counts.</p>
        </div>
      )}
      {inLobby && !isFinal && !isQualifier && <WaitingRoom snapshot={snapshot} remaining={remaining} send={send} />}

      {inQuestion && (
        <div className={cn("grid gap-5", !isQualifier && "lg:grid-cols-[1fr_320px]")}>
          <div className="flex flex-col gap-5">
            {isFinal && phase === "question" && <CheckpointBanner snapshot={snapshot} />}
            <MatchStage snapshot={snapshot} remaining={remaining} send={send} />
            {!isQualifier && <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} disabled={!isReveal} className="mx-auto w-full max-w-sm" />}
          </div>
          {!isQualifier && (
            <div className="flex flex-col gap-4">
              <LiveStandings players={snapshot.players} meId={snapshot.me.userId} showDelta={phase === "reveal"} highlightIds={suddenIds} />
              <MatchSidebar snapshot={snapshot} send={send} />
            </div>
          )}
        </div>
      )}
      {isQualifier && inQuestion && <MatchSidebar snapshot={snapshot} send={send} />}

      {phase === "checkpoint" && (
        <div className="flex flex-col gap-5">
          <CheckpointReveal snapshot={snapshot} remaining={remaining} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </div>
      )}

      {phase === "race" && (
        <div className="flex flex-col gap-5">
          <VaultRace snapshot={snapshot} remaining={remaining} send={send} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </div>
      )}

      {phase === "jackpot" && (
        <div className="flex flex-col gap-5">
          <JackpotRound snapshot={snapshot} remaining={remaining} send={send} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </div>
      )}

      {phase === "results" && isFinal && (
        <>
          <ChampionReveal snapshot={snapshot} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </>
      )}
      {phase === "results" && isQualifier && <QualifierResult snapshot={snapshot} />}

      {phase === "results" && !isFinal && !isQualifier && (
        <>
          <MatchResults snapshot={snapshot} remaining={remaining} send={send} />
          <ReactionBar reactions={reactions} onReact={(emoji) => send({ type: "react", emoji })} className="mx-auto w-full max-w-sm" />
        </>
      )}
    </div>
  );
}
