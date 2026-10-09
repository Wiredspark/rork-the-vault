import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  CloudAlert,
  Copy,
  Crown,
  Eye,
  Flag,
  Gem,
  KeyRound,
  Loader2,
  Lock,
  Play,
  Skull,
  Swords,
  Ticket,
  Timer,
  Trophy,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { formatMs, MiniStat, PlayerAvatar } from "@/components/arena/ArenaBits";
import { EntryChips, formatWhen, ordinal, PhaseCountdown, PrizeStack, StatusPill } from "@/components/tournaments/TournamentBits";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { checkInTournament, fetchTournament, registerTournament, startQualifierRun } from "@/lib/arena/api";
import { FINAL_MAX_PLAYERS, QUALIFIER_RUNS, type TournamentDetail as Detail, type TournamentStanding } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const RULES: { icon: typeof Timer; title: string; body: string }[] = [
  { icon: Play, title: `${QUALIFIER_RUNS} qualifier runs`, body: "Solo 10-question runs against the clock with Arena scoring. Your best run counts. Ties go to the faster total time." },
  { icon: Users, title: "Top 8 make the final", body: "Finalists check in during the 5 minutes before the start. A no-show's seat goes to the next qualifier who checked in." },
  { icon: Skull, title: "Two knockout checkpoints", body: "After Q4 and Q8 the lowest scorers are sealed out. A tie at the cut line goes to sudden death." },
  { icon: KeyRound, title: "The vault race", body: "Survivors enter the vault together: 60 seconds, 3 tries each. The first correct code is champion. No crack? The top score wins." },
];

function CutLine({ label }: { label: string }) {
  return (
    <li aria-hidden="true" className="relative my-1.5 flex items-center gap-3 px-1">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-vault-neon to-vault-neon shadow-[0_0_10px_rgba(207,171,92,0.9)]" />
      <span className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-vault-neonhi">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-vault-neon to-vault-neon shadow-[0_0_10px_rgba(207,171,92,0.9)]" />
    </li>
  );
}

function StandingRow({ s, finalist, showCheckin }: { s: TournamentStanding; finalist: boolean; showCheckin: boolean }) {
  return (
    <li className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", s.isMe ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-transparent bg-white/[0.02]")}>
      <span className={cn("w-7 shrink-0 text-center font-mono text-[13px] tabular", finalist ? "text-vault-neonhi" : "text-vault-muted")}>{s.rank}</span>
      <PlayerAvatar name={s.name} size="sm" highlight={s.isMe} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-medium text-vault-ice">{s.name}</span>
          {s.isMe && <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-vault-neon">You</span>}
        </span>
        <span className="font-mono text-[10.5px] text-vault-muted tabular">
          {s.runsUsed}/{QUALIFIER_RUNS} runs · {formatMs(s.bestTimeMs)} total
          {showCheckin && finalist && (s.checkedIn ? <span className="text-vault-success"> · checked in</span> : <span className="text-vault-danger/80"> · not checked in</span>)}
        </span>
      </span>
      <span className="vault-display text-[15px] tabular text-vault-neonhi">{s.bestScore.toLocaleString("en-US")}</span>
    </li>
  );
}

