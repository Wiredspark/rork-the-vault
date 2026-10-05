import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, CloudAlert, FileJson, Library, Loader2, Pencil, Plus, Radio, Search, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { INPUT, StatusPill } from "@/components/admin/fields";
import { fetchAdminEpisodes, formatDateTime, formatWhen, type AdminEpisodeRow } from "@/lib/admin/api";
import { liveState, parseEpisodeFile, type LiveState } from "@/lib/admin/episodeDraft";
import { getBundledRawEpisodes } from "@/lib/episode";
import { cn } from "@/lib/utils";

type Filter = "all" | LiveState;

/** Hand-off from upload / built-in clone to the editor (kept in sessionStorage so it survives navigation only). */
export const EDITOR_SEED_KEY = "the-vault:editor-seed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "scheduled", label: "Scheduled" },
  { id: "live", label: "Live" },
];

function StatTile({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Radio; tone: string }) {
  return (
    <div className="neon-card flex items-center gap-4 p-4">
      <span className={cn("flex h-11 w-11 items-center justify-center rounded-lg border", tone)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div>
        <p className="vault-display text-[26px] leading-none tabular text-vault-ice">{value}</p>
        <p className="hud-label mt-1.5 text-[10px]">{label}</p>
      </div>
    </div>
  );
}

function EpisodeRow({ row, now }: { row: AdminEpisodeRow & { state: LiveState }; now: number }) {
  return (
    <li>
      <Link
        to={`/admin/episodes/${row.id}`}
        className="group flex items-center gap-4 rounded-lg border border-transparent px-4 py-3 transition-colors hover:border-vault-neon/25 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60"
      >
        <span className="w-16 shrink-0 font-mono text-[13px] text-vault-neon tabular">{row.id}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-vault-ice">{row.title || "Untitled episode"}</span>
          <span className="mt-0.5 block font-mono text-[10.5px] text-vault-muted tabular">
            {row.state === "draft"
              ? `Edited ${formatWhen(row.updatedAt, now)}`
              : row.state === "scheduled"
                ? `Releases ${formatDateTime(row.publishAt)}`
                : `Live since ${formatDateTime(row.publishAt)}`}
          </span>
        </span>
        <StatusPill state={row.state} publishAt={row.publishAt} className="hidden sm:inline-flex" />
        <ChevronRight className="h-4 w-4 shrink-0 text-vault-ice/30 transition-transform group-hover:translate-x-0.5 group-hover:text-vault-neon" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Admin dashboard: database episodes by Draft / Scheduled / Live, plus the built-in library and JSON upload. */
export default function AdminEpisodes() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState<string>("");
  const query = useQuery({ queryKey: ["admin-episodes"], queryFn: fetchAdminEpisodes, staleTime: 15_000 });
  const now = Date.now();

  const rows = useMemo(
    () => (query.data ?? []).map((r) => ({ ...r, state: liveState(r.status, r.publishAt, now) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.data],
  );
  const counts = useMemo(
    () => ({
      draft: rows.filter((r) => r.state === "draft").length,
      scheduled: rows.filter((r) => r.state === "scheduled").length,
      live: rows.filter((r) => r.state === "live").length,
    }),
    [rows],
  );
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.state === filter) && (!term || `${r.id} ${r.title}`.toLowerCase().includes(term)));
  }, [filter, rows, search]);

  const dbIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const builtIns = useMemo(() => getBundledRawEpisodes().filter((e) => e?.episodeId).sort((a, b) => a.episodeId.localeCompare(b.episodeId)), []);

  const openSeed = (content: unknown, source: string) => {
    try {
      window.sessionStorage.setItem(EDITOR_SEED_KEY, JSON.stringify(content));
    } catch {
      toast.error("That episode is too large to hand to the editor.");
      return;
    }
    navigate(`/admin/episodes/new?seed=${encodeURIComponent(source)}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="vault-kicker text-[10.5px]">Content</p>
          <h1 className="mt-1.5 font-display text-[34px] font-medium leading-none text-vault-ice sm:text-[42px]">Episodes</h1>
          <p className="mt-2 text-[15px] text-vault-ice/65">Write, schedule and release R&B Vault episodes. Live episodes reach players on their next visit.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="ghost-neon-button h-11">
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload JSON
          </button>
          <Link to="/admin/episodes/new" className="neon-button h-11">
            <Plus className="h-4 w-4" aria-hidden="true" />
            New episode
          </Link>
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
              openSeed(episode, file.name);
            }}
          />
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Live" value={counts.live} icon={Radio} tone="border-vault-success/40 bg-vault-success/10 text-vault-success" />
        <StatTile label="Scheduled" value={counts.scheduled} icon={CalendarClock} tone="border-vault-neon/45 bg-vault-neon/10 text-vault-neonhi" />
        <StatTile label="Drafts" value={counts.draft} icon={Pencil} tone="border-vault-line bg-white/[0.03] text-vault-ice/70" />
      </div>

      <section className="neon-card p-2 sm:p-3" aria-label="Episode list">
        <div className="flex flex-col gap-3 p-2 sm:flex-row sm:items-center">
          <div role="tablist" aria-label="Filter by status" className="flex gap-1 rounded-lg border border-vault-line bg-vault-ink/60 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-9 rounded-md px-3.5 text-[13px] font-medium transition-colors",
                  filter === f.id ? "bg-vault-neon/15 text-vault-neonhi shadow-[inset_0_0_0_1px_rgba(207,171,92,0.45)]" : "text-vault-ice/60 hover:text-vault-ice",
                )}
              >
                {f.label}
                {f.id !== "all" && <span className="ml-1.5 font-mono text-[11px] opacity-70 tabular">{counts[f.id]}</span>}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vault-muted" aria-hidden="true" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ID or title" aria-label="Search episodes" className={cn(INPUT, "h-10 pl-9")} />
          </div>
        </div>
        <div className="hairline my-1 opacity-50" />

        {query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-14 text-vault-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="vault-kicker text-[11px]">Loading episodes</span>
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
            <CloudAlert className="h-6 w-6 text-vault-danger" aria-hidden="true" />
            <p className="text-vault-ice/80">Couldn't load episodes.</p>
            <button type="button" className="ghost-neon-button h-10" onClick={() => query.refetch()}>
              Retry
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <FileJson className="h-6 w-6 text-vault-neon/60" aria-hidden="true" />
            <p className="text-[15px] text-vault-ice/80">{rows.length ? "No episodes match." : "No episodes in the hub yet."}</p>
            <p className="text-[13px] text-vault-muted">Create one, upload a JSON file, or start from a built-in episode below.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 py-1">
            {visible.map((row) => (
              <EpisodeRow key={row.id} row={row} now={now} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="builtin-title" className="neon-card p-5">
        <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="builtin-title" className="flex items-center gap-2 font-display text-[16px] font-medium text-vault-ice">
            <Library className="h-4 w-4 text-vault-neon" aria-hidden="true" />
            Built-in library
          </h2>
          <p className="text-[12.5px] text-vault-muted">
            Bundled with the app and always live. Open one to edit a copy — publishing it from the hub overrides the built-in version.
          </p>
        </header>
        <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {builtIns.map((ep) => {
            const inHub = dbIds.has(ep.episodeId);
            return (
              <li key={ep.episodeId}>
                <button
                  type="button"
                  onClick={() => (inHub ? navigate(`/admin/episodes/${ep.episodeId}`) : openSeed(ep, ep.episodeId))}
                  className="flex w-full items-center gap-3 rounded-lg border border-vault-line px-3 py-2.5 text-left transition-colors hover:border-vault-neon/35 hover:bg-white/[0.03]"
                >
                  <span className="w-14 shrink-0 font-mono text-[12px] text-vault-neon">{ep.episodeId}</span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-vault-ice/85">{ep.title}</span>
                  <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.14em] text-vault-muted">{inHub ? "In hub" : "Edit copy"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
