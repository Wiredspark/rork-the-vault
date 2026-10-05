import { Menu } from "lucide-react";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

import { JourneyTrack } from "@/components/shell/JourneyTrack";
import { PlayerMenu } from "@/components/shell/PlayerMenu";
import { ScoreHUD } from "@/components/shell/ScoreHUD";
import { SidebarContent } from "@/components/shell/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LeaderboardDialog } from "@/components/vault/Leaderboard";
import { StreakLadderDialog } from "@/components/vault/StreakLadderDialog";
import { useGame } from "@/providers/GameProvider";
import { useShellUI } from "@/providers/ShellUIProvider";

/** Swipe threshold (px) before the mobile drawer dismisses. */
const SWIPE_CLOSE_PX = 72;

/** Shared chrome: persistent nav rail on desktop, swipeable drawer overlay on mobile, plus the sticky HUD bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const { menuOpen, setMenuOpen, flushAfterMenuClose, streakOpen, setStreakOpen } = useShellUI();
  const { state } = useGame();

  // Mobile drawer drag-to-dismiss (left swipe). Desktop uses the persistent rail instead.
  const [dragX, setDragX] = useState<number>(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, horizontal: false };
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const start = touch.current;
    if (!start) return;
    const t = event.touches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (!start.horizontal) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (start.horizontal && dx < 0) setDragX(dx);
  };

  const onTouchEnd = () => {
    if (dragX < -SWIPE_CLOSE_PX) setMenuOpen(false);
    setDragX(0);
    touch.current = null;
  };

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-vault-neon px-3 py-2 text-vault-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside
        aria-label="Main menu"
        className="sticky top-0 hidden h-screen w-[288px] shrink-0 border-r border-vault-neon/15 bg-vault-ink lg:block"
      >
        <SidebarContent />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side="left"
            className="w-[300px] border-vault-neon/15 bg-vault-ink p-0 text-vault-ice lg:hidden"
            style={{
              transform: dragX ? `translateX(${dragX}px)` : undefined,
              transitionDuration: dragX ? "0ms" : undefined,
            }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onCloseAutoFocus={(event) => {
              if (flushAfterMenuClose()) event.preventDefault();
            }}
          >
            <SheetTitle className="sr-only">Main menu</SheetTitle>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <LeaderboardDialog />
        <StreakLadderDialog currentStreak={state.streak} open={streakOpen} onOpenChange={setStreakOpen} />

        <header className="sticky top-0 z-40 border-b border-vault-neon/10 bg-vault-ink/85 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-[1280px]">
            <div className="flex h-[72px] items-center gap-3 px-4 sm:h-[88px] sm:px-6">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-vault-neon/20 text-vault-neon transition-colors hover:border-vault-neon/50 hover:bg-vault-neon/[0.06] lg:hidden"
                aria-label="Open main menu"
                aria-haspopup="dialog"
              >
                <Menu className="h-5 w-5" />
              </button>
              <JourneyTrack className="hidden min-w-0 flex-1 lg:flex" />
              <div className="ml-auto flex items-center gap-2 sm:gap-6">
                <div className="sm:hidden">
                  <ScoreHUD compact />
                </div>
                <div className="hidden sm:block">
                  <ScoreHUD />
                </div>
                <div className="hidden h-12 w-px bg-vault-neon/15 sm:block" />
                <PlayerMenu />
              </div>
            </div>
          </div>
          <div className="border-t border-vault-neon/[0.06] px-2.5 py-1 lg:hidden">
            <JourneyTrack className="mx-auto max-w-[1280px]" />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pb-12 pt-5 sm:px-6">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
