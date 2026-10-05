import { ArrowRight, Check, Clock, Lock } from "lucide-react";
import { memo, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { RoundDot } from "@/components/play/RoundDot";
import { DigitTile } from "@/components/vault/DigitTile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { roundProgress, roundStats, VAULT_MAX_ATTEMPTS, type AnswerRecord, type RoundProgress } from "@/lib/gameEngine";
import { roundStyle } from "@/lib/roundIdentity";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

type TickState = "correct" | "wrong" | "current" | "upcoming";

const STATUS: Record<RoundProgress, { label: string; className: string; Icon: ComponentType<{ className?: string }> }> = {
  done: { label: "Done", className: "text-vault-success", Icon: Check },
  active: { label: "In progress", className: "text-vault-neonhi", Icon: Clock },
  next: { label: "Up next", className: "text-vault-neon", Icon: ArrowRight },
  locked: { label: "Locked", className: "text-vault-muted", Icon: Lock },
};

function tickState(index: number, records: AnswerRecord[], currentIndex: number | null): TickState {
  const record = records[index];
  if (record) return record.correct ? "correct" : "wrong";
  if (currentIndex === index) return "current";
  return "upcoming";
}

const Tick = memo(function Tick({ state, bonus }: { state: TickState; bonus: boolean }) {
  return (
    <span
      className={cn(
        "block shrink-0 transition-all duration-500",
        bonus ? "h-[7px] w-[7px] rotate-45 rounded-[1.5px]" : "h-1 min-w-[6px] flex-1 rounded-full",
        // Progress takes the round's thematic identity color (scoped via --round-rgb on the segment).
        state === "correct" && "bg-round shadow-[0_0_8px_rgb(var(--round-rgb)/0.5)]",
        state === "wrong" && "bg-vault-danger/70",
        state === "current" && "animate-pulse bg-round shadow-[0_0_7px_rgb(var(--round-rgb)/0.9)]",
        state === "upcoming" && "bg-white/[0.12]",
      )}
    />
  );
});

const POPOVER_CLASS = "w-72 border-vault-neon/20 bg-vault-panel p-0 text-vault-ice shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]";

function Segment({
  label,
  meta,
  emphasis,
  grow,
  ariaLabel,
  style,
  children,
  details,
  marker,
}: {
  marker?: ReactNode;
  label: string;
  meta: string;
  emphasis: boolean;
  grow: number;
  ariaLabel: string;
  style?: CSSProperties;
  children: ReactNode;
  details: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          style={{ ...style, ...(grow > 0 ? { flexGrow: grow, flexBasis: 0 } : { flex: "none" }) }}
          className="group flex min-w-0 flex-col gap-1.5 rounded-md px-1.5 py-1.5 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-vault-neon/60"
        >
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("hud-label inline-flex items-center gap-1.5 transition-colors", emphasis ? "text-vault-neon" : "group-hover:text-vault-ice/80")}>
              {marker}
              {label}
            </span>
            <span className="hud-label hidden tracking-[0.1em] tabular sm:inline">{meta}</span>
          </span>
          <span className="flex h-7 items-center gap-[3px]">{children}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={10} className={POPOVER_CLASS}>
        {details}
      </PopoverContent>
    </Popover>
  );
}

function StatusLine({ progress }: { progress: RoundProgress }) {
  const s = STATUS[progress];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em]", s.className)}>
      <s.Icon className="h-3 w-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

