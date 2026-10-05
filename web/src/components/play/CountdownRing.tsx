import { cn } from "@/lib/utils";

interface CountdownRingProps {
  remaining: number;
  total: number;
}

/** Circular countdown for the active question. */
export function CountdownRing({ remaining, total }: CountdownRingProps) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, remaining / total));
  const urgent = remaining <= 5;
  const seconds = Math.ceil(remaining);
  return (
    <div className="relative h-16 w-16 shrink-0" role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
        <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={urgent ? "#FF5A64" : "#CFAB5C"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s" }}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-display text-2xl tabular",
          urgent ? "animate-timer-urgent text-vault-danger" : "text-vault-ice",
        )}
      >
        {seconds}
      </span>
    </div>
  );
}
