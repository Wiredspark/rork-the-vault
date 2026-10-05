import { Download, FileJson, Plus, Timer, Upload } from "lucide-react";
import { memo, useState } from "react";

import { Field, INPUT, TEXTAREA } from "@/components/admin/fields";
import { QuestionCard, type CardAction } from "@/components/admin/QuestionCard";
import { RoundImportDialog } from "@/components/admin/RoundImportDialog";
import { downloadText, keyOf, roundToCsv, roundToJson, type ImportMode, type QuestionKind } from "@/lib/admin/episodeDraft";
import type { RawQuestion, RawRound } from "@/lib/episode";
import { roundStyle } from "@/lib/roundIdentity";
import { cn } from "@/lib/utils";

interface RoundEditorProps {
  episodeId: string;
  round: RawRound;
  roundIndex: number;
  vaultCode: string[];
  /** Error counts keyed by issue location, e.g. "R1 · Q2". */
  errorCounts: Record<string, number>;
  onUpdate: (roundIndex: number, key: string, next: RawQuestion) => void;
  onAction: (roundIndex: number, key: string, action: CardAction) => void;
  onRoundChange: (roundIndex: number, fn: (round: RawRound) => RawRound) => void;
  onImport: (roundIndex: number, questions: RawQuestion[], mode: ImportMode) => void;
  onAdd: (roundIndex: number, kind: QuestionKind) => void;
}

const TOOL_BTN =
  "inline-flex h-10 items-center gap-2 rounded-md border border-vault-line px-3 text-[13px] text-vault-ice/80 transition-colors hover:border-vault-neon/40 hover:text-vault-ice focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60" as const;

