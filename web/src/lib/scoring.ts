/** One rung of the streak multiplier ladder. */
export interface MultiplierRung {
  streak: number;
  label: string;
  multiplier: number;
}

export const MULTIPLIER_LADDER: MultiplierRung[] = [
  { streak: 1, label: "Streak 1 · no streak", multiplier: 1 },
  { streak: 2, label: "Streak 2", multiplier: 1.25 },
  { streak: 3, label: "Streak 3 · POP", multiplier: 1.5 },
  { streak: 4, label: "Streak 4", multiplier: 1.75 },
  { streak: 5, label: "Streak 5+ · capped", multiplier: 2 },
];

/** Multiplier applied to a correct standard answer given the streak it lands on. */
export function multiplierForStreak(streak: number): number {
  if (streak <= 1) return 1;
  if (streak >= 5) return 2;
  return MULTIPLIER_LADDER[streak - 1].multiplier;
}

export interface Rank {
  name: string;
  min: number;
  max: number | null;
}

/** Rank ladder. The Perfect Run threshold equals the episode's maximum possible score. */
export function getRanks(maxScore: number): Rank[] {
  return [
    { name: "Vault Novice", min: 0, max: 4999 },
    { name: "R&B Scholar", min: 5000, max: 9999 },
    { name: "Vault Breaker", min: 10000, max: 14999 },
    { name: "Vault Master", min: 15000, max: 19999 },
    { name: "Platinum Player", min: 20000, max: 24999 },
    { name: "Legend of the Vault", min: 25000, max: maxScore - 1 },
    { name: "Perfect Run", min: maxScore, max: null },
  ];
}

export function rankIndexForScore(score: number, maxScore: number): number {
  const ranks = getRanks(maxScore);
  let index = 0;
  ranks.forEach((rank, i) => {
    if (score >= rank.min) index = i;
  });
  return index;
}

export function rankForScore(score: number, maxScore: number): Rank {
  return getRanks(maxScore)[rankIndexForScore(score, maxScore)];
}

export function nextRankForScore(score: number, maxScore: number): Rank | null {
  const ranks = getRanks(maxScore);
  return ranks[rankIndexForScore(score, maxScore) + 1] ?? null;
}

/** All amounts are denominated in VC (vault credits) — never "$". */
export function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")} VC`;
}

/** Value with a trailing "+", suffix placed after the number (e.g. "5,000+ VC"). */
export function formatMoneyPlus(value: number): string {
  return `${Math.round(value).toLocaleString("en-US")}+ VC`;
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}
