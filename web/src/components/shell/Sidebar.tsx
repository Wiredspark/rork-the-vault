import { BrandMark } from "@/components/shell/BrandMark";
import { DrawerNav } from "@/components/shell/DrawerNav";
import { ModuleNav } from "@/components/shell/ModuleNav";

/** Contents of the concealed drawer menu, opened from the header menu button. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-5 pt-6">
        <BrandMark />
      </div>
      <div className="hairline opacity-60" />
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <DrawerNav onNavigate={onNavigate} />
        <ModuleNav onNavigate={onNavigate} />
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
