import { Menu } from "lucide-react";
import { useState, type ReactNode } from "react";

import { JourneyTrack } from "@/components/shell/JourneyTrack";
import { PlayerMenu } from "@/components/shell/PlayerMenu";
import { ScoreHUD } from "@/components/shell/ScoreHUD";
import { Sidebar, SidebarContent } from "@/components/shell/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** Shared chrome: module sidebar plus sticky HUD bar (run progress, score, streak, player). */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <div className="flex min-h-screen">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-vault-neon px-3 py-2 text-vault-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[290px] border-vault-neon/15 bg-vault-ink p-0 text-vault-ice">
          <SheetTitle className="sr-only">Vault modules</SheetTitle>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-vault-neon/10 bg-vault-ink/85 backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-3 px-4 sm:h-[88px] sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-vault-neon/20 text-vault-neon lg:hidden"
              aria-label="Open modules menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <JourneyTrack className="hidden w-[440px] min-[1400px]:flex 2xl:w-[500px]" />
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
          <div className="border-t border-vault-neon/[0.06] px-2.5 py-1 sm:px-4 lg:px-6 min-[1400px]:hidden">
            <JourneyTrack className="mx-auto max-w-[1280px]" />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 pb-12 pt-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1280px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