function RoundSegment({ roundIndex }: { roundIndex: number }) {
  const { episode, state } = useGame();
  const round = episode.rounds[roundIndex];
  const progress = roundProgress(state, roundIndex);
  const stats = roundStats(state, episode, roundIndex);
  const records = state.answers.filter((a) => a.roundIndex === roundIndex);
  const isCurrentRound = !state.roundsComplete && state.roundIndex === roundIndex;
  const currentIndex = isCurrentRound && (state.phase === "question" || state.phase === "feedback") ? state.questionIndex : null;
  const payoutLabel =
    round.standard.length <= 2
      ? round.standard.map((q) => formatMoney(q.payout)).join(" / ")
      : `${formatMoney(round.minPayout)} – ${formatMoney(round.maxPayout)}`;

  // Scope --round-rgb on the whole segment so the progress ticks pick up this round's identity color.
  return (
    <Segment
      style={roundStyle(round.index)}
      label={`R${round.number}`}
      marker={<RoundDot roundIndex={round.index} glow={progress === "active"} className={cn(progress === "locked" && "opacity-40")} />}
      meta={`${stats.answered}/${stats.total}`}
      emphasis={progress === "active" || progress === "next"}
      grow={round.lineup.length}
      ariaLabel={`Round ${round.number}, ${round.name}: ${stats.answered} of ${stats.total} answered, ${STATUS[progress].label}`}
      details={
        <div>
          <div className="border-b border-vault-line p-4">
            <div className="flex items-center justify-between">
              <span className="vault-kicker inline-flex items-center gap-2">
                <RoundDot roundIndex={round.index} />
                Round {round.number}
              </span>
              <StatusLine progress={progress} />
            </div>
            <h3 className="mt-2 font-display text-lg font-medium leading-tight">{round.name}</h3>
            <p className="mt-1 text-[13px] text-vault-ice/60">
              {round.standard.length} questions + bonus · {round.defaultTimer}s each
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-vault-line">
            <div className="bg-vault-panel px-4 py-3">
              <dt className="hud-label">Payouts</dt>
              <dd className="mt-1 font-mono text-[12px] text-vault-ice/90 tabular">{payoutLabel}</dd>
            </div>
            <div className="bg-vault-panel px-4 py-3">
              <dt className="hud-label">Banked</dt>
              <dd className="mt-1 font-mono text-[12px] text-vault-neonhi tabular">{formatMoney(stats.score)}</dd>
            </div>
          </dl>
          <div className="flex items-center justify-between border-t border-vault-line px-4 py-3">
            <span className="font-mono text-[11px] text-vault-muted tabular">
              {stats.correct} correct{stats.bonusAnswered ? (stats.bonusCorrect ? " · bonus ✓" : " · bonus ✕") : ""}
            </span>
            {progress === "done" && (
              <Link to="/results" className="text-link text-sm">
                Review <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
            {(progress === "active" || progress === "next") && (
              <Link to="/play" className="text-link text-sm">
                {progress === "active" ? "Continue" : "Start"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      }
    >
      {round.lineup.map((q, i) => (
        <Tick key={q.id} state={tickState(i, records, currentIndex)} bonus={q.type === "bonus"} />
      ))}
    </Segment>
  );
}

type BoxKind = "free" | "earned" | "locked" | "exposed";

const BOX_CAPTION: Record<BoxKind, string> = { free: "Free", earned: "Earned", locked: "Locked", exposed: "Revealed" };

/** Which digits are free (given), earned (bonus answered), still locked, or exposed after the vault sealed. */
function useVaultBoxes(): { digit: string; kind: BoxKind }[] {
  const { episode, state, knownDigits } = useGame();
  return episode.vaultCode.map((digit, i) => {
    if (episode.freeDigitIndexes.includes(i)) return { digit, kind: "free" };
    if (knownDigits.includes(i)) return { digit, kind: "earned" };
    if (state.vaultOutcome !== "pending") return { digit, kind: "exposed" };
    return { digit, kind: "locked" };
  });
}

const VaultBox = memo(function VaultBox({
  digit,
  kind,
  cracked,
  awaiting,
}: {
  digit: string;
  kind: BoxKind;
  cracked: boolean;
  awaiting: boolean;
}) {
  const shown = kind !== "locked";
  const [flash, setFlash] = useState(false);
  const prevKind = useRef<BoxKind>(kind);

  // Bloom once when the digit is earned mid-run (locked → earned); previously earned digits stay still on reload.
  useEffect(() => {
    const wasEarned = prevKind.current === "earned";
    prevKind.current = kind;
    if (wasEarned || kind !== "earned") return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1700);
    return () => window.clearTimeout(timer);
  }, [kind]);

  return (
    <span
      className={cn(
        "relative flex h-7 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px] border transition-all duration-500 sm:w-[26px]",
        cracked
          ? "border-vault-success/70 bg-vault-success/10 text-vault-success"
          : kind === "earned"
            ? "border-vault-neonhi/90 bg-vault-neon/15 text-vault-ice shadow-[0_0_12px_-2px_rgba(207,171,92,0.55)]"
            : kind === "free"
              ? "border-vault-neon/40 bg-vault-neon/[0.05] text-vault-neonhi"
              : kind === "exposed"
                ? "border-vault-danger/45 bg-vault-danger/[0.06] text-vault-danger/90"
                : awaiting
                  ? "animate-pulse border-vault-neon/60 bg-white/[0.02] text-vault-neon/70"
                  : "border-white/[0.12] bg-white/[0.02] text-vault-muted/60",
        flash && "animate-digit-earned",
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/50" aria-hidden="true" />
      <span key={`${kind}-${shown ? digit : "x"}`} className={cn("vault-display text-[13px] leading-none tabular", shown && "animate-digit-flip")}>
        {shown ? digit : "?"}
      </span>
      {kind === "free" && !cracked && (
        <span className="pointer-events-none absolute right-[3px] top-[3px] h-[3px] w-[3px] rounded-full bg-vault-neon/70" aria-hidden="true" />
      )}
    </span>
  );
});

function VaultSegment() {
  const { episode, state, status, knownDigits } = useGame();
  const boxes = useVaultBoxes();
  const done = state.vaultOutcome !== "pending";
  const cracked = state.vaultOutcome === "cracked";
  const known = done ? episode.vaultCode.length : knownDigits.length;
  const progress: RoundProgress = done ? "done" : status === "vault" ? "active" : "locked";
  const spoken = boxes.map((b, i) => `digit ${i + 1} ${b.kind === "locked" ? "locked" : `${b.digit}, ${BOX_CAPTION[b.kind].toLowerCase()}`}`).join("; ");

  return (
    <Segment
      label="Vault"
      meta={`${known}/${episode.vaultCode.length}`}
      emphasis={status === "vault"}
      grow={0}
      ariaLabel={`Vault code: ${spoken}${cracked ? ". Cracked" : state.vaultOutcome === "sealed" ? ". Sealed" : ""}`}
      details={
        <div>
          <div className="border-b border-vault-line p-4">
            <div className="flex items-center justify-between">
              <span className="vault-kicker">Vault chamber</span>
              {cracked ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-success">Cracked</span>
              ) : state.vaultOutcome === "sealed" ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-vault-danger">Sealed</span>
              ) : (
                <StatusLine progress={progress} />
              )}
            </div>
            <p className="mt-2 text-[13px] text-vault-ice/60">
              {cracked ? `Cracked — ${episode.vaultYear}. +${formatMoney(episode.vaultPrize)}` : "Bonus questions reveal digits. Crack the code to finish the run."}
            </p>
          </div>
          <div className="flex justify-center gap-2 p-4">
            {boxes.map((box, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <DigitTile
                  size="sm"
                  value={box.kind === "locked" ? null : box.digit}
                  state={box.kind === "locked" ? "locked" : box.kind === "free" ? "free" : "revealed"}
                  label={box.kind === "locked" ? `Digit ${i + 1}: locked` : `Digit ${i + 1}: ${box.digit}, ${BOX_CAPTION[box.kind].toLowerCase()}`}
                />
                <span
                  className={cn(
                    "font-mono text-[9px] uppercase tracking-[0.18em]",
                    box.kind === "earned" ? "text-vault-neonhi" : box.kind === "free" ? "text-vault-neon/70" : box.kind === "exposed" ? "text-vault-danger/80" : "text-vault-muted",
                  )}
                >
                  {BOX_CAPTION[box.kind]}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-vault-line px-4 py-3">
            <span className="font-mono text-[11px] text-vault-muted tabular">
              {state.vaultAttempts}/{VAULT_MAX_ATTEMPTS} attempts
            </span>
            <Link to="/vault" className="text-link text-sm">
              View chamber <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      }
    >
      {boxes.map((box, i) => (
        <VaultBox key={i} digit={box.digit} kind={box.kind} cracked={cracked} awaiting={status === "vault"} />
      ))}
    </Segment>
  );
}

/** Run progress merged into the HUD: per-question ticks for each round plus the vault digits. Each segment opens its details. */
export function JourneyTrack({ className }: { className?: string }) {
  const { episode } = useGame();
  return (
    <nav aria-label="Run progress" className={cn("flex items-stretch gap-2", className)}>
      {episode.rounds.map((round) => (
        <RoundSegment key={round.index} roundIndex={round.index} />
      ))}
      <span className="my-2 w-px shrink-0 bg-vault-neon/15" aria-hidden="true" />
      <VaultSegment />
    </nav>
  );
}