/** Everything for one round: details, bulk import/export, question cards, bonus and Swap reserves. */
export const RoundEditor = memo(function RoundEditor({
  episodeId,
  round,
  roundIndex,
  vaultCode,
  errorCounts,
  onUpdate,
  onAction,
  onRoundChange,
  onImport,
  onAdd,
}: RoundEditorProps) {
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const n = roundIndex + 1;
  const standard = round.questions.filter((q) => q.type !== "bonus");
  const bonus = round.questions.find((q) => q.type === "bonus");
  const reserve = round.reserve ?? [];
  const digitIndex = bonus?.bonus?.codeDigitIndex ?? roundIndex;
  const fileBase = `${episodeId || "episode"}-R${n}`;

  const setTimer = (field: "defaultTimer" | "bonusTimer", value: number) =>
    onRoundChange(roundIndex, (r) => {
      const isBonusField = field === "bonusTimer";
      const apply = (q: RawQuestion) => ((q.type === "bonus") === isBonusField ? { ...q, timer: value } : q);
      return { ...r, [field]: value, questions: r.questions.map(apply), reserve: isBonusField ? r.reserve : (r.reserve ?? []).map((q) => ({ ...q, timer: value })) };
    });

  return (
    <div style={roundStyle(roundIndex)} className="flex flex-col gap-4">
      <section className="neon-card round-tint p-5" aria-label={`Round ${n} details`}>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Round name" htmlFor={`r${n}-name`}>
            <input
              id={`r${n}-name`}
              className={cn(INPUT, "font-display uppercase tracking-wide")}
              value={round.name ?? ""}
              onChange={(e) => onRoundChange(roundIndex, (r) => ({ ...r, name: e.target.value.toUpperCase() }))}
            />
          </Field>
          <Field label="Question timer" htmlFor={`r${n}-timer`}>
            <div className="relative">
              <Timer className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vault-muted" aria-hidden="true" />
              <input
                id={`r${n}-timer`}
                type="number"
                min={5}
                max={90}
                className={cn(INPUT, "w-[110px] pl-9 font-mono tabular")}
                value={round.defaultTimer ?? 15}
                onChange={(e) => setTimer("defaultTimer", Math.max(5, Number(e.target.value) || 15))}
              />
            </div>
          </Field>
          <Field label="Bonus timer" htmlFor={`r${n}-btimer`}>
            <input
              id={`r${n}-btimer`}
              type="number"
              min={5}
              max={90}
              className={cn(INPUT, "w-[110px] font-mono tabular")}
              value={round.bonusTimer ?? 20}
              onChange={(e) => setTimer("bonusTimer", Math.max(5, Number(e.target.value) || 20))}
            />
          </Field>
        </div>
        <Field label="Description" htmlFor={`r${n}-desc`} className="mt-4">
          <textarea
            id={`r${n}-desc`}
            rows={2}
            className={TEXTAREA}
            value={round.description ?? ""}
            onChange={(e) => onRoundChange(roundIndex, (r) => ({ ...r, description: e.target.value }))}
          />
        </Field>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-vault-line pt-4">
          <span className="hud-label mr-1 text-[10px]">Bulk</span>
          <button type="button" className={TOOL_BTN} onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 text-vault-neon" aria-hidden="true" />
            Import round
          </button>
          <button type="button" className={TOOL_BTN} onClick={() => downloadText(`${fileBase}.csv`, roundToCsv(round), "text/csv")}>
            <Download className="h-4 w-4 text-vault-neon" aria-hidden="true" />
            Export CSV
          </button>
          <button type="button" className={TOOL_BTN} onClick={() => downloadText(`${fileBase}.json`, roundToJson(round), "application/json")}>
            <FileJson className="h-4 w-4 text-vault-neon" aria-hidden="true" />
            Export JSON
          </button>
          <span className="ml-auto font-mono text-[11px] text-vault-muted tabular">
            {standard.length} questions · 1 bonus · {reserve.length} reserve
          </span>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {standard.map((q, i) => (
          <QuestionCard
            key={keyOf(q)}
            roundIndex={roundIndex}
            qKey={keyOf(q)}
            question={q}
            label={`Q${i + 1}`}
            kind="standard"
            digit={null}
            digitIndex={digitIndex}
            errorCount={errorCounts[`R${n} · Q${i + 1}`] ?? 0}
            isFirst={i === 0}
            isLast={i === standard.length - 1}
            onUpdate={onUpdate}
            onAction={onAction}
          />
        ))}
        <button
          type="button"
          onClick={() => onAdd(roundIndex, "standard")}
          className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-vault-neon/30 text-[14px] text-vault-neon transition-colors hover:border-vault-neon/60 hover:bg-vault-neon/[0.05]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add question
        </button>

        {bonus && (
          <QuestionCard
            key={keyOf(bonus)}
            roundIndex={roundIndex}
            qKey={keyOf(bonus)}
            question={bonus}
            label="Bonus"
            kind="bonus"
            digit={vaultCode[digitIndex] ?? null}
            digitIndex={digitIndex}
            errorCount={errorCounts[`R${n} · Bonus`] ?? 0}
            isFirst
            isLast
            onUpdate={onUpdate}
            onAction={onAction}
          />
        )}
      </div>

      <section aria-label={`Round ${n} Swap reserves`} className="mt-2">
        <div className="mb-2 flex items-baseline gap-3 px-1">
          <h3 className="eyebrow-muted">Swap reserves</h3>
          <span className="text-[12px] text-vault-muted">Used when a player spends the Swap lifeline. Match the round's difficulty.</span>
        </div>
        <div className="flex flex-col gap-3">
          {reserve.map((q, i) => (
            <QuestionCard
              key={keyOf(q)}
              roundIndex={roundIndex}
              qKey={keyOf(q)}
              question={q}
              label={`Res ${i + 1}`}
              kind="reserve"
              digit={null}
              digitIndex={digitIndex}
              errorCount={errorCounts[`R${n} · Reserve ${i + 1}`] ?? 0}
              isFirst={i === 0}
              isLast={i === reserve.length - 1}
              onUpdate={onUpdate}
              onAction={onAction}
            />
          ))}
          <button
            type="button"
            onClick={() => onAdd(roundIndex, "reserve")}
            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-vault-line text-[13.5px] text-vault-ice/70 transition-colors hover:border-vault-neon/40 hover:text-vault-neon"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add reserve question
          </button>
        </div>
      </section>

      <RoundImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        roundIndex={roundIndex}
        roundLabel={`Round ${n}`}
        onImport={(qs, mode) => onImport(roundIndex, qs, mode)}
      />
    </div>
  );
});
