import poolData from "./pool.json";
import type { ArenaExclusions } from "./protocol";

export interface PoolQuestion {
  id: string;
  ep: string;
  d: string;
  q: string;
  c: string[];
  a: number;
  f: string;
  y: number | null;
}

export interface PoolDigitQuestion extends PoolQuestion {
  di: number;
  dv: string;
}

export interface PoolVault {
  ep: string;
  title: string;
  code: string;
  free: number[];
  story: string;
  digits: PoolDigitQuestion[];
}

interface PoolFile {
  questions: PoolQuestion[];
  vaults: PoolVault[];
}

const POOL = poolData as unknown as PoolFile;

/** A question as served in a match: choices shuffled per match so the bundled answer index can't be reused. */
export interface MatchQuestion {
  id: string;
  episodeId: string;
  difficulty: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  fact: string;
  digitIndex: number | null;
  digit: string | null;
}

export interface MatchSet {
  questions: MatchQuestion[];
  suddenDeath: MatchQuestion[];
  vault: { episodeId: string; title: string; code: string; freeIndexes: number[]; story: string };
}

export const POOL_OPTIONS: { id: string; label: string }[] = [
  { id: "all", label: "All released episodes" },
  { id: "pre90", label: "Classic era · before 1990" },
  { id: "90s", label: "The '90s" },
  { id: "2000s", label: "2000s and beyond" },
];

