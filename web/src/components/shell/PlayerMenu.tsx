import { ChevronDown, CloudAlert, CloudCheck, Loader2, LogOut, RotateCcw, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getEpisodesForModule } from "@/lib/episode";
import { initialsFor, useAuth } from "@/providers/AuthProvider";
import { useGame, type SyncStatus } from "@/providers/GameProvider";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning,";
  if (hour < 18) return "Good afternoon,";
  return "Good evening,";
}

const SYNC_COPY: Record<SyncStatus, string> = {
  synced: "Progress saved to your account.",
  syncing: "Saving progress…",
  error: "Saved on this device. Retrying sync.",
};

function SyncIcon({ status }: { status: SyncStatus }) {
  if (status === "syncing") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (status === "error") return <CloudAlert className="h-3.5 w-3.5 text-vault-danger" aria-hidden="true" />;
  return <CloudCheck className="h-3.5 w-3.5 text-vault-success" aria-hidden="true" />;
}

/** Signed-in player chip with run, episode and account controls. */
export function PlayerMenu() {
  const { episode, soundOn, syncStatus, toggleSound, resetRun, loadDemo, selectEpisode } = useGame();
  const { user, displayName, signOut } = useAuth();
  const navigate = useNavigate();
  const episodes = getEpisodesForModule("rnb");

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/auth", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't sign out. Try again.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-3 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-white/[0.04]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-vault-neon/40 bg-[radial-gradient(circle_at_35%_30%,#2A2415,#101815)] font-mono text-sm font-medium text-vault-neonhi shadow-[0_0_18px_-6px_rgba(207,171,92,0.6)] sm:h-12 sm:w-12 sm:text-base">
          {initialsFor(displayName)}
        </span>
        <span className="hidden max-w-[160px] flex-col text-left leading-tight xl:flex">
          <span className="text-sm text-vault-ice/80">{greeting()}</span>
          <span className="truncate text-[15px] font-semibold text-vault-ice">{displayName}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-vault-ice/70" aria-hidden="true" />
        <span className="sr-only">Open player menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[80vh] w-72 overflow-y-auto border-vault-neon/20 bg-vault-surface text-vault-ice">
        <div className="px-2 pb-2 pt-1.5">
          <p className="truncate text-sm font-semibold text-vault-ice">{displayName}</p>
          <p className="truncate text-xs text-vault-muted">{user?.email}</p>
        </div>
        <DropdownMenuSeparator className="bg-vault-neon/15" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <span className="eyebrow-muted">Episode</span>
            <span className="ml-auto font-mono text-xs text-vault-neon">{episode.id}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[60vh] w-72 overflow-y-auto border-vault-neon/20 bg-vault-surface text-vault-ice">
            <DropdownMenuLabel className="eyebrow-muted">R&B Vault episode</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={episode.id}
              onValueChange={(id) => {
                selectEpisode(id);
                navigate("/");
              }}
            >
              {episodes.map((ep) => (
                <DropdownMenuRadioItem key={ep.id} value={ep.id} className="gap-2">
                  <span className="font-mono text-xs text-vault-neon">{ep.id}</span>
                  <span className="truncate text-vault-ice/80">{ep.title}</span>
                  {ep.status === "draft" && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold uppercase tracking-wider text-vault-muted">Draft</span>
                  )}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className="bg-vault-neon/15" />
        <DropdownMenuItem onSelect={toggleSound} className="gap-2">
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          Sound {soundOn ? "on" : "off"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            loadDemo();
            navigate("/");
            toast("Demo progress loaded", { description: "Round 1 cleared, Round 2 underway." });
          }}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Load demo progress
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            resetRun();
            navigate("/");
            toast(`${episode.id} reset`, { description: "Fresh run. The vault is sealed again." });
          }}
          className="gap-2 text-vault-danger focus:text-vault-danger"
        >
          <RotateCcw className="h-4 w-4" />
          Reset this run
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-vault-neon/15" />
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-vault-neon/15" />
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-vault-muted" role="status" aria-live="polite">
          <SyncIcon status={syncStatus} />
          {SYNC_COPY[syncStatus]}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
