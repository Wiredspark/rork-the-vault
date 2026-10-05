import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { BrandMark } from "@/components/shell/BrandMark";
import { useAdminRole } from "@/hooks/use-admin-role";
import { DrawerNav } from "@/components/shell/DrawerNav";
import { ModuleNav } from "@/components/shell/ModuleNav";

/** Contents of the nav rail — persistent on desktop, drawer overlay on mobile. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, isFounder } = useAdminRole();
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-5 pt-6">
        <BrandMark />
      </div>
      <div className="hairline opacity-60" />
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <DrawerNav onNavigate={onNavigate} />
        <div className="hairline opacity-40" />
        <div className="pt-5">
          <ModuleNav onNavigate={onNavigate} />
        </div>
        {isAdmin && (
          <>
            <div className="hairline my-5 opacity-40" />
            <section aria-label="Admin">
              <p className="eyebrow-muted px-3.5 pb-2">Admin</p>
              <Link
                to="/admin"
                onClick={onNavigate}
                className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3.5 py-2.5 transition-colors hover:bg-white/[0.04]"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-vault-neon/20 bg-vault-ink/60">
                  <ShieldCheck className="h-4 w-4 text-vault-neon" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-[15px] font-medium text-vault-ice">Admin Hub</span>
                  <span className="mt-0.5 font-mono text-[10.5px] text-vault-muted">{isFounder ? "Founder · episodes & roles" : "Episodes & publishing"}</span>
                </span>
              </Link>
            </section>
          </>
        )}
      </div>
      <div className="mx-6 border-t border-vault-neon/15 py-5">
        <p className="text-[10.5px] font-medium uppercase leading-5 tracking-[0.3em] text-vault-muted">
          Different genres.
          <br />
          Same higher stakes.
        </p>
      </div>
    </div>
  );
}
