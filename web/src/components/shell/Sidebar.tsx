import { BrandMark } from "@/components/shell/BrandMark";
import { ModuleNav } from "@/components/shell/ModuleNav";

/** Contents of the concealed drawer menu, opened from the header menu button. */
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-6">
        <BrandMark />
      </div>
      <div className="hairline opacity-60" />
      <div className="flex-1 overflow-y-auto px-3 py-6">
        <ModuleNav onNavigate={onNavigate} />
      </div>
      <div className="mx-6 border-t border-vault-neon/15 py-8">
        <p className="text-[11px] font-medium uppercase leading-6 tracking-[0.3em] text-vault-muted">
          Different genres.
          <br />
          Same higher stakes.
        </p>
      </div>
    </div>
  );
}
