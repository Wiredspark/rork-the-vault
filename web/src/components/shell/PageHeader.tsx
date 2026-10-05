import { ArrowLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  crumb: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

/** Detail-page header with a breadcrumb back to the dashboard. */
export function PageHeader({ crumb, title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[15px]">
          <Link to="/" className="inline-flex items-center gap-2 font-medium text-vault-neon hover:text-vault-neonhi">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Dashboard
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-vault-muted" aria-hidden="true" />
          <span className="text-vault-ice/70" aria-current="page">
            {crumb}
          </span>
        </nav>
        <h1 className="mt-2 font-display text-[44px] font-medium leading-none text-vault-ice sm:text-[60px]">{title}</h1>
        {subtitle && <p className="mt-3 text-lg text-vault-ice/75">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
