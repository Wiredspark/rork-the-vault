import { Lock } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type DigitTileState = "free" | "revealed" | "guess" | "scrambled" | "locked" | "awaiting";

interface DigitTileProps {
  value: string | null;
  state: DigitTileState;
  size?: "lg" | "sm";
  active?: boolean;
  delayMs?: number;
  label: string;
}

function ScrambleDigit() {
  const [digit, setDigit] = useState<number>(() => Math.floor(Math.random() * 10));
  useEffect(() => {
    const id = window.setInterval(() => setDigit(Math.floor(Math.random() * 10)), 90);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular opacity-40 blur-[1.5px]">{digit}</span>;
}

/** One graphite flip-tile with a neon edge in the 4-digit vault code. */
export const DigitTile = memo(function DigitTile({
  value,
  state,
  size = "lg",
  active = false,
  delayMs = 0,
  label,
}: DigitTileProps) {
  const isLarge = size === "lg";
  const showsValue = (state === "free" || state === "revealed" || state === "guess") && value !== null;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "neon-tile flex items-center justify-center p-[7%]",
        isLarge ? "aspect-[4/5] w-full" : "h-14 w-11",
        active && "animate-glow-pulse",
      )}
    >
      <span className="pointer-events-none absolute left-2 top-2 h-1 w-1 rounded-full bg-vault-neonhi/60" />
      <span className="pointer-events-none absolute right-2 top-2 h-1 w-1 rounded-full bg-vault-neonhi/60" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-1 w-1 rounded-full bg-vault-neonhi/60" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-1 w-1 rounded-full bg-vault-neonhi/60" />
      <div
        className={cn(
          "relative flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-black/70",
          "bg-[linear-gradient(180deg,#1c1a20_0%,#141217_49.5%,#0d0c10_50.5%,#17151b_100%)]",
          "shadow-[inset_0_2px_10px_rgba(0,0,0,0.85)]",
        )}
      >
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/80" />
        <span
          key={`${state}-${value ?? "x"}`}
          className={cn(
            "font-display leading-none tabular",
            isLarge ? "text-[clamp(3rem,9vw,6.5rem)]" : "text-2xl",
            showsValue && "animate-digit-flip",
            state === "free" && "text-vault-neonhi",
            state === "revealed" && "text-vault-ice",
            state === "guess" && "text-vault-ice/90 italic",
            (state === "locked" || state === "awaiting") && "text-vault-neon",
            state === "scrambled" && "text-vault-muted",
          )}
          style={showsValue ? { animationDelay: `${delayMs}ms` } : undefined}
        >
          {showsValue && value}
          {state === "scrambled" && <ScrambleDigit />}
          {state === "awaiting" && "?"}
          {state === "locked" &&
            (isLarge ? (
              <span className="flex flex-col items-center gap-2">
                <span>?</span>
                <Lock className="h-4 w-4 text-vault-muted" aria-hidden="true" />
              </span>
            ) : (
              "?"
            ))}
        </span>
      </div>
    </div>
  );
});
