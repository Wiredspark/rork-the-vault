import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Download,
  FileUp,
  KeyRound,
  Loader2,
  Pencil,
  Radio,
  Send,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { Field, INPUT, Panel, StatusPill, TEXTAREA } from "@/components/admin/fields";
import type { CardAction } from "@/components/admin/QuestionCard";
import { RoundEditor } from "@/components/admin/RoundEditor";
import { RoundDot } from "@/components/play/RoundDot";
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
import {
  adminErrorMessage,
  deleteEpisode,
  fetchAdminEpisode,
  fetchAdminEpisodes,
  formatDateTime,
  notifyQuietly,
  saveEpisode,
  type AdminEpisodeRow,
  type DbEpisodeStatus,
} from "@/lib/admin/api";
import {
  applyRoundImport,
  blankQuestion,
  collectIssues,
  createEpisodeTemplate,
  downloadText,
  EPISODE_ID_RE,
  finalizeEpisode,
  getVaultCode,
  getVaultStory,
  keyOf,
  liveState,
  newKey,
  nextEpisodeId,
  parseEpisodeFile,
  setVaultCode,
  setVaultStory,
  withEditorKeys,
  type EditorIssue,
  type ImportMode,
  type QuestionKind,
} from "@/lib/admin/episodeDraft";
import { getBundledRawEpisodes, type RawEpisode, type RawQuestion, type RawRound } from "@/lib/episode";
import { roundStyle } from "@/lib/roundIdentity";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { EDITOR_SEED_KEY } from "@/pages/admin/AdminEpisodes";

type PublishMode = "draft" | "publish" | "schedule";

