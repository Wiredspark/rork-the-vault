import type { Episode, Question } from "@/lib/episode";
import { multiplierForStreak } from "@/lib/scoring";

export type Phase = "intro" | "question" | "feedback" | "round-summary";
export type VaultOutcome = "pending" | "cracked" | "sealed";
export type RunStatus = "fresh" | "playing" | "vault" | "complete";
export type LifelineId = "fiftyFifty" | "shield" | "swap";

export const VAULT_MAX_ATTEMPTS = 3;

/** One answered question in the run. */
export interface AnswerRecord {
  slotId: string;
  questionId: string;
  roundIndex: number;
  type: "standard" | "bonus";
  choiceIndex: number | null;
  correct: boolean;
  timedOut: boolean;
  earned: number;
  multiplier: number;
  streakAfter: number;
  shielded: boolean;
}

/** Full, serialisable state of a single episode run. */
export interface GameState {
  version: 1;
  episodeId: string;
  roundIndex: number;
  questionIndex: number;
  phase: Phase;
  answers: AnswerRecord[];
  streak: number;
  peakStreak: number;
  lifelinesUsed: Record<LifelineId, boolean>;
  shieldArmedFor: string | null;
  eliminated: Record<string, number[]>;
  swaps: Record<string, string>;
  revealed: number[];
  vaultAttempts: number;
  vaultOutcome: VaultOutcome;
  roundsComplete: boolean;
}

export function createInitialState(episodeId: string): GameState {
  return {
    version: 1,
    episodeId,
    roundIndex: 0,
    questionIndex: 0,
    phase: "intro",
    answers: [],
    streak: 0,
    peakStreak: 0,
    lifelinesUsed: { fiftyFifty: false, shield: false, swap: false },
    shieldArmedFor: null,
    eliminated: {},
    swaps: {},
    revealed: [],
    vaultAttempts: 0,
    vaultOutcome: "pending",
    roundsComplete: false,
  };
}

export function currentSlot(state: GameState, episode: Episode): Question | null {
  if (state.roundsComplete) return null;
  return episode.rounds[state.roundIndex]?.lineup[state.questionIndex] ?? null;
}

export function currentQuestion(state: GameState, episode: Episode): Question | null {
  const slot = currentSlot(state, episode);
  if (!slot) return null;
  const swappedId = state.swaps[slot.id];
  return swappedId ? (episode.questionsById[swappedId] ?? slot) : slot;
}

export function startRound(state: GameState): GameState {
  if (state.phase !== "intro" || state.roundsComplete) return state;
  return { ...state, phase: "question" };
}

/** Resolve an answer (or a timeout when choiceIndex is null) for the current question. */
export function answerQuestion(
  state: GameState,
  episode: Episode,
  choiceIndex: number | null,
  timedOut: boolean,
): GameState {
  if (state.phase !== "question") return state;
  const slot = currentSlot(state, episode);
  const question = currentQuestion(state, episode);
  if (!slot || !question) return state;

  const correct = choiceIndex !== null && choiceIndex === question.correctIndex;
  const isBonus = slot.type === "bonus";
  let streak = state.streak;
  let earned = 0;
  let multiplier = 1;
  let shielded = false;
  let revealed = state.revealed;

  if (isBonus) {
    // Bonus questions never pay cash and never break the streak.
    if (correct && slot.bonus && !revealed.includes(slot.bonus.codeDigitIndex)) {
      revealed = [...revealed, slot.bonus.codeDigitIndex];
    }
  } else if (correct) {
    streak += 1;
    multiplier = multiplierForStreak(streak);
    earned = Math.round(slot.payout * multiplier);
  } else if (state.shieldArmedFor === question.id) {
    shielded = true;
  } else {
    streak = 0;
  }

  const record: AnswerRecord = {
    slotId: slot.id,
    questionId: question.id,
    roundIndex: state.roundIndex,
    type: isBonus ? "bonus" : "standard",
    choiceIndex,
    correct,
    timedOut,
    earned,
    multiplier,
    streakAfter: streak,
    shielded,
  };

  return {
    ...state,
    phase: "feedback",
    answers: [...state.answers, record],
    streak,
    peakStreak: Math.max(state.peakStreak, streak),
    shieldArmedFor: null,
    revealed,
  };
}

export function advance(state: GameState, episode: Episode): GameState {
  if (state.phase !== "feedback") return state;
  const round = episode.rounds[state.roundIndex];
  if (state.questionIndex < round.lineup.length - 1) {
    return { ...state, phase: "question", questionIndex: state.questionIndex + 1 };
  }
  return { ...state, phase: "round-summary" };
}

/** Leave the round summary: next round (streak resets) or into the Vault Chamber. */
export function continueAfterRound(state: GameState, episode: Episode): GameState {
  if (state.phase !== "round-summary") return state;
  if (state.roundIndex < episode.rounds.length - 1) {
    return { ...state, roundIndex: state.roundIndex + 1, questionIndex: 0, phase: "intro", streak: 0 };
  }
  return { ...state, roundsComplete: true, streak: 0 };
}

export function applyFiftyFifty(state: GameState, episode: Episode, random: () => number): GameState {
  const question = currentQuestion(state, episode);
  if (!question || state.phase !== "question" || state.lifelinesUsed.fiftyFifty) return state;
  const wrong = question.choices.map((_, i) => i).filter((i) => i !== question.correctIndex);
  const shuffled = [...wrong].sort(() => random() - 0.5);
  return {
    ...state,
    lifelinesUsed: { ...state.lifelinesUsed, fiftyFifty: true },
    eliminated: { ...state.eliminated, [question.id]: shuffled.slice(0, 2) },
  };
}

