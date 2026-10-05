import { CalendarClock, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatWhen } from "@/lib/admin/api";
import type { LiveState } from "@/lib/admin/episodeDraft";
import { cn } from "@/lib/utils";

export const INPUT =
  "h-11 w-full rounded-md border border-vault-line bg-vault-ink/60 px-3 text-[14.5px] text-vault-ice placeholder:text-vault-muted/60 transition-colors hover:border-vault-neon/30 focus:border-vault-neon/70 focus:outline-none focus:shadow-[0_0_0_3px_rgba(207,171,92,0.12)] disabled:cursor-not-allowed disabled:opacity-60" as const;

export const TEXTAREA =
  "w-full resize-y rounded-md border border-vault-line bg-vault-ink/60 px-3 py-2.5 text-[14.5px] leading-relaxed text-vault-ice placeholder:text-vault-muted/60 transition-colors hover:border-vault-neon/30 focus:border-vault-neon/70 focus:outline-none focus:shadow-[0_0_0_3px_rgba(207,171,92,0.12)]" as const;

/** Labelled form control wrapper used across the admin hub. */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="hud-label text-[10px] text-vault-ice/60">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] leading-snug text-vault-muted">{hint}</p>}
    </div>
  );
}

/** Titled card section. */
export function Panel({
  title,
  icon: Icon,
  action,
  className,
  id,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("neon-card p-5", className)} aria-labelledby={id}>
      <header className="mb-4 flex items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-vault-neon" aria-hidden="true" />}
        <h2 id={id} className="font-display text-[16px] font-medium text-vault-ice">
          {title}
        </h2>
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Draft / Scheduled / Live publication chip. */
export function StatusPill({ state, publishAt, className }: { state: LiveState; publishAt?: string | null; className?: string }) {
  const base = "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em]";
  if (state === "live") {
    return (
      <span className={cn(base, "border-vault-success/40 bg-vault-success/10 text-vault-success", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-vault-success shadow-[0_0_6px_#3FE0A8]" aria-hidden="true" />
        Live
      </span>
    );
  }
  if (state === "scheduled") {
    return (
      <span className={cn(base, "border-vault-neon/50 bg-vault-neon/10 text-vault-neonhi", className)}>
        <CalendarClock className="h-3 w-3" aria-hidden="true" />
        Scheduled{publishAt ? ` · ${formatWhen(publishAt)}` : ""}
      </span>
    );
  }
  return <span className={cn(base, "border-dashed border-vault-muted/50 text-vault-muted", className)}>Draft</span>;
}
