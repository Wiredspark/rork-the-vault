import {
  FINAL_MAX_PLAYERS,
  QUALIFIER_RUNS,
  type ArenaInsights,
  type TournamentAdminEntry,
  type TournamentAdminView,
  type TournamentConfig,
  type TournamentDetail,
  type TournamentMyStatus,
  type TournamentPlacement,
  type TournamentRaceSummary,
  type TournamentStanding,
  type TournamentStatus,
  type TournamentSummary,
} from "./protocol";

/** Runs started before the window closes may finish during this grace period. */
export const LOCK_GRACE_MS = 4 * 60_000;
export const CHECKIN_MS = 5 * 60_000;
const RUN_STALE_MS = 6 * 60_000;
const FINAL_STALL_MS = 45 * 60_000;
const MIN_QUALIFIERS = 2;

type Sql = SqlStorage;

export type DoFetch = (className: string, id: string, path: string, body?: unknown) => Promise<Response>;

type TournamentRow = {
  id: string;
  config: string;
  status: TournamentStatus;
  paused: number;
  invite_code: string;
  invites: string;
  created_at: number;
  final_room_id: string | null;
  finalists: string | null;
  champion_id: string | null;
  champion_name: string | null;
  placements: string | null;
  race: string | null;
  prize_sent: number;
  viewers: number;
  paid_out: number;
};

type EntryRow = {
  tournament_id: string;
  user_id: string;
  name: string;
  email: string | null;
  registered_at: number;
  fee_paid: number;
  refunded: number;
  runs_used: number;
  best_score: number | null;
  best_time: number | null;
  disqualified: number;
  checked_in: number;
};

type RunRow = {
  run_id: string;
  tournament_id: string;
  user_id: string;
  started_at: number;
  done: number;
  score: number | null;
};

export interface RequestUser {
  userId: string;
  name: string;
  email: string | null;
}

export class TournamentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function randomId(length: number): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

const lockAt = (c: TournamentConfig) => c.qualEnd + LOCK_GRACE_MS;
const checkinAt = (c: TournamentConfig) => Math.max(c.finalsAt - CHECKIN_MS, lockAt(c));

/** Validates and normalizes an admin-submitted config. */
export function cleanConfig(input: Partial<TournamentConfig>, now: number, allowPast = false): TournamentConfig {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN);
  const name = text(input.name, 60);
  if (!name) throw new TournamentError("Give the tournament a name.");
  const qualStart = num(input.qualStart);
  const qualEnd = num(input.qualEnd);
  const finalsAt = num(input.finalsAt);
  if ([qualStart, qualEnd, finalsAt].some((t) => Number.isNaN(t))) throw new TournamentError("Set the qualifier window and the finals time.");
  if (qualEnd <= qualStart) throw new TournamentError("Qualifiers must close after they open.");
  // Windows that are already under way (or were closed early from the control room) aren't re-validated for length.
  if (!allowPast && qualEnd - qualStart < 10 * 60_000) throw new TournamentError("Give qualifiers at least 10 minutes.");
  if (finalsAt < qualEnd + (allowPast ? 60_000 : LOCK_GRACE_MS + 60_000)) throw new TournamentError("Finals need to start at least 5 minutes after qualifiers close.");
  if (!allowPast && qualEnd < now) throw new TournamentError("The qualifier window has already passed.");
  const prizes = input.prizes ?? ({} as Partial<TournamentConfig["prizes"]>);
  const split = Array.isArray(prizes.split) ? prizes.split.map((v) => Math.max(0, Math.round(Number(v) || 0))).filter((v) => v > 0).slice(0, 8) : [50, 30, 20];
  const splitTotal = split.reduce((a, b) => a + b, 0);
  if (split.length > 0 && splitTotal !== 100) throw new TournamentError("The prize split must add up to 100%.");
  const fee = Math.max(0, Math.min(1_000_000, num(input.entryFee) || 0));
  const capRaw = num(input.cap);
  const cap = Number.isNaN(capRaw) || capRaw <= 0 ? null : Math.max(2, Math.min(10_000, capRaw));
  return {
    name,
    series: text(input.series, 30),
    description: text(input.description, 600),
    qualStart,
    qualEnd,
    finalsAt,
    pool: ["all", "pre90", "90s", "2000s"].includes(String(input.pool)) ? String(input.pool) : "all",
    entryType: input.entryType === "invite" ? "invite" : "open",
    entryFee: fee,
    cap,
    prizes: {
      baseVc: Math.max(0, Math.min(10_000_000, num(prizes.baseVc) || 0)),
      split: split.length ? split : [50, 30, 20],
      badges: prizes.badges !== false,
      title: text(prizes.title, 40),
      custom: text(prizes.custom, 200),
    },
  };
}

/** Tournament state, entries, qualifier runs, scheduling and payouts. Lives inside the ArenaHub DO. */
export class TournamentStore {
  private bg: Promise<void>[] = [];