/** Main call-to-action panel: changes with the tournament phase and the player's status. */
function ActionPanel({ t, invite }: { t: Detail; invite: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmFee, setConfirmFee] = useState<boolean>(false);
  const me = t.me;
  const fee = t.config.entryFee;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tournament", t.id] });

  const register = useMutation({
    mutationFn: () => registerTournament(t.id, invite),
    onSuccess: () => {
      toast.success(fee > 0 ? `You're in. ${formatMoney(fee)} added to the prize pool.` : "You're registered. Good luck!");
      void refresh();
      void queryClient.invalidateQueries({ queryKey: ["arena-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setConfirmFee(false),
  });
  const run = useMutation({
    mutationFn: () => startQualifierRun(t.id),
    onSuccess: ({ roomId }) => navigate(`/arena/room/${roomId}`),
    onError: (e: Error) => toast.error(e.message),
  });
  const checkin = useMutation({
    mutationFn: () => checkInTournament(t.id),
    onSuccess: () => {
      toast.success("Checked in. See you in the final.");
      void refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (t.status === "cancelled") {
    return (
      <div className="rounded-lg border border-vault-line bg-vault-ink/50 p-4 text-[14px] text-vault-ice/75">
        This tournament was cancelled.{me?.registered && fee > 0 ? ` Your ${formatMoney(fee)} entry fee was refunded.` : ""}
      </div>
    );
  }

  if (t.status === "final" && t.finalRoomId) {
    return (
      <Link to={`/arena/room/${t.finalRoomId}`} className="neon-button h-14 text-lg">
        {me?.finalist ? <Swords className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        {me?.finalist ? "Enter the final" : "Watch the final live"}
      </Link>
    );
  }

  if (t.status === "completed") {
    return me?.placement ? (
      <div className="rounded-lg border border-vault-neon/40 bg-vault-neon/[0.07] px-4 py-3 text-[15px] text-vault-ice">
        You finished <span className="font-semibold text-vault-neonhi">{ordinal(me.placement)}</span> in the final.
      </div>
    ) : me?.rank ? (
      <div className="rounded-lg border border-vault-line bg-vault-ink/50 px-4 py-3 text-[14.5px] text-vault-ice/80">You qualified #{me.rank}. Thanks for playing.</div>
    ) : null;
  }

  if (!me) return null;

  if (!me.registered) {
    const open = t.status === "scheduled" || t.status === "qualifying";
    return (
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => (fee > 0 ? setConfirmFee(true) : register.mutate())}
          disabled={!me.canRegister && !(invite && t.config.entryType === "invite" && open && !t.paused)}
          className="neon-button h-14 text-lg"
        >
          {register.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : fee > 0 ? <Ticket className="h-5 w-5" aria-hidden="true" /> : <Flag className="h-5 w-5" aria-hidden="true" />}
          {fee > 0 ? `Register · ${formatMoney(fee)}` : "Register"}
        </button>
        {invite && t.config.entryType === "invite" && <p className="text-[13px] text-vault-success">Invite code applied.</p>}
        {me.blockedReason && !(invite && me.blockedReason.includes("invite")) && (
          <p className="flex items-center gap-1.5 text-[13px] text-vault-ice/65">
            <Lock className="h-3.5 w-3.5 text-vault-neon" aria-hidden="true" /> {me.blockedReason}
          </p>
        )}
        {fee > 0 && <p className="font-mono text-[11px] text-vault-muted tabular">Your Arena VC: {formatMoney(me.arenaVc)}</p>}

        <AlertDialog open={confirmFee} onOpenChange={setConfirmFee}>
          <AlertDialogContent className="border-vault-neon/25 bg-vault-panel text-vault-ice">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">Pay {formatMoney(fee)} to enter?</AlertDialogTitle>
              <AlertDialogDescription className="text-vault-ice/70">
                {formatMoney(fee)} comes out of your Arena VC ({formatMoney(me.arenaVc)} → {formatMoney(me.arenaVc - fee)}) and goes straight into the prize pool. It's only refunded if the
                tournament is cancelled.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-vault-line bg-transparent text-vault-ice hover:bg-white/5">Not now</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  register.mutate();
                }}
                className="neon-button h-10"
              >
                {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Pay ${formatMoney(fee)} & register`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (t.status === "scheduled") {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-vault-success/40 bg-vault-success/[0.07] px-4 py-3 text-[14.5px] text-vault-ice">
        <CheckCircle2 className="h-5 w-5 text-vault-success" aria-hidden="true" /> You're registered. Qualifiers open {formatWhen(t.config.qualStart)}.
      </div>
    );
  }

  if (t.status === "qualifying") {
    const resumable = Boolean(me.liveRunId);
    return (
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={() => run.mutate()} disabled={(!resumable && me.runsLeft === 0) || run.isPending || t.paused} className="neon-button h-14 text-lg">
          {run.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Play className="h-5 w-5" aria-hidden="true" />}
          {resumable ? "Resume your run" : me.runsLeft === 0 ? "All runs used" : me.runsUsed === 0 ? "Play qualifier run" : "Play another run"}
        </button>
        <div className="flex items-center justify-between font-mono text-[11px] text-vault-muted tabular">
          <span className="flex gap-1" aria-label={`${me.runsLeft} of ${QUALIFIER_RUNS} runs left`}>
            {Array.from({ length: QUALIFIER_RUNS }).map((_, i) => (
              <span key={i} className={cn("h-1.5 w-7 rounded-full", i < me.runsUsed ? "bg-vault-neon" : "bg-white/10")} />
            ))}
          </span>
          <span>
            {me.runsLeft} of {QUALIFIER_RUNS} left{me.bestScore !== null ? ` · best ${me.bestScore.toLocaleString("en-US")}` : ""}
          </span>
        </div>
        <p className="text-[12.5px] text-vault-muted">A run counts as soon as it starts. If you drop, reopen it within 30 seconds to keep going.</p>
      </div>
    );
  }

  if (t.status === "locking") {
    return me.finalist ? (
      <div className="rounded-lg border border-vault-neon/50 bg-vault-neon/[0.08] px-4 py-3 text-[14.5px] text-vault-ice">
        <span className="font-semibold text-vault-neonhi">You made the final.</span> Check in opens {formatWhen(t.checkinAt)}. Be here for it!
      </div>
    ) : (
      <div className="rounded-lg border border-vault-line bg-vault-ink/50 px-4 py-3 text-[14.5px] text-vault-ice/80">
        {me.rank ? `You qualified #${me.rank}. If a finalist doesn't check in, standby players move up in order, so check in when it opens.` : "Qualifiers are closed."}
      </div>
    );
  }

  if (t.status === "checkin") {
    const eligible = me.rank !== null;
    return eligible ? (
      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={() => checkin.mutate()} disabled={me.checkedIn || checkin.isPending} className="neon-button h-14 text-lg">
          {checkin.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : me.checkedIn ? <Check className="h-5 w-5" aria-hidden="true" /> : <Flag className="h-5 w-5" aria-hidden="true" />}
          {me.checkedIn ? "Checked in" : "Check in for the final"}
        </button>
        <p className="text-[12.5px] text-vault-muted">
          {me.finalist ? "Your seat is held while you check in." : "You're on standby. If a finalist misses check-in, you move up."}
          {t.finalRoomId && (
            <>
              {" "}
              <Link to={`/arena/room/${t.finalRoomId}`} className="text-vault-neon hover:text-vault-neonhi">
                Go to the final room →
              </Link>
            </>
          )}
        </p>
      </div>
    ) : (
      <Link to={t.finalRoomId ? `/arena/room/${t.finalRoomId}` : "#"} className="ghost-neon-button h-12">
        <Eye className="h-4 w-4" aria-hidden="true" /> Spectate the final
      </Link>
    );
  }
  return null;
}

/** Final placings + vault race summary for completed tournaments. */
function FinalResults({ t }: { t: Detail }) {
  const placements = t.placements ?? [];
  const race = t.race;
  if (!placements.length) return null;
  return (
    <section className="neon-frame relative overflow-hidden bg-vault-panel p-5 sm:p-7" aria-labelledby="final-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-[560px] -translate-x-1/2 rounded-full bg-vault-neon/[0.1] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <PlayerAvatar name={placements[0].name} size="lg" highlight />
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-vault-neon">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Champion
            </p>
            <h2 id="final-title" className="mt-1 font-display text-[32px] font-medium leading-tight text-vault-ice">
              {placements[0].name}
            </h2>
            <p className="mt-1 text-[14px] text-vault-ice/65">
              {race?.cracked ? `Cracked the vault in ${formatMs(race.crackedAtMs)}` : "Nobody cracked the vault. Top score took it."} · {formatMoney(placements[0].vcPrize)}
            </p>
          </div>
        </div>
        {race && (
          <div className="text-right">
            <p className="hud-label text-[9.5px]">Vault · {race.vaultTitle}</p>
            <p className="vault-display mt-1 text-[34px] tracking-[0.2em] tabular text-vault-neonhi">{race.code}</p>
          </div>
        )}
      </div>
      <ol className="relative mt-6 grid gap-1.5 sm:grid-cols-2">
        {placements.map((p) => (
          <li key={p.userId} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", p.placement === 1 ? "border-vault-neon/50 bg-vault-neon/[0.08]" : "border-vault-line bg-vault-ink/40")}>
            <span className={cn("w-8 font-mono text-[13px] tabular", p.placement <= 3 ? "text-vault-neonhi" : "text-vault-muted")}>{ordinal(p.placement)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-vault-ice">{p.name}</span>
              <span className="font-mono text-[10.5px] text-vault-muted tabular">
                {p.score.toLocaleString("en-US")} pts{p.eliminatedAfter ? ` · out after Q${p.eliminatedAfter}` : p.cracked ? " · cracked it" : " · vault race"}
              </span>
            </span>
            {p.vcPrize > 0 && <span className="vault-display text-[13.5px] tabular text-vault-neonhi">{formatMoney(p.vcPrize)}</span>}
          </li>
        ))}
      </ol>
      {race && race.attempts.length > 0 && (
        <div className="relative mt-5 border-t border-vault-line pt-4">
          <p className="eyebrow-muted pb-2">Vault race replay</p>
          <ul className="flex flex-col gap-1.5">
            {race.attempts.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="w-32 truncate text-vault-ice/85">{a.name}</span>
                {a.codes.length === 0 && <span className="font-mono text-[11px] text-vault-muted">no tries</span>}
                {a.codes.map((c, i) => (
                  <span
                    key={i}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] tracking-[0.18em] tabular",
                      c === race.code ? "border-vault-success/60 bg-vault-success/10 text-vault-success" : "border-vault-danger/40 text-vault-danger/90",
                    )}
                  >
                    {c}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Tournament detail: rules, prizes, schedule, your status and the qualifier board. */
export default function TournamentDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const invite = params.get("invite");
  const query = useQuery({
    queryKey: ["tournament", id],
    queryFn: () => fetchTournament(id),
    refetchInterval: (q) => (["qualifying", "checkin", "final", "locking"].includes(q.state.data?.status ?? "") ? 5_000 : 20_000),
  });
  const t = query.data;

  const standings = useMemo(() => t?.standings ?? [], [t]);
  const cut = Math.min(FINAL_MAX_PLAYERS, t?.finalists ?? FINAL_MAX_PLAYERS);

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-vault-muted" role="status">
        <Loader2 className="h-5 w-5 animate-spin text-vault-neon" aria-hidden="true" /> Loading tournament…
      </div>
    );
  }
  if (query.isError || !t) {
    return (
      <div className="neon-card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center" role="alert">
        <CloudAlert className="h-7 w-7 text-vault-danger" aria-hidden="true" />
        <p className="text-vault-ice/80">{query.error?.message ?? "That tournament doesn't exist."}</p>
        <Link to="/arena/tournaments" className="ghost-neon-button h-11">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All tournaments
        </Link>
      </div>
    );
  }

  const me = t.me;
  const myRowOutsideTop = t.myStanding && !standings.slice(0, 20).some((s) => s.isMe) ? t.myStanding : null;
  const shown = standings.slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px]">
          <Link to="/arena" className="font-medium text-vault-neon hover:text-vault-neonhi">
            Arena
          </Link>
          <span className="text-vault-muted">/</span>
          <Link to="/arena/tournaments" className="font-medium text-vault-neon hover:text-vault-neonhi">
            Tournaments
          </Link>
          <span className="text-vault-muted">/</span>
          <span className="truncate text-vault-ice/70" aria-current="page">
            {t.config.name}
          </span>
        </nav>
      </header>

      <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel" aria-labelledby="t-title">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-28 h-80 w-80 rounded-full bg-vault-neon/[0.09] blur-3xl" />
        <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.35fr_1fr]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={t.status} paused={t.paused} />
              <EntryChips t={t} />
            </div>
            <div>
              <h1 id="t-title" className="font-display text-[38px] font-medium leading-[1.02] text-vault-ice sm:text-[52px]">
                {t.config.name}
              </h1>
              {t.config.description && <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-vault-ice/70">{t.config.description}</p>}
            </div>
            <PhaseCountdown t={t} size="lg" />
            <ol className="grid gap-2 sm:grid-cols-3" aria-label="Schedule">
              {[
                { label: "Qualifiers open", at: t.config.qualStart, done: t.status !== "scheduled" },
                { label: "Qualifiers close", at: t.config.qualEnd, done: !["scheduled", "qualifying"].includes(t.status) },
                { label: "Live final", at: t.config.finalsAt, done: ["final", "completed"].includes(t.status) },
              ].map((step) => (
                <li key={step.label} className={cn("rounded-lg border px-3 py-2.5", step.done ? "border-vault-neon/30 bg-vault-neon/[0.05]" : "border-vault-line bg-vault-ink/40")}>
                  <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-vault-muted">
                    {step.done ? <Check className="h-3 w-3 text-vault-neon" aria-hidden="true" /> : <CalendarClock className="h-3 w-3" aria-hidden="true" />}
                    {step.label}
                  </p>
                  <p className="mt-1 text-[13.5px] text-vault-ice/85">{formatWhen(step.at)}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col gap-5 rounded-xl border border-vault-line bg-vault-ink/60 p-5 backdrop-blur">
            <PrizeStack t={t} />
            <div className="border-t border-vault-line pt-5">
              <ActionPanel t={t} invite={invite} />
            </div>
          </div>
        </div>
      </section>

      {t.status === "completed" && <FinalResults t={t} />}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="neon-card p-4 sm:p-5" aria-labelledby="board-title">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <h2 id="board-title" className="flex items-center gap-2 font-display text-[20px] text-vault-ice">
              <Trophy className="h-5 w-5 text-vault-neon" aria-hidden="true" /> Qualifier board
            </h2>
            <span className="font-mono text-[10.5px] text-vault-muted tabular">{standings.length} posted · top {cut} make the final</span>
          </div>
          {standings.length === 0 ? (
            <p className="rounded-lg border border-dashed border-vault-line px-4 py-10 text-center text-[14px] text-vault-muted">
              {t.status === "scheduled" ? "Scores appear here once qualifiers open." : "No scores posted yet. Be the first on the board."}
            </p>
          ) : (
            <ol className="flex flex-col gap-1.5" aria-label="Qualifier standings">
              {shown.map((s, i) => (
                <div key={s.userId} className="contents">
                  <StandingRow s={s} finalist={i < cut} showCheckin={t.status === "checkin"} />
                  {i === cut - 1 && shown.length > cut && <CutLine label={`Top ${cut} cut line`} />}
                </div>
              ))}
              {shown.length <= cut && shown.length > 0 && t.status === "qualifying" && <CutLine label={`${cut - shown.length} final seats open`} />}
              {myRowOutsideTop && (
                <>
                  <li aria-hidden="true" className="px-3 py-1 text-center font-mono text-[10px] tracking-[0.3em] text-vault-muted">
                    ···
                  </li>
                  <StandingRow s={myRowOutsideTop} finalist={false} showCheckin={false} />
                </>
              )}
            </ol>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          {me?.registered && (
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Your best" value={me.bestScore !== null ? me.bestScore.toLocaleString("en-US") : "—"} sub={me.rank ? `rank #${me.rank}` : "no score yet"} />
              <MiniStat label="Runs left" value={`${me.runsLeft}`} sub={`of ${QUALIFIER_RUNS}`} />
              {me.feePaid > 0 && <MiniStat label="Entry paid" value={formatMoney(me.feePaid)} sub="in the pool" />}
              <MiniStat label="Status" value={me.finalist ? "Finalist" : me.standby ? "Standby" : "Entrant"} sub={me.checkedIn ? "checked in" : undefined} />
            </div>
          )}
          <div className="neon-card p-5">
            <p className="eyebrow-muted pb-3">How it works</p>
            <ol className="flex flex-col gap-4">
              {RULES.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-vault-neon/25 bg-vault-ink/60">
                    <Icon className="h-4 w-4 text-vault-neon" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-semibold text-vault-ice">{title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-vault-ice/65">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <ShareInvite t={t} />
        </aside>
      </div>
    </div>
  );
}

function ShareInvite({ t }: { t: Detail }) {
  if (t.status === "completed" || t.status === "cancelled" || t.config.entryType === "invite") return null;
  const link = `${window.location.origin}/arena/tournaments/${t.id}`;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (navigator.share) await navigator.share({ title: t.config.name, text: `Join me in ${t.config.name} on The Vault`, url: link });
          else {
            await navigator.clipboard.writeText(link);
            toast.success("Tournament link copied.");
          }
        } catch {
          /* share sheet dismissed */
        }
      }}
      className="ghost-neon-button h-12"
    >
      <Copy className="h-4 w-4" aria-hidden="true" /> Share this tournament
    </button>
  );
}

export { Gem };
