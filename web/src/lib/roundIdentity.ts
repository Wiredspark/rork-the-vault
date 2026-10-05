import type { CSSProperties } from "react";

/** A round's accent identity. Accent-only: never applied to interactive elements, which stay in the vault palette. */
export interface RoundIdentity {
  hex: string;
  /** Space-separated RGB channels for `rgb(var(--round-rgb) / α)`. */
  rgb: string;
}

/** Keyed by round position (R1 Radio Hits, R2 Deep Cuts, R3 Hidden Gems) so every episode format shares the same rhythm. */
const ROUND_IDENTITIES: RoundIdentity[] = [
  { hex: "#7FFF50", rgb: "127 255 80" },
  { hex: "#22D3EE", rgb: "34 211 238" },
  { hex: "#F472B6", rgb: "244 114 182" },
];

export function roundIdentity(roundIndex: number): RoundIdentity {
  return ROUND_IDENTITIES[Math.abs(roundIndex) % ROUND_IDENTITIES.length];
}

/** Scopes the `round` Tailwind color (text-round, bg-round/20…) to this round for everything inside. */
export function roundStyle(roundIndex: number): CSSProperties {
  return { "--round-rgb": roundIdentity(roundIndex).rgb } as CSSProperties;
}
