import { roundStyle } from "@/lib/roundIdentity";
import { cn } from "@/lib/utils";

/** Small round-identity marker for HUD labels, tables and kickers. Decorative; the round name always carries the meaning. */
export function RoundDot({ roundIndex, className, glow = false }: { roundIndex: number; className?: string; glow?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={roundStyle(roundIndex)}
      className={cn(
        "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-round",
        glow && "shadow-[0_0_8px_rgb(var(--round-rgb)/0.7)]",
        className,
      )}
    />
  );
}
