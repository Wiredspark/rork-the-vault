import { ArrowDown, ArrowUp, Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { memo } from "react";

import { INPUT, TEXTAREA } from "@/components/admin/fields";
import { LETTERS, questionFact, withFact, type QuestionKind } from "@/lib/admin/episodeDraft";
import type { RawQuestion } from "@/lib/episode";
import { cn } from "@/lib/utils";

export type CardAction = "up" | "down" | "duplicate" | "remove";

interface QuestionCardProps {
  roundIndex: number;
  qKey: string;
  question: RawQuestion;
  label: string;
  kind: QuestionKind;
  /** Vault digit this bonus unlocks (bonus cards only). */
  digit: string | null;
  digitIndex: number;
  errorCount: number;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (roundIndex: number, key: string, next: RawQuestion) => void;
  onAction: (roundIndex: number, key: string, action: CardAction) => void;
}

const ICON_BTN =
  "flex h-9 w-9 items-center justify-center rounded-md text-vault-muted transition-colors hover:bg-white/[0.05] hover:text-vault-ice disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60" as const;

/** One editable question: prompt, four choices with a correct-answer radio, payout or bonus hint, and fun fact. */
export const QuestionCard = memo(function QuestionCard({
  roundIndex,
  qKey,
  question,
  label,
  kind,
  digit,
  digitIndex,
  errorCount,
  isFirst,
  isLast,
  onUpdate,
  onAction,
}: QuestionCardProps) {
  const set = (patch: Partial<RawQuestion>) => onUpdate(roundIndex, qKey, { ...question, ...patch });
  const choices = [0, 1, 2, 3].map((i) => question.choices?.[i] ?? "");
  const setChoice = (i: number, value: string) => set({ choices: choices.map((c, j) => (j === i ? value : c)) });
  const id = `q-${qKey}`;
  const isBonus = kind === "bonus";
  const movable = !isBonus;

  return (
    <article
      aria-label={`${label}${question.question ? `: ${question.question}` : ""}`}
      className={cn(
        "rounded-xl border bg-vault-panel/80 p-4 transition-colors sm:p-5",
        isBonus ? "border-vault-neon/50 shadow-[0_0_40px_-24px_rgba(207,171,92,0.6)]" : "border-vault-line",
        errorCount > 0 && "border-vault-danger/35",
      )}
    >
      <header className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "inline-flex h-7 min-w-[2.25rem] items-center justify-center rounded-md px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]",
            isBonus ? "bg-vault-neon text-vault-ink" : kind === "reserve" ? "border border-vault-line text-vault-ice/70" : "bg-round/15 text-round",
          )}
        >
          {label}
        </span>

        {kind === "standard" && (
          <label className="flex items-center gap-2">
            <span className="sr-only">Payout</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={50}
              value={question.payout ?? ""}
              onChange={(e) => set({ payout: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })}
              className={cn(INPUT, "h-9 w-[104px] pr-1 font-mono text-[13px] tabular")}
              aria-label={`${label} payout in VC`}
            />
            <span className="font-mono text-[11px] text-vault-muted">VC</span>
          </label>
        )}
        {isBonus && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-vault-neonhi">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            Unlocks digit {digitIndex + 1}: <span className="vault-display text-[13px]">{digit || "?"}</span>
          </span>
        )}
        {kind === "reserve" && <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vault-muted">Swap reserve</span>}
        {errorCount > 0 && (
          <span className="rounded-full bg-vault-danger/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-vault-danger">
            {errorCount} to fix
          </span>
        )}

        {movable && (
          <div className="ml-auto flex items-center">
            <button type="button" className={ICON_BTN} disabled={isFirst} onClick={() => onAction(roundIndex, qKey, "up")} aria-label={`Move ${label} up`}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className={ICON_BTN} disabled={isLast} onClick={() => onAction(roundIndex, qKey, "down")} aria-label={`Move ${label} down`}>
              <ArrowDown className="h-4 w-4" />
            </button>
            <button type="button" className={ICON_BTN} onClick={() => onAction(roundIndex, qKey, "duplicate")} aria-label={`Duplicate ${label}`}>
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(ICON_BTN, "hover:text-vault-danger")}
              onClick={() => onAction(roundIndex, qKey, "remove")}
              aria-label={`Delete ${label}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </header>

      <label htmlFor={`${id}-prompt`} className="sr-only">
        {label} question
      </label>
      <textarea
        id={`${id}-prompt`}
        rows={2}
        value={question.question ?? ""}
        onChange={(e) => set({ question: e.target.value })}
        placeholder="Type the question…"
        className={cn(TEXTAREA, "mt-3 font-display text-[16px] font-medium")}
      />

      <fieldset className="mt-3">
        <legend className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-vault-muted">
          Choices <span className="normal-case tracking-normal text-vault-muted/80">· select the correct answer</span>
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {choices.map((choice, i) => {
            const correct = question.correctIndex === i;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-2 rounded-lg border py-1 pl-1 pr-1.5 transition-colors",
                  correct ? "border-vault-success/60 bg-vault-success/[0.06]" : "border-vault-line bg-vault-ink/40",
                )}
              >
                <label className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="radio"
                    name={`${id}-correct`}
                    checked={correct}
                    onChange={() => set({ correctIndex: i })}
                    className="peer sr-only"
                    aria-label={`Mark choice ${LETTERS[i]} correct`}
                  />
                  <span
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full border text-[12px] font-semibold transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-vault-neon/60",
                      correct ? "border-vault-success bg-vault-success text-vault-ink" : "border-vault-neon/40 text-vault-neon hover:border-vault-neon",
                    )}
                    aria-hidden="true"
                  >
                    {correct ? <Check className="h-4 w-4" strokeWidth={3} /> : LETTERS[i]}
                  </span>
                </label>
                <input
                  type="text"
                  value={choice}
                  onChange={(e) => setChoice(i, e.target.value)}
                  placeholder={`Choice ${LETTERS[i]}`}
                  aria-label={`${label} choice ${LETTERS[i]}${correct ? " (correct)" : ""}`}
                  className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] text-vault-ice placeholder:text-vault-muted/50 focus:outline-none"
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      {isBonus && (
        <div className="mt-3">
          <label htmlFor={`${id}-hint`} className="hud-label text-[10px] text-vault-ice/60">
            Bonus hint
          </label>
          <input
            id={`${id}-hint`}
            type="text"
            value={question.bonus?.bonusHint ?? ""}
            onChange={(e) =>
              set({
                bonus: { codeDigitIndex: digitIndex, codeDigit: digit ?? "0", ...(question.bonus ?? {}), bonusHint: e.target.value },
              })
            }
            placeholder={`Digit ${digitIndex + 1} — what the answer reveals`}
            className={cn(INPUT, "mt-1.5")}
          />
        </div>
      )}

      <div className="mt-3">
        <label htmlFor={`${id}-fact`} className="hud-label text-[10px] text-vault-ice/60">
          Fun fact
        </label>
        <textarea
          id={`${id}-fact`}
          rows={2}
          value={questionFact(question)}
          onChange={(e) => onUpdate(roundIndex, qKey, withFact(question, e.target.value))}
          placeholder="Shown after the answer is revealed."
          className={cn(TEXTAREA, "mt-1.5 text-[14px]")}
        />
      </div>
    </article>
  );
});
