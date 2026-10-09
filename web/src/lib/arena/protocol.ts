// Shared Arena wire protocol. Source of truth: functions/arena/protocol.ts — keep both in sync.

export type RoomKind = "public" | "private" | "qualifier" | "final";

export type ArenaPhase =
  | "lobby"
  | "countdown"
  | "question"
  | "reveal"
  | "sudden"
  | "sudden_reveal"
  | "checkpoint"
  | "race"
  | "jackpot"
  | "results";

export type WinReason = "score" | "sudden" | "time" | "solo" | "cracked";

export const FINAL_TOTAL_QUESTIONS = 12;
export const FINAL_CHECKPOINTS = [4, 8];
export const FINAL_RACE_MS = 60_000;
export const FINAL_MAX_PLAYERS = 8;
export const QUALIFIER_RUNS = 3;

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
  /** Knocked out of a tournament final (after this question number). */
  eliminatedAfter: number | null;
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
  /** Tournament finals: the question after which this player was knocked out. */
  eliminatedAfter?: number | null;
}

export interface EliminationView {
  checkpoints: number[];
  cuts: number[];
  /** Index into checkpoints of the next cut still to come, or null once all cuts are done. */
  next: number | null;
  /** Players cut at the most recent checkpoint (shown during the checkpoint phase). */
  lastCut: string[];
  survivors: number;
}

export interface RaceRacerView {
  userId: string;
  name: string;
  attempts: number;
  /** Submitted codes: visible to spectators and knocked-out players live, to rival racers only after the race. */
  codes: (string | null)[];
  cracked: boolean;
  crackedAtMs: number | null;
  knownDigits: number;
  score: number;
}

export interface RaceView {
  racers: RaceRacerView[];
  status: "open" | "done";
  winnerId: string | null;
  code: string | null;
  story: string | null;
  attemptsPerRacer: number;
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
  sudden: { round: number; playerIds: string[]; purpose: "win" | "cut" } | null;
  vault: { episodeId: string; title: string; freeIndexes: number[]; codeLength: number } | null;
  digitPositions: number[];
  tournament: { id: string; name: string; rank: number | null; runsLeft: number | null; entrants: number | null } | null;
  elimination: EliminationView | null;
  race: RaceView | null;
  jackpotAmount: number;
  winnerId: string | null;
  winReason: WinReason | null;
  jackpot: ArenaJackpotView | null;
  standings: ArenaStanding[] | null;
  notice: string | null;
  /** Tournament finals: scheduled start (server clock) while waiting in the lobby. */
  startsAt: number | null;
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

export const ARENA_PROTOCOL_VERSION = 2;

export interface TrophyCounts {
  champion: number;
  finalist: number;
  qualifier: number;
}

export interface ArenaPlayerStats {
  userId: string;
  name: string;
  matches: number;
  wins: number;
  rating: number;
  arenaVc: number;
  jackpots: number;
  bestScore: number;
  trophies: TrophyCounts;
  /** Active champion title, e.g. "Weekly Champion". */
  title: string | null;
}

export interface ArenaOverview {
  online: number;
  liveRooms: number;
  publicJackpot: number;
  me: ArenaPlayerStats | null;
  spotlight: TournamentSpotlight | null;
}

export interface TournamentSpotlight {
  id: string;
  name: string;
  status: TournamentStatus;
  /** Next milestone: qualifiers open, qualifiers close, or finals start. */
  at: number;
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

// ---------- Tournaments ----------

export type TournamentStatus = "draft" | "scheduled" | "qualifying" | "locking" | "checkin" | "final" | "completed" | "cancelled";

export type EntryType = "open" | "invite";

export interface TournamentPrizes {
  /** Base VC put up by the house; entry fees are added on top. */
  baseVc: number;
  /** Percent of the pool for 1st, 2nd, 3rd… (sums to 100). */
  split: number[];
  badges: boolean;
  /** Champion title text, e.g. "Weekly Champion". Empty = none. */
  title: string;
  /** Real-world prize description, fulfilled offline. Empty = none. */
  custom: string;
}

export interface TournamentConfig {
  name: string;
  /** Series name used for champion titles ("Weekly", "Monthly"…). */
  series: string;
  description: string;
  qualStart: number;
  qualEnd: number;
  finalsAt: number;
  pool: string;
  entryType: EntryType;
  entryFee: number;
  cap: number | null;
  prizes: TournamentPrizes;
}

export interface TournamentStanding {
  userId: string;
  name: string;
  rank: number;
  bestScore: number;
  bestTimeMs: number;
  runsUsed: number;
  isMe: boolean;
  checkedIn: boolean;
}

export interface TournamentPlacement {
  userId: string;
  name: string;
  placement: number;
  score: number;
  eliminatedAfter: number | null;
  vcPrize: number;
  cracked: boolean;
}

export interface TournamentRaceSummary {
  winnerId: string | null;
  cracked: boolean;
  crackedAtMs: number | null;
  code: string;
  vaultTitle: string;
  attempts: { userId: string; name: string; codes: string[]; cracked: boolean }[];
}

export interface TournamentMyStatus {
  registered: boolean;
  invited: boolean;
  canRegister: boolean;
  blockedReason: string | null;
  runsUsed: number;
  runsLeft: number;
  liveRunId: string | null;
  bestScore: number | null;
  rank: number | null;
  finalist: boolean;
  standby: boolean;
  checkedIn: boolean;
  feePaid: number;
  arenaVc: number;
  placement: number | null;
}

export interface TournamentSummary {
  id: string;
  status: TournamentStatus;
  paused: boolean;
  config: TournamentConfig;
  lockAt: number;
  checkinAt: number;
  prizePool: number;
  entrants: number;
  finalRoomId: string | null;
  championId: string | null;
  championName: string | null;
  me: TournamentMyStatus | null;
}

export interface TournamentDetail extends TournamentSummary {
  standings: TournamentStanding[];
  myStanding: TournamentStanding | null;
  finalists: number;
  placements: TournamentPlacement[] | null;
  race: TournamentRaceSummary | null;
}

export interface TournamentAdminEntry {
  userId: string;
  name: string;
  email: string | null;
  registeredAt: number;
  feePaid: number;
  refunded: boolean;
  runsUsed: number;
  bestScore: number | null;
  bestTimeMs: number | null;
  disqualified: boolean;
  checkedIn: boolean;
}

export interface TournamentAdminView extends TournamentSummary {
  inviteCode: string;
  invites: string[];
  entries: TournamentAdminEntry[];
  placements: TournamentPlacement[] | null;
  prizeSent: boolean;
  stats: { registrations: number; runs: number; finalViewers: number };
  createdAt: number;
}

export interface ArenaInsights {
  /** Player-plays per UTC hour bucket (epoch hours) over the last 8 weeks. */
  hours: { hour: number; plays: number }[];
}
