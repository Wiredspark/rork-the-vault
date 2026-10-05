import { ArrowRight, Check, KeyRound, Shield, Timer, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { AutoAdvanceBar, autoAdvanceDelay } from "@/components/play/AutoAdvanceBar";
import { CountdownRing } from "@/components/play/CountdownRing";
import { LifelineBar } from "@/components/play/LifelineBar";
import { RoundDot } from "@/components/play/RoundDot";
import { PageHeader } from "@/components/shell/PageHeader";
import { DigitTile } from "@/components/vault/DigitTile";
import { useCountdown } from "@/hooks/use-countdown";
import type { Question, Round } from "@/lib/episode";
import { roundStats } from "@/lib/gameEngine";
import { roundStyle } from "@/lib/roundIdentity";
import { formatMoney, formatMultiplier, multiplierForStreak } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function RoundIntro({ round, onStart }: { round: Round; onStart: () => void }) {
  const { episode } = useGame();
  const digitIndex = round.bonus.bonus?.codeDigitIndex ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <section
      key={round.index}
      style={roundStyle(round.index)}
      className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-10"
      aria-labelledby="round-title"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 h-80 w-[36rem] rounded-full bg-round/[0.09] blur-3xl"
      />
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] origin-left animate-round-sweep bg-gradient-to-r from-round via-round/60 to-transparent" />
      <p className="relative flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-round">
        <RoundDot roundIndex={round.index} glow className="h-2 w-2" />
        {round.tag}
      </p>
      <h2 id="round-title" className="round-glow-text relative mt-3 animate-round-title font-display text-5xl font-medium sm:text-7xl">
        {round.name}
      </h2>
      <p className="relative mt-4 max-w-2xl text-lg leading-relaxed text-vault-ice/75">{round.description}</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_auto]">
        <div>
          <p className="eyebrow-muted">Payout ladder · before multiplier</p>
          <ol className="mt-3 flex flex-wrap gap-2.5">
            {round.standard.map((q, i) => (
              <li key={q.id} className="flex flex-col items-center rounded-lg border border-vault-neon/20 bg-white/[0.02] px-4 py-2.5">
                <span className="text-[11px] text-vault-muted">Q{i + 1}</span>
                <span className="font-display text-xl text-vault-ice tabular">{formatMoney(q.payout)}</span>
                <span className="text-[11px] text-vault-neon tabular">up to {formatMultiplier(multiplierForStreak(i + 1))}</span>
              </li>
            ))}
            <li className="flex flex-col items-center rounded-lg border border-vault-neon/60 bg-vault-neon/10 px-4 py-2.5">
              <span className="text-[11px] text-vault-neon">Bonus</span>
              <span className="font-display text-xl text-vault-neonhi">Digit {digitIndex + 1}</span>
              <span className="text-[11px] text-vault-ice/60">of the code</span>
            </li>
          </ol>
        </div>
        <div className="flex flex-col justify-end gap-2 text-sm text-vault-ice/70">
          <span className="inline-flex items-center gap-2">
            <Timer className="h-4 w-4 text-vault-neon" aria-hidden="true" /> {round.defaultTimer}s per question · bonus {round.bonusTimer}s
          </span>
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-vault-neon" aria-hidden="true" /> {round.bonus.bonus?.hint ?? "Bonus unlocks a vault digit"}
          </span>
        </div>
      </div>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        <button type="button" onClick={onStart} className="neon-button h-14 text-lg" autoFocus>
          Start Round {round.number}
          <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </button>
        <span className="text-sm text-vault-muted">
          {episode.id} · streak starts fresh this round
        </span>
      </div>
    </section>
  );
}

interface QuestionStageProps {
  round: Round;
  slot: Question;
  question: Question;
}