function inPool(q: PoolQuestion, pool: string): boolean {
  if (pool === "all" || q.y === null) return pool === "all";
  if (pool === "pre90") return q.y < 1990;
  if (pool === "90s") return q.y >= 1990 && q.y < 2000;
  if (pool === "2000s") return q.y >= 2000;
  return true;
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function toMatch(q: PoolQuestion, digit?: { index: number; value: string }): MatchQuestion {
  const order = shuffle([0, 1, 2, 3]);
  return {
    id: q.id,
    episodeId: q.ep,
    difficulty: q.d,
    prompt: q.q,
    choices: order.map((i) => q.c[i]),
    correctIndex: order.indexOf(q.a),
    fact: q.f,
    digitIndex: digit?.index ?? null,
    digit: digit?.value ?? null,
  };
}

/** Picks `count` questions of a difficulty, preferring the era pool and widening when it runs dry. */
function pick(available: PoolQuestion[], difficulty: string, count: number, pool: string, used: Set<string>): PoolQuestion[] {
  const fresh = (q: PoolQuestion) => !used.has(q.id) && !used.has(`prompt:${q.q}`);
  const tiers = [
    available.filter((q) => q.d === difficulty && inPool(q, pool)),
    available.filter((q) => q.d === difficulty),
    available,
  ];
  const out: PoolQuestion[] = [];
  for (const tier of tiers) {
    for (const q of shuffle(tier)) {
      if (out.length >= count) break;
      if (!fresh(q)) continue;
      out.push(q);
      used.add(q.id);
      used.add(`prompt:${q.q}`);
    }
    if (out.length >= count) break;
  }
  return out;
}

/**
 * Builds a 10-question match: 8 standard (3 easy, 3 medium, 2 hard) with the two vault-digit
 * questions slotted in at positions 5 and 9, plus a reserve of sudden-death questions.
 */
export function buildMatchSet(pool: string, exclusions: ArenaExclusions, recent: string[]): MatchSet {
  const excludedEps = new Set(exclusions.episodes);
  const excludedQs = new Set(exclusions.questions);
  const available = POOL.questions.filter((q) => !excludedEps.has(q.ep) && !excludedQs.has(q.id));
  const recentSet = new Set(recent);
  const preferred = available.filter((q) => !recentSet.has(q.id));
  const source = preferred.length >= 40 ? preferred : available;

  const vaults = POOL.vaults.filter((v) => !excludedEps.has(v.ep));
  const vault = shuffle(vaults.length ? vaults : POOL.vaults)[0];
  const digitQs = shuffle(vault.digits.filter((d) => !excludedQs.has(d.id))).slice(0, 2);
  const digits = digitQs.length === 2 ? digitQs : shuffle(vault.digits).slice(0, 2);
  const earnedIndexes = new Set(digits.map((d) => d.di));
  const freeIndexes = Array.from({ length: vault.code.length }, (_, i) => i).filter((i) => !earnedIndexes.has(i));

  const used = new Set<string>(digits.map((d) => d.id));
  const easy = pick(source, "easy", 3, pool, used);
  const medium = pick(source, "medium", 3, pool, used);
  const hard = pick(source, "hard", 2, pool, used);
  const sudden = [...pick(source, "medium", 2, pool, used), ...pick(source, "hard", 2, pool, used)];

  const standard = [...easy, ...medium, ...hard].map((q) => toMatch(q));
  const [d1, d2] = digits.map((d) => toMatch(d, { index: d.di, value: d.dv }));
  const questions = [...standard.slice(0, 4), d1, ...standard.slice(4, 7), d2, ...standard.slice(7)];

  return {
    questions,
    suddenDeath: shuffle(sudden).map((q) => toMatch(q)),
    vault: { episodeId: vault.ep, title: vault.title, code: vault.code, freeIndexes, story: vault.story },
  };
}

/**
 * Builds a 12-question tournament final: 9 standard (3 easy, 3 medium, 3 hard) with the vault's three
 * earnable digit questions at Q3, Q7 and Q10 (one digit is free), plus a deep sudden-death reserve
 * for tiebreaks at the elimination cut lines.
 */
export function buildFinalSet(pool: string, exclusions: ArenaExclusions): MatchSet {
  const excludedEps = new Set(exclusions.episodes);
  const excludedQs = new Set(exclusions.questions);
  const available = POOL.questions.filter((q) => !excludedEps.has(q.ep) && !excludedQs.has(q.id));
  const vaults = POOL.vaults.filter((v) => !excludedEps.has(v.ep) && v.digits.length >= 3);
  const vault = shuffle(vaults.length ? vaults : POOL.vaults)[0];
  const digits = [...vault.digits].sort((a, b) => a.di - b.di).slice(0, 3);
  const earned = new Set(digits.map((d) => d.di));
  const freeIndexes = Array.from({ length: vault.code.length }, (_, i) => i).filter((i) => !earned.has(i));

  const used = new Set<string>(digits.map((d) => d.id));
  const easy = pick(available, "easy", 3, pool, used);
  const medium = pick(available, "medium", 3, pool, used);
  const hard = pick(available, "hard", 3, pool, used);
  const sudden = [...pick(available, "medium", 4, pool, used), ...pick(available, "hard", 4, pool, used)];

  const standard = [...easy, ...medium, ...hard].map((q) => toMatch(q));
  const [d1, d2, d3] = shuffle(digits).map((d) => toMatch(d, { index: d.di, value: d.dv }));
  // Positions (0-based): digit questions land at 2, 6 and 9.
  const questions = [...standard.slice(0, 2), d1, ...standard.slice(2, 5), d2, ...standard.slice(5, 7), d3, ...standard.slice(7)];

  return {
    questions,
    suddenDeath: shuffle(sudden).map((q) => toMatch(q)),
    vault: { episodeId: vault.ep, title: vault.title, code: vault.code, freeIndexes, story: vault.story },
  };
}

/** Episode list for the admin exclusions panel. */
export function poolEpisodes(): { id: string; title: string; questionCount: number }[] {
  const counts = new Map<string, number>();
  POOL.questions.forEach((q) => counts.set(q.ep, (counts.get(q.ep) ?? 0) + 1));
  return POOL.vaults
    .map((v) => ({ id: v.ep, title: v.title, questionCount: (counts.get(v.ep) ?? 0) + v.digits.length }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const STREAK_LADDER = [1, 1, 1.25, 1.5, 1.75, 2];

export function multiplierForStreak(streak: number): number {
  return STREAK_LADDER[Math.min(Math.max(streak, 0), 5)];
}

export function basePoints(difficulty: string): number {
  if (difficulty === "easy") return 500;
  if (difficulty === "medium") return 750;
  return 1000;
}

export const JACKPOT_BASE = 10_000;
export const JACKPOT_STEP = 5_000;
export const JACKPOT_CAP = 50_000;
