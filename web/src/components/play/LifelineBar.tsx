import { RefreshCw, Shield } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Half-filled circle glyph for the 50/50 lifeline. */
export function FiftyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3 A9 9 0 0 1 12 21 Z" fill="currentColor" />
      <path d="M12 3 V21" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

interface LifelineButtonProps {
  icon: ReactNode;
  name: string;
  hint: string;
  used: boolean;
  armed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: "md" | "lg";
}

export function LifelineButton({ icon, name, hint, used, armed, disabled, onClick, size = "md" }: LifelineButtonProps) {
  const inert = !onClick;
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || used || inert}
        aria-pressed={armed}
        aria-label={`${name}: ${used ? "used" : hint}`}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-2 rounded-lg border transition-all duration-200",
          size === "lg" ? "h-28 px-3" : "h-[74px] px-2",
          armed
            ? "animate-glow-pulse border-vault-neonhi bg-vault-neon/15"
            : "border-white/[0.08] bg-[linear-gradient(180deg,#1d1a22,#15131a)]",
          !used && !disabled && !inert && "hover:-translate-y-0.5 hover:border-vault-neon/60",
          (used || disabled) && "opacity-35",
          inert && !used && "cursor-default",
        )}
      >
        <span className={cn("text-vault-neon", size === "lg" ? "[&>svg]:h-9 [&>svg]:w-9" : "[&>svg]:h-6 [&>svg]:w-6")}>{icon}</span>
        <span className={cn("font-semibold text-vault-ice", size === "lg" ? "text-lg" : "text-sm")}>
          {used ? <s className="decoration-vault-neon/70">{name}</s> : name}
        </span>
      </button>
      <span className="text-[13px] leading-snug text-vault-ice/60">{used ? "Used" : armed ? "Armed for this question" : hint}</span>
    </div>
  );
}

interface LifelineBarProps {
  used: { fiftyFifty: boolean; shield: boolean; swap: boolean };
  shieldArmed?: boolean;
  isBonus?: boolean;
  canSwap?: boolean;
  locked?: boolean;
  onFifty?: () => void;
  onShield?: () => void;
  onSwap?: () => void;
  size?: "md" | "lg";
}

/** The three lifelines. Without handlers it renders as a read-only status panel. */
export function LifelineBar({ used, shieldArmed, isBonus, canSwap = true, locked, onFifty, onShield, onSwap, size }: LifelineBarProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <LifelineButton
        icon={<FiftyIcon />}
        name="50/50"
        hint="Remove two wrong answers"
        used={used.fiftyFifty}
        disabled={locked}
        onClick={onFifty}
        size={size}
      />
      <LifelineButton
        icon={<Shield />}
        name="Shield"
        hint={isBonus ? "Bonus misses are already safe" : "Protect your streak"}
        used={used.shield}
        armed={shieldArmed}
        disabled={locked || isBonus || shieldArmed}
        onClick={onShield}
        size={size}
      />
      <LifelineButton
        icon={<RefreshCw />}
        name="Swap"
        hint={isBonus ? "Bonus questions can't be swapped" : canSwap ? "Get a new question" : "No reserve left"}
        used={used.swap}
        disabled={locked || isBonus || !canSwap}
        onClick={onSwap}
        size={size}
      />
    </div>
  );
}