function QuestionStage({ round, slot, question }: QuestionStageProps) {
  const { episode, state, answer, next, activateFiftyFifty, activateShield, activateSwap, canSwap, autoAdvance, toggleAutoAdvance } = useGame();
  const [holding, setHolding] = useState<boolean>(false);
  const isFeedback = state.phase === "feedback";
  const isBonus = slot.type === "bonus";
  const record = isFeedback ? state.answers[state.answers.length - 1] : null;
  const eliminated = state.eliminated[question.id] ?? [];
  const potentialMultiplier = multiplierForStreak(state.streak + 1);

  const onExpire = useCallback(() => answer(null, true), [answer]);
  const remaining = useCountdown(`${slot.id}:${question.id}`, question.timer, !isFeedback, onExpire);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isFeedback) {
        if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) next();
        return;
      }
      const key = e.key.toUpperCase();
      const index = /^[1-9]$/.test(key) ? Number(key) - 1 : LETTERS.indexOf(key);
      if (index >= 0 && index < question.choices.length && !eliminated.includes(index)) answer(index);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, eliminated, isFeedback, next, question.choices.length]);

  const isLastInRound = state.questionIndex === round.lineup.length - 1;
  const digitIndex = slot.bonus?.codeDigitIndex ?? -1;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <section
        key={`${slot.id}:${question.id}`}
        style={roundStyle(round.index)}
        className={cn(
          "neon-card round-tint animate-rise-in p-6 sm:p-9",
          isBonus && "border-vault-neon/60 shadow-[0_0_60px_-25px_rgba(207,171,92,0.55)]",
        )}
        aria-labelledby="question-prompt"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.25em] text-round">
              <RoundDot roundIndex={round.index} />
              R{round.number} · {round.name}
            </p>
            <p className="eyebrow">
              {isBonus ? `Bonus · ${slot.bonus?.hint ?? ""}` : `Question ${state.questionIndex + 1} of ${round.standard.length}`}
            </p>
            <p className="mt-2 text-sm text-vault-ice/60">
              {isBonus ? (
                "Answer right to lock in a vault digit. A miss won't break your streak."
              ) : (
                <>
                  Worth <span className="font-semibold text-vault-ice">{formatMoney(slot.payout)}</span> ×{" "}
                  <span className="font-semibold text-vault-neonhi">{formatMultiplier(potentialMultiplier)}</span> ={" "}
                  <span className="font-semibold text-vault-neonhi">{formatMoney(Math.round(slot.payout * potentialMultiplier))}</span>
                  {state.swaps[slot.id] && <span className="ml-2 text-vault-neon">· swapped</span>}
                </>
              )}
            </p>
          </div>
          {!isFeedback ? (
            <CountdownRing remaining={remaining} total={question.timer} />
          ) : (
            <span
              className={cn(
                "flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2",
                record?.correct ? "border-vault-success text-vault-success" : "border-vault-danger text-vault-danger",
              )}
              aria-hidden="true"
            >
              {record?.correct ? <Check className="h-8 w-8" /> : <X className="h-8 w-8" />}
            </span>
          )}
        </div>

        <h2 id="question-prompt" className="mt-6 font-display text-[28px] font-medium leading-snug text-vault-ice sm:text-[36px]">
          {question.prompt}
        </h2>

        <div className="mt-7 grid gap-3 sm:grid-cols-2" role="group" aria-label="Answer choices">
          {question.choices.map((choice, i) => {
            const isEliminated = eliminated.includes(i);
            const isCorrect = i === question.correctIndex;
            const isChosen = record?.choiceIndex === i;
            return (
              <button
                key={`${question.id}-${i}`}
                type="button"
                disabled={isFeedback || isEliminated}
                onClick={() => answer(i)}
                className={cn(
                  "group flex min-h-[68px] items-center gap-4 rounded-lg border px-4 py-3 text-left transition-all duration-200",
                  !isFeedback && !isEliminated && "border-white/10 bg-white/[0.02] hover:-translate-y-0.5 hover:border-vault-neon/70 hover:bg-vault-neon/[0.06] active:translate-y-0",
                  isEliminated && "border-white/5 opacity-25",
                  isFeedback && isCorrect && "border-vault-success bg-vault-success/10",
                  isFeedback && isChosen && !isCorrect && "animate-shake border-vault-danger bg-vault-danger/10",
                  isFeedback && !isCorrect && !isChosen && "border-white/5 opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold",
                    isFeedback && isCorrect
                      ? "border-vault-success bg-vault-success text-vault-ink"
                      : isFeedback && isChosen
                        ? "border-vault-danger bg-vault-danger text-vault-ink"
                        : "border-vault-neon/40 text-vault-neon group-hover:border-vault-neon",
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span className={cn("text-[17px] text-vault-ice", isEliminated && "line-through")}>{choice}</span>
              </button>
            );
          })}
        </div>

        {isFeedback && record && (
          <div
            className="mt-7 animate-rise-in rounded-lg border border-vault-neon/20 bg-black/30 p-5"
            aria-live="polite"
            onPointerEnter={(e) => e.pointerType === "mouse" && setHolding(true)}
            onPointerLeave={() => setHolding(false)}
          >
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <p className={cn("font-display text-2xl", record.correct ? "text-vault-success" : "text-vault-danger")}>
                {record.correct ? "Correct" : record.timedOut ? "Time's up" : "Not quite"}
              </p>
              {record.type === "standard" && record.correct && (
                <p className="text-lg text-vault-ice">
                  +{formatMoney(record.earned)}{" "}
                  <span className="text-sm text-vault-ice/60">
                    ({formatMoney(slot.payout)} × {formatMultiplier(record.multiplier)})
                  </span>
                </p>
              )}
              {record.shielded && (
                <p className="inline-flex items-center gap-2 text-sm text-vault-neonhi">
                  <Shield className="h-4 w-4" aria-hidden="true" /> Shield held — streak preserved at {record.streakAfter}
                </p>
              )}
              {record.type === "standard" && !record.correct && !record.shielded && (
                <p className="text-sm text-vault-ice/70">Streak broken.</p>
              )}
              {record.type === "bonus" && !record.correct && (
                <p className="text-sm text-vault-ice/70">Digit {digitIndex + 1} stays scrambled — your streak is safe.</p>
              )}
            </div>
            {record.type === "bonus" && record.correct && (
              <div className="mt-4 flex items-center gap-4">
                <DigitTile size="sm" value={slot.bonus?.digit ?? null} state="revealed" label={`Digit ${digitIndex + 1} unlocked`} />
                <p className="text-vault-ice">
                  Digit {digitIndex + 1} locked in: <span className="font-display text-2xl text-vault-neonhi">{slot.bonus?.digit}</span>
                </p>
              </div>
            )}
            {question.fact && <p className="mt-3 leading-relaxed text-vault-ice/75">{question.fact}</p>}
            {autoAdvance ? (
              <AutoAdvanceBar
                key={`${slot.id}:${question.id}`}
                durationMs={autoAdvanceDelay(question.fact)}
                holding={holding}
                label={isLastInRound ? "Finish round" : "Next now"}
                onDone={next}
                onDisable={toggleAutoAdvance}
              />
            ) : (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button type="button" onClick={next} className="neon-button h-12" autoFocus>
                  {isLastInRound ? "Finish round" : "Next question"}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={toggleAutoAdvance}
                  className="rounded-md px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-vault-muted transition-colors hover:text-vault-neon"
                >
                  Turn on auto-advance
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-5">
        <div className="neon-card p-5">
          <h3 className="font-display text-2xl font-medium text-vault-ice">Lifelines</h3>
          <p className="mb-4 mt-1 text-sm text-vault-ice/60">One use each, per run.</p>
          <LifelineBar
            used={state.lifelinesUsed}
            shieldArmed={state.shieldArmedFor === question.id}
            isBonus={isBonus}
            canSwap={canSwap}
            locked={isFeedback}
            onFifty={activateFiftyFifty}
            onShield={activateShield}
            onSwap={activateSwap}
          />
        </div>
        <div className="neon-card p-5">
          <p className="eyebrow-muted">Vault code</p>
          <div className="mt-3 flex gap-2">
            {episode.vaultCode.map((digit, i) => {
              const known = episode.freeDigitIndexes.includes(i) || state.revealed.includes(i);
              return (
                <DigitTile
                  key={i}
                  size="sm"
                  value={known ? digit : null}
                  state={known ? (episode.freeDigitIndexes.includes(i) ? "free" : "revealed") : i === digitIndex ? "awaiting" : "locked"}
                  active={!known && i === digitIndex && !isFeedback}
                  label={known ? `Digit ${i + 1}: ${digit}` : `Digit ${i + 1}: locked`}
                />
              );
            })}
          </div>
          <p className="mt-3 text-xs text-vault-muted">Keys 1–4 or A–D answer · Enter continues{autoAdvance ? " · auto-advance on" : ""}</p>
        </div>
      </aside>
    </div>
  );
}

function RoundSummary({ round }: { round: Round }) {
  const { episode, state, continueAfterRound } = useGame();
  const navigate = useNavigate();
  const stats = roundStats(state, episode, round.index);
  const isLast = round.index === episode.rounds.length - 1;
  const digitIndex = round.bonus.bonus?.codeDigitIndex ?? 0;

  const onContinue = useCallback(() => {
    continueAfterRound();
    if (isLast) navigate("/vault");
  }, [continueAfterRound, isLast, navigate]);

  return (
    <section
      style={roundStyle(round.index)}
      className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-10"
      aria-labelledby="summary-title"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-round/70 via-round/30 to-transparent" />
      <p className="flex items-center gap-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.3em] text-round">
        <RoundDot roundIndex={round.index} glow className="h-2 w-2" />
        {round.tag} · complete
      </p>
      <h2 id="summary-title" className="mt-3 font-display text-5xl font-medium text-vault-ice sm:text-6xl">
        {round.name} cleared
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-vault-neon/20 bg-white/[0.02] p-5">
          <p className="eyebrow-muted">Round payout</p>
          <p className="mt-2 font-display text-4xl text-vault-neonhi tabular">{formatMoney(stats.score)}</p>
        </div>
        <div className="rounded-lg border border-vault-neon/20 bg-white/[0.02] p-5">
          <p className="eyebrow-muted">Correct</p>
          <p className="mt-2 font-display text-4xl text-vault-ice tabular">
            {stats.correct} / {stats.total}
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-vault-neon/20 bg-white/[0.02] p-5">
          <DigitTile
            size="sm"
            value={stats.bonusCorrect ? (round.bonus.bonus?.digit ?? null) : null}
            state={stats.bonusCorrect ? "revealed" : "scrambled"}
            label={`Digit ${digitIndex + 1} ${stats.bonusCorrect ? "collected" : "missed"}`}
          />
          <div>
            <p className="eyebrow-muted">Digit {digitIndex + 1}</p>
            <p className={cn("mt-1 font-medium", stats.bonusCorrect ? "text-vault-success" : "text-vault-ice/70")}>
              {stats.bonusCorrect ? "Collected" : "Still scrambled"}
            </p>
          </div>
        </div>
      </div>
      <p className="mt-6 text-vault-ice/70">
        {isLast
          ? "All rounds done. Head to the Vault Chamber to crack the code."
          : "Your streak resets as the next round begins. Every round is a fresh run at the multiplier."}
      </p>
      <button type="button" onClick={onContinue} className="neon-button mt-6 h-14 text-lg" autoFocus>
        {isLast ? "Enter the Vault Chamber" : `On to Round ${round.number + 1}`}
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </section>
  );
}

/** Gameplay screen: round intro → questions with timer & lifelines → round summary. */
export default function Play() {
  const { episode, state, slot, question, status, startRound } = useGame();

  if (status === "vault") return <Navigate to="/vault" replace />;
  if (status === "complete") return <Navigate to="/results" replace />;

  const round = episode.rounds[state.roundIndex];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumb={`Round ${round.number}`} title={`Round ${round.number}: ${round.name}`} subtitle={`${episode.id} · ${episode.title}`} />
      {state.phase === "intro" && <RoundIntro round={round} onStart={startRound} />}
      {(state.phase === "question" || state.phase === "feedback") && slot && question && (
        <QuestionStage round={round} slot={slot} question={question} />
      )}
      {state.phase === "round-summary" && <RoundSummary round={round} />}
    </div>
  );
}
