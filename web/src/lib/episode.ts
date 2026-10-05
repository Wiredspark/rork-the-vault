import { multiplierForStreak } from "@/lib/scoring";

const EPISODE_FILES = import.meta.glob<{ default: unknown }>("../data/episodes/*.json", { eager: true });

/** Manual B2 fallbacks, used when an episode omits round-level timers. */
const DEFAULT_TIMERS: { standard: number; bonus: number }[] = [
  { standard: 15, bonus: 20 },
  { standard: 17, bonus: 20 },
  { standard: 20, bonus: 23 },
];

interface RawSource {
  title: string;
  url: string;
}

interface RawQuestion {
  id: string;
  round: number;
  slot: number;
  type: string;
  difficulty: string;
  category: string;
  question: string;
  choices: string[];
  correctIndex: number;
  payout: number | null;
  timer: number | null;
  bonus: { codeDigitIndex: number; bonusHint: string; codeDigit: string } | null;
  metadata?: {
    artist?: string;
    song?: string;
    album?: string;
    year?: number | null;
    fact?: string;
    sourceNotes?: string;
    storyHook?: string;
    sources?: RawSource[];
  };
}

interface RawRound {
  round: number;
  name: string;
  tag: string;
  description: string;
  defaultTimer?: number | null;
  bonusTimer?: number | null;
  questions: RawQuestion[];
  reserve?: RawQuestion[];
}

interface RawEpisode {
  episodeId: string;
  title: string;
  theme: string;
  status?: string;
  vault: { codeLength: number; freeDigitMap: Record<string, string>; note: string };
  scoring: { vaultPrize: number };
  rounds: RawRound[];
}

export type QuestionType = "standard" | "bonus" | "reserve";
export type EpisodeStatus = "production" | "draft";

export interface Question {
  id: string;
  type: QuestionType;
  difficulty: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  payout: number;
  timer: number;
  bonus: { codeDigitIndex: number; hint: string; digit: string } | null;
  fact: string;
  artist: string;
  song: string;
  year: number | null;
  sources: RawSource[];
}

export interface Round {
  index: number;
  number: number;
  name: string;
  tag: string;
  description: string;
  defaultTimer: number;
  bonusTimer: number;
  standard: Question[];
  bonus: Question;
  reserve: Question[];
  /** Ordered play lineup: standard questions then the bonus. */
  lineup: Question[];
  minPayout: number;
  maxPayout: number;
}

