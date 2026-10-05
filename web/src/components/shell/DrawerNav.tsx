import { BarChart3, Disc3, Gauge, Home, KeyRound, Play, Trophy, Zap, type LucideIcon } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";
import { useShellUI } from "@/providers/ShellUIProvider";

const ROW =
  "group flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors outline-none focus-visible:ring-1 focus-visible:ring-vault-neon/60" as const;
const ACTIVE =
  "border-vault-neon/60 bg-[linear-gradient(90deg,rgba(207,171,92,0.22),rgba(207,171,92,0.06))] shadow-[inset_3px_0_0_#CFAB5C]" as const;
const IDLE = "border-transparent hover:bg-white/[0.04]" as const;

function RowBody({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint?: string }) {
  return (
    <>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-vault-neon/20 bg-vault-ink/60">
        <Icon className="h-4 w-4 text-vault-neon" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[15px] font-medium text-vault-ice">{label}</span>
        {hint && <span className="mt-0.5 truncate font-mono text-[10.5px] text-vault-muted tabular">{hint}</span>}
      </span>
    </>
  );
}

function RouteItem({ to, icon, label, hint, onNavigate }: { to: string; icon: LucideIcon; label: string; hint?: string; onNavigate?: () => void }) {
  return (
    <li>
      <NavLink to={to} end onClick={onNavigate} className={({ isActive }) => cn(ROW, isActive ? ACTIVE : IDLE)}>
        <RowBody icon={icon} label={label} hint={hint} />
      </NavLink>
    </li>
  );
}

function ActionItem({ icon, label, hint, onSelect }: { icon: LucideIcon; label: string; hint?: string; onSelect: () => void }) {
  return (
    <li>
      <button type="button" onClick={onSelect} className={cn(ROW, IDLE)} aria-haspopup="dialog">
        <RowBody icon={icon} label={label} hint={hint} />
      </button>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="pb-5">
      <p className="eyebrow-muted px-3.5 pb-2">{title}</p>
      <ul className="flex flex-col gap-1">{children}</ul>
    </section>
  );
}

/** Drawer sections mirroring every dashboard destination: Play, Compete, Episodes. */
export function DrawerNav({ onNavigate }: { onNavigate?: () => void }) {
  const { episode, status, state, knownDigits, multiplier } = useGame();
  const { runAfterMenuClose, openLeaderboard, setStreakOpen, setPickerOpen } = useShellUI();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const playHint =
    status === "fresh"
      ? `${episode.id} · Round 1 ready`
      : status === "playing"
        ? `${episode.id} · Round ${state.roundIndex + 1} in progress`
        : `${episode.id} · rounds complete`;
  const vaultHint =
    state.vaultOutcome === "cracked"
      ? "Cracked"
      : state.vaultOutcome === "sealed"
        ? "Sealed"
        : `${knownDigits.length}/${episode.vaultCode.length} digits · ${3 - state.vaultAttempts} tries left`;

  return (
    <nav aria-label="Main menu">
      <Section title="Play">
        <RouteItem to="/" icon={Home} label="Dashboard" hint="Home · current episode" onNavigate={onNavigate} />
        <RouteItem to="/play" icon={Play} label={status === "playing" ? "Continue Run" : "Play Rounds"} hint={playHint} onNavigate={onNavigate} />
        <RouteItem to="/vault" icon={KeyRound} label="Vault Chamber" hint={vaultHint} onNavigate={onNavigate} />
        <RouteItem to="/results" icon={BarChart3} label="Results" hint={status === "complete" ? "Final score" : "Score so far"} onNavigate={onNavigate} />
      </Section>

      <Section title="Compete">
        <ActionItem icon={Trophy} label="Leaderboard" hint="Top 10 · your global rank" onSelect={() => runAfterMenuClose(() => openLeaderboard("standings"))} />
        <ActionItem icon={Gauge} label="Career Stats" hint="All time · week · episode" onSelect={() => runAfterMenuClose(() => openLeaderboard("stats"))} />
      </Section>

      <Section title="Episodes">
        <ActionItem
          icon={Disc3}
          label="Choose Episode"
          hint={`Now: ${episode.id} · ${episode.title}`}
          onSelect={() =>
            runAfterMenuClose(() => {
              if (pathname !== "/") navigate("/");
              // Let the dashboard (and its picker anchor) mount before opening.
              window.setTimeout(() => setPickerOpen(true), pathname === "/" ? 0 : 60);
            })
          }
        />
        <ActionItem
          icon={Zap}
          label="Streak Guide"
          hint={`Streak ${state.streak} · ${multiplier.toFixed(2)}×`}
          onSelect={() => runAfterMenuClose(() => setStreakOpen(true))}
        />
      </Section>
    </nav>
  );
}