  /** Background room calls queued by the last operations (the hub hands them to waitUntil). */
  drain(): Promise<void>[] {
    const out = this.bg;
    this.bg = [];
    return out;
  }

  constructor(
    private readonly sql: Sql,
    private readonly callDo: DoFetch,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY, config TEXT NOT NULL, status TEXT NOT NULL, paused INTEGER NOT NULL DEFAULT 0,
      invite_code TEXT NOT NULL, invites TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
      final_room_id TEXT, finalists TEXT, champion_id TEXT, champion_name TEXT, placements TEXT, race TEXT,
      prize_sent INTEGER NOT NULL DEFAULT 0, viewers INTEGER NOT NULL DEFAULT 0, paid_out INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS t_entries (
      tournament_id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT,
      registered_at INTEGER NOT NULL, fee_paid INTEGER NOT NULL DEFAULT 0, refunded INTEGER NOT NULL DEFAULT 0,
      runs_used INTEGER NOT NULL DEFAULT 0, best_score INTEGER, best_time INTEGER,
      disqualified INTEGER NOT NULL DEFAULT 0, checked_in INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (tournament_id, user_id))`);
    sql.exec(`CREATE TABLE IF NOT EXISTS t_runs (
      run_id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL, user_id TEXT NOT NULL,
      started_at INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0, score INTEGER, time_ms INTEGER)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS activity (hour INTEGER PRIMARY KEY, plays INTEGER NOT NULL)`);
    // Clear pre-launch bot test tournaments.
    const botTournaments = sql
      .exec<{ tournament_id: string }>("SELECT DISTINCT tournament_id FROM t_entries WHERE user_id LIKE 'test-%'")
      .toArray()
      .map((r) => r.tournament_id);
    botTournaments.forEach((id) => {
      sql.exec("DELETE FROM tournaments WHERE id = ?", id);
      sql.exec("DELETE FROM t_entries WHERE tournament_id = ?", id);
      sql.exec("DELETE FROM t_runs WHERE tournament_id = ?", id);
    });
    sql.exec("DELETE FROM tournaments WHERE config LIKE '%\"name\":\"Sim Cup%' OR config LIKE '%\"name\":\"Refund Cup%' OR config LIKE '%\"name\":\"Tie Cup%'");
    sql.exec("DELETE FROM activity");
  }

  // ---------- reads ----------

  private row(id: string): TournamentRow | null {
    return this.sql.exec<TournamentRow>("SELECT * FROM tournaments WHERE id = ?", id).toArray()[0] ?? null;
  }

  private mustRow(id: string): TournamentRow {
    const row = this.row(id);
    if (!row) throw new TournamentError("That tournament doesn't exist.", 404);
    return row;
  }

  private config(row: TournamentRow): TournamentConfig {
    return JSON.parse(row.config) as TournamentConfig;
  }

  private entry(tid: string, userId: string): EntryRow | null {
    return this.sql.exec<EntryRow>("SELECT * FROM t_entries WHERE tournament_id = ? AND user_id = ?", tid, userId).toArray()[0] ?? null;
  }

  private entries(tid: string): EntryRow[] {
    return this.sql.exec<EntryRow>("SELECT * FROM t_entries WHERE tournament_id = ? ORDER BY registered_at", tid).toArray();
  }

  /** Qualifier ranking: best score, then lower total answer time on that run, then who posted first. */
  private ranked(tid: string): EntryRow[] {
    return this.sql
      .exec<EntryRow>(
        `SELECT * FROM t_entries WHERE tournament_id = ? AND best_score IS NOT NULL AND disqualified = 0
         ORDER BY best_score DESC, best_time ASC, registered_at ASC`,
        tid,
      )
      .toArray();
  }

  private prizePool(row: TournamentRow): number {
    const fees = this.sql
      .exec<{ total: number | null }>("SELECT SUM(fee_paid) AS total FROM t_entries WHERE tournament_id = ? AND refunded = 0", row.id)
      .toArray()[0]?.total;
    return this.config(row).prizes.baseVc + (fees ?? 0);
  }

  private arenaVc(userId: string): number {
    return this.sql.exec<{ arena_vc: number }>("SELECT arena_vc FROM players WHERE user_id = ?", userId).toArray()[0]?.arena_vc ?? 0;
  }

  private isInvited(row: TournamentRow, user: RequestUser): boolean {
    const invites = JSON.parse(row.invites) as string[];
    const keys = [user.userId, user.email ?? "", user.name].map((v) => v.trim().toLowerCase()).filter(Boolean);
    return invites.some((inv) => keys.includes(inv.trim().toLowerCase()));
  }

  private liveRun(tid: string, userId: string, now: number): RunRow | null {
    return (
      this.sql
        .exec<RunRow>(
          "SELECT * FROM t_runs WHERE tournament_id = ? AND user_id = ? AND done = 0 AND started_at > ? ORDER BY started_at DESC LIMIT 1",
          tid,
          userId,
          now - RUN_STALE_MS,
        )
        .toArray()[0] ?? null
    );
  }

  private myStatus(row: TournamentRow, user: RequestUser | null, now: number): TournamentMyStatus | null {
    if (!user) return null;
    const c = this.config(row);
    const e = this.entry(row.id, user.userId);
    const ranked = this.ranked(row.id);
    const rankIndex = ranked.findIndex((r) => r.user_id === user.userId);
    const finalists = row.finalists ? (JSON.parse(row.finalists) as string[]) : null;
    const invited = c.entryType === "open" || this.isInvited(row, user);
    const vc = this.arenaVc(user.userId);
    let blockedReason: string | null = null;
    if (e) blockedReason = null;
    else if (row.status !== "scheduled" && row.status !== "qualifying") blockedReason = "Registration is closed.";
    else if (row.paused) blockedReason = "This tournament is paused.";
    else if (!invited) blockedReason = "This tournament is invite-only.";
    else if (c.cap !== null && this.entries(row.id).length >= c.cap) blockedReason = "This tournament is full.";
    else if (c.entryFee > vc) blockedReason = `You need ${c.entryFee.toLocaleString("en-US")} Arena VC to enter.`;
    const placements = row.placements ? (JSON.parse(row.placements) as TournamentPlacement[]) : null;
    const live = e ? this.liveRun(row.id, user.userId, now) : null;
    return {
      registered: Boolean(e),
      invited,
      canRegister: !e && blockedReason === null,
      blockedReason,
      runsUsed: e?.runs_used ?? 0,
      runsLeft: e ? Math.max(0, QUALIFIER_RUNS - e.runs_used) : QUALIFIER_RUNS,
      liveRunId: live?.run_id ?? null,
      bestScore: e?.best_score ?? null,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      finalist: finalists ? finalists.includes(user.userId) : false,
      standby: Boolean(finalists && !finalists.includes(user.userId) && rankIndex >= 0),
      checkedIn: Boolean(e?.checked_in),
      feePaid: e && !e.refunded ? e.fee_paid : 0,
      arenaVc: vc,
      placement: placements?.find((p) => p.userId === user.userId)?.placement ?? null,
    };
  }

  private summary(row: TournamentRow, user: RequestUser | null, now: number): TournamentSummary {
    const c = this.config(row);
    return {
      id: row.id,
      status: row.status,
      paused: Boolean(row.paused),
      config: c,
      lockAt: lockAt(c),
      checkinAt: checkinAt(c),
      prizePool: this.prizePool(row),
      entrants: this.entries(row.id).length,
      finalRoomId: row.final_room_id,
      championId: row.champion_id,
      championName: row.champion_name,
      me: this.myStatus(row, user, now),
    };
  }

  list(user: RequestUser | null, now: number): TournamentSummary[] {
    const rows = this.sql
      .exec<TournamentRow>("SELECT * FROM tournaments WHERE status != 'draft' ORDER BY created_at DESC LIMIT 60")
      .toArray()
      .filter((r) => r.status !== "cancelled" || now - this.config(r).finalsAt < 3 * 86_400_000);
    return rows.map((r) => this.summary(r, user, now));
  }

  detail(id: string, user: RequestUser | null, now: number): TournamentDetail {
    const row = this.mustRow(id);
    if (row.status === "draft") throw new TournamentError("That tournament doesn't exist.", 404);
    const ranked = this.ranked(id);
    const toStanding = (e: EntryRow, i: number): TournamentStanding => ({
      userId: e.user_id,
      name: e.name,
      rank: i + 1,
      bestScore: e.best_score ?? 0,
      bestTimeMs: e.best_time ?? 0,
      runsUsed: e.runs_used,
      isMe: e.user_id === user?.userId,
      checkedIn: Boolean(e.checked_in),
    });
    const standings = ranked.map(toStanding);
    const finalists = row.finalists ? (JSON.parse(row.finalists) as string[]) : null;
    return {
      ...this.summary(row, user, now),
      standings: standings.slice(0, 50),
      myStanding: standings.find((s) => s.isMe) ?? null,
      finalists: finalists?.length ?? Math.min(FINAL_MAX_PLAYERS, standings.length),
      placements: row.placements ? (JSON.parse(row.placements) as TournamentPlacement[]) : null,
      race: row.race ? (JSON.parse(row.race) as TournamentRaceSummary) : null,
    };
  }

  /** Lightweight teaser for the lobby and the side menu: the live or next tournament. */
  spotlight(now: number): { id: string; name: string; status: TournamentStatus; at: number } | null {
    const rows = this.sql
      .exec<TournamentRow>("SELECT * FROM tournaments WHERE status IN ('scheduled','qualifying','locking','checkin','final')")
      .toArray();
    const ranked = rows
      .map((r) => {
        const c = this.config(r);
        const at = r.status === "scheduled" ? c.qualStart : r.status === "qualifying" ? c.qualEnd : c.finalsAt;
        return { id: r.id, name: c.name, status: r.status, at, live: r.status === "final" ? 0 : r.status === "scheduled" ? 2 : 1 };
      })
      .sort((a, b) => a.live - b.live || a.at - b.at);
    const top = ranked[0];
    void now;
    return top ? { id: top.id, name: top.name, status: top.status, at: top.at } : null;
  }

  // ---------- player actions ----------

  register(id: string, user: RequestUser, code: string | null, now: number): TournamentSummary {
    this.process(now);
    const row = this.mustRow(id);
    const c = this.config(row);
    if (this.entry(id, user.userId)) return this.summary(row, user, now);
    if (row.status !== "scheduled" && row.status !== "qualifying") throw new TournamentError("Registration is closed.");
    if (row.paused) throw new TournamentError("This tournament is paused.");
    const codeOk = code !== null && code.trim().toUpperCase() === row.invite_code;
    if (c.entryType === "invite" && !codeOk && !this.isInvited(row, user)) {
      throw new TournamentError("This tournament is invite-only. Ask the organizer for an invite.", 403);
    }
    if (c.cap !== null && this.entries(id).length >= c.cap) throw new TournamentError("This tournament is full.");
    const fee = c.entryFee;
    if (fee > 0) {
      // The hub handles one request at a time, so the balance check and deduction can't interleave.
      const vc = this.arenaVc(user.userId);
      if (vc < fee) throw new TournamentError(`You need ${fee.toLocaleString("en-US")} Arena VC to enter. You have ${vc.toLocaleString("en-US")}.`);
      this.sql.exec("UPDATE players SET arena_vc = arena_vc - ?, updated_at = ? WHERE user_id = ? AND arena_vc >= ?", fee, now, user.userId, fee);
    }
    this.sql.exec(
      `INSERT INTO t_entries (tournament_id, user_id, name, email, registered_at, fee_paid) VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      user.userId,
      user.name,
      user.email,
      now,
      fee,
    );
    return this.summary(this.mustRow(id), user, now);
  }

  /** Starts (or resumes) a qualifier run. A started run always counts toward the 3. */
  async startRun(id: string, user: RequestUser, now: number): Promise<{ roomId: string; resumed: boolean }> {
    this.process(now);
    const row = this.mustRow(id);
    const c = this.config(row);
    const e = this.entry(id, user.userId);
    if (!e) throw new TournamentError("Register for this tournament first.", 403);
    if (e.disqualified) throw new TournamentError("You've been removed from this tournament.", 403);
    const live = this.liveRun(id, user.userId, now);
    if (live) return { roomId: live.run_id, resumed: true };
    if (row.status !== "qualifying" || now < c.qualStart || now >= c.qualEnd) throw new TournamentError("The qualifier window isn't open.");
    if (row.paused) throw new TournamentError("This tournament is paused.");
    if (e.runs_used >= QUALIFIER_RUNS) throw new TournamentError("You've used all 3 qualifier runs.");
    const runId = `q-${randomId(10)}`;
    this.sql.exec("INSERT INTO t_runs (run_id, tournament_id, user_id, started_at) VALUES (?, ?, ?, ?)", runId, id, user.userId, now);
    this.sql.exec("UPDATE t_entries SET runs_used = runs_used + 1, name = ? WHERE tournament_id = ? AND user_id = ?", user.name, id, user.userId);
    this.bumpActivity(now, 1);
    const res = await this.callDo("ArenaRoom", runId, "/init", {
      kind: "qualifier",
      ownerId: user.userId,
      runId,
      pool: c.pool,
      tournament: { id, name: c.name },
    });
    if (!res.ok) throw new TournamentError("Couldn't open your run. Try again.", 500);
    return { roomId: runId, resumed: false };
  }

  runResult(body: { runId: string; tournamentId: string; userId: string; score: number; totalTimeMs: number }, now: number) {
    const run = this.sql.exec<RunRow>("SELECT * FROM t_runs WHERE run_id = ?", body.runId).toArray()[0];
    if (!run || run.user_id !== body.userId || run.tournament_id !== body.tournamentId) throw new TournamentError("Unknown run.", 404);
    const row = this.mustRow(run.tournament_id);
    const c = this.config(row);
    if (!run.done) {
      const inTime = now <= lockAt(c) && ["qualifying", "locking"].includes(row.status) && !row.finalists;
      this.sql.exec("UPDATE t_runs SET done = 1, score = ?, time_ms = ? WHERE run_id = ?", Math.round(body.score), Math.round(body.totalTimeMs), run.run_id);
      if (inTime) {
        const e = this.entry(run.tournament_id, run.user_id);
        const better = e && (e.best_score === null || body.score > e.best_score || (body.score === e.best_score && body.totalTimeMs < (e.best_time ?? Infinity)));
        if (better) {
          this.sql.exec(
            "UPDATE t_entries SET best_score = ?, best_time = ? WHERE tournament_id = ? AND user_id = ?",
            Math.round(body.score),
            Math.round(body.totalTimeMs),
            run.tournament_id,
            run.user_id,
          );
        }
      } else {
        throw new TournamentError("Qualifiers had already closed, so this run didn't count.", 409);
      }
    }
    const ranked = this.ranked(run.tournament_id);
    const e = this.entry(run.tournament_id, run.user_id);
    const rank = ranked.findIndex((r) => r.user_id === run.user_id);
    return { rank: rank >= 0 ? rank + 1 : null, runsLeft: Math.max(0, QUALIFIER_RUNS - (e?.runs_used ?? 0)), entrants: ranked.length };
  }

  checkin(id: string, user: RequestUser, now: number): TournamentSummary {
    this.process(now);
    const row = this.mustRow(id);
    if (row.status !== "checkin") throw new TournamentError("Check-in isn't open.");
    const ranked = this.ranked(id);
    if (!ranked.some((r) => r.user_id === user.userId)) throw new TournamentError("Only players with a qualifier score can check in.", 403);
    this.sql.exec("UPDATE t_entries SET checked_in = 1 WHERE tournament_id = ? AND user_id = ?", id, user.userId);
    return this.summary(this.mustRow(id), user, now);
  }

  // ---------- scheduling ----------

  /** Next moment a transition is due (for the hub's alarm). */
  nextDue(now: number): number | null {
    const rows = this.sql
      .exec<TournamentRow>("SELECT * FROM tournaments WHERE status IN ('scheduled','qualifying','locking','checkin','final')")
      .toArray();
    let next = Infinity;
    for (const r of rows) {
      const c = this.config(r);
      const t =
        r.status === "scheduled"
          ? c.qualStart
          : r.status === "qualifying"
            ? now < c.qualEnd
              ? c.qualEnd
              : now + 20_000
            : r.status === "locking"
              ? c.finalsAt - CHECKIN_MS
              : r.status === "checkin"
                ? c.finalsAt
                : now + 60_000;
      next = Math.min(next, t);
    }
    return Number.isFinite(next) ? Math.max(next, now + 500) : null;
  }

  /** Advances every tournament whose next phase is due. Synchronous state changes; room calls are returned as tasks. */
  process(now: number): Promise<void>[] {
    const tasks: Promise<void>[] = [];
    const rows = this.sql
      .exec<TournamentRow>("SELECT * FROM tournaments WHERE status IN ('scheduled','qualifying','locking','checkin','final') AND paused = 0")
      .toArray();
    for (const r of rows) {
      const c = this.config(r);
      let status = r.status;
      if (status === "scheduled" && now >= c.qualStart) status = this.setStatus(r.id, "qualifying");
      // Qualifiers lock as soon as the window closes and no run is still in progress (or the grace period ends).
      if (status === "qualifying" && now >= c.qualEnd && (now >= lockAt(c) || !this.hasLiveRuns(r.id, now))) {
        status = this.lock(r, c, now, tasks);
      }
      if (status === "locking" && now >= c.finalsAt - CHECKIN_MS) status = this.setStatus(r.id, "checkin");
      if (status === "checkin" && now >= c.finalsAt) status = this.startFinal(r.id, c, tasks);
      if (status === "final" && now >= c.finalsAt + FINAL_STALL_MS && r.final_room_id) {
        // Safety net: nudge a final that hasn't reported back.
        tasks.push(this.callDo("ArenaRoom", r.final_room_id, "/poke", {}).then(() => undefined).catch(() => undefined));
      }
    }
    this.bg.push(...tasks);
    return tasks;
  }

  private hasLiveRuns(tid: string, now: number): boolean {
    return (
      (this.sql
        .exec<{ n: number }>("SELECT COUNT(*) AS n FROM t_runs WHERE tournament_id = ? AND done = 0 AND started_at > ?", tid, now - RUN_STALE_MS)
        .toArray()[0]?.n ?? 0) > 0
    );
  }

  private setStatus(id: string, status: TournamentStatus): TournamentStatus {
    this.sql.exec("UPDATE tournaments SET status = ? WHERE id = ?", status, id);
    return status;
  }

  private lock(r: TournamentRow, c: TournamentConfig, now: number, tasks: Promise<void>[]): TournamentStatus {
    const ranked = this.ranked(r.id);
    if (ranked.length < MIN_QUALIFIERS) {
      this.cancel(r.id, "Not enough players posted a qualifier score.", tasks);
      return "cancelled";
    }
    const finalists = ranked.slice(0, FINAL_MAX_PLAYERS).map((e) => e.user_id);
    const roomId = r.final_room_id ?? `f-${randomId(8)}`;
    this.sql.exec("UPDATE tournaments SET status = 'locking', finalists = ?, final_room_id = ? WHERE id = ?", JSON.stringify(finalists), roomId, r.id);
    const seats = ranked.slice(0, FINAL_MAX_PLAYERS).map((e) => ({ userId: e.user_id, name: e.name }));
    tasks.push(
      this.callDo("ArenaRoom", roomId, "/init", { kind: "final", pool: c.pool, startsAt: c.finalsAt, tournament: { id: r.id, name: c.name }, seats })
        .then(() => undefined)
        .catch((err: unknown) => console.warn("[tournaments] final init failed", String(err))),
    );
    void now;
    return "locking";
  }

  /** Seats the final: checked-in players in qualifier order (no-shows are replaced by the next checked-in qualifier). */
  private startFinal(id: string, c: TournamentConfig, tasks: Promise<void>[]): TournamentStatus {
    const row = this.mustRow(id);
    const ranked = this.ranked(id);
    let seated = ranked.filter((e) => e.checked_in).slice(0, FINAL_MAX_PLAYERS);
    if (seated.length < MIN_QUALIFIERS) {
      // Too few checked in: fall back to the top qualifiers so the final still runs.
      const extra = ranked.filter((e) => !seated.includes(e)).slice(0, MIN_QUALIFIERS - seated.length);
      seated = [...seated, ...extra].sort((a, b) => ranked.indexOf(a) - ranked.indexOf(b));
    }
    const finalists = seated.map((e) => e.user_id);
    const roomId = row.final_room_id ?? `f-${randomId(8)}`;
    this.sql.exec("UPDATE tournaments SET status = 'final', finalists = ?, final_room_id = ? WHERE id = ?", JSON.stringify(finalists), roomId, id);
    const seats = seated.map((e) => ({ userId: e.user_id, name: e.name }));
    tasks.push(
      (async () => {
        await this.callDo("ArenaRoom", roomId, "/init", { kind: "final", pool: c.pool, startsAt: c.finalsAt, tournament: { id, name: c.name }, seats });
        await this.callDo("ArenaRoom", roomId, "/final/start", { seats });
      })().catch((err: unknown) => console.warn("[tournaments] final start failed", String(err))),
    );
    return "final";
  }

  /** Records the final and pays out once. Returns placements with VC prizes filled in. */
  finalResult(body: { tournamentId: string; placements: TournamentPlacement[]; race: TournamentRaceSummary | null; viewers: number }, now: number): TournamentPlacement[] {
    const row = this.mustRow(body.tournamentId);
    if (row.paid_out || row.status === "completed") return row.placements ? (JSON.parse(row.placements) as TournamentPlacement[]) : [];
    if (row.status === "cancelled") throw new TournamentError("Tournament was cancelled.", 409);
    const c = this.config(row);
    const pool = this.prizePool(row);
    const split = c.prizes.split;
    let paid = 0;
    const placements = body.placements.map((p, i) => {
      const share = split[i] ?? 0;
      // The last paid place takes any rounding remainder so the whole pool is paid out.
      const lastPaid = i === Math.min(split.length, body.placements.length) - 1;
      const vc = share > 0 ? (lastPaid ? pool - paid : Math.floor((pool * share) / 100)) : 0;
      paid += vc;
      return { ...p, vcPrize: vc };
    });

    const finalistIds = new Set(placements.map((p) => p.userId));
    const champion = placements[0];
    if (c.prizes.title && champion) {
      // The previous holder of this series' title hands it over now.
      this.sql.exec("UPDATE players SET title = NULL, title_series = NULL WHERE title_series = ?", c.series || c.name);
    }
    const touch = (userId: string, name: string) => {
      this.sql.exec(
        `INSERT INTO players (user_id, name, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO NOTHING`,
        userId,
        name,
        now,
      );
    };
    placements.forEach((p) => {
      touch(p.userId, p.name);
      this.sql.exec(
        `UPDATE players SET arena_vc = arena_vc + ?, t_champion = t_champion + ?, t_finalist = t_finalist + ?, updated_at = ? WHERE user_id = ?`,
        p.vcPrize,
        c.prizes.badges && p.placement === 1 ? 1 : 0,
        c.prizes.badges && p.placement !== 1 ? 1 : 0,
        now,
        p.userId,
      );
    });
    if (c.prizes.badges) {
      // Badge tiers: Champion (1st), Finalist (made the final), Qualifier (posted a score, missed the final).
      this.ranked(row.id).forEach((e) => {
        if (finalistIds.has(e.user_id)) return;
        touch(e.user_id, e.name);
        this.sql.exec("UPDATE players SET t_qualifier = t_qualifier + 1 WHERE user_id = ?", e.user_id);
      });
    }
    if (c.prizes.title && champion) {
      this.sql.exec("UPDATE players SET title = ?, title_series = ? WHERE user_id = ?", c.prizes.title, c.series || c.name, champion.userId);
    }
    this.sql.exec(
      `UPDATE tournaments SET status = 'completed', paid_out = 1, champion_id = ?, champion_name = ?, placements = ?, race = ?, viewers = ? WHERE id = ?`,
      champion?.userId ?? null,
      champion?.name ?? null,
      JSON.stringify(placements),
      body.race ? JSON.stringify(body.race) : null,
      Math.max(0, Math.round(body.viewers)),
      row.id,
    );
    return placements;
  }

  // ---------- admin ----------

  adminList(now: number): TournamentAdminView[] {
    return this.sql
      .exec<TournamentRow>("SELECT * FROM tournaments ORDER BY created_at DESC LIMIT 60")
      .toArray()
      .map((r) => this.adminView(r, now));
  }

  private adminView(r: TournamentRow, now: number): TournamentAdminView {
    const entries: TournamentAdminEntry[] = this.entries(r.id).map((e) => ({
      userId: e.user_id,
      name: e.name,
      email: e.email,
      registeredAt: e.registered_at,
      feePaid: e.fee_paid,
      refunded: Boolean(e.refunded),
      runsUsed: e.runs_used,
      bestScore: e.best_score,
      bestTimeMs: e.best_time,
      disqualified: Boolean(e.disqualified),
      checkedIn: Boolean(e.checked_in),
    }));
    const runs = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM t_runs WHERE tournament_id = ?", r.id).toArray()[0]?.n ?? 0;
    return {
      ...this.summary(r, null, now),
      inviteCode: r.invite_code,
      invites: JSON.parse(r.invites) as string[],
      entries,
      placements: r.placements ? (JSON.parse(r.placements) as TournamentPlacement[]) : null,
      prizeSent: Boolean(r.prize_sent),
      stats: { registrations: entries.length, runs, finalViewers: r.viewers },
      createdAt: r.created_at,
    };
  }

  save(body: { id?: string; config: Partial<TournamentConfig>; publish?: boolean }, now: number): TournamentAdminView {
    if (body.id) {
      const row = this.mustRow(body.id);
      if (!["draft", "scheduled", "qualifying", "locking"].includes(row.status)) throw new TournamentError("This tournament can't be edited anymore.");
      const prev = this.config(row);
      const next = cleanConfig(body.config, now, row.status !== "draft" && row.status !== "scheduled");
      const anyPaid = this.entries(row.id).some((e) => e.fee_paid > 0);
      if (anyPaid && next.entryFee !== prev.entryFee) throw new TournamentError("Players have already paid the entry fee, so it can't change.");
      if (row.status !== "draft" && row.status !== "scheduled" && next.qualStart !== prev.qualStart) {
        throw new TournamentError("Qualifiers have started, so the opening time can't change.");
      }
      if (row.status === "locking" && next.qualEnd !== prev.qualEnd) throw new TournamentError("Qualifiers have closed.");
      this.sql.exec("UPDATE tournaments SET config = ? WHERE id = ?", JSON.stringify(next), row.id);
      if (body.publish && row.status === "draft") this.sql.exec("UPDATE tournaments SET status = 'scheduled' WHERE id = ?", row.id);
      return this.adminView(this.mustRow(row.id), now);
    }
    const config = cleanConfig(body.config, now);
    const id = `t-${randomId(8)}`;
    this.sql.exec(
      "INSERT INTO tournaments (id, config, status, invite_code, created_at) VALUES (?, ?, ?, ?, ?)",
      id,
      JSON.stringify(config),
      body.publish ? "scheduled" : "draft",
      inviteCode(),
      now,
    );
    return this.adminView(this.mustRow(id), now);
  }

  setInvites(id: string, invites: unknown, now: number): TournamentAdminView {
    const row = this.mustRow(id);
    const list = Array.isArray(invites)
      ? [...new Set(invites.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter((v) => v && v.length <= 80))].slice(0, 2000)
      : [];
    this.sql.exec("UPDATE tournaments SET invites = ? WHERE id = ?", JSON.stringify(list), row.id);
    return this.adminView(this.mustRow(id), now);
  }

  action(body: { id: string; action: string; userId?: string }, now: number): TournamentAdminView | { deleted: true } | { id: string } {
    const row = this.mustRow(body.id);
    const tasks = this.bg;
    switch (body.action) {
      case "publish":
        if (row.status !== "draft") throw new TournamentError("Already published.");
        cleanConfig(this.config(row), now);
        this.setStatus(row.id, "scheduled");
        break;
      case "pause":
        if (["completed", "cancelled", "final"].includes(row.status)) throw new TournamentError("Can't pause now.");
        this.sql.exec("UPDATE tournaments SET paused = 1 WHERE id = ?", row.id);
        break;
      case "resume":
        this.sql.exec("UPDATE tournaments SET paused = 0 WHERE id = ?", row.id);
        this.process(now);
        break;
      case "cancel":
        if (row.status === "completed") throw new TournamentError("This tournament already finished.");
        this.cancel(row.id, "Cancelled by an admin.", tasks);
        break;
      case "delete":
        if (row.status !== "draft") throw new TournamentError("Only drafts can be deleted. Cancel it instead.");
        this.sql.exec("DELETE FROM tournaments WHERE id = ?", row.id);
        return { deleted: true };
      case "duplicate": {
        const c = this.config(row);
        const shift = Math.max(7 * 86_400_000, Math.ceil((now - c.qualStart) / (7 * 86_400_000)) * 7 * 86_400_000);
        const copy: TournamentConfig = { ...c, qualStart: c.qualStart + shift, qualEnd: c.qualEnd + shift, finalsAt: c.finalsAt + shift };
        const id = `t-${randomId(8)}`;
        this.sql.exec(
          "INSERT INTO tournaments (id, config, status, invite_code, invites, created_at) VALUES (?, ?, 'draft', ?, ?, ?)",
          id,
          JSON.stringify(copy),
          inviteCode(),
          row.invites,
          now,
        );
        return { id };
      }
      case "prize-sent":
      case "prize-unsent":
        this.sql.exec("UPDATE tournaments SET prize_sent = ? WHERE id = ?", body.action === "prize-sent" ? 1 : 0, row.id);
        break;
      case "disqualify":
      case "reinstate": {
        if (!body.userId) throw new TournamentError("Pick a player.");
        if (row.finalists && ["final", "completed"].includes(row.status)) throw new TournamentError("The final has started.");
        this.sql.exec(
          "UPDATE t_entries SET disqualified = ? WHERE tournament_id = ? AND user_id = ?",
          body.action === "disqualify" ? 1 : 0,
          row.id,
          body.userId,
        );
        // Recompute the finalist list if it was already locked.
        if (row.finalists && ["locking", "checkin"].includes(row.status)) {
          const c = this.config(row);
          const ranked = this.ranked(row.id);
          const finalists = ranked.slice(0, FINAL_MAX_PLAYERS);
          this.sql.exec("UPDATE tournaments SET finalists = ? WHERE id = ?", JSON.stringify(finalists.map((e) => e.user_id)), row.id);
          if (row.final_room_id) {
            const roomId = row.final_room_id;
            tasks.push(
              this.callDo("ArenaRoom", roomId, "/final/preview", { seats: finalists.map((e) => ({ userId: e.user_id, name: e.name })), startsAt: c.finalsAt })
                .then(() => undefined)
                .catch(() => undefined),
            );
          }
        }
        break;
      }
      case "skip": {
        // Control-room shortcut: bring the next milestone forward to right now.
        const c = this.config(row);
        if (row.status === "scheduled") c.qualStart = now;
        else if (row.status === "qualifying") c.qualEnd = Math.max(now, c.qualStart + 1);
        else if (row.status === "locking" || row.status === "checkin") c.finalsAt = now;
        else throw new TournamentError("Nothing to skip right now.");
        if (c.qualEnd <= c.qualStart) c.qualEnd = c.qualStart + 10 * 60_000;
        if (c.finalsAt < c.qualEnd) c.finalsAt = c.qualEnd + LOCK_GRACE_MS + 60_000;
        this.sql.exec("UPDATE tournaments SET config = ? WHERE id = ?", JSON.stringify(c), row.id);
        this.process(now);
        break;
      }
      case "regen-code":
        this.sql.exec("UPDATE tournaments SET invite_code = ? WHERE id = ?", inviteCode(), row.id);
        break;
      default:
        throw new TournamentError("Unknown action.");
    }
    return this.adminView(this.mustRow(row.id), now);
  }

  /** Cancels and refunds every unrefunded entry fee exactly once. */
  private cancel(id: string, reason: string, tasks: Promise<void>[]): void {
    const row = this.mustRow(id);
    const unrefunded = this.sql
      .exec<EntryRow>("SELECT * FROM t_entries WHERE tournament_id = ? AND refunded = 0 AND fee_paid > 0", id)
      .toArray();
    unrefunded.forEach((e) => {
      this.sql.exec("UPDATE players SET arena_vc = arena_vc + ? WHERE user_id = ?", e.fee_paid, e.user_id);
      this.sql.exec("UPDATE t_entries SET refunded = 1 WHERE tournament_id = ? AND user_id = ?", id, e.user_id);
    });
    this.sql.exec("UPDATE tournaments SET status = 'cancelled', paused = 0 WHERE id = ?", id);
    if (row.final_room_id) {
      tasks.push(this.callDo("ArenaRoom", row.final_room_id, "/final/cancel", {}).then(() => undefined).catch(() => undefined));
    }
    console.log("[tournaments] cancelled", id, reason, "refunds:", unrefunded.length);
  }

  // ---------- activity ----------

  bumpActivity(now: number, plays: number): void {
    const hour = Math.floor(now / 3_600_000);
    this.sql.exec("INSERT INTO activity (hour, plays) VALUES (?, ?) ON CONFLICT(hour) DO UPDATE SET plays = plays + excluded.plays", hour, plays);
  }

  insights(now: number): ArenaInsights {
    const since = Math.floor(now / 3_600_000) - 24 * 7 * 8;
    this.sql.exec("DELETE FROM activity WHERE hour < ?", since - 24 * 7 * 4);
    return { hours: this.sql.exec<{ hour: number; plays: number }>("SELECT hour, plays FROM activity WHERE hour >= ? ORDER BY hour", since).toArray() };
  }
}
