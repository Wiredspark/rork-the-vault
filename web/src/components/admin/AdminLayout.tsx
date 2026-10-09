import { ArrowLeft, Crown, Library, LogOut, ShieldAlert, ShieldCheck, Swords, UsersRound } from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { AuthLoading } from "@/components/auth/AuthLoading";
import { useAdminRole } from "@/hooks/use-admin-role";
import { cn } from "@/lib/utils";
import { initialsFor, useAuth } from "@/providers/AuthProvider";

const TAB =
  "inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3.5 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60" as const;

function AccessDenied() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="neon-card w-full max-w-md p-7 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-vault-danger" aria-hidden="true" />
        <h1 className="mt-4 font-display text-2xl font-medium text-vault-ice">No admin access</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-vault-ice/70">
          <span className="text-vault-ice">{user?.email}</span> isn't on the admin roster. Ask the founding admin to promote this account.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => navigate("/")} className="ghost-neon-button h-11">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the game
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOut().catch(() => undefined);
              navigate("/admin/login", { replace: true });
            }}
            className="neon-button h-11"
          >
            Use another account
          </button>
        </div>
      </div>
    </div>
  );
}

/** Admin hub gate + chrome. Access is decided by the server-side admin roster, never client state alone. */
export function AdminLayout() {
  const { user, displayName, signOut } = useAuth();
  const { role, isAdmin, isLoading, isError } = useAdminRole();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) return <AuthLoading />;
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center" role="alert">
        <p className="text-vault-ice/80">Couldn't verify admin access. Check your connection.</p>
        <button type="button" className="neon-button h-11" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  if (!isAdmin) return <AccessDenied />;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-vault-neon/10 bg-vault-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 px-4 sm:px-6">
          <NavLink to="/admin" end className="flex items-center gap-2.5 rounded-md">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-vault-neon/40 bg-vault-neon/10">
              <ShieldCheck className="h-[18px] w-[18px] text-vault-neon" aria-hidden="true" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-display text-[15px] font-medium text-vault-ice">The Vault</span>
              <span className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.24em] text-vault-neon">Admin hub</span>
            </span>
          </NavLink>

          <nav aria-label="Admin sections" className="ml-2 flex items-center gap-1 overflow-x-auto sm:ml-6">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => cn(TAB, isActive || location.pathname.startsWith("/admin/episodes") ? "bg-vault-neon/15 text-vault-neonhi" : "text-vault-ice/65 hover:text-vault-ice")}
            >
              <Library className="h-4 w-4" aria-hidden="true" />
              Episodes
            </NavLink>
            <NavLink to="/admin/roles" className={({ isActive }) => cn(TAB, isActive ? "bg-vault-neon/15 text-vault-neonhi" : "text-vault-ice/65 hover:text-vault-ice")}>
              <UsersRound className="h-4 w-4" aria-hidden="true" />
              Admins
            </NavLink>
            <NavLink to="/admin/arena" className={({ isActive }) => cn(TAB, isActive ? "bg-vault-neon/15 text-vault-neonhi" : "text-vault-ice/65 hover:text-vault-ice")}>
              <Swords className="h-4 w-4" aria-hidden="true" />
              Arena
            </NavLink>
            <NavLink to="/admin/tournaments" className={({ isActive }) => cn(TAB, isActive ? "bg-vault-neon/15 text-vault-neonhi" : "text-vault-ice/65 hover:text-vault-ice")}>
              <Crown className="h-4 w-4" aria-hidden="true" />
              Tournaments
            </NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NavLink to="/" className="hidden h-10 items-center gap-2 rounded-md px-3 text-[13.5px] text-vault-ice/70 transition-colors hover:text-vault-neon md:inline-flex">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Play
            </NavLink>
            <span className="hidden flex-col items-end leading-tight lg:flex">
              <span className="text-[13.5px] font-medium text-vault-ice">{displayName}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-vault-neon">{role === "founder" ? "Founding admin" : "Admin"}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-vault-neon/40 font-mono text-[12px] text-vault-neonhi" aria-hidden="true">
              {initialsFor(displayName)}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut();
                  navigate("/admin/login", { replace: true });
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Couldn't sign out.");
                }
              }}
              className="flex h-10 w-10 items-center justify-center rounded-md text-vault-muted transition-colors hover:bg-white/[0.04] hover:text-vault-ice"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1 px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto w-full max-w-[1320px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