export interface Episode {
  id: string;
  number: number;
  moduleId: string;
  title: string;
  theme: string;
  status: EpisodeStatus;
  rounds: Round[];
  vaultCode: string[];
  freeDigitIndexes: number[];
  vaultYear: string;
  vaultStory: string;
  vaultPrize: number;
  maxScore: number;
  standardCount: number;
  totalQuestions: number;
  questionsById: Record<string, Question>;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

interface RoundTimers {
  standard: number;
  bonus: number;
}

function resolveTimers(raw: RawRound, index: number): RoundTimers {
  const fallback = DEFAULT_TIMERS[index] ?? DEFAULT_TIMERS[DEFAULT_TIMERS.length - 1];
  const std = raw.questions.find((q) => q.type === "standard" && q.timer);
  const bonus = raw.questions.find((q) => q.type === "bonus" && q.timer);
  return {
    standard: raw.defaultTimer ?? std?.timer ?? fallback.standard,
    bonus: raw.bonusTimer ?? bonus?.timer ?? fallback.bonus,
  };
}

function normalizeQuestion(raw: RawQuestion, timers: RoundTimers): Question {
  const type: QuestionType = raw.type === "bonus" ? "bonus" : raw.type === "reserve" ? "reserve" : "standard";
  const fact = [raw.metadata?.fact, raw.metadata?.storyHook, raw.metadata?.sourceNotes].find((t) => t?.trim()) ?? "";
  return {
    id: raw.id,
    type,
    difficulty: raw.difficulty,
    prompt: raw.question,
    choices: raw.choices,
    correctIndex: raw.correctIndex,
    payout: raw.payout ?? 0,
    timer: raw.timer ?? (type === "bonus" ? timers.bonus : timers.standard),
    bonus: raw.bonus
      ? { codeDigitIndex: raw.bonus.codeDigitIndex, hint: raw.bonus.bonusHint, digit: raw.bonus.codeDigit }
      : null,
    fact: fact.trim(),
    artist: raw.metadata?.artist ?? "",
    song: raw.metadata?.song ?? "",
    year: raw.metadata?.year ?? null,
    sources: raw.metadata?.sources ?? [],
  };
}

function extractStory(note: string): string {
  const withoutRule = note.replace(/^Digit \d \(index \d\) is always visible\.\s*/i, "");
  const dash = withoutRule.indexOf("—");
  const story = (dash >= 0 ? withoutRule.slice(dash + 1) : withoutRule).trim();
  return story.length ? story[0].toUpperCase() + story.slice(1) : story;
}

function normalizeEpisode(raw: RawEpisode, moduleId: string): Episode {
  const questionsById: Record<string, Question> = {};

  const rounds: Round[] = raw.rounds.map((rawRound, index) => {
    const timers = resolveTimers(rawRound, index);
    const all = rawRound.questions.map((q) => normalizeQuestion(q, timers));
    const standard = all.filter((q) => q.type === "standard");
    const bonus = all.find((q) => q.type === "bonus") ?? all[all.length - 1];
    const reserve = (rawRound.reserve ?? []).map((q) => normalizeQuestion(q, timers));
    [...all, ...reserve].forEach((q) => {
      questionsById[q.id] = q;
    });
    const payouts = standard.map((q) => q.payout);
    return {
      index,
      number: rawRound.round,
      name: titleCase(rawRound.name),
      tag: rawRound.tag,
      description: rawRound.description,
      defaultTimer: timers.standard,
      bonusTimer: timers.bonus,
      standard,
      bonus,
      reserve,
      lineup: [...standard, bonus],
      minPayout: Math.min(...payouts),
      maxPayout: Math.max(...payouts),
    };
  });

  const codeLength = raw.vault.codeLength;
  const vaultCode: string[] = Array.from({ length: codeLength }, () => "0");
  const freeDigitIndexes: number[] = [];
  Object.entries(raw.vault.freeDigitMap).forEach(([key, digit]) => {
    const i = Number(key);
    vaultCode[i] = digit;
    freeDigitIndexes.push(i);
  });
  rounds.forEach((round) => {
    if (round.bonus.bonus) vaultCode[round.bonus.bonus.codeDigitIndex] = round.bonus.bonus.digit;
  });

  // Each payout is rounded half-up after its multiplier; streaks reset every round.
  const roundsMax = rounds.reduce(
    (sum, round) =>
      sum + round.standard.reduce((acc, q, i) => acc + Math.round(q.payout * multiplierForStreak(i + 1)), 0),
    0,
  );

  const standardCount = rounds.reduce((sum, r) => sum + r.standard.length, 0);

  return {
    id: raw.episodeId,
    number: parseInt(raw.episodeId.replace(/\D/g, ""), 10),
    moduleId,
    title: raw.title,
    theme: raw.theme,
    status: raw.status === "draft" ? "draft" : "production",
    rounds,
    vaultCode,
    freeDigitIndexes,
    vaultYear: vaultCode.join(""),
    vaultStory: extractStory(raw.vault.note),
    vaultPrize: raw.scoring.vaultPrize,
    maxScore: roundsMax + raw.scoring.vaultPrize,
    standardCount,
    totalQuestions: standardCount + rounds.length,
    questionsById,
  };
}

/** Fatal structural problems that would break gameplay (manual A7 / C4). Empty = playable. */
function validateEpisode(raw: RawEpisode): string[] {
  const errors: string[] = [];
  if (!raw.episodeId) errors.push("missing episodeId");
  if (!Array.isArray(raw.rounds) || raw.rounds.length !== 3) errors.push("must have exactly 3 rounds");
  const digitIndexes = new Set<number>();
  (raw.rounds ?? []).forEach((round) => {
    const qs = round.questions ?? [];
    const last = qs[qs.length - 1];
    if (!last || last.type !== "bonus") errors.push(`R${round.round} BONUS_NOT_LAST`);
    else if (!last.bonus) errors.push(`R${round.round} BONUS_MISSING_BONUS_OBJECT`);
    else if (digitIndexes.has(last.bonus.codeDigitIndex)) errors.push("DUPLICATE_BONUS_DIGIT_INDEX");
    else digitIndexes.add(last.bonus.codeDigitIndex);
    [...qs, ...(round.reserve ?? [])].forEach((q) => {
      if (q.choices?.length !== 4 || q.correctIndex < 0 || q.correctIndex > 3) errors.push(`${q.id} invalid choices`);
      if (q.type === "standard" && !(q.payout && q.payout > 0)) errors.push(`${q.id} MISSING_STANDARD_PAYOUT`);
    });
  });
  return errors;
}

const EPISODES: Episode[] = Object.entries(EPISODE_FILES)
  .flatMap(([path, mod]) => {
    const raw = mod.default as RawEpisode;
    const errors = validateEpisode(raw);
    if (errors.length) {
      console.warn(`[vault] Skipping ${path}:`, errors.slice(0, 5).join("; "));
      return [];
    }
    return [normalizeEpisode(raw, "rnb")];
  })
  .sort((a, b) => a.number - b.number);

const EPISODES_BY_ID: Record<string, Episode> = Object.fromEntries(EPISODES.map((e) => [e.id, e]));

export const DEFAULT_EPISODE_ID = "EP001";

export function getEpisode(id: string): Episode | undefined {
  return EPISODES_BY_ID[id];
}

export function getEpisodesForModule(moduleId: string): Episode[] {
  return EPISODES.filter((e) => e.moduleId === moduleId);
}
