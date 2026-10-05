import { Check, ChevronsUpDown } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACTIVE_MODULE } from "@/data/modules";
import { getEpisodesForModule, type Episode } from "@/lib/episode";
import { runStatus, type GameState } from "@/lib/gameEngine";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

type RunBadge = "cracked" | "sealed" | "vault" | "playing" | null;

const BADGE: Record<Exclude<RunBadge, null>, { label: string; className: string }> = {
  cracked: { label: "Cracked", className: "text-vault-success" },
  sealed: { label: "Sealed", className: "text-vault-danger/80" },
  vault: { label: "At vault", className: "text-vault-neonhi" },
  playing: { label: "In progress", className: "text-vault-neon" },
};

function badgeFor(run: GameState | undefined): RunBadge {
  if (!run) return null;
  if (run.vaultOutcome === "cracked") return "cracked";
  if (run.vaultOutcome === "sealed") return "sealed";
  const status = runStatus(run);
  if (status === "vault") return "vault";
  if (status === "playing") return "playing";
  return null;
}

/** Groups episodes into tens (001–010, 011–020…) so a long catalogue stays scannable. */
function groupByTens(episodes: Episode[]): { heading: string; items: Episode[] }[] {
  const groups = new Map<number, Episode[]>();
  episodes.forEach((ep) => {
    const key = Math.floor((ep.number - 1) / 10);
    groups.set(key, [...(groups.get(key) ?? []), ep]);
  });
  const pad = (n: number) => String(n).padStart(3, "0");
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, items]) => ({ heading: `EP${pad(key * 10 + 1)} – ${pad(key * 10 + 10)}`, items }));
}

const EpisodeRow = memo(function EpisodeRow({
  episode,
  active,
  badge,
  onPick,
}: {
  episode: Episode;
  active: boolean;
  badge: RunBadge;
  onPick: (id: string) => void;
}) {
  return (
    <CommandItem
      value={episode.id}
      keywords={[episode.title, episode.theme]}
      onSelect={() => onPick(episode.id)}
      className={cn(
        "group gap-3 rounded-md px-2.5 py-2.5 text-vault-ice/80 data-[selected=true]:bg-vault-neon/10 data-[selected=true]:text-vault-ice",
        active && "bg-vault-neon/[0.06] text-vault-ice",
      )}
    >
      <span className={cn("w-12 shrink-0 font-mono text-[12px] tabular", active ? "text-vault-neonhi" : "text-vault-neon/80")}>{episode.id}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px]">{episode.title}</span>
      {episode.status === "draft" && (
        <span className="shrink-0 rounded-full border border-dashed border-vault-ice/25 px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.16em] text-vault-muted">
          Draft
        </span>
      )}
      {badge && <span className={cn("shrink-0 font-mono text-[9.5px] uppercase tracking-[0.16em]", BADGE[badge].className)}>{BADGE[badge].label}</span>}
      <Check className={cn("h-3.5 w-3.5 shrink-0 text-vault-neon", active ? "opacity-100" : "opacity-0")} aria-hidden="true" />
    </CommandItem>
  );
});

/** Searchable episode dropdown for the dashboard hero; replaces the old chip row so the catalogue can grow. */
export function EpisodePicker({ className }: { className?: string }) {
  const { episode, runs, selectEpisode } = useGame();
  const [open, setOpen] = useState<boolean>(false);
  const episodes = useMemo(() => getEpisodesForModule(ACTIVE_MODULE.id), []);
  const groups = useMemo(() => groupByTens(episodes), [episodes]);
  const crackedCount = useMemo(() => episodes.filter((ep) => runs[ep.id]?.vaultOutcome === "cracked").length, [episodes, runs]);

  const pick = (id: string) => {
    selectEpisode(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={`Episode: ${episode.id}, ${episode.title}. Change episode`}
          className={cn(
            "group flex h-14 w-full max-w-[420px] items-center gap-3 rounded-md border border-vault-neon/25 bg-vault-ink/70 px-4 text-left backdrop-blur-sm transition-colors hover:border-vault-neon/60 data-[state=open]:border-vault-neon/70",
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="hud-label">Episode · {episodes.length} available</span>
            <span className="mt-1 flex min-w-0 items-baseline gap-2">
              <span className="font-mono text-[13px] text-vault-neonhi tabular">{episode.id}</span>
              <span className="truncate text-[14px] font-medium text-vault-ice">{episode.title}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-vault-ice/50 transition-colors group-hover:text-vault-neon" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(440px,calc(100vw-2rem))] border-vault-neon/20 bg-vault-panel p-0 text-vault-ice shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
      >
        <Command className="bg-transparent text-vault-ice [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.25em] [&_[cmdk-group-heading]]:text-vault-muted [&_[cmdk-input-wrapper]]:border-vault-line">
          <CommandInput placeholder="Search by number, title or theme…" className="text-vault-ice placeholder:text-vault-muted" />
          <CommandList className="max-h-[min(380px,55vh)] p-1">
            <CommandEmpty className="py-8 text-center text-sm text-vault-muted">No episode matches that.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading} className="text-vault-ice">
                {group.items.map((ep) => (
                  <EpisodeRow key={ep.id} episode={ep} active={ep.id === episode.id} badge={badgeFor(runs[ep.id])} onPick={pick} />
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex items-center justify-between border-t border-vault-line px-3 py-2.5 font-mono text-[10.5px] text-vault-muted tabular">
            <span>
              {crackedCount}/{episodes.length} vaults cracked
            </span>
            <span className="hidden sm:inline">↑↓ to browse · ↵ to select</span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
