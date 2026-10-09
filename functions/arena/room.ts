import { DurableObject } from "cloudflare:workers";

import { basePoints, buildFinalSet, buildMatchSet, JACKPOT_BASE, JACKPOT_CAP, JACKPOT_STEP, multiplierForStreak, POOL_OPTIONS, type MatchQuestion, type MatchSet } from "./pool";
import {
  ARENA_JACKPOT_ATTEMPTS,
  ARENA_JACKPOT_MS,
  ARENA_MAX_PLAYERS,
  ARENA_QUESTION_MS,
  ARENA_REACTIONS,
  ARENA_REJOIN_MS,
  ARENA_REVEAL_MS,
  ARENA_SUDDEN_MS,
  ARENA_TOTAL_QUESTIONS,
  FINAL_CHECKPOINTS,
  FINAL_RACE_MS,
  FINAL_TOTAL_QUESTIONS,
  type ArenaExclusions,
  type ArenaJackpotView,
  type ArenaMatchRecord,
  type ArenaPhase,
  type ArenaPlayerView,
  type ArenaRoomSummary,
  type ArenaSnapshot,
  type ArenaStanding,
  type ClientMessage,
  type RaceView,
  type Reaction,
  type RoomKind,
  type ServerMessage,
  type TournamentPlacement,
  type TournamentRaceSummary,
  type WinReason,
} from "./protocol";

type Env = {
  DO: Fetcher & {
    setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>;
  };
};

const PUBLIC_COUNTDOWN_MS = 20_000;
const PRIVATE_COUNTDOWN_MS = 5_000;
const PUBLIC_RESULTS_MS = 25_000;
const JACKPOT_OUTRO_MS = 4_500;
const LOBBY_GRACE_MS = 12_000;
const SUDDEN_ROUNDS = 3;
const QUALIFIER_COUNTDOWN_MS = 4_000;
const FINAL_COUNTDOWN_MS = 10_000;
const CHECKPOINT_MS = 6_500;
const RACE_OUTRO_MS = 6_000;
const RACE_ATTEMPTS = 3;
const TICK_MS = 1_000;
const REPORT_EVERY_MS = 30_000;
const STATE_KEY = "room";

interface Answer {
  choice: number | null;
  ms: number;
}

interface PlayerState {
  userId: string;
  name: string;
  joinedAt: number;
  role: "player" | "spectator";
  connected: boolean;
  disconnectedAt: number | null;
  left: boolean;
  score: number;
  streak: number;
  correct: number;
  answered: number;
  totalTimeMs: number;
  fastestMs: number | null;
  fiftyUsed: boolean;
  shield: "ready" | "armed" | "used";
  earned: Record<string, string>;
  current: Answer | null;
  removed: number[];
  lastPoints: number;
  lastSpeedBonus: number;
  lastCorrect: boolean | null;
  lastChoice: number | null;
  sudden: Answer | null;
  ready: boolean;
  eliminatedAfter: number | null;
}

interface JackpotState {
  winnerId: string;
  amount: number;
  attempts: { code: string; correct: boolean }[];
  status: "open" | "cracked" | "sealed";
}

interface CutState {
  checkpoint: number;
  slots: number;
  group: string[];
  safe: string[];
  below: string[];
}

interface EliminationState {
  cuts: number[];
  done: number;
  lastCut: string[];
  pending: CutState | null;
}

interface RaceState {
  startedAt: number;
  racers: { userId: string; codes: string[]; crackedAtMs: number | null }[];
  status: "open" | "done";
  winnerId: string | null;
}

interface TournamentLink {
  id: string;
  name: string;
  ownerId: string | null;
  runId: string | null;
  rank: number | null;
  runsLeft: number | null;
  entrants: number | null;
  reported: boolean;
  startsAt: number | null;
}

interface RoomState {
  initialized: boolean;
  kind: RoomKind;
  hostId: string | null;
  createdAt: number;
  pool: string;
  phase: ArenaPhase;
  phaseEndsAt: number | null;
  matchNumber: number;
  matchId: string | null;
  players: PlayerState[];
  kicked: string[];
  set: MatchSet | null;
  qIndex: number;
  questionStartedAt: number;
  sudden: { round: number; playerIds: string[]; purpose: "win" | "cut" } | null;
  suddenIndex: number;
  elimination: EliminationState | null;
  race: RaceState | null;
  tournament: TournamentLink | null;
  winnerId: string | null;
  winReason: WinReason | null;
  jackpot: JackpotState | null;
  jackpotAmount: number;
  privateJackpot: number;
  standings: ArenaStanding[] | null;
  recent: string[];
  notice: string | null;
}

interface Seat {
  userId: string;
  name: string;
}

interface InitBody {
  kind?: RoomKind;
  hostId?: string;
  ownerId?: string;
  runId?: string;
  pool?: string;
  startsAt?: number;
  tournament?: { id: string; name: string };
  seats?: Seat[];
}

interface SocketMeta {
  userId: string;
  name: string;
}

function freshState(): RoomState {
  return {
    initialized: false,
    kind: "public",
    hostId: null,
    createdAt: Date.now(),
    pool: "all",
    phase: "lobby",
    phaseEndsAt: null,
    matchNumber: 0,
    matchId: null,
    players: [],
    kicked: [],
    set: null,
    qIndex: 0,
    questionStartedAt: 0,
    sudden: null,
    suddenIndex: -1,
    elimination: null,
    race: null,
    tournament: null,
    winnerId: null,
    winReason: null,
    jackpot: null,
    jackpotAmount: JACKPOT_BASE,
    privateJackpot: JACKPOT_BASE,
    standings: null,
    recent: [],
    notice: null,
  };
}

function resetMatchFields(p: PlayerState): void {
  p.score = 0;
  p.streak = 0;
  p.correct = 0;
  p.answered = 0;
  p.totalTimeMs = 0;
  p.fastestMs = null;
  p.fiftyUsed = false;
  p.shield = "ready";
  p.earned = {};
  p.current = null;
  p.removed = [];
  p.lastPoints = 0;
  p.lastSpeedBonus = 0;
  p.lastCorrect = null;
  p.lastChoice = null;
  p.sudden = null;
  p.ready = false;
  p.eliminatedAfter = null;
}

function newPlayer(userId: string, name: string, role: PlayerState["role"]): PlayerState {
  const p = {
    userId,
    name,
    joinedAt: Date.now(),
    role,
    connected: true,
    disconnectedAt: null,
    left: false,
  } as PlayerState;
  resetMatchFields(p);
  return p;
}

/**
 * How many finalists drop at each checkpoint: half the field goes over two cuts (8 → 6 → 4),
 * never leaving fewer than 2 for the vault race.
 */
