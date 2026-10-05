import { FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { TEXTAREA } from "@/components/admin/fields";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { csvTemplate, downloadText, parseRoundImport, type ImportMode } from "@/lib/admin/episodeDraft";
import type { RawQuestion } from "@/lib/episode";
import { cn } from "@/lib/utils";

interface RoundImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundIndex: number;
  roundLabel: string;
  onImport: (questions: RawQuestion[], mode: ImportMode) => void;
}

const MODES: { id: ImportMode; title: string; body: string }[] = [
  { id: "merge", title: "Replace", body: "Imported standard, bonus and reserve questions replace those types. Types not in the file are kept." },
  { id: "append", title: "Append", body: "Adds imported questions after the existing ones. An imported bonus replaces the current bonus." },
];

/** Bulk import for a single round: paste or upload CSV / JSON, preview counts, then replace or append. */
export function RoundImportDialog({ open, onOpenChange, roundIndex, roundLabel, onImport }: RoundImportDialogProps) {
  const [text, setText] = useState<string>("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (text.trim() ? parseRoundImport(text, roundIndex) : null), [roundIndex, text]);
  const counts = useMemo(() => {
    const qs = parsed?.questions ?? [];
    return {
      standard: qs.filter((q) => q.type === "standard").length,
      bonus: qs.filter((q) => q.type === "bonus").length,
      reserve: qs.filter((q) => q.type === "reserve").length,
    };
  }, [parsed]);
  const ready = Boolean(parsed && !parsed.error && parsed.questions.length);

  const close = (next: boolean) => {
    if (!next) {
      setText("");
      setFileName(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] max-w-xl flex-col gap-0 overflow-hidden border-vault-neon/20 bg-[linear-gradient(180deg,#141D19,#0F1613)] p-0 text-vault-ice">
        <DialogHeader className="gap-1.5 border-b border-vault-neon/15 px-5 pb-4 pt-5 text-left">
          <DialogTitle className="flex items-center gap-2.5 font-display text-lg font-medium text-vault-ice">
            <Upload className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            Import into {roundLabel}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-vault-muted">
            Paste CSV or JSON, or upload a .csv / .json file. Round JSON exports from this editor import as-is.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="ghost-neon-button h-10 text-[13px]">
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload file
            </button>
            <button
              type="button"
              onClick={() => downloadText("vault-round-template.csv", csvTemplate(), "text/csv")}
              className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-[13px] text-vault-ice/70 transition-colors hover:text-vault-neon"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              CSV template
            </button>
            {fileName && <span className="truncate font-mono text-[11px] text-vault-muted">{fileName}</span>}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              tabIndex={-1}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setText(await file.text());
                setFileName(file.name);
              }}
            />
          </div>

          <label htmlFor="round-import-text" className="sr-only">
            Questions to import
          </label>
          <textarea
            id="round-import-text"
            rows={9}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
            }}
            placeholder={"type,question,choice_a,choice_b,choice_c,choice_d,correct,payout,fact,bonus_hint\nstandard,Which group sang 'Weak'?,Jade,SWV,En Vogue,Xscape,B,150,SWV stood for Sisters With Voices.,"}
            className={cn(TEXTAREA, "mt-3 font-mono text-[12px]")}
          />

          <div className="mt-2 min-h-[22px] text-[12.5px]" aria-live="polite">
            {parsed?.error ? (
              <span className="text-vault-danger">{parsed.error}</span>
            ) : ready ? (
              <span className="text-vault-success">
                Found {counts.standard} standard · {counts.bonus} bonus · {counts.reserve} reserve
              </span>
            ) : null}
          </div>

          <div role="radiogroup" aria-label="Import mode" className="mt-3 grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  mode === m.id ? "border-vault-neon/60 bg-vault-neon/10" : "border-vault-line hover:border-vault-neon/30",
                )}
              >
                <span className={cn("text-[14px] font-medium", mode === m.id ? "text-vault-neonhi" : "text-vault-ice")}>{m.title}</span>
                <span className="mt-1 block text-[12px] leading-snug text-vault-muted">{m.body}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-vault-neon/15 px-5 py-4">
          <button type="button" onClick={() => close(false)} className="h-11 rounded-md px-4 text-[14px] text-vault-ice/70 hover:text-vault-ice">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (!parsed) return;
              onImport(parsed.questions, mode);
              close(false);
            }}
            className="neon-button h-11"
          >
            Import {parsed?.questions.length ? parsed.questions.length : ""} questions
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
