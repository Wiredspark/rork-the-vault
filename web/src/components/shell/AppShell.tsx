import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { JourneyTrack } from "@/components/shell/JourneyTrack";
import { PlayerMenu } from "@/components/shell/PlayerMenu";
import { ScoreHUD } from "@/components/shell/ScoreHUD";
import { SidebarContent } from "@/components/shell/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** Shared chrome: drawer module menu plus sticky HUD bar (run progress, score, streak, player). */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-vault-neon px-3 py-2 text-vault-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[300px] border-vault-neon/15 bg-vault-ink p-0 text-vault-ice">
          <SheetTitle className="sr-only">Main menu</SheetTitle>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <header className="sticky top-0 z-40 border-b border-vault-neon/10 bg-vault-ink/85 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[1280px]">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:h-[88px] sm:px-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-vault-neon/20 text-vault-neon transition-colors hover:border-vault-neon/50 hover:bg-vault-neon/[0.06]"
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
        <div className="border-t border-vault-neon/[0.06] px-2.5 py-1 sm:px-4 lg:hidden">
          <JourneyTrack className="mx-auto max-w-[1280px]" />
        </div>
      </header>
      <main id="main" className="flex-1 px-4 pb-12 pt-5 sm:px-6">
        <div className="mx-auto w-full max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
