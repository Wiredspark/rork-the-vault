import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, DoorOpen, Gem, KeyRound, Loader2, Lock, Medal, Swords, Timer, Trophy, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { LiveDot, MiniStat, winRate } from "@/components/arena/ArenaBits";
import { formatClock, STATUS_LABEL, TrophyBadges, useTicker } from "@/components/tournaments/TournamentBits";
import { PageHeader } from "@/components/shell/PageHeader";
import { IMAGES } from "@/data/assets";
import { createPrivateRoom, fetchArenaOverview, fetchRoomInfo, joinPublicArena, normalizeRoomCode } from "@/lib/arena/api";
import type { ArenaOverview } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useShellUI } from "@/providers/ShellUIProvider";

const RULES: { icon: typeof Timer; title: string; body: string }[] = [
  { icon: Timer, title: "10 questions, 15 seconds each", body: "Everyone gets the same question at the same moment. Faster correct answers earn up to 50% more VC." },
  { icon: Swords, title: "Highest score wins", body: "Tied at the top? The leaders face sudden death: fastest correct answer takes it." },
  { icon: KeyRound, title: "Two gold digit questions", body: "Answer them right to privately unlock vault digits. Only you see what you earned." },
  { icon: Gem, title: "Winner's Jackpot", body: "The winner gets 30 seconds and 3 tries to crack the vault. Every sealed vault grows the next jackpot." },
];

