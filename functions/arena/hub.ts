import { DurableObject } from "cloudflare:workers";

import { JACKPOT_BASE, JACKPOT_CAP, JACKPOT_STEP, poolEpisodes } from "./pool";
import { TournamentError, TournamentStore, type RequestUser } from "./tournaments";
import {
  ARENA_MAX_PLAYERS,
  type ArenaAdminState,
  type ArenaExclusions,
  type ArenaLeaderboard,
  type ArenaLeaderboardRow,
  type ArenaMatchRecord,
  type ArenaOverview,
  type ArenaPlayerStats,
  type ArenaRoomSummary,
} from "./protocol";

type Env = {
  DO: Fetcher & {
    setAlarm(className: string, id: string, scheduledTime: number | Date): Promise<void>;
  };
};

const ROOM_TTL_MS = 90_000;
const RATING_START = 1000;
const RATING_K = 32;

type PlayerRow = {
  user_id: string;
  name: string;
  matches: number;
  wins: number;
  rating: number;
  arena_vc: number;
  jackpots: number;
  best_score: number;
  t_champion?: number;
  t_finalist?: number;
  t_qualifier?: number;
  title?: string | null;
};

function toStats(row: PlayerRow): ArenaPlayerStats {
  return {
    userId: row.user_id,
    name: row.name,
    matches: row.matches,
    wins: row.wins,
    rating: Math.round(row.rating),
    arenaVc: row.arena_vc,
    jackpots: row.jackpots,
    bestScore: row.best_score,
    trophies: { champion: row.t_champion ?? 0, finalist: row.t_finalist ?? 0, qualifier: row.t_qualifier ?? 0 },
    title: row.title ?? null,
  };
}