const MODES: { id: PublishMode; label: string; body: string; icon: LucideIcon }[] = [
  { id: "draft", label: "Draft", body: "Hidden from players.", icon: Pencil },
  { id: "publish", label: "Publish now", body: "Live on players' next visit.", icon: Radio },
  { id: "schedule", label: "Schedule", body: "Goes live at a set time.", icon: CalendarClock },
];

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultSchedule(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

function readSeed(): RawEpisode | null {
  try {
    const text = window.sessionStorage.getItem(EDITOR_SEED_KEY);
    window.sessionStorage.removeItem(EDITOR_SEED_KEY);
    if (!text) return null;
    return parseEpisodeFile(text).episode;
  } catch {
    return null;
  }
}

function IssueList({ issues, onJump }: { issues: EditorIssue[]; onJump: (roundIndex: number) => void }) {
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  if (!issues.length) {
    return (
      <p className="flex items-center gap-2 text-[13.5px] text-vault-success">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Ready to publish — no issues found.
      </p>
    );
  }
  const shown = [...errors, ...warnings].slice(0, 14);
  return (
    <div>
      <p className="mb-2.5 flex flex-wrap gap-x-3 text-[13px]">
        {errors.length > 0 && <span className="text-vault-danger">{errors.length} to fix before publishing</span>}
        {warnings.length > 0 && <span className="text-vault-neon">{warnings.length} suggestions</span>}
      </p>
      <ul className="flex flex-col gap-1">
        {shown.map((issue, i) => (
          <li key={`${issue.where}-${issue.message}-${i}`}>
            <button
              type="button"
              disabled={issue.roundIndex === undefined}
              onClick={() => issue.roundIndex !== undefined && onJump(issue.roundIndex)}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition-colors enabled:hover:bg-white/[0.04]"
            >
              {issue.level === "error" ? (
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vault-danger" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-vault-neon/80" aria-hidden="true" />
              )}
              <span>
                <span className="font-mono text-[11px] text-vault-ice/60">{issue.where}</span>{" "}
                <span className="text-vault-ice/85">{issue.message}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {issues.length > shown.length && <p className="mt-1.5 px-2 text-[11.5px] text-vault-muted">+{issues.length - shown.length} more</p>}
    </div>
  );
}

/** Episode editor: details, vault, per-round question cards with bulk import/export, and publishing controls. */
export default function AdminEpisodeEditor() {
  const { id = "new" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNewRoute = id === "new";
  const fileRef = useRef<HTMLInputElement>(null);

  const listQuery = useQuery({ queryKey: ["admin-episodes"], queryFn: fetchAdminEpisodes, staleTime: 15_000 });
  const episodeQuery = useQuery({
    queryKey: ["admin-episode", id],
    queryFn: () => fetchAdminEpisode(id),
    enabled: !isNewRoute,
    staleTime: 0,
  });

  const [draft, setDraft] = useState<RawEpisode | null>(null);
  const [row, setRow] = useState<AdminEpisodeRow | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);
  const [activeRound, setActiveRound] = useState<number>(0);
  const [mode, setMode] = useState<PublishMode>("draft");
  const [scheduleAt, setScheduleAt] = useState<string>(defaultSchedule);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const initFor = useRef<string | null>(null);

  const dbIds = useMemo(() => (listQuery.data ?? []).map((r) => r.id), [listQuery.data]);

  useEffect(() => {
    if (initFor.current === id) return;
    if (isNewRoute) {
      if (listQuery.isPending) return;
      const seed = searchParams.get("seed") ? readSeed() : null;
      const allIds = [...dbIds, ...getBundledRawEpisodes().map((e) => e.episodeId)];
      const base = seed ?? createEpisodeTemplate(nextEpisodeId(allIds));
      initFor.current = id;
      setDraft(withEditorKeys(base));
      setRow(null);
      setDirty(Boolean(seed));
      setMode("draft");
      setActiveRound(0);
      return;
    }
    if (episodeQuery.data === undefined) return;
    initFor.current = id;
    const data = episodeQuery.data;
    if (!data) return;
    setDraft(withEditorKeys(data.content));
    setRow(data);
    setDirty(false);
    const state = liveState(data.status, data.publishAt);
    setMode(state === "draft" ? "draft" : state === "scheduled" ? "schedule" : "publish");
    if (state === "scheduled" && data.publishAt) setScheduleAt(toLocalInput(new Date(data.publishAt)));
  }, [dbIds, episodeQuery.data, id, isNewRoute, listQuery.isPending, searchParams]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = useCallback((fn: (prev: RawEpisode) => RawEpisode) => {
    setDraft((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  }, []);

  const changeRound = useCallback(
    (roundIndex: number, fn: (round: RawRound) => RawRound) =>
      edit((prev) => ({ ...prev, rounds: prev.rounds.map((r, i) => (i === roundIndex ? fn(r) : r)) })),
    [edit],
  );

  const updateQuestion = useCallback(
    (roundIndex: number, key: string, next: RawQuestion) =>
      changeRound(roundIndex, (r) => ({
        ...r,
        questions: r.questions.map((q) => (keyOf(q) === key ? next : q)),
        reserve: (r.reserve ?? []).map((q) => (keyOf(q) === key ? next : q)),
      })),
    [changeRound],
  );

  const cardAction = useCallback(
    (roundIndex: number, key: string, action: CardAction) =>
      changeRound(roundIndex, (r) => {
        const inReserve = (r.reserve ?? []).some((q) => keyOf(q) === key);
        const list = inReserve ? [...(r.reserve ?? [])] : r.questions.filter((q) => q.type !== "bonus");
        const bonus = r.questions.find((q) => q.type === "bonus");
        const i = list.findIndex((q) => keyOf(q) === key);
        if (i < 0) return r;
        if (action === "up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        if (action === "down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        if (action === "duplicate") list.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(list[i])), id: "", _key: newKey() });
        if (action === "remove") list.splice(i, 1);
        return inReserve ? { ...r, reserve: list } : { ...r, questions: bonus ? [...list, bonus] : list };
      }),
    [changeRound],
  );

  const addQuestion = useCallback(
    (roundIndex: number, kind: QuestionKind) =>
      changeRound(roundIndex, (r) => {
        if (kind === "reserve") return { ...r, reserve: [...(r.reserve ?? []), blankQuestion("reserve", roundIndex)] };
        const std = r.questions.filter((q) => q.type !== "bonus");
        const bonus = r.questions.find((q) => q.type === "bonus");
        const last = std[std.length - 1]?.payout ?? null;
        const q = blankQuestion("standard", roundIndex, last);
        return { ...r, questions: bonus ? [...std, q, bonus] : [...std, q] };
      }),
    [changeRound],
  );

  const importRound = useCallback(
    (roundIndex: number, questions: RawQuestion[], importMode: ImportMode) => {
      changeRound(roundIndex, (r) => applyRoundImport(r, questions, importMode));
      toast.success(`Imported ${questions.length} questions into Round ${roundIndex + 1}`);
    },
    [changeRound],
  );

  const deferredDraft = useDeferredValue(draft);
  const issues = useMemo(() => (deferredDraft ? collectIssues(deferredDraft) : []), [deferredDraft]);
  const errors = issues.filter((i) => i.level === "error");
  const errorCounts = useMemo(() => {
    const out: Record<string, number> = {};
    issues.forEach((i) => {
      if (i.level === "error") out[i.where] = (out[i.where] ?? 0) + 1;
    });
    return out;
  }, [issues]);
  const roundErrorCounts = useMemo(
    () => [0, 1, 2].map((ri) => errors.filter((e) => e.roundIndex === ri).length),
    [errors],
  );

  const saveMutation = useMutation({
    mutationFn: saveEpisode,
    onSuccess: (saved, vars) => {
      const releaseChanged =
        saved.status !== "draft" && (!row || row.status === "draft" || row.publishAt !== saved.publishAt);
      if (releaseChanged) notifyQuietly({ action: "episode_released", episodeId: saved.id });
      setRow(saved);
      setDirty(false);
      setDraft((prev) => (prev ? finalizeEpisode(prev, { keepKeys: true }) : prev));
      queryClient.invalidateQueries({ queryKey: ["admin-episodes"] });
      queryClient.invalidateQueries({ queryKey: ["released-episodes"] });
      queryClient.setQueryData(["admin-episode", saved.id], { ...saved, content: vars.content });
      const state = liveState(saved.status, saved.publishAt);
      toast.success(
        state === "live" ? `${saved.id} is live` : state === "scheduled" ? `${saved.id} scheduled for ${formatDateTime(saved.publishAt)}` : `${saved.id} saved as draft`,
      );
      if (isNewRoute || saved.id !== id) {
        initFor.current = saved.id;
        navigate(`/admin/episodes/${saved.id}`, { replace: true });
      }
    },
    onError: (error) => toast.error(adminErrorMessage(error, "Couldn't save the episode.")),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEpisode,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-episodes"] });
      queryClient.invalidateQueries({ queryKey: ["released-episodes"] });
      setDirty(false);
      toast.success("Episode deleted");
      navigate("/admin", { replace: true });
    },
    onError: (error) => toast.error(adminErrorMessage(error, "Couldn't delete the episode.")),
  });

  const currentState = row ? liveState(row.status, row.publishAt) : "draft";

  const save = useCallback(() => {
    if (!draft || saveMutation.isPending) return;
    if (!EPISODE_ID_RE.test(draft.episodeId)) {
      toast.error("Episode ID must look like EP021.");
      return;
    }
    if (!row && dbIds.includes(draft.episodeId)) {
      toast.error(`${draft.episodeId} already exists in the hub. Pick another ID or open that episode.`);
      return;
    }
    const blocking = collectIssues(draft).filter((i) => i.level === "error");
    if (mode !== "draft" && blocking.length) {
      toast.error(`Fix ${blocking.length} issue${blocking.length === 1 ? "" : "s"} before going live`, {
        description: "Save as a draft to keep your work in the meantime.",
      });
      return;
    }
    let status: DbEpisodeStatus = "draft";
    let publishAt: string | null = null;
    if (mode === "publish") {
      status = "published";
      publishAt = currentState === "live" && row?.publishAt ? row.publishAt : new Date().toISOString();
    } else if (mode === "schedule") {
      const at = new Date(scheduleAt);
      if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() + 60_000) {
        toast.error("Pick a release time in the future.");
        return;
      }
      status = "scheduled";
      publishAt = at.toISOString();
    }
    saveMutation.mutate({ content: finalizeEpisode(draft), status, publishAt, existingId: row?.id });
  }, [currentState, dbIds, draft, mode, row, saveMutation, scheduleAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!isNewRoute && episodeQuery.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center" role="alert">
        <p className="text-vault-ice/80">{adminErrorMessage(episodeQuery.error, "Couldn't load this episode.")}</p>
        <Link to="/admin" className="ghost-neon-button h-10">
          Back to episodes
        </Link>
      </div>
    );
  }
  if (!isNewRoute && episodeQuery.data === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <p className="font-display text-xl text-vault-ice">{id} isn't in the hub</p>
        <Link to="/admin" className="ghost-neon-button h-10">
          Back to episodes
        </Link>
      </div>
    );
  }
  if (!draft) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-vault-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="vault-kicker text-[11px]">Opening editor</span>
      </div>
    );
  }

  const code = getVaultCode(draft);
  const freeIndexes = Object.keys(draft.vault?.freeDigitMap ?? {}).map(Number);
  const digitSource = (i: number): string => {
    if (freeIndexes.includes(i)) return "Free";
    const ri = draft.rounds.findIndex((r) => r.questions.some((q) => q.type === "bonus" && q.bonus?.codeDigitIndex === i));
    return ri >= 0 ? `R${ri + 1} bonus` : "Unlinked";
  };
  const totalQuestions = draft.rounds.reduce((s, r) => s + r.questions.length, 0);
  const primaryLabel =
    mode === "draft"
      ? currentState === "draft"
        ? "Save draft"
        : "Move to draft"
      : mode === "publish"
        ? currentState === "live"
          ? "Update live episode"
          : "Publish now"
        : currentState === "scheduled"
          ? "Update schedule"
          : "Schedule release";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link to="/admin" className="text-link w-fit">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All episodes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-vault-neon/40 bg-vault-neon/10 px-2.5 py-1 font-mono text-[13px] text-vault-neonhi">{draft.episodeId || "EP???"}</span>
          <h1 className="min-w-0 truncate font-display text-[28px] font-medium leading-tight text-vault-ice sm:text-[34px]">{draft.title || "Untitled episode"}</h1>
          <StatusPill state={currentState} publishAt={row?.publishAt} />
          <span className={cn("font-mono text-[10.5px] uppercase tracking-[0.16em]", dirty ? "text-vault-neon" : "text-vault-muted")} aria-live="polite">
            {dirty ? "Unsaved changes" : row ? "All changes saved" : "Not saved yet"}
          </span>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Episode details" icon={Pencil} id="details-title">
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Episode ID" htmlFor="ep-id" hint={row ? "Locked after the first save so player progress stays linked." : "Format EP021."}>
                <input
                  id="ep-id"
                  className={cn(INPUT, "font-mono uppercase tabular")}
                  value={draft.episodeId}
                  disabled={Boolean(row)}
                  onChange={(e) => edit((p) => ({ ...p, episodeId: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                />
              </Field>
              <Field label="Title" htmlFor="ep-title">
                <input id="ep-title" className={INPUT} value={draft.title ?? ""} placeholder="Debuts and Number Ones" onChange={(e) => edit((p) => ({ ...p, title: e.target.value }))} />
              </Field>
            </div>
            <Field label="Theme" htmlFor="ep-theme" className="mt-4">
              <textarea
                id="ep-theme"
                rows={2}
                className={TEXTAREA}
                value={draft.theme ?? ""}
                placeholder="One line on what ties this episode together."
                onChange={(e) => edit((p) => ({ ...p, theme: e.target.value }))}
              />
            </Field>
          </Panel>

          <Panel title="Vault" icon={KeyRound} id="vault-title">
            <div className="flex flex-col gap-5 lg:flex-row">
              <div>
                <p className="hud-label mb-2 text-[10px] text-vault-ice/60">Code</p>
                <div className="flex gap-2">
                  {code.map((digit, i) => (
                    <div key={i} className="flex flex-col items-center gap-1.5">
                      <input
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        aria-label={`Vault digit ${i + 1} (${digitSource(i)})`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(-1);
                          edit((p) => setVaultCode(p, code.map((d, j) => (j === i ? v : d))));
                        }}
                        className="neon-tile vault-display h-14 w-12 rounded-lg text-center text-[24px] text-vault-neonhi focus:outline-none focus:ring-2 focus:ring-vault-neon/60"
                      />
                      <span className={cn("font-mono text-[9px] uppercase tracking-[0.14em]", freeIndexes.includes(i) ? "text-vault-neon" : "text-vault-muted")}>{digitSource(i)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid flex-1 gap-4 sm:grid-cols-[1fr_140px]">
                <Field label="Story revealed on crack" htmlFor="ep-story">
                  <textarea
                    id="ep-story"
                    rows={3}
                    className={TEXTAREA}
                    value={getVaultStory(draft)}
                    placeholder="Why this year matters to the episode."
                    onChange={(e) => edit((p) => setVaultStory(p, e.target.value))}
                  />
                </Field>
                <Field label="Vault prize" htmlFor="ep-prize" hint={formatMoney(draft.scoring?.vaultPrize ?? 0)}>
                  <input
                    id="ep-prize"
                    type="number"
                    min={0}
                    step={500}
                    className={cn(INPUT, "font-mono tabular")}
                    value={draft.scoring?.vaultPrize ?? 0}
                    onChange={(e) => edit((p) => ({ ...p, scoring: { ...p.scoring, vaultPrize: Math.max(0, Math.round(Number(e.target.value) || 0)) } }))}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          <div>
            <div role="tablist" aria-label="Rounds" className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-vault-line bg-vault-ink/60 p-1.5">
              {draft.rounds.map((round, ri) => (
                <button
                  key={ri}
                  type="button"
                  role="tab"
                  aria-selected={activeRound === ri}
                  onClick={() => setActiveRound(ri)}
                  style={roundStyle(ri)}
                  className={cn(
                    "flex min-h-[52px] flex-col items-start justify-center rounded-lg px-3 py-2 text-left transition-colors",
                    activeRound === ri ? "bg-round/[0.1] shadow-[inset_0_-2px_0_rgb(var(--round-rgb))]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <span className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-round">
                    <RoundDot roundIndex={ri} glow={activeRound === ri} />
                    Round {ri + 1}
                    {roundErrorCounts[ri] > 0 && (
                      <span className="rounded-full bg-vault-danger/15 px-1.5 text-[9.5px] text-vault-danger tabular">{roundErrorCounts[ri]}</span>
                    )}
                  </span>
                  <span className="mt-0.5 hidden truncate text-[13px] text-vault-ice/80 sm:block">{round.name || "Untitled"}</span>
                </button>
              ))}
            </div>
            {draft.rounds[activeRound] && (
              <RoundEditor
                key={activeRound}
                episodeId={draft.episodeId}
                round={draft.rounds[activeRound]}
                roundIndex={activeRound}
                vaultCode={code}
                errorCounts={errorCounts}
                onUpdate={updateQuestion}
                onAction={cardAction}
                onRoundChange={changeRound}
                onImport={importRound}
                onAdd={addQuestion}
              />
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-[88px]">
          <Panel title="Publishing" icon={Send} id="publish-title">
            <div role="radiogroup" aria-label="Publication" className="flex flex-col gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    mode === m.id ? "border-vault-neon/60 bg-vault-neon/10" : "border-vault-line hover:border-vault-neon/30",
                  )}
                >
                  <span
                    className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", mode === m.id ? "border-vault-neon" : "border-vault-muted/60")}
                    aria-hidden="true"
                  >
                    {mode === m.id && <span className="h-2 w-2 rounded-full bg-vault-neon" />}
                  </span>
                  <m.icon className={cn("h-4 w-4 shrink-0", mode === m.id ? "text-vault-neonhi" : "text-vault-muted")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={cn("block text-[14px] font-medium", mode === m.id ? "text-vault-neonhi" : "text-vault-ice")}>{m.label}</span>
                    <span className="block text-[12px] text-vault-muted">{m.body}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode === "schedule" && (
              <Field label="Release time (your timezone)" htmlFor="ep-schedule" className="mt-3">
                <input id="ep-schedule" type="datetime-local" className={cn(INPUT, "[color-scheme:dark]")} value={scheduleAt} min={toLocalInput(new Date())} onChange={(e) => setScheduleAt(e.target.value)} />
              </Field>
            )}
            {mode !== "draft" && errors.length > 0 && (
              <p className="mt-3 text-[12.5px] text-vault-danger">Fix {errors.length} issue{errors.length === 1 ? "" : "s"} below to go live.</p>
            )}
            <button type="button" onClick={save} disabled={saveMutation.isPending} className="neon-button mt-4 h-12 w-full">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {primaryLabel}
            </button>
            <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-vault-muted">⌘/Ctrl + S saves</p>
          </Panel>

          <Panel title="Checklist" icon={CheckCircle2} id="check-title">
            <p className="mb-3 font-mono text-[11px] text-vault-muted tabular">
              {draft.rounds.length} rounds · {totalQuestions} questions · {draft.rounds.reduce((s, r) => s + (r.reserve?.length ?? 0), 0)} reserves
            </p>
            <IssueList issues={issues} onJump={setActiveRound} />
          </Panel>

          <Panel title="Episode JSON" icon={FileUp} id="json-title">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="ghost-neon-button h-10 text-[13px]"
                onClick={() => downloadText(`${draft.episodeId || "episode"}.json`, JSON.stringify(finalizeEpisode(draft), null, 2), "application/json")}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Export full episode
              </button>
              <button type="button" className="ghost-neon-button h-10 text-[13px]" onClick={() => fileRef.current?.click()}>
                <FileUp className="h-4 w-4" aria-hidden="true" />
                Replace from JSON file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  const { episode, error } = parseEpisodeFile(await file.text());
                  if (error || !episode) {
                    toast.error(error ?? "Couldn't read that file.");
                    return;
                  }
                  edit(() => withEditorKeys(row ? { ...episode, episodeId: row.id } : episode));
                  setActiveRound(0);
                  toast.success(`Loaded ${file.name}`, { description: "Review, then save to keep it." });
                }}
              />
            </div>
          </Panel>

          {row && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-10 items-center justify-center gap-2 rounded-md text-[13px] text-vault-danger/80 transition-colors hover:bg-vault-danger/10 hover:text-vault-danger"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete from hub
            </button>
          )}
        </aside>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="border-vault-danger/30 bg-vault-panel text-vault-ice">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete {row?.id}?</AlertDialogTitle>
            <AlertDialogDescription className="text-vault-ice/70">
              {currentState === "live"
                ? "It's live — players lose access on their next visit (a built-in version with the same ID comes back if one exists)."
                : "This removes it from the hub permanently."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-vault-line bg-transparent text-vault-ice hover:bg-white/5 hover:text-vault-ice">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-vault-danger text-vault-ink hover:bg-vault-danger/90" onClick={() => row && deleteMutation.mutate(row.id)}>
              Delete episode
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
