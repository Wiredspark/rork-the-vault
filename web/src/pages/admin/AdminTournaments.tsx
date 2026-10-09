import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarPlus,
  Check,
  Copy,
  Crown,
  Eye,
  FastForward,
  Gift,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { formatMs, MiniStat } from "@/components/arena/ArenaBits";
import { formatWhen, ordinal, PhaseCountdown, StatusPill } from "@/components/tournaments/TournamentBits";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  fetchAdminTournaments,
  POOL_OPTIONS,
  saveTournament,
  saveTournamentInvites,
  tournamentAction,
  tournamentLink,
  type TournamentAdminAction,
} from "@/lib/arena/api";
import type { ArenaInsights, TournamentAdminView, TournamentConfig } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const FIELD =
  "h-11 w-full rounded-md border border-vault-line bg-vault-ink/60 px-3 text-[14px] text-vault-ice placeholder:text-vault-muted focus:border-vault-neon/60 focus:outline-none focus:ring-1 focus:ring-vault-neon/40" as const;

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): number {
  return new Date(v).getTime();
}

/** Next Saturday 8pm local, qualifiers the 3 days before. */
function defaultConfig(): TournamentConfig {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(20, 0, 0, 0);
  const finalsAt = d.getTime();
  return {
    name: "Saturday Night Vault",
    series: "Weekly",
    description: "",
    qualStart: Math.max(Date.now() + 5 * 60_000, finalsAt - 3 * 86_400_000),
    qualEnd: finalsAt - 30 * 60_000,
    finalsAt,
    pool: "all",
    entryType: "open",
    entryFee: 0,
    cap: null,
    prizes: { baseVc: 25_000, split: [50, 30, 20], badges: true, title: "Weekly Champion", custom: "" },
  };
}

function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="hud-label text-[9.5px]">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-vault-muted">{hint}</span>}
    </label>
  );
}

