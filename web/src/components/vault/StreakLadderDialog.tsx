import { Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MULTIPLIER_LADDER, formatMultiplier } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/** Explains the streak multiplier ladder and lifeline rules. */
export function StreakLadderDialog({ children, currentStreak }: { children: ReactNode; currentStreak: number }) {
  const activeRung = Math.min(Math.max(currentStreak, 1), 5);
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md border-vault-neon/25 bg-vault-panel text-vault-ice">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-medium">
            <Zap className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            Streak Multiplier
          </DialogTitle>
          <DialogDescription className="text-vault-ice/70">
            Consecutive correct answers multiply each standard payout.
          </DialogDescription>
        </DialogHeader>
        <ol className="mt-2 flex flex-col gap-1.5">
          {MULTIPLIER_LADDER.map((rung) => (
            <li
              key={rung.streak}
              className={cn(
                "flex items-center justify-between rounded-md border px-4 py-2.5",
                rung.streak === activeRung && currentStreak > 0
                  ? "border-vault-neon bg-vault-neon/10"
                  : "border-white/[0.06] bg-white/[0.02]",
              )}
            >
              <span className="text-sm text-vault-ice/85">{rung.label}</span>
              <span className={cn("font-display text-xl tabular", rung.streak >= 3 ? "text-vault-neonhi" : "text-vault-ice")}>
                {formatMultiplier(rung.multiplier)}
              </span>
            </li>
          ))}
        </ol>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-vault-ice/70">
          <li>• Wrong answers and timeouts on standard questions break the streak.</li>
          <li>• Missed bonus questions never break the streak.</li>
          <li>• Streaks reset at every round boundary.</li>
          <li>• Shield lifeline preserves your streak on one wrong answer.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
