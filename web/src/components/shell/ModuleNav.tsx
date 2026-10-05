import { Headphones, Lock } from "lucide-react";
import { NavLink } from "react-router-dom";

import { VAULT_MODULES } from "@/data/modules";
import { cn } from "@/lib/utils";

interface ModuleNavProps {
  onNavigate?: () => void;
}

const ITEM_BASE = "flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left transition-colors" as const;

/** Drawer "Modules" section: the live genre plus a single muted coming-soon note — kept lean on purpose. */
export function ModuleNav({ onNavigate }: ModuleNavProps) {
  return (
    <section aria-label="Modules">
      <p className="eyebrow-muted px-3.5 pb-2">Modules</p>
      <ul className="flex flex-col gap-1">
        {VAULT_MODULES.map((module) =>
          module.status === "live" ? (
            <li key={module.id}>
              <NavLink to="/" onClick={onNavigate} className={cn(ITEM_BASE, "hover:bg-white/[0.04]")}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-vault-neon/20 bg-vault-ink/60">
                  <Headphones className="h-4 w-4 text-vault-neon" aria-hidden="true" />
                </span>
                <span className="flex-1 text-[15px] font-medium text-vault-ice">{module.name}</span>
                <span className="rounded-sm bg-vault-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">
                  Live
                </span>
              </NavLink>
            </li>
          ) : null,
        )}
        <li>
          <div className={cn(ITEM_BASE, "opacity-60")} aria-label="More genres coming soon">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-vault-line">
              <Lock className="h-3.5 w-3.5 text-vault-muted" aria-hidden="true" />
            </span>
            <span className="flex-1 text-[14px] text-vault-ice/70">More genres</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vault-muted">Soon</span>
          </div>
        </li>
      </ul>
    </section>
  );
}
