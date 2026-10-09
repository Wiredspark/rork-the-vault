// Shared Arena wire protocol. Source of truth: functions/arena/protocol.ts — keep both in sync.

export type RoomKind = "public" | "private";

export type ArenaPhase = "lobby" | "countdown" | "question" | "reveal" | "sudden" | "sudden_reveal" | "jackpot" | "results";

export type WinReason = "score" | "sudden" | "time" | "solo";

export const ARENA_TOTAL_QUESTIONS = 10;
export const ARENA_MAX_PLAYERS = 8;
export const ARENA_QUESTION_MS = 15_000;
export const ARENA_SUDDEN_MS = 10_000;
export const ARENA_REVEAL_MS = 5_000;
export const ARENA_JACKPOT_MS = 30_000;
export const ARENA_JACKPOT_ATTEMPTS = 3;
export const ARENA_REJOIN_MS = 30_000;
export const ARENA_REACTIONS = ["🔥", "👏", "😮", "😂", "💯", "🎶"] as const;

export type Reaction = (typeof ARENA_REACTIONS)[number];

export interface ArenaPlayerView {
  userId: string;
  name: string;
  score: number;
  streak: number;
  connected: boolean;
  /** Left the match for good (missed the rejoin window). */
  left: boolean;
  isHost: boolean;
  /** Locked an answer on the current question (choice stays hidden until reveal). */
  answered: boolean;
  correctCount: number;
  answeredCount: number;
  /** Points from the last revealed question. */
  lastPoints: number;
  lastSpeedBonus: number;
  lastCorrect: boolean | null;
  /** Choice on the last revealed question (only populated during reveal phases). */
  lastChoice: number | null;
  inSuddenDeath: boolean;
  ready: boolean;
}

export interface ArenaQuestionView {
  id: string;
  number: number;
  prompt: string;
  choices: string[];
  difficulty: string;
  episodeId: string;
  isDigit: boolean;
  digitIndex: number | null;
  startedAt: number;
  durationMs: number;
}

export interface ArenaRevealView {
  correctIndex: number;
  fact: string;
  picks: Record<string, number | null>;
}

export interface ArenaStanding {
  userId: string;
  name: string;
  placement: number;
  score: number;
  correct: number;
  answered: number;
  fastestMs: number | null;
  totalTimeMs: number;
  vcEarned: number;
  left: boolean;
}

export interface ArenaJackpotView {
  winnerId: string;
  amount: number;
  attempts: { code: string; correct: boolean }[];
  attemptsLeft: number;
  status: "open" | "cracked" | "sealed";
  /** Revealed to everyone once the jackpot round ends. */
  code: string | null;
  story: string | null;
}

export interface ArenaMeView {
  userId: string;
  role: "player" | "spectator";
  /** Known vault digits by index (free + earned). */
  digits: (string | null)[];
  fiftyUsed: boolean;
  shield: "ready" | "armed" | "used";
  answer: number | null;
  removed: number[];
  ready: boolean;
}

export interface ArenaSnapshot {
  type: "state";
  roomId: string;
  kind: RoomKind;
  code: string | null;
  serverNow: number;
  phase: ArenaPhase;
  phaseEndsAt: number | null;
  hostId: string | null;
  pool: string;
  matchNumber: number;
  players: ArenaPlayerView[];
  spectators: number;
  me: ArenaMeView;
  question: ArenaQuestionView | null;
  reveal: ArenaRevealView | null;
  questionIndex: number;
  totalQuestions: number;
  sudden: { round: number; playerIds: string[] } | null;
  vault: { episodeId: string; title: string; freeIndexes: number[]; codeLength: number } | null;
  jackpotAmount: number;
  winnerId: string | null;
  winReason: WinReason | null;
  jackpot: ArenaJackpotView | null;
  standings: ArenaStanding[] | null;
  notice: string | null;
}

export type ServerMessage =
  | ArenaSnapshot
  | { type: "reaction"; userId: string; name: string; emoji: Reaction; at: number }
  | { type: "error"; message: string }
  | { type: "kicked"; message: string }
  | { type: "pong"; serverNow: number; clientSentAt: number };

export type ClientMessage =
  | { type: "answer"; questionId: string; choice: number }
  | { type: "fifty" }
  | { type: "shield" }
  | { type: "start" }
  | { type: "pool"; pool: string }
  | { type: "crack"; code: string }
  | { type: "react"; emoji: Reaction }
  | { type: "ready" }
  | { type: "rematch" }
  | { type: "ping"; clientSentAt: number };

export interface ArenaPlayerStats {
  userId: string;
  name: string;
  matches: number;
  wins: number;
  rating: number;
  arenaVc: number;
  jackpots: number;
  bestScore: number;
}

export interface ArenaOverview {
  online: number;
  liveRooms: number;
  publicJackpot: number;
  me: ArenaPlayerStats | null;
}

export interface ArenaLeaderboardRow extends ArenaPlayerStats {
  rank: number;
  isMe: boolean;
}

export interface ArenaLeaderboard {
  rows: ArenaLeaderboardRow[];
  me: ArenaLeaderboardRow | null;
  totalPlayers: number;
}

export interface ArenaRoomSummary {
  roomId: string;
  kind: RoomKind;
  phase: ArenaPhase;
  playerNames: string[];
  playerIds: string[];
  playerCount: number;
  spectators: number;
  updatedAt: number;
}

export interface ArenaMatchRecord {
  matchId: string;
  roomId: string;
  kind: RoomKind;
  endedAt: number;
  winnerId: string | null;
  winnerName: string | null;
  winReason: WinReason | null;
  jackpotAmount: number;
  jackpotCracked: boolean;
  vaultEpisodeId: string | null;
  standings: ArenaStanding[];
}

export interface ArenaExclusions {
  episodes: string[];
  questions: string[];
}

export interface ArenaAdminState {
  rooms: ArenaRoomSummary[];
  matches: ArenaMatchRecord[];
  exclusions: ArenaExclusions;
  publicJackpot: number;
  episodes: { id: string; title: string; questionCount: number }[];
}