export function eliminationCuts(field: number): number[] {
  if (field <= 2) return [0, 0];
  const survivors = Math.max(2, Math.ceil(field / 2));
  const total = field - survivors;
  return [Math.ceil(total / 2), Math.floor(total / 2)];
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** One Arena room: lobby, synchronized questions, server-timed scoring, sudden death, the Winner's Jackpot, results. */
export class ArenaRoom extends DurableObject<Env> {
  private state: RoomState = freshState();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastReportAt = 0;
  private reactionAt = new Map<string, number>();
  private transitioning = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.get<RoomState>(STATE_KEY);
      if (saved) this.state = { ...freshState(), ...saved };
    });
  }

  private get roomId(): string {
    return this.ctx.id.name ?? "unknown";
  }

  // ---------- HTTP + sockets ----------

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/init") {
      const body = (await request.json()) as InitBody;
      if (!this.state.initialized) {
        if (body.kind === "qualifier" || body.kind === "final") {
          this.state = {
            ...freshState(),
            initialized: true,
            kind: body.kind,
            pool: body.pool ?? "all",
            tournament: {
              id: body.tournament?.id ?? "",
              name: body.tournament?.name ?? "Tournament",
              ownerId: body.ownerId ?? null,
              runId: body.runId ?? null,
              rank: null,
              runsLeft: null,
              entrants: null,
              reported: false,
              startsAt: body.startsAt ?? null,
            },
          };
          if (body.kind === "final") this.seedSeats(body.seats ?? []);
        } else {
          this.state = { ...freshState(), initialized: true, kind: "private", hostId: body.hostId ?? null };
        }
        this.persist();
      }
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/final/preview") {
      const body = (await request.json()) as { seats: Seat[]; startsAt: number };
      const s = this.state;
      if (s.kind === "final" && s.phase === "lobby") {
        this.seedSeats(body.seats);
        if (s.tournament) s.tournament.startsAt = body.startsAt;
        this.persist();
        this.broadcast();
      }
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/final/start") {
      const body = (await request.json()) as { seats: Seat[] };
      const s = this.state;
      if (s.kind === "final" && s.phase === "lobby") {
        this.seedSeats(body.seats, true);
        s.phase = "countdown";
        s.phaseEndsAt = Date.now() + FINAL_COUNTDOWN_MS;
        s.notice = null;
        this.persist();
        this.broadcast();
        this.report(true);
        this.schedule();
      }
      return Response.json({ ok: true, phase: s.phase });
    }

    if (request.method === "POST" && url.pathname === "/poke") {
      await this.tick();
      this.schedule();
      return Response.json({ ok: true, phase: this.state.phase, reported: this.state.tournament?.reported ?? false });
    }

    if (request.method === "POST" && url.pathname === "/final/cancel") {
      const s = this.state;
      s.notice = "This tournament was cancelled. Entry fees have been refunded.";
      s.phase = "lobby";
      s.phaseEndsAt = null;
      this.persist();
      this.broadcast();
      return Response.json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/info") {
      const exists = this.state.initialized || this.roomId.startsWith("pub-");
      return Response.json({
        exists,
        tournamentId: this.state.tournament?.id ?? null,
        kind: this.state.kind,
        phase: this.state.phase,
        players: this.activePlayers().length,
      });
    }

    if (request.method === "POST" && url.pathname === "/admin/kick") {
      const { userId } = (await request.json()) as { userId: string };
      this.kick(userId, "An admin removed you from this room.");
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/admin/close") {
      await this.closeRoom();
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }

    const userId = request.headers.get("X-Arena-User-Id");
    const name = (request.headers.get("X-Arena-User-Name") ?? "Player").slice(0, 32);
    if (!userId) return new Response("missing identity", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, name } satisfies SocketMeta);

    if (!this.state.initialized && this.roomId.startsWith("pub-")) {
      this.state = { ...freshState(), initialized: true, kind: "public" };
    }
    if (!this.state.initialized) {
      this.sendTo(server, { type: "error", message: "That room doesn't exist or has closed." });
      server.close(4404, "room not found");
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.state.kind === "qualifier" && this.state.tournament?.ownerId !== userId) {
      this.sendTo(server, { type: "kicked", message: "Qualifier runs are solo. Only the player who started this run can join." });
      server.close(4403, "not your run");
      return new Response(null, { status: 101, webSocket: client });
    }
    if (this.state.kicked.includes(userId)) {
      this.sendTo(server, { type: "kicked", message: "You were removed from this room." });
      server.close(4403, "kicked");
      return new Response(null, { status: 101, webSocket: client });
    }

    // One live socket per player: a new tab takes over.
    for (const ws of this.ctx.getWebSockets(userId)) {
      if (ws !== server) {
        try {
          ws.close(4000, "replaced");
        } catch {
          /* already closed */
        }
      }
    }

    this.join(userId, name);
    this.persist();
    this.broadcast();
    this.report(true);
    this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string" || raw.length > 2_000) return;
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (!meta) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === "ping") {
      this.sendTo(ws, { type: "pong", serverNow: Date.now(), clientSentAt: Number(msg.clientSentAt) || 0 });
      this.schedule();
      return;
    }
    await this.handle(meta.userId, msg);
    this.schedule();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (!meta) return;
    const stillOpen = this.ctx.getWebSockets(meta.userId).some((s) => s !== ws && s.readyState === WebSocket.OPEN);
    if (stillOpen) return;
    const p = this.player(meta.userId);
    if (p) {
      p.connected = false;
      p.disconnectedAt = Date.now();
      this.maybeEndQuestionEarly();
      this.persist();
      this.broadcast();
      this.report(true);
    }
    this.schedule();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // ---------- helpers ----------

  private player(userId: string): PlayerState | undefined {
    return this.state.players.find((p) => p.userId === userId);
  }

  /** Seated players (not spectators), including ones who dropped this match. */
  private activePlayers(): PlayerState[] {
    return this.state.players.filter((p) => p.role === "player");
  }

  /** Players who can still act right now. */
  private livePlayers(): PlayerState[] {
    return this.activePlayers().filter((p) => p.connected && !p.left && p.eliminatedAfter === null);
  }

  private isArena(): boolean {
    return this.state.kind === "public" || this.state.kind === "private";
  }

  private totalQuestions(): number {
    return this.state.kind === "final" ? FINAL_TOTAL_QUESTIONS : ARENA_TOTAL_QUESTIONS;
  }

  private digitPositions(): number[] {
    if (this.state.kind === "qualifier") return [];
    if (!this.state.set) return this.state.kind === "final" ? [2, 6, 9] : [4, 8];
    return this.state.set.questions.map((q, i) => (q.digitIndex !== null ? i : -1)).filter((i) => i >= 0);
  }

  /** Final rooms: seat the finalists (shown as away until they connect); everyone else watches. */
  private seedSeats(seats: Seat[], lock = false): void {
    const s = this.state;
    const ids = new Set(seats.map((x) => x.userId));
    seats.forEach((seat, i) => {
      const existing = this.player(seat.userId);
      if (existing) {
        existing.role = "player";
        existing.joinedAt = existing.joinedAt || Date.now() + i;
      } else {
        const p = newPlayer(seat.userId, seat.name, "player");
        p.connected = false;
        p.joinedAt = Date.now() + i;
        s.players.push(p);
      }
    });
    s.players.forEach((p) => {
      if (!ids.has(p.userId) && p.role === "player") p.role = "spectator";
    });
    if (lock) s.players = s.players.filter((p) => p.role === "player" || p.connected);
  }

  private inMatch(): boolean {
    return !["lobby", "countdown", "results"].includes(this.state.phase);
  }

  private currentQuestion(): MatchQuestion | null {
    const s = this.state;
    if (!s.set) return null;
    if (s.phase === "question" || s.phase === "reveal") return s.set.questions[s.qIndex] ?? null;
    if ((s.phase === "sudden" || s.phase === "sudden_reveal") && s.sudden) return s.set.suddenDeath[s.suddenIndex] ?? null;
    return null;
  }

  private join(userId: string, name: string): void {
    const s = this.state;
    const existing = this.player(userId);
    if (existing) {
      existing.connected = true;
      existing.disconnectedAt = null;
      existing.name = name;
      return;
    }
    const seated = this.activePlayers().length;
    const canSit = s.kind === "final" ? false : s.kind === "qualifier" ? userId === s.tournament?.ownerId : !this.inMatch() && s.phase !== "results" && seated < ARENA_MAX_PLAYERS;
    const role: PlayerState["role"] = canSit ? "player" : "spectator";
    s.players.push(newPlayer(userId, name, role));
    if (s.kind === "private" && !s.hostId) s.hostId = userId;
  }

  private persist(): void {
    this.ctx.storage.put(STATE_KEY, this.state, { allowUnconfirmed: true });
  }

  private sendTo(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket closing */
    }
  }

  private broadcastRaw(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* socket closing */
      }
    }
  }

  private broadcast(): void {
    const now = Date.now();
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SocketMeta | null;
      if (!meta) continue;
      this.sendTo(ws, this.snapshotFor(meta.userId, now));
    }
  }

  private snapshotFor(userId: string, now: number): ArenaSnapshot {
    const s = this.state;
    const me = this.player(userId);
    const q = this.currentQuestion();
    const isReveal = s.phase === "reveal" || s.phase === "sudden_reveal";
    const isSuddenPhase = s.phase === "sudden" || s.phase === "sudden_reveal";
    const codeLength = s.set?.vault.code.length ?? 4;

    const players: ArenaPlayerView[] = this.activePlayers().map((p) => ({
      userId: p.userId,
      name: p.name,
      score: p.score,
      streak: p.streak,
      connected: p.connected,
      left: p.left,
      isHost: s.kind === "private" && s.hostId === p.userId,
      answered: isSuddenPhase ? p.sudden !== null : p.current !== null,
      correctCount: p.correct,
      answeredCount: p.answered,
      lastPoints: p.lastPoints,
      lastSpeedBonus: p.lastSpeedBonus,
      lastCorrect: p.lastCorrect,
      lastChoice: isReveal ? p.lastChoice : null,
      inSuddenDeath: Boolean(s.sudden?.playerIds.includes(p.userId)),
      ready: p.ready,
      eliminatedAfter: p.eliminatedAfter,
    }));

    const digits: (string | null)[] = Array.from({ length: s.kind === "qualifier" ? 0 : codeLength }, () => null);
    if (s.set && s.kind !== "qualifier") {
      s.set.vault.freeIndexes.forEach((i) => {
        digits[i] = s.set!.vault.code[i];
      });
      if (me) Object.entries(me.earned).forEach(([i, d]) => (digits[Number(i)] = d));
    }

    let reveal: ArenaSnapshot["reveal"] = null;
    if (isReveal && q) {
      const picks: Record<string, number | null> = {};
      this.activePlayers().forEach((p) => {
        if (s.phase === "sudden_reveal" && !s.sudden?.playerIds.includes(p.userId)) return;
        picks[p.userId] = p.lastChoice;
      });
      reveal = { correctIndex: q.correctIndex, fact: q.fact, picks };
    }

    const jackpotDone = s.jackpot && s.jackpot.status !== "open";
    const jackpot: ArenaJackpotView | null = s.jackpot
      ? {
          winnerId: s.jackpot.winnerId,
          amount: s.jackpot.amount,
          attempts: s.jackpot.attempts,
          attemptsLeft: ARENA_JACKPOT_ATTEMPTS - s.jackpot.attempts.length,
          status: s.jackpot.status,
          code: jackpotDone || s.phase === "results" ? (s.set?.vault.code ?? null) : null,
          story: jackpotDone || s.phase === "results" ? (s.set?.vault.story ?? null) : null,
        }
      : null;

    const answer = isSuddenPhase ? (me?.sudden?.choice ?? null) : (me?.current?.choice ?? null);
    const isSeated = Boolean(me && me.role === "player" && !me.left && me.eliminatedAfter === null);
    const showDigits = s.kind !== "qualifier";

    return {
      type: "state",
      roomId: this.roomId,
      kind: s.kind,
      code: s.kind === "private" ? this.roomId : null,
      serverNow: now,
      phase: s.phase,
      phaseEndsAt: s.phaseEndsAt,
      hostId: s.hostId,
      pool: s.pool,
      matchNumber: s.matchNumber,
      players,
      spectators: s.players.filter((p) => p.role === "spectator" && p.connected).length,
      me: {
        userId,
        role: isSeated ? "player" : "spectator",
        digits,
        fiftyUsed: me?.fiftyUsed ?? false,
        shield: me?.shield ?? "ready",
        answer: isReveal ? (me?.lastChoice ?? null) : answer,
        removed: s.phase === "question" ? (me?.removed ?? []) : [],
        ready: me?.ready ?? false,
      },
      question: q
        ? {
            id: q.id,
            number: isSuddenPhase ? (s.sudden?.round ?? 1) : s.qIndex + 1,
            prompt: q.prompt,
            choices: q.choices,
            difficulty: !showDigits && q.difficulty === "bonus" ? "hard" : q.difficulty,
            episodeId: q.episodeId,
            isDigit: showDigits && q.digitIndex !== null,
            digitIndex: showDigits ? q.digitIndex : null,
            startedAt: s.questionStartedAt,
            durationMs: isSuddenPhase ? ARENA_SUDDEN_MS : ARENA_QUESTION_MS,
          }
        : null,
      reveal,
      questionIndex: s.qIndex,
      totalQuestions: this.totalQuestions(),
      sudden: s.sudden,
      vault:
        s.set && showDigits
          ? { episodeId: s.set.vault.episodeId, title: s.set.vault.title, freeIndexes: s.set.vault.freeIndexes, codeLength }
          : null,
      digitPositions: this.digitPositions(),
      tournament: s.tournament
        ? { id: s.tournament.id, name: s.tournament.name, rank: s.tournament.rank, runsLeft: s.tournament.runsLeft, entrants: s.tournament.entrants }
        : null,
      elimination: s.elimination
        ? {
            checkpoints: FINAL_CHECKPOINTS,
            cuts: s.elimination.cuts,
            next: s.elimination.done < s.elimination.cuts.length ? s.elimination.done : null,
            lastCut: s.elimination.lastCut,
            survivors: this.activePlayers().filter((p) => p.eliminatedAfter === null).length,
          }
        : null,
      race: this.raceView(userId),
      jackpotAmount: s.jackpotAmount,
      winnerId: s.winnerId,
      winReason: s.winReason,
      jackpot,
      standings: s.standings,
      notice: s.notice,
      startsAt: s.tournament?.startsAt ?? null,
    };
  }

  private knownDigitCount(p: PlayerState): number {
    return (this.state.set?.vault.freeIndexes.length ?? 0) + Object.keys(p.earned).length;
  }

  private raceView(viewerId: string): RaceView | null {
    const s = this.state;
    if (!s.race) return null;
    const done = s.race.status === "done";
    const viewerRacing = !done && s.race.racers.some((r) => r.userId === viewerId);
    return {
      racers: s.race.racers.map((r) => {
        const p = this.player(r.userId);
        const own = r.userId === viewerId;
        return {
          userId: r.userId,
          name: p?.name ?? "Player",
          attempts: r.codes.length,
          // Rival racers can't read each other's guesses mid-race; spectators and knocked-out players can.
          codes: r.codes.map((c) => (own || done || !viewerRacing ? c : null)),
          cracked: r.crackedAtMs !== null,
          crackedAtMs: r.crackedAtMs,
          knownDigits: p ? this.knownDigitCount(p) : 0,
          score: p?.score ?? 0,
        };
      }),
      status: s.race.status,
      winnerId: s.race.winnerId,
      code: done ? (s.set?.vault.code ?? null) : null,
      story: done ? (s.set?.vault.story ?? null) : null,
      attemptsPerRacer: RACE_ATTEMPTS,
    };
  }

  private hubRequest(path: string, init?: RequestInit): Request {
    const headers = new Headers(init?.headers);
    headers.set("X-Rork-DO-Class", "ArenaHub");
    headers.set("X-Rork-DO-Id", "global");
    if (init?.body) headers.set("Content-Type", "application/json");
    return new Request(`https://internal${path}`, { ...init, headers });
  }

  private report(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastReportAt < REPORT_EVERY_MS) return;
    this.lastReportAt = now;
    const seated = this.activePlayers().filter((p) => !p.left && (p.connected || this.inMatch()));
    const summary: ArenaRoomSummary = {
      roomId: this.roomId,
      kind: this.state.kind,
      phase: this.state.phase,
      playerNames: seated.map((p) => p.name),
      playerIds: seated.map((p) => p.userId),
      playerCount: seated.filter((p) => p.connected).length,
      spectators: this.state.players.filter((p) => p.role === "spectator" && p.connected).length,
      updatedAt: now,
    };
    this.ctx.waitUntil(
      this.env.DO.fetch(this.hubRequest("/report", { method: "POST", body: JSON.stringify(summary) })).catch((err: unknown) =>
        console.warn("[arena] hub report failed", String(err)),
      ),
    );
  }

  // ---------- timing ----------

  /** Arms one timer for the next deadline (or a 1s housekeeping tick) while there's a reason to stay awake. */
  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const hasSockets = this.ctx.getWebSockets().length > 0;
    const needsWork = hasSockets || this.inMatch() || this.state.phase === "countdown" || this.state.players.some((p) => p.connected);
    if (!needsWork) return;
    const now = Date.now();
    const deadline = this.state.phaseEndsAt ?? Infinity;
    const wait = Math.max(0, Math.min(deadline - now, TICK_MS));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.ctx.waitUntil(this.tick().finally(() => this.schedule()));
    }, wait);
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const s = this.state;
    let changed = false;

    // Rejoin windows: drop out of the match after 30s away, or out of the lobby after a short grace.
    for (const p of [...s.players]) {
      if (p.connected || p.disconnectedAt === null) continue;
      const away = now - p.disconnectedAt;
      if (this.inMatch() && p.role === "player") {
        if (!p.left && away > ARENA_REJOIN_MS) {
          p.left = true;
          changed = true;
        }
      } else if (s.kind === "final" && p.role === "player") {
        // Finalists keep their seat while they're away from the lobby.
      } else if (away > LOBBY_GRACE_MS && !(s.kind === "qualifier" && p.userId === s.tournament?.ownerId)) {
        s.players = s.players.filter((x) => x !== p);
        changed = true;
      }
    }
    // The creator keeps host while they're on the way in; hand it off only once they've clearly gone.
    if (s.kind === "private" && s.hostId && !this.player(s.hostId) && now - s.createdAt > LOBBY_GRACE_MS) {
      s.hostId = this.activePlayers().find((p) => p.connected)?.userId ?? null;
      changed = true;
    }

    if (this.isArena() && this.inMatch() && this.activePlayers().every((p) => p.left)) {
      this.resetToLobby("Match cancelled. Everyone left.");
      changed = true;
    }
    // A qualifier player who stays away past the rejoin window banks what they have.
    if (s.kind === "qualifier" && this.inMatch() && s.phase !== "results" && this.activePlayers().every((p) => p.left) && !this.transitioning) {
      this.transitioning = true;
      try {
        await this.finishRun();
      } finally {
        this.transitioning = false;
      }
      changed = true;
    }
    if (s.kind === "qualifier" && s.phase === "lobby" && this.livePlayers().length >= 1) {
      s.phase = "countdown";
      s.phaseEndsAt = now + QUALIFIER_COUNTDOWN_MS;
      changed = true;
    }
    if (s.kind === "final" && s.phase === "results" && s.tournament && !s.tournament.reported && now - this.lastResultPushAt > 10_000) {
      await this.pushFinalResult();
    }

    if (s.phase === "lobby" && s.kind === "public" && this.livePlayers().length >= 2) {
      s.phase = "countdown";
      s.phaseEndsAt = now + PUBLIC_COUNTDOWN_MS;
      s.notice = null;
      changed = true;
    }
    if (this.isArena() && s.phase === "countdown" && this.livePlayers().length < 2) {
      s.phase = "lobby";
      s.phaseEndsAt = null;
      s.notice = "Countdown paused. Waiting for another player.";
      changed = true;
    }

    if (s.phaseEndsAt !== null && now >= s.phaseEndsAt && !this.transitioning) {
      this.transitioning = true;
      try {
        await this.advance();
      } finally {
        this.transitioning = false;
      }
      changed = true;
    }

    if (changed) {
      this.persist();
      this.broadcast();
      this.report(true);
    } else {
      this.report();
    }
  }

  private async advance(): Promise<void> {
    const s = this.state;
    switch (s.phase) {
      case "countdown":
        await this.startMatch();
        return;
      case "question":
        this.revealQuestion();
        return;
      case "reveal": {
        const answered = s.qIndex + 1;
        if (s.kind === "final" && s.elimination && s.elimination.done < s.elimination.cuts.length && FINAL_CHECKPOINTS[s.elimination.done] === answered) {
          if (s.elimination.cuts[s.elimination.done] > 0) {
            this.runCheckpoint();
            return;
          }
          // Tiny finals skip empty checkpoints.
          s.elimination.done += 1;
        }
        await this.nextQuestionOrFinish();
        return;
      }
      case "checkpoint":
        await this.nextQuestionOrFinish();
        return;
      case "sudden":
        this.revealSudden();
        return;
      case "sudden_reveal":
        if (s.sudden?.purpose === "cut") this.resolveCutSudden();
        else this.resolveSudden();
        return;
      case "race":
        if (s.race && s.race.status === "open") {
          this.closeRace();
          return;
        }
        await this.finalize();
        return;
      case "jackpot":
        if (s.jackpot && s.jackpot.status === "open") {
          s.jackpot.status = "sealed";
          s.phaseEndsAt = Date.now() + JACKPOT_OUTRO_MS;
          return;
        }
        await this.finalize();
        return;
      case "results":
        if (this.isArena()) this.resetToLobby(null);
        else s.phaseEndsAt = null;
        return;
      default:
        s.phaseEndsAt = null;
    }
  }

  // ---------- match flow ----------

  private async startMatch(): Promise<void> {
    const s = this.state;
    if (this.isArena() && this.livePlayers().length < 2) {
      s.phase = "lobby";
      s.phaseEndsAt = null;
      s.notice = "Need at least 2 players to start.";
      return;
    }
    let exclusions: ArenaExclusions = { episodes: [], questions: [] };
    let publicJackpot = JACKPOT_BASE;
    try {
      const res = await this.env.DO.fetch(this.hubRequest("/match-config"));
      const config = (await res.json()) as { exclusions: ArenaExclusions; publicJackpot: number };
      exclusions = config.exclusions;
      publicJackpot = config.publicJackpot;
    } catch (err) {
      console.warn("[arena] match-config failed", String(err));
    }

    s.set = s.kind === "final" ? buildFinalSet(s.pool, exclusions) : buildMatchSet(s.pool, exclusions, s.recent);
    s.recent = [...s.set.questions.map((q) => q.id), ...s.recent].slice(0, 80);
    s.matchNumber += 1;
    s.matchId = `${this.roomId}-${Date.now().toString(36)}`;
    s.jackpotAmount = s.kind === "public" ? publicJackpot : s.privateJackpot;
    s.qIndex = 0;
    s.sudden = null;
    s.suddenIndex = -1;
    s.race = null;
    s.winnerId = null;
    s.winReason = null;
    s.jackpot = null;
    s.standings = null;
    s.notice = null;
    // Players who dropped in the lobby don't take a seat in an Arena match; finalists always keep theirs.
    if (s.kind !== "final") s.players = s.players.filter((p) => p.connected || p.role === "spectator");
    s.players.forEach((p) => {
      resetMatchFields(p);
      p.left = false;
      // A finalist who never showed up is treated as away from the first question.
      if (s.kind === "final" && p.role === "player" && !p.connected && p.disconnectedAt === null) p.disconnectedAt = Date.now();
    });
    s.elimination = s.kind === "final" ? { cuts: eliminationCuts(this.activePlayers().length), done: 0, lastCut: [], pending: null } : null;
    this.openQuestion();
  }

  private openQuestion(): void {
    const s = this.state;
    s.phase = "question";
    s.questionStartedAt = Date.now();
    s.phaseEndsAt = s.questionStartedAt + ARENA_QUESTION_MS;
    this.activePlayers().forEach((p) => {
      p.current = null;
      p.removed = [];
    });
  }

  private maybeEndQuestionEarly(): void {
    const s = this.state;
    if (s.phase === "question") {
      const live = this.livePlayers();
      if (live.length > 0 && live.every((p) => p.current !== null)) s.phaseEndsAt = Math.min(s.phaseEndsAt ?? Infinity, Date.now() + 400);
    }
    if (s.phase === "sudden" && s.sudden) {
      const tied = this.livePlayers().filter((p) => s.sudden!.playerIds.includes(p.userId));
      if (tied.length > 0 && tied.every((p) => p.sudden !== null)) s.phaseEndsAt = Math.min(s.phaseEndsAt ?? Infinity, Date.now() + 400);
    }
  }

  private revealQuestion(): void {
    const s = this.state;
    const q = s.set?.questions[s.qIndex];
    if (!q) return;
    const isDigit = q.digitIndex !== null;
    const base = isDigit ? 1000 : basePoints(q.difficulty);

    this.activePlayers().forEach((p) => {
      if (p.eliminatedAfter !== null) {
        p.lastChoice = null;
        p.lastCorrect = null;
        p.lastPoints = 0;
        p.lastSpeedBonus = 0;
        return;
      }
      const ans = p.current;
      const correct = ans !== null && ans.choice === q.correctIndex;
      p.lastChoice = ans?.choice ?? null;
      p.lastCorrect = correct;
      p.lastPoints = 0;
      p.lastSpeedBonus = 0;
      p.totalTimeMs += ans ? ans.ms : ARENA_QUESTION_MS;
      if (ans && ans.choice !== null) p.answered += 1;

      if (correct && ans) {
        const speed = Math.round(base * 0.5 * Math.max(0, 1 - ans.ms / ARENA_QUESTION_MS));
        p.streak += 1;
        const points = Math.round((base + speed) * multiplierForStreak(p.streak));
        p.score += points;
        p.correct += 1;
        p.lastPoints = points;
        p.lastSpeedBonus = speed;
        p.fastestMs = p.fastestMs === null ? ans.ms : Math.min(p.fastestMs, ans.ms);
        if (isDigit && q.digit !== null) p.earned[String(q.digitIndex)] = q.digit;
      } else if (!isDigit) {
        // Missed digit questions never break the streak; Shield saves it once on a standard miss.
        if (p.shield === "armed" && ans) p.shield = "used";
        else p.streak = 0;
      }
    });

    s.phase = "reveal";
    s.phaseEndsAt = Date.now() + ARENA_REVEAL_MS;
  }

  private ranking(): PlayerState[] {
    return [...this.activePlayers()].sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
  }

  private finishMain(): void {
    const ranked = this.ranking();
    const top = ranked[0]?.score ?? 0;
    const tied = ranked.filter((p) => p.score === top && !p.left);
    if (ranked.length === 1) return this.declareWinner(ranked[0].userId, "solo");
    if (tied.length === 0) return this.declareWinner(ranked[0].userId, "time");
    if (tied.length === 1) return this.declareWinner(tied[0].userId, "score");
    this.state.sudden = { round: 1, playerIds: tied.map((p) => p.userId), purpose: "win" };
    this.openSudden();
  }

  private openSudden(): void {
    const s = this.state;
    s.suddenIndex += 1;
    s.phase = "sudden";
    s.questionStartedAt = Date.now();
    s.phaseEndsAt = s.questionStartedAt + ARENA_SUDDEN_MS;
    this.activePlayers().forEach((p) => {
      p.sudden = null;
      p.lastChoice = null;
    });
  }

  private revealSudden(): void {
    const s = this.state;
    const q = this.currentQuestion();
    if (!q || !s.sudden) return;
    this.activePlayers().forEach((p) => {
      if (!s.sudden!.playerIds.includes(p.userId)) return;
      p.lastChoice = p.sudden?.choice ?? null;
      p.lastCorrect = p.sudden !== null && p.sudden.choice === q.correctIndex;
    });
    s.phase = "sudden_reveal";
    s.phaseEndsAt = Date.now() + ARENA_REVEAL_MS;
  }

  private resolveSudden(): void {
    const s = this.state;
    const q = this.currentQuestion();
    if (!q || !s.sudden) return;
    const contenders = this.activePlayers().filter((p) => s.sudden!.playerIds.includes(p.userId));
    const correct = contenders
      .filter((p) => p.sudden && p.sudden.choice === q.correctIndex)
      .sort((a, b) => (a.sudden!.ms - b.sudden!.ms) || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
    if (correct.length > 0) return this.declareWinner(correct[0].userId, "sudden");
    if (s.sudden.round < SUDDEN_ROUNDS && s.set && s.set.suddenDeath.length > s.suddenIndex + 1) {
      s.sudden = { ...s.sudden, round: s.sudden.round + 1 };
      return this.openSudden();
    }
    // Still tied after sudden death: faster total answer time across the match wins.
    const fallback = [...contenders].sort((a, b) => a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt)[0];
    this.declareWinner(fallback.userId, "time");
  }

  private declareWinner(userId: string, reason: WinReason): void {
    const s = this.state;
    s.winnerId = userId;
    s.winReason = reason;
    s.jackpot = { winnerId: userId, amount: s.jackpotAmount, attempts: [], status: "open" };
    s.phase = "jackpot";
    s.phaseEndsAt = Date.now() + ARENA_JACKPOT_MS;
  }

  private async finalize(): Promise<void> {
    const s = this.state;
    if (s.kind === "final") return this.finalizeFinal();
    const cracked = s.jackpot?.status === "cracked";
    const winnerId = s.winnerId;
    const others = this.ranking().filter((p) => p.userId !== winnerId);
    const winner = this.activePlayers().find((p) => p.userId === winnerId);
    const ordered = winner ? [winner, ...others] : others;
    s.standings = ordered.map((p, i) => ({
      userId: p.userId,
      name: p.name,
      placement: i + 1,
      score: p.score,
      correct: p.correct,
      answered: p.answered,
      fastestMs: p.fastestMs,
      totalTimeMs: p.totalTimeMs,
      vcEarned: p.score + (p.userId === winnerId && cracked ? s.jackpotAmount : 0),
      left: p.left,
    }));

    if (s.kind === "private") {
      s.privateJackpot = cracked ? JACKPOT_BASE : Math.min(JACKPOT_CAP, s.privateJackpot + JACKPOT_STEP);
    }

    const record: ArenaMatchRecord = {
      matchId: s.matchId ?? `${this.roomId}-${Date.now()}`,
      roomId: this.roomId,
      kind: s.kind,
      endedAt: Date.now(),
      winnerId,
      winnerName: winner?.name ?? null,
      winReason: s.winReason,
      jackpotAmount: s.jackpotAmount,
      jackpotCracked: cracked,
      vaultEpisodeId: s.set?.vault.episodeId ?? null,
      standings: s.standings,
    };
    try {
      await this.env.DO.fetch(this.hubRequest("/record", { method: "POST", body: JSON.stringify(record) }));
    } catch (err) {
      console.warn("[arena] record failed", String(err));
    }

    s.phase = "results";
    s.phaseEndsAt = s.kind === "public" ? Date.now() + PUBLIC_RESULTS_MS : null;
    this.activePlayers().forEach((p) => (p.ready = false));
  }

  // ---------- tournament flow ----------

  private async nextQuestionOrFinish(): Promise<void> {
    const s = this.state;
    const total = Math.min(this.totalQuestions(), s.set?.questions.length ?? 0);
    if (s.qIndex + 1 < total) {
      s.qIndex += 1;
      this.openQuestion();
      return;
    }
    if (s.kind === "qualifier") {
      await this.finishRun();
      return;
    }
    if (s.kind === "final") {
      await this.openRace();
      return;
    }
    this.finishMain();
  }

  /** Ranks finalists still in it: players who left drop to the bottom, then score, then total answer time. */
  private finalRanking(): PlayerState[] {
    return this.activePlayers()
      .filter((p) => p.eliminatedAfter === null)
      .sort((a, b) => Number(a.left) - Number(b.left) || b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
  }

  private runCheckpoint(): void {
    const s = this.state;
    const el = s.elimination!;
    const checkpoint = FINAL_CHECKPOINTS[el.done];
    const cut = el.cuts[el.done];
    const ranked = this.finalRanking();
    const keep = ranked.length - cut;
    if (cut <= 0 || keep < 1) {
      el.done += 1;
      el.lastCut = [];
      this.openCheckpoint();
      return;
    }
    // Players who left are never "tied" with someone still playing.
    const lastSafe = ranked[keep - 1];
    const firstOut = ranked[keep];
    const sameLine = (a: PlayerState, b: PlayerState) => a.score === b.score && a.left === b.left;
    if (!sameLine(lastSafe, firstOut) || lastSafe.left) {
      this.applyCut(checkpoint, ranked.slice(keep));
      return;
    }
    const group = ranked.filter((p) => sameLine(p, lastSafe));
    const safe = ranked.filter((p) => !group.includes(p) && ranked.indexOf(p) < keep);
    const below = ranked.filter((p) => !group.includes(p) && ranked.indexOf(p) >= keep);
    const slots = keep - safe.length;
    el.pending = { checkpoint, slots, group: group.map((p) => p.userId), safe: safe.map((p) => p.userId), below: below.map((p) => p.userId) };
    s.sudden = { round: 1, playerIds: el.pending.group, purpose: "cut" };
    s.notice = `Tie at the cut line. ${group.length} players fight for ${slots} ${slots === 1 ? "seat" : "seats"}.`;
    this.openSudden();
  }

  private resolveCutSudden(): void {
    const s = this.state;
    const el = s.elimination;
    const q = this.currentQuestion();
    if (!el?.pending || !s.sudden || !q) return;
    const pending = el.pending;
    const contenders = this.activePlayers().filter((p) => pending.group.includes(p.userId));
    const correct = contenders
      .filter((p) => !p.left && p.sudden && p.sudden.choice === q.correctIndex)
      .sort((a, b) => a.sudden!.ms - b.sudden!.ms || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
    const through = correct.slice(0, pending.slots);
    pending.safe.push(...through.map((p) => p.userId));
    pending.slots -= through.length;
    pending.group = pending.group.filter((id) => !through.some((p) => p.userId === id));

    const finish = () => {
      const cutIds = new Set([...pending.group, ...pending.below]);
      el.pending = null;
      s.sudden = null;
      s.notice = null;
      this.applyCut(pending.checkpoint, this.activePlayers().filter((p) => cutIds.has(p.userId)));
    };
    if (pending.slots <= 0) return finish();
    const canRetry = s.sudden.round < SUDDEN_ROUNDS && s.set && s.set.suddenDeath.length > s.suddenIndex + 1;
    if (canRetry) {
      s.sudden = { round: s.sudden.round + 1, playerIds: [...pending.group], purpose: "cut" };
      s.notice = `${pending.group.length} players fight for ${pending.slots} ${pending.slots === 1 ? "seat" : "seats"}.`;
      return this.openSudden();
    }
    // Still level after sudden death: faster total answer time takes the remaining seats.
    const byTime = this.activePlayers()
      .filter((p) => pending.group.includes(p.userId))
      .sort((a, b) => Number(a.left) - Number(b.left) || a.totalTimeMs - b.totalTimeMs || a.joinedAt - b.joinedAt);
    const rest = byTime.slice(0, pending.slots).map((p) => p.userId);
    pending.safe.push(...rest);
    pending.group = pending.group.filter((id) => !rest.includes(id));
    pending.slots = 0;
    finish();
  }

  private applyCut(checkpoint: number, out: PlayerState[]): void {
    const s = this.state;
    const el = s.elimination!;
    out.forEach((p) => {
      p.eliminatedAfter = checkpoint;
      p.current = null;
      p.sudden = null;
    });
    el.lastCut = out.map((p) => p.userId);
    el.done += 1;
    this.openCheckpoint();
  }

  private openCheckpoint(): void {
    const s = this.state;
    s.phase = "checkpoint";
    s.phaseEndsAt = Date.now() + CHECKPOINT_MS;
  }

  private async openRace(): Promise<void> {
    const s = this.state;
    const survivors = this.activePlayers().filter((p) => p.eliminatedAfter === null);
    if (survivors.length === 0) {
      await this.finalizeFinal();
      return;
    }
    s.race = {
      startedAt: Date.now(),
      racers: survivors.map((p) => ({ userId: p.userId, codes: [], crackedAtMs: null })),
      status: "open",
      winnerId: null,
    };
    s.phase = "race";
    s.phaseEndsAt = Date.now() + FINAL_RACE_MS;
  }

  /** Time's up or everyone's out of tries: nobody cracked it, so the top score among survivors takes it. */
  private closeRace(): void {
    const s = this.state;
    if (!s.race || s.race.status !== "open") return;
    const top = this.finalRanking()[0];
    s.race.status = "done";
    s.race.winnerId = top?.userId ?? null;
    s.winnerId = top?.userId ?? null;
    const rivals = this.finalRanking();
    s.winReason = rivals.length > 1 && rivals[1].score === top?.score ? "time" : "score";
    s.phaseEndsAt = Date.now() + RACE_OUTRO_MS;
  }

  private placements(): TournamentPlacement[] {
    const s = this.state;
    const winnerId = s.race?.winnerId ?? s.winnerId;
    const survivors = this.finalRanking();
    const eliminated = this.activePlayers()
      .filter((p) => p.eliminatedAfter !== null)
      .sort((a, b) => (b.eliminatedAfter ?? 0) - (a.eliminatedAfter ?? 0) || b.score - a.score || a.totalTimeMs - b.totalTimeMs);
    const winner = survivors.find((p) => p.userId === winnerId);
    const ordered = [...(winner ? [winner] : []), ...survivors.filter((p) => p !== winner), ...eliminated];
    return ordered.map((p, i) => ({
      userId: p.userId,
      name: p.name,
      placement: i + 1,
      score: p.score,
      eliminatedAfter: p.eliminatedAfter,
      vcPrize: 0,
      cracked: (s.race?.racers.find((r) => r.userId === p.userId)?.crackedAtMs ?? null) !== null,
    }));
  }

  private raceSummary(): TournamentRaceSummary | null {
    const s = this.state;
    if (!s.race || !s.set) return null;
    const winner = s.race.racers.find((r) => r.userId === s.race!.winnerId);
    return {
      winnerId: s.race.winnerId,
      cracked: Boolean(winner && winner.crackedAtMs !== null),
      crackedAtMs: winner?.crackedAtMs ?? null,
      code: s.set.vault.code,
      vaultTitle: s.set.vault.title,
      attempts: s.race.racers.map((r) => ({
        userId: r.userId,
        name: this.player(r.userId)?.name ?? "Player",
        codes: r.codes,
        cracked: r.crackedAtMs !== null,
      })),
    };
  }

  private async finalizeFinal(): Promise<void> {
    const s = this.state;
    const placements = this.placements();
    s.winnerId = placements[0]?.userId ?? null;
    s.standings = placements.map((pl) => {
      const p = this.player(pl.userId)!;
      return {
        userId: p.userId,
        name: p.name,
        placement: pl.placement,
        score: p.score,
        correct: p.correct,
        answered: p.answered,
        fastestMs: p.fastestMs,
        totalTimeMs: p.totalTimeMs,
        vcEarned: 0,
        left: p.left,
        eliminatedAfter: p.eliminatedAfter,
      };
    });
    s.phase = "results";
    s.phaseEndsAt = null;
    await this.pushFinalResult();
  }

  private lastResultPushAt = 0;

  private finalResultBody(): string {
    const s = this.state;
    return JSON.stringify({
      tournamentId: s.tournament?.id,
      placements: this.placements(),
      race: this.raceSummary(),
      viewers: s.players.filter((p) => p.role === "spectator").length,
    });
  }

  /** Sends the final's placings to the hub, which pays prizes. Retried until the hub confirms. */
  private async pushFinalResult(): Promise<void> {
    const s = this.state;
    if (!s.tournament || s.tournament.reported) return;
    this.lastResultPushAt = Date.now();
    try {
      const res = await this.env.DO.fetch(this.hubRequest("/t/final-result", { method: "POST", body: this.finalResultBody() }));
      if (res.ok) {
        const data = (await res.json()) as { placements?: TournamentPlacement[] };
        s.tournament.reported = true;
        if (data.placements && s.standings) {
          const prize = new Map(data.placements.map((p) => [p.userId, p.vcPrize]));
          s.standings = s.standings.map((row) => ({ ...row, vcEarned: prize.get(row.userId) ?? 0 }));
        }
      }
    } catch (err) {
      console.warn("[arena] final result push failed", String(err));
    }
  }

  /** Qualifier run over: report the score to the hub and show the player where they landed. */
  private async finishRun(): Promise<void> {
    const s = this.state;
    if (s.phase === "results") return;
    const p = this.activePlayers()[0];
    s.standings = p
      ? [
          {
            userId: p.userId,
            name: p.name,
            placement: 1,
            score: p.score,
            correct: p.correct,
            answered: p.answered,
            fastestMs: p.fastestMs,
            totalTimeMs: p.totalTimeMs + (this.totalQuestions() - Math.min(this.totalQuestions(), s.qIndex + 1)) * ARENA_QUESTION_MS,
            vcEarned: 0,
            left: p.left,
          },
        ]
      : [];
    s.phase = "results";
    s.phaseEndsAt = null;
    s.winnerId = p?.userId ?? null;
    if (!s.tournament || !p) return;
    try {
      const res = await this.env.DO.fetch(
        this.hubRequest("/t/run-result", {
          method: "POST",
          body: JSON.stringify({ runId: s.tournament.runId, tournamentId: s.tournament.id, userId: p.userId, score: p.score, totalTimeMs: s.standings[0].totalTimeMs }),
        }),
      );
      const data = (await res.json()) as { rank?: number | null; runsLeft?: number; entrants?: number; error?: string };
      s.tournament.reported = res.ok;
      s.tournament.rank = data.rank ?? null;
      s.tournament.runsLeft = data.runsLeft ?? null;
      s.tournament.entrants = data.entrants ?? null;
      if (!res.ok && data.error) s.notice = data.error;
    } catch (err) {
      console.warn("[arena] run result failed", String(err));
      s.notice = "Your score is saved here but couldn't reach the tournament board yet. Refresh in a moment.";
    }
  }

  private resetToLobby(notice: string | null): void {
    const s = this.state;
    s.players = s.players.filter((p) => p.connected && !p.left);
    s.players
      .sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === "player" ? -1 : 1))
      .forEach((p, i) => {
        p.role = i < ARENA_MAX_PLAYERS ? "player" : "spectator";
        resetMatchFields(p);
      });
    if (s.kind === "private" && (!s.hostId || !this.player(s.hostId))) s.hostId = s.players[0]?.userId ?? null;
    s.phase = "lobby";
    s.phaseEndsAt = null;
    s.set = null;
    s.qIndex = 0;
    s.sudden = null;
    s.winnerId = null;
    s.winReason = null;
    s.jackpot = null;
    s.standings = null;
    s.notice = notice;
  }

  private kick(userId: string, message: string): void {
    const s = this.state;
    if (!s.kicked.includes(userId)) s.kicked.push(userId);
    for (const ws of this.ctx.getWebSockets(userId)) {
      this.sendTo(ws, { type: "kicked", message });
      try {
        ws.close(4403, "kicked");
      } catch {
        /* already closed */
      }
    }
    const p = this.player(userId);
    if (p) {
      if (this.inMatch() && p.role === "player") {
        p.left = true;
        p.connected = false;
        p.disconnectedAt = Date.now();
      } else {
        s.players = s.players.filter((x) => x !== p);
      }
    }
    if (s.hostId === userId) s.hostId = this.activePlayers().find((x) => x.connected && !x.left)?.userId ?? null;
    this.maybeEndQuestionEarly();
    this.persist();
    this.broadcast();
    this.report(true);
    this.schedule();
  }

  private async closeRoom(): Promise<void> {
    this.broadcastRaw({ type: "kicked", message: "This room was closed by an admin." });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(4410, "closed");
      } catch {
        /* already closed */
      }
    }
    const kind = this.state.kind;
    this.state = freshState();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.ctx.storage.deleteAll();
    const summary: ArenaRoomSummary = {
      roomId: this.roomId,
      kind,
      phase: "lobby",
      playerNames: [],
      playerIds: [],
      playerCount: 0,
      spectators: 0,
      updatedAt: Date.now(),
    };
    await this.env.DO.fetch(this.hubRequest("/report", { method: "POST", body: JSON.stringify(summary) })).catch(() => undefined);
  }

  // ---------- client actions ----------

  private async handle(userId: string, msg: ClientMessage): Promise<void> {
    const s = this.state;
    const p = this.player(userId);
    if (!p) return;
    const seated = p.role === "player" && !p.left && p.eliminatedAfter === null;
    const fail = (message: string) => {
      for (const ws of this.ctx.getWebSockets(userId)) this.sendTo(ws, { type: "error", message });
    };

    switch (msg.type) {
      case "answer": {
        const q = this.currentQuestion();
        if (!seated || !q || msg.questionId !== q.id) return;
        const choice = Number(msg.choice);
        if (!Number.isInteger(choice) || choice < 0 || choice > 3) return;
        const ms = Math.max(0, Date.now() - s.questionStartedAt);
        if (s.phase === "question") {
          if (p.current || p.removed.includes(choice)) return;
          p.current = { choice, ms: Math.min(ms, ARENA_QUESTION_MS) };
        } else if (s.phase === "sudden") {
          if (!s.sudden?.playerIds.includes(userId) || p.sudden) return;
          p.sudden = { choice, ms: Math.min(ms, ARENA_SUDDEN_MS) };
        } else {
          return;
        }
        this.maybeEndQuestionEarly();
        break;
      }
      case "fifty": {
        const q = this.currentQuestion();
        if (!seated || s.phase !== "question" || !q || p.fiftyUsed || p.current || s.kind === "final") return;
        const wrong = shuffle([0, 1, 2, 3].filter((i) => i !== q.correctIndex)).slice(0, 2);
        p.fiftyUsed = true;
        p.removed = wrong;
        break;
      }
      case "shield": {
        if (!seated || !this.inMatch() || p.shield !== "ready" || s.kind === "final") return;
        if (s.phase === "question" && p.current) return fail("Arm the Shield before you answer.");
        p.shield = "armed";
        break;
      }
      case "start": {
        if (s.kind !== "private" || s.hostId !== userId || s.phase !== "lobby") return;
        if (this.livePlayers().length < 2) return fail("You need at least 2 players to start.");
        s.phase = "countdown";
        s.phaseEndsAt = Date.now() + PRIVATE_COUNTDOWN_MS;
        s.notice = null;
        break;
      }
      case "pool": {
        if (s.kind !== "private" || s.hostId !== userId || s.phase !== "lobby") return;
        if (!POOL_OPTIONS.some((o) => o.id === msg.pool)) return;
        s.pool = msg.pool;
        break;
      }
      case "crack": {
        if (s.phase === "race") {
          // Messages are handled one at a time, so the first correct code the server receives wins outright.
          const race = s.race;
          const racer = race?.racers.find((r) => r.userId === userId);
          if (!race || race.status !== "open" || !racer || racer.crackedAtMs !== null) return;
          if (racer.codes.length >= RACE_ATTEMPTS) return fail("You're out of tries.");
          const code = String(msg.code ?? "").replace(/\D/g, "");
          const length = s.set?.vault.code.length ?? 4;
          if (code.length !== length) return fail(`Enter all ${length} digits.`);
          racer.codes.push(code);
          if (code === s.set?.vault.code) {
            racer.crackedAtMs = Date.now() - race.startedAt;
            race.status = "done";
            race.winnerId = userId;
            s.winnerId = userId;
            s.winReason = "cracked";
            s.phaseEndsAt = Date.now() + RACE_OUTRO_MS;
          } else if (race.racers.every((r) => r.codes.length >= RACE_ATTEMPTS || !this.player(r.userId)?.connected)) {
            this.closeRace();
          }
          break;
        }
        const jp = s.jackpot;
        if (s.phase !== "jackpot" || !jp || jp.status !== "open" || jp.winnerId !== userId) return;
        const code = String(msg.code ?? "").replace(/\D/g, "");
        const length = s.set?.vault.code.length ?? 4;
        if (code.length !== length) return fail(`Enter all ${length} digits.`);
        const correct = code === s.set?.vault.code;
        jp.attempts.push({ code, correct });
        if (correct) jp.status = "cracked";
        else if (jp.attempts.length >= ARENA_JACKPOT_ATTEMPTS) jp.status = "sealed";
        if (jp.status !== "open") s.phaseEndsAt = Date.now() + JACKPOT_OUTRO_MS;
        break;
      }
      case "react": {
        if (!ARENA_REACTIONS.includes(msg.emoji)) return;
        const last = this.reactionAt.get(userId) ?? 0;
        if (Date.now() - last < 1_200) return;
        this.reactionAt.set(userId, Date.now());
        this.broadcastRaw({ type: "reaction", userId, name: p.name, emoji: msg.emoji as Reaction, at: Date.now() });
        return;
      }
      case "ready": {
        if (s.phase !== "results") return;
        p.ready = true;
        const live = this.livePlayers();
        if (s.kind === "public" && live.length > 0 && live.every((x) => x.ready)) s.phaseEndsAt = Date.now() + 600;
        break;
      }
      case "rematch": {
        if (s.kind !== "private" || s.hostId !== userId || s.phase !== "results") return;
        this.resetToLobby(null);
        break;
      }
      default:
        return;
    }
    this.persist();
    this.broadcast();
    this.report(msg.type === "start" || msg.type === "rematch");
  }
}