function randomId(length: number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Singleton Arena hub (id "global"): public matchmaking, the live room directory,
 * player stats + skill rating, match history, the public jackpot, and admin pool exclusions.
 */
export class ArenaHub extends DurableObject<Env> {
  private readonly tournaments: TournamentStore;
  private alarmAt: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS rooms (
      room_id TEXT PRIMARY KEY, kind TEXT NOT NULL, phase TEXT NOT NULL,
      player_names TEXT NOT NULL, player_ids TEXT NOT NULL,
      player_count INTEGER NOT NULL, spectators INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS players (
      user_id TEXT PRIMARY KEY, name TEXT NOT NULL, matches INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0, rating REAL NOT NULL DEFAULT ${RATING_START},
      arena_vc INTEGER NOT NULL DEFAULT 0, jackpots INTEGER NOT NULL DEFAULT 0,
      best_score INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS matches (match_id TEXT PRIMARY KEY, ended_at INTEGER NOT NULL, data TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const cols = new Set(sql.exec<{ name: string }>("PRAGMA table_info(players)").toArray().map((c) => c.name));
    const add: [string, string][] = [
      ["t_champion", "INTEGER NOT NULL DEFAULT 0"],
      ["t_finalist", "INTEGER NOT NULL DEFAULT 0"],
      ["t_qualifier", "INTEGER NOT NULL DEFAULT 0"],
      ["title", "TEXT"],
      ["title_series", "TEXT"],
    ];
    add.forEach(([name, type]) => {
      if (!cols.has(name)) sql.exec(`ALTER TABLE players ADD COLUMN ${name} ${type}`);
    });
    // Clear pre-launch bot test data (real player ids are Supabase UUIDs).
    sql.exec("DELETE FROM players WHERE user_id LIKE 'test-%'");
    sql.exec(`DELETE FROM matches WHERE data LIKE '%"userId":"test-%'`);
    sql.exec("DELETE FROM rooms WHERE player_ids LIKE '%test-%'");
    this.tournaments = new TournamentStore(sql, (className, id, path, body) => {
      const headers = new Headers({ "X-Rork-DO-Class": className, "X-Rork-DO-Id": id, "Content-Type": "application/json" });
      return this.env.DO.fetch(new Request(`https://internal${path}`, { method: "POST", headers, body: JSON.stringify(body ?? {}) }));
    });
  }

  /** Durable scheduler: advances tournaments even when nobody is online. */
  async onAlarm(): Promise<void> {
    this.alarmAt = null;
    const now = Date.now();
    this.tournaments.process(now);
    await Promise.allSettled(this.tournaments.drain());
    await this.armAlarm(true);
  }

  private async armAlarm(force = false): Promise<void> {
    const next = this.tournaments.nextDue(Date.now());
    if (next === null) return;
    if (!force && this.alarmAt !== null && this.alarmAt <= next) return;
    this.alarmAt = next;
    try {
      await this.env.DO.setAlarm("ArenaHub", "global", next);
    } catch (err) {
      console.warn("[hub] setAlarm failed", String(err));
      this.alarmAt = null;
    }
  }

  private async afterTournamentWrite(): Promise<void> {
    this.ctx.waitUntil(Promise.allSettled(this.tournaments.drain()).then(() => undefined));
    await this.armAlarm(true);
  }

  private async tournamentRoute(request: Request, url: URL): Promise<Response | null> {
    const path = url.pathname;
    if (!path.startsWith("/t/")) return null;
    const now = Date.now();
    const user: RequestUser | null = url.searchParams.get("userId")
      ? { userId: url.searchParams.get("userId")!, name: url.searchParams.get("name") ?? "Player", email: url.searchParams.get("email") }
      : null;
    const body = request.method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
    try {
      // Catch up on anything overdue before answering (the alarm is the backstop).
      this.tournaments.process(now);
      let out: unknown;
      if (path === "/t/list") out = this.tournaments.list(user, now);
      else if (path === "/t/detail") out = this.tournaments.detail(String(url.searchParams.get("id")), user, now);
      else if (path === "/t/register" && user) out = this.tournaments.register(String(body.id), user, typeof body.code === "string" ? body.code : null, now);
      else if (path === "/t/run" && user) out = await this.tournaments.startRun(String(body.id), user, now);
      else if (path === "/t/checkin" && user) out = this.tournaments.checkin(String(body.id), user, now);
      else if (path === "/t/run-result") out = this.tournaments.runResult(body as never, now);
      else if (path === "/t/final-result") out = { placements: this.tournaments.finalResult(body as never, now) };
      else if (path === "/t/admin/list") out = { tournaments: this.tournaments.adminList(now), insights: this.tournaments.insights(now) };
      else if (path === "/t/admin/save") out = this.tournaments.save(body as never, now);
      else if (path === "/t/admin/invites") out = this.tournaments.setInvites(String(body.id), body.invites, now);
      else if (path === "/t/admin/action") out = this.tournaments.action(body as never, now);

      else return Response.json({ error: "not found" }, { status: 404 });
      await this.afterTournamentWrite();
      return Response.json(out);
    } catch (err) {
      await this.afterTournamentWrite();
      if (err instanceof TournamentError) return Response.json({ error: err.message }, { status: err.status });
      console.error("[hub] tournament route failed", path, String(err));
      return Response.json({ error: "Something went wrong with the tournament." }, { status: 500 });
    }
  }

  private getKv<T>(key: string, fallback: T): T {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM kv WHERE key = ?", key).toArray()[0];
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private setKv(key: string, value: unknown): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }

  private publicJackpot(): number {
    return this.getKv<number>("public_jackpot", JACKPOT_BASE);
  }

  private exclusions(): ArenaExclusions {
    return this.getKv<ArenaExclusions>("exclusions", { episodes: [], questions: [] });
  }

  private liveRooms(): ArenaRoomSummary[] {
    this.ctx.storage.sql.exec("DELETE FROM rooms WHERE updated_at < ?", Date.now() - ROOM_TTL_MS);
    return this.ctx.storage.sql
      .exec<{
        room_id: string;
        kind: string;
        phase: string;
        player_names: string;
        player_ids: string;
        player_count: number;
        spectators: number;
        updated_at: number;
      }>("SELECT * FROM rooms ORDER BY updated_at DESC")
      .toArray()
      .map((r) => ({
        roomId: r.room_id,
        kind: r.kind as ArenaRoomSummary["kind"],
        phase: r.phase as ArenaRoomSummary["phase"],
        playerNames: JSON.parse(r.player_names) as string[],
        playerIds: JSON.parse(r.player_ids) as string[],
        playerCount: r.player_count,
        spectators: r.spectators,
        updatedAt: r.updated_at,
      }));
  }

  private playerRow(userId: string): PlayerRow | null {
    return this.ctx.storage.sql.exec<PlayerRow>("SELECT * FROM players WHERE user_id = ?", userId).toArray()[0] ?? null;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const tournamentResponse = await this.tournamentRoute(request, url);
    if (tournamentResponse) return tournamentResponse;

    if (request.method === "POST" && path === "/report") {
      const report = (await request.json()) as ArenaRoomSummary;
      if (report.playerCount + report.spectators === 0) {
        this.ctx.storage.sql.exec("DELETE FROM rooms WHERE room_id = ?", report.roomId);
      } else {
        this.ctx.storage.sql.exec(
          `INSERT INTO rooms (room_id, kind, phase, player_names, player_ids, player_count, spectators, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(room_id) DO UPDATE SET kind = excluded.kind, phase = excluded.phase,
             player_names = excluded.player_names, player_ids = excluded.player_ids,
             player_count = excluded.player_count, spectators = excluded.spectators, updated_at = excluded.updated_at`,
          report.roomId,
          report.kind,
          report.phase,
          JSON.stringify(report.playerNames),
          JSON.stringify(report.playerIds),
          report.playerCount,
          report.spectators,
          Date.now(),
        );
      }
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && path === "/assign") {
      const { userId } = (await request.json()) as { userId: string };
      const rooms = this.liveRooms().filter((r) => r.kind === "public");
      const mine = rooms.find((r) => r.playerIds.includes(userId));
      if (mine) return Response.json({ roomId: mine.roomId });
      const seats = (r: ArenaRoomSummary) => r.playerCount + r.spectators;
      const open = rooms
        .filter((r) => (r.phase === "lobby" || r.phase === "countdown") && seats(r) < ARENA_MAX_PLAYERS)
        .sort((a, b) => seats(b) - seats(a))[0];
      const live = rooms.filter((r) => seats(r) < ARENA_MAX_PLAYERS).sort((a, b) => seats(a) - seats(b))[0];
      const target = open ?? live;
      if (target) return Response.json({ roomId: target.roomId });
      const roomId = `pub-${randomId(6)}`;
      // Reserve the new room right away so simultaneous joiners land together.
      this.ctx.storage.sql.exec(
        `INSERT INTO rooms (room_id, kind, phase, player_names, player_ids, player_count, spectators, updated_at)
         VALUES (?, 'public', 'lobby', '[]', ?, 1, 0, ?)`,
        roomId,
        JSON.stringify([userId]),
        Date.now(),
      );
      return Response.json({ roomId });
    }

    if (request.method === "GET" && path === "/overview") {
      const userId = url.searchParams.get("userId");
      const rooms = this.liveRooms();
      const row = userId ? this.playerRow(userId) : null;
      const overview: ArenaOverview = {
        online: rooms.reduce((sum, r) => sum + r.playerCount + r.spectators, 0),
        liveRooms: rooms.filter((r) => r.phase !== "lobby" && r.phase !== "countdown").length,
        publicJackpot: this.publicJackpot(),
        me: row ? toStats(row) : null,
        spotlight: this.tournaments.spotlight(Date.now()),
      };
      return Response.json(overview);
    }

    if (request.method === "GET" && path === "/leaderboard") {
      const userId = url.searchParams.get("userId");
      const all = this.ctx.storage.sql
        .exec<PlayerRow>("SELECT * FROM players WHERE matches > 0 ORDER BY rating DESC, wins DESC, arena_vc DESC")
        .toArray();
      const ranked: ArenaLeaderboardRow[] = all.map((row, i) => ({ ...toStats(row), rank: i + 1, isMe: row.user_id === userId }));
      const board: ArenaLeaderboard = {
        rows: ranked.slice(0, 10),
        me: ranked.find((r) => r.isMe) ?? null,
        totalPlayers: ranked.length,
      };
      return Response.json(board);
    }

    if (request.method === "GET" && path === "/match-config") {
      return Response.json({ exclusions: this.exclusions(), publicJackpot: this.publicJackpot() });
    }

    if (request.method === "POST" && path === "/record") {
      const record = (await request.json()) as ArenaMatchRecord;
      this.applyRecord(record);
      return Response.json({ ok: true, publicJackpot: this.publicJackpot() });
    }

    if (request.method === "GET" && path === "/admin/state") {
      const matches = this.ctx.storage.sql
        .exec<{ data: string }>("SELECT data FROM matches ORDER BY ended_at DESC LIMIT 40")
        .toArray()
        .map((r) => JSON.parse(r.data) as ArenaMatchRecord);
      const state: ArenaAdminState = {
        rooms: this.liveRooms(),
        matches,
        exclusions: this.exclusions(),
        publicJackpot: this.publicJackpot(),
        episodes: poolEpisodes(),
      };
      return Response.json(state);
    }

    if (request.method === "POST" && path === "/admin/exclusions") {
      const body = (await request.json()) as Partial<ArenaExclusions>;
      const clean = (list: unknown): string[] =>
        Array.isArray(list) ? [...new Set(list.filter((v): v is string => typeof v === "string" && v.length <= 64).map((v) => v.trim()).filter(Boolean))].slice(0, 500) : [];
      const next: ArenaExclusions = { episodes: clean(body.episodes), questions: clean(body.questions) };
      this.setKv("exclusions", next);
      return Response.json(next);
    }

    return new Response("not found", { status: 404 });
  }

  private applyRecord(record: ArenaMatchRecord): void {
    const sql = this.ctx.storage.sql;
    sql.exec("INSERT OR IGNORE INTO matches (match_id, ended_at, data) VALUES (?, ?, ?)", record.matchId, record.endedAt, JSON.stringify(record));
    sql.exec("DELETE FROM matches WHERE match_id NOT IN (SELECT match_id FROM matches ORDER BY ended_at DESC LIMIT 200)");

    if (record.kind === "public") {
      const current = this.publicJackpot();
      this.setKv("public_jackpot", record.jackpotCracked ? JACKPOT_BASE : Math.min(JACKPOT_CAP, current + JACKPOT_STEP));
    }

    this.tournaments.bumpActivity(record.endedAt, record.standings.length);
    // Practice matches (a single player) never touch ratings or the board.
    const field = record.standings;
    if (field.length < 2) return;

    const rows = new Map<string, PlayerRow>();
    field.forEach((s) => {
      rows.set(
        s.userId,
        this.playerRow(s.userId) ?? {
          user_id: s.userId,
          name: s.name,
          matches: 0,
          wins: 0,
          rating: RATING_START,
          arena_vc: 0,
          jackpots: 0,
          best_score: 0,
        },
      );
    });

    // Pairwise Elo by final placement, averaged over the field.
    const deltas = new Map<string, number>();
    field.forEach((a) => {
      const ra = rows.get(a.userId)!.rating;
      let delta = 0;
      field.forEach((b) => {
        if (a.userId === b.userId) return;
        const rb = rows.get(b.userId)!.rating;
        const expected = 1 / (1 + 10 ** ((rb - ra) / 400));
        const actual = a.placement < b.placement ? 1 : a.placement === b.placement ? 0.5 : 0;
        delta += RATING_K * (actual - expected);
      });
      deltas.set(a.userId, delta / (field.length - 1));
    });

    field.forEach((s) => {
      const row = rows.get(s.userId)!;
      const isWinner = s.userId === record.winnerId;
      // arena_vc is incremented in SQL so tournament fees/prizes landing in between are never overwritten.
      sql.exec(
        `INSERT INTO players (user_id, name, matches, wins, rating, arena_vc, jackpots, best_score, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, matches = excluded.matches, wins = excluded.wins,
           rating = excluded.rating, arena_vc = players.arena_vc + ?, jackpots = excluded.jackpots,
           best_score = excluded.best_score, updated_at = excluded.updated_at`,
        s.userId,
        s.name,
        row.matches + 1,
        row.wins + (isWinner ? 1 : 0),
        Math.max(100, row.rating + (deltas.get(s.userId) ?? 0)),
        s.vcEarned,
        row.jackpots + (isWinner && record.jackpotCracked ? 1 : 0),
        Math.max(row.best_score, s.score),
        Date.now(),
        s.vcEarned,
      );
    });
  }
}
