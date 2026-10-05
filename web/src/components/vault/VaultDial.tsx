import { useId } from "react";

import { cn } from "@/lib/utils";

interface VaultDialProps {
  className?: string;
  spinning?: boolean;
}

/** Graphite combination-dial glyph with a neon ring, used for the brand mark and unlock sequence. */
export function VaultDial({ className, spinning = false }: VaultDialProps) {
  const id = useId().replace(/:/g, "");
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <svg viewBox="0 0 100 100" className={cn("shrink-0", className)} aria-hidden="true">
      <defs>
        <radialGradient id={`knob-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F6DDA4" />
          <stop offset="45%" stopColor="#CFAB5C" />
          <stop offset="100%" stopColor="#6E5022" />
        </radialGradient>
        <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#EAD9A8" />
          <stop offset="50%" stopColor="#9A7B3F" />
          <stop offset="100%" stopColor="#EAD9A8" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke={`url(#ring-${id})`} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="#CFAB5C" strokeOpacity="0.45" strokeWidth="1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <circle
          key={deg}
          cx={50 + 44 * Math.cos((deg * Math.PI) / 180)}
          cy={50 + 44 * Math.sin((deg * Math.PI) / 180)}
          r="1.6"
          fill="#CFAB5C"
        />
      ))}
      <g className={spinning ? "animate-dial-spin" : undefined} style={{ transformOrigin: "50px 50px" }}>
        {ticks.map((i) => {
          const angle = (i * 6 * Math.PI) / 180;
          const long = i % 5 === 0;
          const r1 = long ? 31 : 34;
          return (
            <line
              key={i}
              x1={50 + r1 * Math.cos(angle)}
              y1={50 + r1 * Math.sin(angle)}
              x2={50 + 37.5 * Math.cos(angle)}
              y2={50 + 37.5 * Math.sin(angle)}
              stroke="#CFAB5C"
              strokeOpacity={long ? 0.95 : 0.5}
              strokeWidth={long ? 1.4 : 0.7}
            />
          );
        })}
        <circle cx="50" cy="50" r="24" fill={`url(#knob-${id})`} stroke="#3A2C14" strokeWidth="1" />
        <circle cx="50" cy="50" r="17" fill="none" stroke="#3A2C14" strokeOpacity="0.5" strokeWidth="0.8" />
        <circle cx="50" cy="50" r="10" fill="none" stroke="#3A2C14" strokeOpacity="0.4" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="3" fill="#3A2C14" />
      </g>
      <path d="M50 8 L53 14 L47 14 Z" fill="#EAD9A8" />
    </svg>
  );
}
