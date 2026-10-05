import { ChevronRight, Headphones, Home, Lock } from "lucide-react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";

import { VAULT_MODULES } from "@/data/modules";
import { cn } from "@/lib/utils";

interface ModuleNavProps {
  onNavigate?: () => void;
}

const ITEM_BASE =
  "flex items-center gap-3 rounded-lg px-4 py-3.5 text-left transition-colors" as const;

/** Drawer navigation: a dashboard entry plus the trivia modules, each with an icon and a clear text label. */
export function ModuleNav({ onNavigate }: ModuleNavProps) {
  return (
    <nav aria-label="Main menu">
      <p className="eyebrow-muted px-4 pb-2">Menu</p>
      <ul className="flex flex-col gap-1.5">
        <li>
          <NavLink
            to="/"
            end
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                ITEM_BASE,
                "border",
                isActive
                  ? "border-vault-neon/60 bg-[linear-gradient(90deg,rgba(207,171,92,0.22),rgba(207,171,92,0.06))] shadow-[inset_3px_0_0_#CFAB5C]"
                  : "border-transparent hover:bg-white/[0.04]",
              )
            }
          >
            <Home className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            <span className="flex-1 text-[16px] font-medium text-vault-ice">Dashboard</span>
            <ChevronRight className="h-4 w-4 text-vault-ice/40" aria-hidden="true" />
          </NavLink>
        </li>
      </ul>

      <p className="eyebrow-muted px-4 pb-2 pt-6">Modules</p>
      <ul className="flex flex-col gap-1.5">
        {VAULT_MODULES.map((module) =>
          module.status === "live" ? (
            <li key={module.id}>
              <NavLink
                to="/"
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    ITEM_BASE,
                    "border",
                    isActive
                      ? "border-vault-neon/60 bg-[linear-gradient(90deg,rgba(207,171,92,0.22),rgba(207,171,92,0.06))] shadow-[inset_3px_0_0_#CFAB5C]"
                      : "border-transparent hover:bg-white/[0.04]",
                  )
                }
              >
                <Headphones className="h-6 w-6 text-vault-neon" aria-hidden="true" />
                <span className="flex-1 text-[16px] font-medium text-vault-ice">{module.name}</span>
                <span className="rounded-sm bg-vault-neon/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">
                  Live
                </span>
              </NavLink>
            </li>
          ) : (
            <li key={module.id}>
              <button
                type="button"
                onClick={() =>
                  toast(`${module.name} is still sealed`, {
                    description: "New genres are coming soon. Different genres, same higher stakes.",
                  })
                }
                className={cn(ITEM_BASE, "w-full hover:bg-white/[0.03]")}
                aria-label={`${module.name} — coming soon`}
              >
                <Lock className="h-5 w-5 shrink-0 text-vault-muted transition-colors group-hover:text-vault-neon/70" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-[15px] text-vault-ice/75">{module.name}</span>
                  <span className="text-[12px] text-vault-muted">Coming Soon</span>
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