/** Arena home: join the public room, host a private room, or join one by code. */
export default function ArenaLobby() {
  const navigate = useNavigate();
  const { openLeaderboard } = useShellUI();
  const [code, setCode] = useState<string>("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ["arena-overview"],
    queryFn: fetchArenaOverview,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const joinPublic = useMutation({
    mutationFn: joinPublicArena,
    onSuccess: ({ roomId }) => navigate(`/arena/room/${roomId}`),
    onError: (error: Error) => toast.error(error.message),
  });

  const createRoom = useMutation({
    mutationFn: createPrivateRoom,
    onSuccess: ({ roomId }) => navigate(`/arena/room/${roomId}`),
    onError: (error: Error) => toast.error(error.message),
  });

  const joinCode = useMutation({
    mutationFn: async (roomCode: string) => {
      const info = await fetchRoomInfo(roomCode);
      if (!info.exists) throw new Error("No room with that code. Check it and try again.");
      return roomCode;
    },
    onSuccess: (roomCode) => navigate(`/arena/room/${roomCode}`),
    onError: (error: Error) => setCodeError(error.message),
  });

  const onSubmitCode = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (normalized.length !== 6) {
      setCodeError("Room codes are 6 characters.");
      return;
    }
    setCodeError(null);
    joinCode.mutate(normalized);
  };

  const data = overview.data;
  const me = data?.me ?? null;
  const busy = joinPublic.isPending || createRoom.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumb="Arena" title="The Arena" subtitle="Live R&B trivia against real players. 2 to 8 per room." />

      <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-ink" aria-labelledby="arena-hero">
        <img src={IMAGES.vaultDoor} alt="" className="absolute inset-y-0 right-0 h-full w-full object-cover object-[70%_50%] opacity-35 sm:w-[70%] sm:opacity-80" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#0B1210_0%,#0B1210_35%,rgba(11,18,16,0.82)_58%,rgba(11,18,16,0.2)_100%)]" />
        <div className="relative grid gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[1.25fr_1fr]">
          <div className="flex flex-col justify-center">
            <p className="flex items-center gap-2.5">
              <LiveDot />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.26em] text-vault-success">
                {overview.isPending ? "Checking the floor…" : `${data?.online ?? 0} ${data?.online === 1 ? "player" : "players"} in the Arena`}
              </span>
            </p>
            <h2 id="arena-hero" className="mt-4 font-display text-[40px] font-medium leading-[0.98] text-vault-ice sm:text-[56px]">
              Outplay the room.
              <br />
              <span className="text-vault-neonhi">Crack the jackpot.</span>
            </h2>

            <div className="mt-6 inline-flex w-fit items-center gap-4 rounded-xl border border-vault-neon/40 bg-vault-neon/[0.07] px-5 py-3.5">
              <Gem className="h-6 w-6 text-vault-neon" aria-hidden="true" />
              <div>
                <p className="vault-kicker text-[10px]">Public jackpot</p>
                <p className="vault-display text-[28px] leading-none tabular text-vault-neonhi">
                  {data ? formatMoney(data.publicJackpot) : "—"}
                </p>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => joinPublic.mutate()} disabled={busy} className="neon-button h-14 text-lg">
                {joinPublic.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <DoorOpen className="h-5 w-5" aria-hidden="true" />}
                Join public room
              </button>
              <button type="button" onClick={() => createRoom.mutate()} disabled={busy} className="ghost-neon-button h-14">
                {createRoom.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}
                Create private room
              </button>
            </div>
            <p className="mt-3 text-[13px] text-vault-muted">Public matches start 20 seconds after a second player arrives.</p>
          </div>

          <div className="flex flex-col justify-center gap-4">
            <form onSubmit={onSubmitCode} className="rounded-xl border border-vault-line bg-vault-panel/90 p-5 backdrop-blur" aria-labelledby="code-title">
              <p id="code-title" className="eyebrow-muted">Join with a code</p>
              <label htmlFor="room-code" className="sr-only">
                Room code
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="room-code"
                  value={code}
                  onChange={(e) => {
                    setCode(normalizeRoomCode(e.target.value));
                    setCodeError(null);
                  }}
                  placeholder="ABC123"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  className="h-14 min-w-0 flex-1 rounded-md border border-vault-neon/30 bg-vault-ink/80 px-4 text-center font-display text-[24px] uppercase tracking-[0.35em] text-vault-neonhi placeholder:text-vault-ice/15 focus:border-vault-neon focus:outline-none focus:ring-1 focus:ring-vault-neon/50"
                  aria-invalid={Boolean(codeError)}
                  aria-describedby={codeError ? "code-error" : undefined}
                />
                <button
                  type="submit"
                  disabled={joinCode.isPending || code.length !== 6}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-vault-neon/50 text-vault-neonhi transition-colors hover:bg-vault-neon/10 disabled:opacity-40"
                  aria-label="Join room"
                >
                  {joinCode.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                </button>
              </div>
              {codeError && (
                <p id="code-error" role="alert" className="mt-2 text-[13px] text-vault-danger">
                  {codeError}
                </p>
              )}
            </form>

            <div className="rounded-xl border border-vault-line bg-vault-panel/90 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="eyebrow-muted">Your Arena record</p>
                <button
                  type="button"
                  onClick={() => openLeaderboard("arena")}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-vault-neon transition-colors hover:text-vault-neonhi"
                >
                  <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                  Arena board
                </button>
              </div>
              {me && (me.title || me.trophies.champion + me.trophies.finalist + me.trophies.qualifier > 0) && (
                <TrophyBadges trophies={me.trophies} title={me.title} className="mt-2" />
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniStat label="Rating" value={me ? `${me.rating}` : "1000"} sub={me ? `best ${me.bestScore.toLocaleString("en-US")}` : "unrated"} />
                <MiniStat label="Wins" value={`${me?.wins ?? 0}`} sub={`${winRate(me?.wins ?? 0, me?.matches ?? 0)} of ${me?.matches ?? 0}`} />
                <MiniStat label="Arena VC" value={formatMoney(me?.arenaVc ?? 0)} />
                <MiniStat label="Jackpots" value={`${me?.jackpots ?? 0}`} sub="vaults cracked" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <TournamentTeaser spotlight={data?.spotlight ?? null} />

      <section aria-labelledby="rules-title">
        <h2 id="rules-title" className="sr-only">
          How the Arena works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {RULES.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className={cn("neon-card animate-rise-in p-5")} style={{ animationDelay: `${120 + i * 70}ms` }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-vault-neon/25 bg-vault-ink/60">
                  <Icon className="h-4 w-4 text-vault-neon" aria-hidden="true" />
                </span>
                <span className="font-mono text-[11px] text-vault-muted tabular">0{i + 1}</span>
              </div>
              <p className="mt-3 text-[15.5px] font-semibold text-vault-ice">{title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-vault-ice/65">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-vault-muted">
          <Medal className="h-3.5 w-3.5 text-vault-neon/70" aria-hidden="true" />
          Lifelines: 50/50 and Shield, once each per match.
          <Users className="ml-2 h-3.5 w-3.5 text-vault-neon/70" aria-hidden="true" />
          Arena VC is tracked separately from your solo runs.
        </p>
      </section>
    </div>
  );
}

const SPOT_COPY: Record<string, string> = {
  scheduled: "Qualifiers open in",
  qualifying: "Qualifiers close in",
  locking: "Final starts in",
  checkin: "Final starts in",
  final: "Final is live",
};

/** Gold strip promoting the live or next tournament. */
function TournamentTeaser({ spotlight }: { spotlight: ArenaOverview["spotlight"] }) {
  const left = useTicker(spotlight && spotlight.status !== "final" ? spotlight.at : null);
  return (
    <Link
      to={spotlight ? `/arena/tournaments/${spotlight.id}` : "/arena/tournaments"}
      className="group neon-card animate-rise-in relative flex flex-wrap items-center gap-4 overflow-hidden border-vault-neon/35 p-5 transition-colors hover:border-vault-neon/70 sm:px-6"
    >
      <span aria-hidden="true" className="pointer-events-none absolute -left-10 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-vault-neon/[0.12] blur-3xl" />
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-vault-neon/50 bg-vault-neon/10">
        <Crown className="h-6 w-6 text-vault-neonhi" aria-hidden="true" />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-vault-neon">
          {spotlight?.status === "final" && <LiveDot />}
          {spotlight ? STATUS_LABEL[spotlight.status] : "Tournaments"}
        </p>
        <p className="mt-1 truncate font-display text-[22px] text-vault-ice">{spotlight ? spotlight.name : "Qualify, survive the cuts, race for the vault"}</p>
      </div>
      {spotlight && (
        <div className="relative text-right">
          <p className="hud-label text-[9.5px]">{SPOT_COPY[spotlight.status] ?? ""}</p>
          {spotlight.status !== "final" && <p className="vault-display mt-1 text-[22px] leading-none tabular text-vault-neonhi">{left > 0 ? formatClock(left) : "Soon"}</p>}
        </div>
      )}
      <ArrowRight className="relative h-5 w-5 text-vault-neon transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </Link>
  );
}
