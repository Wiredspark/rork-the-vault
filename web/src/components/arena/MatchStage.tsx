import { Eye, KeyRound, Lock, Shield, Skull, Zap } from "lucide-react";
import { useEffect, useRef } from "react";

import { PlayerAvatar } from "@/components/arena/ArenaBits";
import { CountdownRing } from "@/components/play/CountdownRing";
import { FiftyIcon, LifelineButton } from "@/components/play/LifelineBar";
import { DigitTile } from "@/components/vault/DigitTile";
import type { ArenaSnapshot, ClientMessage } from "@/lib/arena/protocol";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"];

interface MatchStageProps {
  snapshot: ArenaSnapshot;
  remaining: number;
  send: (msg: ClientMessage) => void;
}

/** Shared question stage for the main 10 and sudden death: lock-in, live lock dots, reveal. */
export function MatchStage({ snapshot, remaining, send }: MatchStageProps) {
  const q = snapshot.question;
  const isSudden = snapshot.phase === "sudden" || snapshot.phase === "sudden_reveal";
  const isReveal = snapshot.phase === "reveal" || snapshot.phase === "sudden_reveal";
  const me = snapshot.me;
  const myView = snapshot.players.find((p) => p.userId === me.userId);
  const canAnswer = me.role === "player" && !isReveal && me.answer === null && (!isSudden || Boolean(snapshot.sudden?.playerIds.includes(me.userId)));
  const contenders = isSudden
    ? snapshot.players.filter((p) => snapshot.sudden?.playerIds.includes(p.userId))
    : snapshot.players.filter((p) => !p.left && p.eliminatedAfter === null);
  const lockedCount = contenders.filter((p) => p.answered).length;
  const revealSound = useRef<string | null>(null);

  // Answer with keys 1–4 / A–D.
  useEffect(() => {
    if (!canAnswer || !q) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      const index = ["1", "2", "3", "4"].indexOf(k) >= 0 ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
      if (index >= 0 && !me.removed.includes(index)) send({ type: "answer", questionId: q.id, choice: index });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canAnswer, me.removed, q, send]);

  useEffect(() => {
    if (!isReveal || !q || !snapshot.reveal) return;
    const key = `${snapshot.phase}-${q.id}`;
    if (revealSound.current === key || me.role !== "player") return;
    revealSound.current = key;
    if (me.answer === null) return;
    playSound(me.answer === snapshot.reveal.correctIndex ? "correct" : "wrong");
  }, [isReveal, me.answer, me.role, q, snapshot.phase, snapshot.reveal]);

  if (!q) return null;

  const correctIndex = snapshot.reveal?.correctIndex ?? null;
  const pickers = (choice: number) => snapshot.players.filter((p) => snapshot.reveal?.picks[p.userId] === choice);
  const gotIt = isReveal && me.answer !== null && me.answer === correctIndex;
  const digitIndex = q.digitIndex;

  return (
    <section
      key={`${snapshot.phase === "sudden_reveal" ? "sudden" : snapshot.phase}-${q.id}`}
      className={cn(
        "neon-card animate-rise-in relative overflow-hidden p-5 sm:p-7",
        q.isDigit && "border-vault-neon/60 shadow-[0_0_40px_-18px_rgba(207,171,92,0.8)]",
        isSudden && "border-vault-danger/50 shadow-[0_0_44px_-18px_rgba(255,90,100,0.6)]",
      )}
      aria-labelledby="arena-q"
    >
      {q.isDigit && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-vault-neonhi via-vault-neon to-transparent" />}
      {isSudden && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-vault-danger via-vault-neon to-transparent" />}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={cn("flex flex-wrap items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.24em]", isSudden ? "text-vault-danger" : "text-vault-neon")}>
            {isSudden ? (
              <>
                <Skull className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.sudden?.purpose === "cut" ? "Cut-line sudden death" : "Sudden death"} · round {snapshot.sudden?.round ?? 1} of 3
              </>
            ) : (
              <>
                Question {q.number} of {snapshot.totalQuestions}
                {q.isDigit && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-vault-neon/60 bg-vault-neon/15 px-2 py-0.5 text-[10px] tracking-[0.16em] text-vault-neonhi">
                    <KeyRound className="h-3 w-3" aria-hidden="true" /> Digit {(digitIndex ?? 0) + 1}
                  </span>
                )}
              </>
            )}
          </p>
          <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-vault-muted">
            {q.episodeId} · {q.difficulty === "bonus" ? "vault digit" : q.difficulty}
          </p>
        </div>
        {!isReveal ? (
          <CountdownRing remaining={remaining} total={q.durationMs / 1000} />
        ) : (
          <span className="flex h-16 shrink-0 items-center font-mono text-[11px] uppercase tracking-[0.2em] text-vault-muted">Next in {Math.ceil(remaining)}s</span>
        )}
      </div>

      {!isSudden && (
        <div className="mt-4 flex gap-1" aria-hidden="true">
          {Array.from({ length: snapshot.totalQuestions }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                i < snapshot.questionIndex ? "bg-vault-neon/70" : i === snapshot.questionIndex ? "bg-vault-neonhi" : "bg-white/[0.08]",
                snapshot.digitPositions.includes(i) && i > snapshot.questionIndex && "bg-vault-neon/25",
                snapshot.elimination?.checkpoints.includes(i + 1) && "relative after:absolute after:-right-[3px] after:-top-1 after:h-3 after:w-[2px] after:rounded-full after:bg-vault-danger/70",
              )}
            />
          ))}
        </div>
      )}

      <h2 id="arena-q" className="mt-5 text-[22px] font-semibold leading-snug text-vault-ice sm:text-[26px]">
        {q.prompt}
      </h2>

      {isSudden && !snapshot.sudden?.playerIds.includes(me.userId) && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-vault-line bg-vault-ink/60 px-3 py-1.5 text-[12.5px] text-vault-ice/70">
          <Eye className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.sudden?.purpose === "cut" ? "Watching the fight for the last seats" : "Watching the tiebreaker"}
        </p>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2" role="group" aria-label="Answer choices">
        {q.choices.map((choice, i) => {
          const removed = me.removed.includes(i);
          const chosen = me.answer === i;
          const isCorrect = isReveal && i === correctIndex;
          const isWrongPick = isReveal && chosen && i !== correctIndex;
          return (
            <button
              key={`${q.id}-${i}`}
              type="button"
              disabled={!canAnswer || removed}
              onClick={() => send({ type: "answer", questionId: q.id, choice: i })}
              className={cn(
                "group relative flex min-h-[68px] items-center gap-4 rounded-lg border px-4 py-3 text-left transition-all duration-200",
                canAnswer && !removed && "border-white/10 bg-white/[0.02] hover:-translate-y-0.5 hover:border-vault-neon/70 hover:bg-vault-neon/[0.06] active:translate-y-0 active:scale-[0.99]",
                !canAnswer && !isReveal && !chosen && "border-white/[0.06] opacity-60",
                !isReveal && chosen && "border-vault-neon bg-vault-neon/[0.12] shadow-[inset_0_0_0_1px_rgba(207,171,92,0.6)]",
                removed && "border-white/5 opacity-25",
                isCorrect && "border-vault-success bg-vault-success/10",
                isWrongPick && "animate-shake border-vault-danger bg-vault-danger/10",
                isReveal && !isCorrect && !isWrongPick && "border-white/5 opacity-50",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold",
                  isCorrect ? "border-vault-success bg-vault-success text-vault-ink" : isWrongPick ? "border-vault-danger bg-vault-danger text-vault-ink" : chosen ? "border-vault-neon bg-vault-neon text-vault-ink" : "border-vault-neon/40 text-vault-neon",
                )}
              >
                {LETTERS[i]}
              </span>
              <span className={cn("flex-1 text-[16.5px] text-vault-ice", removed && "line-through")}>{choice}</span>
              {!isReveal && chosen && <Lock className="h-4 w-4 shrink-0 text-vault-neon" aria-label="Locked in" />}
              {isReveal && pickers(i).length > 0 && (
                <span className="flex shrink-0 -space-x-2">
                  {pickers(i)
                    .slice(0, 4)
                    .map((p) => (
                      <PlayerAvatar key={p.userId} name={p.name} size="sm" highlight={p.userId === me.userId} className="animate-pop-in" />
                    ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!isReveal && (
        <div className="mt-5 flex flex-wrap items-center gap-3" aria-live="polite">
          <span className="flex -space-x-1.5">
            {contenders.map((p) => (
              <span
                key={p.userId}
                title={p.name}
                className={cn(
                  "h-3 w-3 rounded-full border border-vault-ink transition-all duration-300",
                  p.answered ? "scale-110 bg-vault-neon shadow-[0_0_8px_rgba(207,171,92,0.8)]" : p.connected ? "bg-white/15" : "bg-vault-danger/40",
                )}
              />
            ))}
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-vault-muted tabular">
            {lockedCount}/{contenders.length} locked in
          </span>
          {me.answer !== null && <span className="text-[13px] text-vault-neon">Locked. Answers reveal when time's up or everyone's in.</span>}
          {me.role === "spectator" && (
            <span className="text-[13px] text-vault-ice/60">{myView?.eliminatedAfter ? `Sealed out after Q${myView.eliminatedAfter}. Watching the rest.` : "You're spectating this match."}</span>
          )}
        </div>
      )}

      {isReveal && snapshot.reveal && (
        <div className="mt-6 animate-rise-in rounded-lg border border-vault-neon/20 bg-black/30 p-4 sm:p-5" aria-live="polite">
          {me.role === "player" && (!isSudden || snapshot.sudden?.playerIds.includes(me.userId)) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <p className={cn("font-display text-[22px]", gotIt ? "text-vault-success" : "text-vault-danger")}>
                {gotIt ? "Correct" : me.answer === null ? "Time's up" : "Not quite"}
              </p>
              {!isSudden && gotIt && myView && (
                <p className="text-[16px] text-vault-ice">
                  +{myView.lastPoints.toLocaleString("en-US")} VC
                  {myView.lastSpeedBonus > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[13px] text-vault-neonhi">
                      <Zap className="h-3.5 w-3.5" aria-hidden="true" />+{myView.lastSpeedBonus} speed
                    </span>
                  )}
                </p>
              )}
              {!isSudden && !gotIt && !q.isDigit && me.shield === "used" && myView?.streak !== 0 && (
                <p className="inline-flex items-center gap-1.5 text-[13px] text-vault-neonhi">
                  <Shield className="h-3.5 w-3.5" aria-hidden="true" /> Shield held your streak
                </p>
              )}
              {q.isDigit && !gotIt && <p className="text-[13px] text-vault-ice/65">Digit {(digitIndex ?? 0) + 1} stays locked. Your streak is safe.</p>}
            </div>
          )}
          {q.isDigit && gotIt && digitIndex !== null && (
            <div className="mt-3 flex items-center gap-3">
              <DigitTile size="sm" value={me.digits[digitIndex]} state="revealed" label={`Digit ${digitIndex + 1} unlocked`} />
              <p className="text-[15px] text-vault-ice">
                Digit {digitIndex + 1} is yours: <span className="font-display text-[22px] text-vault-neonhi">{me.digits[digitIndex]}</span>
                <span className="ml-2 text-[12.5px] text-vault-muted">(only you can see it)</span>
              </p>
            </div>
          )}
          {snapshot.reveal.fact && <p className="mt-3 text-[14.5px] leading-relaxed text-vault-ice/75">{snapshot.reveal.fact}</p>}
        </div>
      )}
    </section>
  );
}

/** Side panel with the two Arena lifelines and the player's vault digits. */
export function MatchSidebar({ snapshot, send }: { snapshot: ArenaSnapshot; send: (msg: ClientMessage) => void }) {
  const me = snapshot.me;
  const isPlayer = me.role === "player";
  const inQuestion = snapshot.phase === "question";
  const answered = me.answer !== null;
  const nextDigit = snapshot.question?.isDigit ? snapshot.question.digitIndex : null;
  const isFinal = snapshot.kind === "final";
  const hasVault = snapshot.kind !== "qualifier";
  return (
    <div className="flex flex-col gap-4">
      {!isFinal && (
      <div className="neon-card p-4">
        <p className="eyebrow-muted pb-3">Lifelines · once each</p>
        <div className="grid grid-cols-2 gap-3">
          <LifelineButton
            icon={<FiftyIcon />}
            name="50/50"
            hint="Remove two wrong answers"
            used={me.fiftyUsed}
            disabled={!isPlayer || !inQuestion || answered}
            onClick={() => send({ type: "fifty" })}
          />
          <LifelineButton
            icon={<Shield />}
            name="Shield"
            hint={me.shield === "armed" ? "Armed until it saves you" : "Protect your streak once"}
            used={me.shield === "used"}
            armed={me.shield === "armed"}
            disabled={!isPlayer || me.shield !== "ready" || (inQuestion && answered) || snapshot.phase === "sudden"}
            onClick={() => send({ type: "shield" })}
          />
        </div>
      </div>
      )}
      {hasVault && (
      <div className="neon-card p-4">
        <p className="eyebrow-muted">Your vault digits</p>
        <div className="mt-3 flex gap-2">
          {me.digits.map((d, i) => (
            <DigitTile
              key={i}
              size="sm"
              value={d}
              state={d !== null ? (snapshot.vault?.freeIndexes.includes(i) ? "free" : "revealed") : i === nextDigit ? "awaiting" : "locked"}
              active={d === null && i === nextDigit && inQuestion}
              label={d !== null ? `Digit ${i + 1}: ${d}` : `Digit ${i + 1}: locked`}
            />
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-vault-muted">
          {snapshot.vault ? `Vault from ${snapshot.vault.episodeId} · ${snapshot.vault.title}. ` : ""}
          {isFinal
            ? "One digit is free; three gold questions unlock the rest. Survivors use them in the vault race."
            : "Two digits are free; gold questions unlock the rest. Only the winner opens the vault."}
        </p>
      </div>
      )}
    </div>
  );
}
