import { ChevronRight, Headphones, Lock } from "lucide-react";
import { NavLink } from "react-router-dom";
import { toast } from "sonner";

import { VAULT_MODULES } from "@/data/modules";
import { cn } from "@/lib/utils";

interface ModuleNavProps {
  onNavigate?: () => void;
}

/** Sidebar list of trivia modules. Only live modules are navigable. */
export function ModuleNav({ onNavigate }: ModuleNavProps) {
  return (
    <nav aria-label="Vault modules">
      <ul className="flex flex-col gap-1.5">
        {VAULT_MODULES.map((module) =>
          module.status === "live" ? (
            <li key={module.id}>
              <NavLink
                to="/"
                end
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-vault-neon/60 px-4 py-3.5",
                  "bg-[linear-gradient(90deg,rgba(207,171,92,0.22),rgba(207,171,92,0.06))]",
                  "shadow-[inset_3px_0_0_#CFAB5C] transition-colors hover:border-vault-neon",
                )}
              >
                <Headphones className="h-6 w-6 text-vault-neon" aria-hidden="true" />
                <span className="flex-1 text-[17px] font-medium text-vault-ice">{module.name}</span>
                <ChevronRight className="h-4 w-4 text-vault-neon" aria-hidden="true" />
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
                className="group flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                aria-label={`${module.name} — coming soon`}
              >
                <Lock className="h-5 w-5 text-vault-muted transition-colors group-hover:text-vault-neon/70" aria-hidden="true" />
                <span className="flex flex-col">
                  <span className="text-[16px] text-vault-ice/75">{module.name}</span>
                  <span className="text-[13px] text-vault-muted">Coming Soon</span>
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