/** Create / edit form in a side sheet. */
function TournamentForm({ initial, onDone }: { initial: TournamentAdminView | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [c, setC] = useState<TournamentConfig>(() => initial?.config ?? defaultConfig());
  const [splitText, setSplitText] = useState<string>(() => (initial?.config.prizes.split ?? [50, 30, 20]).join(" / "));
  const locked = initial ? !["draft", "scheduled"].includes(initial.status) : false;
  const feeLocked = Boolean(initial?.entries.some((e) => e.feePaid > 0));

  const set = <K extends keyof TournamentConfig>(key: K, value: TournamentConfig[K]) => setC((prev) => ({ ...prev, [key]: value }));
  const setPrize = <K extends keyof TournamentConfig["prizes"]>(key: K, value: TournamentConfig["prizes"][K]) =>
    setC((prev) => ({ ...prev, prizes: { ...prev.prizes, [key]: value } }));

  const split = splitText
    .split(/[\s,/]+/)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  const splitSum = split.reduce((a, b) => a + b, 0);

  const save = useMutation({
    mutationFn: (publish: boolean) => saveTournament({ id: initial?.id, config: { ...c, prizes: { ...c.prizes, split } }, publish }),
    onSuccess: (_d, publish) => {
      toast.success(publish ? "Published. Players can see it now." : initial ? "Saved." : "Draft created.");
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(false);
      }}
      className="flex flex-col gap-5 pb-8"
    >
      <Field label="Name">
        <input className={FIELD} value={c.name} onChange={(e) => set("name", e.target.value)} maxLength={60} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Series" hint="Champion titles pass between events in the same series.">
          <input className={FIELD} value={c.series} onChange={(e) => set("series", e.target.value)} maxLength={30} placeholder="Weekly" />
        </Field>
        <Field label="Question pool">
          <select className={FIELD} value={c.pool} onChange={(e) => set("pool", e.target.value)} disabled={locked}>
            {POOL_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Description">
        <textarea className={cn(FIELD, "h-20 py-2")} value={c.description} onChange={(e) => set("description", e.target.value)} maxLength={600} />
      </Field>

      <fieldset className="grid gap-3 rounded-lg border border-vault-line p-4">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-vault-neon">Schedule (your local time)</legend>
        <Field label="Qualifiers open">
          <input type="datetime-local" className={FIELD} value={toLocalInput(c.qualStart)} onChange={(e) => set("qualStart", fromLocalInput(e.target.value))} disabled={locked} />
        </Field>
        <Field label="Qualifiers close">
          <input
            type="datetime-local"
            className={FIELD}
            value={toLocalInput(c.qualEnd)}
            onChange={(e) => set("qualEnd", fromLocalInput(e.target.value))}
            disabled={initial ? !["draft", "scheduled", "qualifying"].includes(initial.status) : false}
          />
        </Field>
        <Field label="Live final starts" hint="Check-in opens 5 minutes before. Needs at least 5 minutes after qualifiers close.">
          <input type="datetime-local" className={FIELD} value={toLocalInput(c.finalsAt)} onChange={(e) => set("finalsAt", fromLocalInput(e.target.value))} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-vault-line p-4">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-vault-neon">Entry</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Entry type">
          {(["open", "invite"] as const).map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={c.entryType === type}
              onClick={() => set("entryType", type)}
              className={cn(
                "rounded-lg border px-3 py-2.5 text-left text-[13.5px] transition-colors",
                c.entryType === type ? "border-vault-neon bg-vault-neon/10 text-vault-neonhi" : "border-vault-line text-vault-ice/70 hover:border-vault-neon/40",
              )}
            >
              <span className="block font-semibold">{type === "open" ? "Open" : "Invite-only"}</span>
              <span className="block text-[11.5px] text-vault-muted">{type === "open" ? "Any signed-in player" : "Invite list or code/link"}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entry fee (Arena VC)" hint={feeLocked ? "Locked: players have paid." : "0 = free. Fees grow the pool."}>
            <input type="number" min={0} step={100} className={FIELD} value={c.entryFee} onChange={(e) => set("entryFee", Math.max(0, Number(e.target.value) || 0))} disabled={feeLocked} />
          </Field>
          <Field label="Player cap" hint="Blank = no cap (recommended).">
            <input
              type="number"
              min={2}
              className={FIELD}
              value={c.cap ?? ""}
              placeholder="No cap"
              onChange={(e) => set("cap", e.target.value ? Math.max(2, Number(e.target.value)) : null)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border border-vault-line p-4">
        <legend className="px-1 font-mono text-[10px] uppercase tracking-[0.18em] text-vault-neon">Prizes</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base prize (VC)" hint="Entry fees are added on top.">
            <input type="number" min={0} step={1000} className={FIELD} value={c.prizes.baseVc} onChange={(e) => setPrize("baseVc", Math.max(0, Number(e.target.value) || 0))} />
          </Field>
          <Field label="Split %" hint={splitSum === 100 ? `${split.length} paid places` : `Adds to ${splitSum}%, needs 100`}>
            <input className={cn(FIELD, splitSum !== 100 && "border-vault-danger/60")} value={splitText} onChange={(e) => setSplitText(e.target.value)} placeholder="50 / 30 / 20" />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-[14px] text-vault-ice/85">
          <input type="checkbox" checked={c.prizes.badges} onChange={(e) => setPrize("badges", e.target.checked)} className="h-4 w-4 accent-[#CFAB5C]" />
          Award trophy badges (Champion, Finalist, Qualifier)
        </label>
        <Field label="Champion title" hint="Shown with a crown until the next event in this series. Blank = none.">
          <input className={FIELD} value={c.prizes.title} onChange={(e) => setPrize("title", e.target.value)} maxLength={40} placeholder="Weekly Champion" />
        </Field>
        <Field label="Custom prize" hint="Fulfilled by you, offline. Shows on the tournament page.">
          <input className={FIELD} value={c.prizes.custom} onChange={(e) => setPrize("custom", e.target.value)} maxLength={200} placeholder="Signed vinyl, merch pack…" />
        </Field>
      </fieldset>

      <div className="sticky bottom-0 -mx-6 flex gap-2 border-t border-vault-line bg-vault-panel/95 px-6 py-4 backdrop-blur">
        <button type="submit" disabled={save.isPending || splitSum !== 100} className="ghost-neon-button h-11 flex-1">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {initial && initial.status !== "draft" ? "Save changes" : "Save draft"}
        </button>
        {(!initial || initial.status === "draft") && (
          <button type="button" onClick={() => save.mutate(true)} disabled={save.isPending || splitSum !== 100} className="neon-button h-11 flex-1">
            <Rocket className="h-4 w-4" /> Publish
          </button>
        )}
      </div>
    </form>
  );
}

/** Day-of-week × hour heatmap of Arena activity (local time). */
function PeakHours({ insights }: { insights: ArenaInsights }) {
  const { grid, max, best } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    insights.hours.forEach(({ hour, plays }) => {
      const d = new Date(hour * 3_600_000);
      g[d.getDay()][d.getHours()] += plays;
    });
    let m = 0;
    let b: { day: number; hour: number; plays: number } | null = null;
    g.forEach((row, day) =>
      row.forEach((plays, hour) => {
        m = Math.max(m, plays);
        if (!b || plays > b.plays) b = { day, hour, plays };
      }),
    );
    return { grid: g, max: m, best: b as { day: number; hour: number; plays: number } | null };
  }, [insights]);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <section className="neon-card p-5" aria-labelledby="peak-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="peak-title" className="font-display text-xl text-vault-ice">
            Peak hours
          </h2>
          <p className="mt-0.5 text-[13px] text-vault-muted">Arena plays over the last 8 weeks, by day and hour (your local time). Use it to pick a weekly anchor slot.</p>
        </div>
        {best && best.plays > 0 && (
          <p className="rounded-full border border-vault-neon/40 bg-vault-neon/10 px-3 py-1 font-mono text-[11px] text-vault-neonhi">
            Busiest: {days[best.day]} {String(best.hour).padStart(2, "0")}:00
          </p>
        )}
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[560px] gap-[3px]" style={{ gridTemplateColumns: "36px repeat(24, minmax(0, 1fr))" }}>
          <span />
          {Array.from({ length: 24 }).map((_, h) => (
            <span key={h} className="text-center font-mono text-[8.5px] text-vault-muted">
              {h % 3 === 0 ? h : ""}
            </span>
          ))}
          {grid.map((row, day) => (
            <div key={day} className="contents">
              <span className="font-mono text-[10px] leading-[18px] text-vault-muted">{days[day]}</span>
              {row.map((plays, hour) => (
                <span
                  key={hour}
                  title={`${days[day]} ${hour}:00 · ${plays} plays`}
                  className="h-[18px] rounded-[3px] border border-white/[0.03]"
                  style={{ backgroundColor: plays === 0 || max === 0 ? "rgba(255,255,255,0.025)" : `rgba(207,171,92,${0.12 + (plays / max) * 0.83})` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {max === 0 && <p className="mt-3 text-[12.5px] text-vault-muted">No Arena activity recorded yet. The chart fills in as people play.</p>}
    </section>
  );
}

type Confirm = { t: TournamentAdminView; action: TournamentAdminAction; userId?: string; title: string; body: string } | null;

function TournamentRow({ t, onEdit, onConfirm }: { t: TournamentAdminView; onEdit: () => void; onConfirm: (c: Confirm) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<boolean>(["qualifying", "locking", "checkin", "final"].includes(t.status));
  const [inviteText, setInviteText] = useState<string>(t.invites.join("\n"));
  useEffect(() => setInviteText(t.invites.join("\n")), [t.invites]);

  const run = useMutation({
    mutationFn: ({ action, userId }: { action: TournamentAdminAction; userId?: string }) => tournamentAction(t.id, action, userId),
    onSuccess: (res, { action }) => {
      if ("id" in res && action === "duplicate") toast.success("Duplicated as a draft, one week later.");
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const invites = useMutation({
    mutationFn: () => saveTournamentInvites(t.id, inviteText.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean)),
    onSuccess: () => {
      toast.success("Invite list saved.");
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error("Couldn't copy.");
    }
  };

  const ranked = [...t.entries].filter((e) => e.bestScore !== null && !e.disqualified).sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0) || (a.bestTimeMs ?? 0) - (b.bestTimeMs ?? 0));
  const rankOf = new Map(ranked.map((e, i) => [e.userId, i + 1]));
  const entries = [...t.entries].sort((a, b) => (rankOf.get(a.userId) ?? 9999) - (rankOf.get(b.userId) ?? 9999) || a.registeredAt - b.registeredAt);
  const editable = ["draft", "scheduled", "qualifying", "locking"].includes(t.status);
  const canSkip = ["scheduled", "qualifying", "locking", "checkin"].includes(t.status);
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors disabled:opacity-40" as const;

  return (
    <li className={cn("rounded-xl border bg-vault-ink/40", t.status === "final" ? "border-vault-success/40" : "border-vault-line")}>
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={t.status} paused={t.paused} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-vault-muted">
              {t.config.entryType === "invite" ? "Invite-only" : "Open"}
              {t.config.entryFee > 0 ? ` · fee ${formatMoney(t.config.entryFee)}` : ""}
              {t.config.cap ? ` · cap ${t.config.cap}` : ""}
            </span>
          </div>
          <p className="mt-2 font-display text-[22px] leading-tight text-vault-ice">{t.config.name}</p>
          <p className="mt-1 font-mono text-[11px] text-vault-muted">
            Q {formatWhen(t.config.qualStart)} → {formatWhen(t.config.qualEnd)} · Final {formatWhen(t.config.finalsAt)}
          </p>
        </button>
        <div className="flex items-center gap-4">
          <PhaseCountdown t={t} className="hidden items-end text-right sm:flex" />
          <div className="text-right">
            <p className="hud-label text-[9.5px]">Pool</p>
            <p className="vault-display text-[18px] tabular text-vault-neonhi">{formatMoney(t.prizePool)}</p>
          </div>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-vault-line p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {editable && (
              <button type="button" onClick={onEdit} className={cn(btn, "border-vault-neon/40 text-vault-neon hover:bg-vault-neon/10")}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            )}
            {t.status === "draft" && (
              <button type="button" onClick={() => run.mutate({ action: "publish" })} className={cn(btn, "border-vault-neon bg-vault-neon/15 text-vault-neonhi hover:bg-vault-neon/25")}>
                <Rocket className="h-3.5 w-3.5" /> Publish
              </button>
            )}
            <button type="button" onClick={() => run.mutate({ action: "duplicate" })} className={cn(btn, "border-vault-line text-vault-ice/80 hover:border-vault-neon/40")}>
              <CalendarPlus className="h-3.5 w-3.5" /> Duplicate
            </button>
            {t.status !== "draft" && (
              <Link to={`/arena/tournaments/${t.id}`} className={cn(btn, "border-vault-line text-vault-ice/80 hover:border-vault-neon/40")}>
                <Eye className="h-3.5 w-3.5" /> Player view
              </Link>
            )}
            {t.finalRoomId && ["checkin", "final", "locking"].includes(t.status) && (
              <Link to={`/arena/room/${t.finalRoomId}`} className={cn(btn, "border-vault-success/50 text-vault-success hover:bg-vault-success/10")}>
                <Eye className="h-3.5 w-3.5" /> Watch final room
              </Link>
            )}
            {canSkip && !t.paused && (
              <button
                type="button"
                onClick={() =>
                  onConfirm({
                    t,
                    action: "skip",
                    title: "Jump to the next phase now?",
                    body:
                      t.status === "scheduled"
                        ? "Qualifiers open immediately."
                        : t.status === "qualifying"
                          ? "Qualifiers close now. Runs in progress may finish, then the top 8 are locked."
                          : "The final starts now with whoever has checked in.",
                  })
                }
                className={cn(btn, "border-vault-line text-vault-ice/80 hover:border-vault-neon/40")}
              >
                <FastForward className="h-3.5 w-3.5" /> Skip ahead
              </button>
            )}
            {!["completed", "cancelled", "final", "draft"].includes(t.status) &&
              (t.paused ? (
                <button type="button" onClick={() => run.mutate({ action: "resume" })} className={cn(btn, "border-vault-success/50 text-vault-success hover:bg-vault-success/10")}>
                  <Play className="h-3.5 w-3.5" /> Resume
                </button>
              ) : (
                <button type="button" onClick={() => run.mutate({ action: "pause" })} className={cn(btn, "border-vault-line text-vault-ice/80 hover:border-vault-danger/40")}>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </button>
              ))}
            {!["completed", "cancelled", "draft"].includes(t.status) && (
              <button
                type="button"
                onClick={() =>
                  onConfirm({
                    t,
                    action: "cancel",
                    title: `Cancel ${t.config.name}?`,
                    body: `It ends for everyone.${t.entries.some((e) => e.feePaid > 0 && !e.refunded) ? " Every entry fee is refunded to players' Arena VC automatically." : ""} This can't be undone.`,
                  })
                }
                className={cn(btn, "border-vault-danger/40 text-vault-danger hover:bg-vault-danger/10")}
              >
                <Ban className="h-3.5 w-3.5" /> Cancel
              </button>
            )}
            {t.status === "draft" && (
              <button
                type="button"
                onClick={() => onConfirm({ t, action: "delete", title: "Delete this draft?", body: "It's removed permanently." })}
                className={cn(btn, "border-vault-danger/40 text-vault-danger hover:bg-vault-danger/10")}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            {run.isPending && <Loader2 className="h-4 w-4 animate-spin self-center text-vault-neon" />}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Registrations" value={`${t.stats.registrations}`} sub={t.config.cap ? `of ${t.config.cap}` : "no cap"} />
            <MiniStat label="Qualifier runs" value={`${t.stats.runs}`} sub={`${ranked.length} posted a score`} />
            <MiniStat label="Fees in pool" value={formatMoney(t.prizePool - t.config.prizes.baseVc)} sub={`base ${formatMoney(t.config.prizes.baseVc)}`} />
            <MiniStat label="Final viewers" value={`${t.stats.finalViewers}`} sub={t.status === "completed" ? "spectators" : "after the final"} />
          </div>

          {t.placements && (
            <div className="rounded-lg border border-vault-neon/30 bg-vault-neon/[0.05] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[15px] text-vault-ice">
                  <Crown className="h-4 w-4 text-vault-neonhi" aria-hidden="true" /> Champion: <span className="font-semibold text-vault-neonhi">{t.championName}</span>
                </p>
                {t.config.prizes.custom && (
                  <button
                    type="button"
                    onClick={() => run.mutate({ action: t.prizeSent ? "prize-unsent" : "prize-sent" })}
                    className={cn(
                      btn,
                      t.prizeSent ? "border-vault-success/50 bg-vault-success/10 text-vault-success" : "border-vault-neon/50 text-vault-neonhi hover:bg-vault-neon/10",
                    )}
                  >
                    {t.prizeSent ? <Check className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5" />}
                    {t.prizeSent ? "Prize sent" : `Mark “${t.config.prizes.custom}” sent`}
                  </button>
                )}
              </div>
              <p className="mt-2 text-[12.5px] text-vault-ice/65">
                {t.placements
                  .filter((p) => p.vcPrize > 0)
                  .map((p) => `${ordinal(p.placement)} ${p.name} ${formatMoney(p.vcPrize)}`)
                  .join(" · ")}
              </p>
            </div>
          )}

          {t.config.entryType === "invite" && (
            <div className="grid gap-3 rounded-lg border border-vault-line p-4 lg:grid-cols-[1fr_1.2fr]">
              <div>
                <p className="eyebrow-muted">Invite code & link</p>
                <p className="mt-2 font-display text-[26px] tracking-[0.2em] text-vault-neonhi">{t.inviteCode}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => copy(tournamentLink(t.id, t.inviteCode), "Invite link")} className={cn(btn, "border-vault-neon/40 text-vault-neon hover:bg-vault-neon/10")}>
                    <Copy className="h-3.5 w-3.5" /> Copy link
                  </button>
                  <button type="button" onClick={() => run.mutate({ action: "regen-code" })} className={cn(btn, "border-vault-line text-vault-ice/75 hover:border-vault-neon/40")}>
                    <RefreshCw className="h-3.5 w-3.5" /> New code
                  </button>
                </div>
                <p className="mt-2 text-[11.5px] text-vault-muted">Anyone with the link can register. A new code disables the old link.</p>
              </div>
              <div>
                <p className="eyebrow-muted">Invite list</p>
                <textarea
                  value={inviteText}
                  onChange={(e) => setInviteText(e.target.value)}
                  placeholder={"One per line: email or display name\nplayer@example.com"}
                  className={cn(FIELD, "mt-2 h-28 py-2 font-mono text-[12.5px]")}
                />
                <button type="button" onClick={() => invites.mutate()} disabled={invites.isPending} className={cn(btn, "mt-2 border-vault-neon/40 text-vault-neon hover:bg-vault-neon/10")}>
                  {invites.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save list
                </button>
              </div>
            </div>
          )}

          <div>
            <p className="eyebrow-muted pb-2">Entrants ({t.entries.length})</p>
            {t.entries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-vault-line px-4 py-6 text-center text-[13.5px] text-vault-muted">No one has registered yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-vault-line">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="bg-vault-ink/60 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-muted">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Runs</th>
                      <th className="px-3 py-2">Best</th>
                      <th className="px-3 py-2">Fee</th>
                      <th className="px-3 py-2">Check-in</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const rank = rankOf.get(e.userId);
                      return (
                        <tr key={e.userId} className={cn("border-t border-vault-line", e.disqualified && "opacity-50")}>
                          <td className={cn("px-3 py-2 font-mono tabular", rank && rank <= 8 ? "text-vault-neonhi" : "text-vault-muted")}>{rank ?? "—"}</td>
                          <td className="px-3 py-2">
                            <span className="block text-vault-ice">{e.name}</span>
                            {e.email && <span className="block font-mono text-[10.5px] text-vault-muted">{e.email}</span>}
                          </td>
                          <td className="px-3 py-2 font-mono tabular text-vault-ice/80">{e.runsUsed}/3</td>
                          <td className="px-3 py-2 font-mono tabular text-vault-ice/80">
                            {e.bestScore !== null ? `${e.bestScore.toLocaleString("en-US")} · ${formatMs(e.bestTimeMs)}` : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono tabular text-vault-ice/80">{e.feePaid > 0 ? `${formatMoney(e.feePaid)}${e.refunded ? " · refunded" : ""}` : "—"}</td>
                          <td className="px-3 py-2">{e.checkedIn ? <span className="text-vault-success">Yes</span> : <span className="text-vault-muted">—</span>}</td>
                          <td className="px-3 py-2 text-right">
                            {!["final", "completed", "cancelled"].includes(t.status) &&
                              (e.disqualified ? (
                                <button type="button" onClick={() => run.mutate({ action: "reinstate", userId: e.userId })} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-vault-success hover:bg-vault-success/10">
                                  <UserCheck className="h-3.5 w-3.5" /> Reinstate
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onConfirm({
                                      t,
                                      action: "disqualify",
                                      userId: e.userId,
                                      title: `Remove ${e.name}?`,
                                      body: "Their scores stop counting and the finalist list updates. Their entry fee is kept unless the tournament is cancelled.",
                                    })
                                  }
                                  className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-vault-danger hover:bg-vault-danger/10"
                                >
                                  <UserX className="h-3.5 w-3.5" /> Remove
                                </button>
                              ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** Admin control room for tournaments. */
export default function AdminTournaments() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<TournamentAdminView | "new" | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const query = useQuery({ queryKey: ["admin-tournaments"], queryFn: fetchAdminTournaments, refetchInterval: 5_000 });

  const doConfirm = useMutation({
    mutationFn: (c: NonNullable<Confirm>) => tournamentAction(c.t.id, c.action, c.userId),
    onSuccess: (_d, c) => {
      toast.success(c.action === "cancel" ? "Tournament cancelled. Fees refunded." : c.action === "delete" ? "Draft deleted." : "Done.");
      void queryClient.invalidateQueries({ queryKey: ["admin-tournaments"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setConfirm(null),
  });

  const list = query.data?.tournaments ?? [];
  const active = list.filter((t) => !["completed", "cancelled"].includes(t.status));
  const past = list.filter((t) => ["completed", "cancelled"].includes(t.status));
  const unsent = past.filter((t) => t.status === "completed" && t.config.prizes.custom && !t.prizeSent);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="vault-kicker text-[11px]">Admin hub</p>
          <h1 className="mt-1 font-display text-[36px] font-medium text-vault-ice">Tournaments</h1>
          <p className="mt-1 text-[14.5px] text-vault-ice/65">Phases advance on schedule automatically. Use Skip ahead or Pause when you need to step in.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="neon-button h-12">
          <Plus className="h-4 w-4" /> New tournament
        </button>
      </header>

      {unsent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-vault-neon/40 bg-vault-neon/[0.07] px-4 py-3 text-[14px] text-vault-ice" role="status">
          <Gift className="h-4 w-4 text-vault-neonhi" aria-hidden="true" />
          {unsent.length} custom {unsent.length === 1 ? "prize needs" : "prizes need"} sending: {unsent.map((t) => `${t.config.prizes.custom} → ${t.championName}`).join(" · ")}
        </div>
      )}

      {query.isPending ? (
        <div className="flex items-center justify-center gap-2 py-20 text-vault-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-vault-neon" aria-hidden="true" /> Loading tournaments…
        </div>
      ) : query.isError ? (
        <div className="neon-card mx-auto max-w-md p-7 text-center" role="alert">
          <p className="text-vault-ice/80">{query.error.message}</p>
          <button type="button" onClick={() => query.refetch()} className="neon-button mt-4 h-11">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="active-title">
            <h2 id="active-title" className="eyebrow-muted pb-3">
              Active & upcoming
            </h2>
            {active.length === 0 ? (
              <div className="neon-card flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Crown className="h-8 w-8 text-vault-neon" aria-hidden="true" />
                <p className="text-[15px] text-vault-ice/80">No tournaments on the calendar.</p>
                <button type="button" onClick={() => setEditing("new")} className="ghost-neon-button h-11">
                  <Plus className="h-4 w-4" /> Schedule one
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {active.map((t) => (
                  <TournamentRow key={t.id} t={t} onEdit={() => setEditing(t)} onConfirm={setConfirm} />
                ))}
              </ul>
            )}
          </section>

          {query.data && <PeakHours insights={query.data.insights} />}

          {past.length > 0 && (
            <section aria-labelledby="past-title">
              <h2 id="past-title" className="eyebrow-muted pb-3">
                Completed & cancelled
              </h2>
              <ul className="flex flex-col gap-3">
                {past.map((t) => (
                  <TournamentRow key={t.id} t={t} onEdit={() => setEditing(t)} onConfirm={setConfirm} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto border-vault-neon/20 bg-vault-panel text-vault-ice sm:max-w-lg">
          <SheetHeader className="pb-4">
            <SheetTitle className="font-display text-2xl text-vault-ice">{editing === "new" ? "New tournament" : "Edit tournament"}</SheetTitle>
            <SheetDescription className="text-vault-ice/60">Players see it once it's published. Times are in your local timezone.</SheetDescription>
          </SheetHeader>
          {editing !== null && <TournamentForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent className="border-vault-neon/20 bg-vault-panel text-vault-ice">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-vault-ice/70">{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-vault-line bg-transparent text-vault-ice hover:bg-white/5">
              <X className="h-4 w-4" /> Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm) doConfirm.mutate(confirm);
              }}
              className={cn(confirm && ["cancel", "delete", "disqualify"].includes(confirm.action) ? "bg-vault-danger text-vault-ink hover:bg-vault-danger/90" : "neon-button h-10")}
            >
              {doConfirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