export function applyShield(state: GameState, episode: Episode): GameState {
  const slot = currentSlot(state, episode);
  const question = currentQuestion(state, episode);
  if (!slot || !question || slot.type === "bonus" || state.phase !== "question" || state.lifelinesUsed.shield) {
    return state;
  }
  return { ...state, lifelinesUsed: { ...state.lifelinesUsed, shield: true }, shieldArmedFor: question.id };
}

/** Pick a same-round reserve question, preferring the slot's difficulty tier. */
export function pickReserve(state: GameState, episode: Episode): Question | null {
  const slot = currentSlot(state, episode);
  if (!slot || slot.type === "bonus") return null;
  const used = new Set(Object.values(state.swaps));
  const pool = episode.rounds[state.roundIndex].reserve.filter((q) => !used.has(q.id));
  return pool.find((q) => q.difficulty === slot.difficulty) ?? pool[0] ?? null;
}

export function applySwap(state: GameState, episode: Episode): GameState {
  const slot = currentSlot(state, episode);
  if (!slot || state.phase !== "question" || state.lifelinesUsed.swap) return state;
  const reserve = pickReserve(state, episode);
  if (!reserve) return state;
  return {
    ...state,
    lifelinesUsed: { ...state.lifelinesUsed, swap: true },
    swaps: { ...state.swaps, [slot.id]: reserve.id },
    shieldArmedFor: state.shieldArmedFor ? reserve.id : null,
  };
}

export function knownDigitIndexes(state: GameState, episode: Episode): number[] {
  return [...episode.freeDigitIndexes, ...state.revealed].sort((a, b) => a - b);
}

export function missingDigitIndexes(state: GameState, episode: Episode): number[] {
  const known = new Set(knownDigitIndexes(state, episode));
  return episode.vaultCode.map((_, i) => i).filter((i) => !known.has(i));
}

export function isCodeCorrect(code: string[], episode: Episode): boolean {
  return code.length === episode.vaultCode.length && code.every((d, i) => d === episode.vaultCode[i]);
}

export function submitVaultCode(state: GameState, episode: Episode, code: string[]): GameState {
  if (!state.roundsComplete || state.vaultOutcome !== "pending") return state;
  if (isCodeCorrect(code, episode)) {
    return { ...state, vaultOutcome: "cracked", vaultAttempts: state.vaultAttempts + 1 };
  }
  const attempts = state.vaultAttempts + 1;
  return { ...state, vaultAttempts: attempts, vaultOutcome: attempts >= VAULT_MAX_ATTEMPTS ? "sealed" : "pending" };
}

export function runStatus(state: GameState): RunStatus {
  if (state.vaultOutcome !== "pending") return "complete";
  if (state.roundsComplete) return "vault";
  if (state.answers.length === 0 && state.phase === "intro" && state.roundIndex === 0) return "fresh";
  return "playing";
}

export function roundPayout(state: GameState, roundIndex: number): number {
  return state.answers.filter((a) => a.roundIndex === roundIndex).reduce((sum, a) => sum + a.earned, 0);
}

export function totalPayout(state: GameState, episode: Episode): number {
  const base = state.answers.reduce((sum, a) => sum + a.earned, 0);
  return base + (state.vaultOutcome === "cracked" ? episode.vaultPrize : 0);
}

export interface RoundStats {
  answered: number;
  correct: number;
  total: number;
  score: number;
  bonusAnswered: boolean;
  bonusCorrect: boolean;
}

export function roundStats(state: GameState, episode: Episode, roundIndex: number): RoundStats {
  const records = state.answers.filter((a) => a.roundIndex === roundIndex);
  const bonus = records.find((a) => a.type === "bonus");
  return {
    answered: records.length,
    correct: records.filter((a) => a.correct).length,
    total: episode.rounds[roundIndex].lineup.length,
    score: roundPayout(state, roundIndex),
    bonusAnswered: Boolean(bonus),
    bonusCorrect: Boolean(bonus?.correct),
  };
}

export type RoundProgress = "done" | "active" | "next" | "locked";

export function roundProgress(state: GameState, roundIndex: number): RoundProgress {
  if (state.roundsComplete || roundIndex < state.roundIndex) return "done";
  if (roundIndex > state.roundIndex) return "locked";
  if (state.phase === "round-summary") return "done";
  const hasAnswers = state.answers.some((a) => a.roundIndex === roundIndex);
  return hasAnswers || state.phase !== "intro" ? "active" : "next";
}

/** Replays a scripted run, used to seed demo progress for the dashboard. */
export function buildDemoState(episode: Episode): GameState {
  let s = createInitialState(episode.id);
  const answerRound = (count: number) => {
    s = startRound(s);
    for (let i = 0; i < count; i++) {
      const q = currentQuestion(s, episode);
      if (!q) break;
      s = answerQuestion(s, episode, q.correctIndex, false);
      if (i < count - 1) s = advance(s, episode);
    }
  };
  answerRound(episode.rounds[0].lineup.length);
  s = advance(s, episode);
  s = continueAfterRound(s, episode);
  answerRound(3);
  s = advance(s, episode);
  return s;
}
