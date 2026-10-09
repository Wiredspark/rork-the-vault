import { Crown, Delete, Eye, KeyRound, Lock, ShieldOff, Skull, Sparkles, Trophy, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { formatMs, PlayerAvatar } from "@/components/arena/ArenaBits";
import { CountdownRing } from "@/components/play/CountdownRing";
import { DigitTile } from "@/components/vault/DigitTile";
import { FINAL_CHECKPOINTS, FINAL_RACE_MS, type ArenaSnapshot, type ClientMessage } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

import { formatClock, ordinal, useTicker } from "./TournamentBits";

/** Banner over the match stage: how many will be cut at the next checkpoint. */
export function CheckpointBanner({ snapshot }: { snapshot: ArenaSnapshot }) {
  const el = snapshot.elimination;
  if (!el || el.next === null) return null;
  const at = el.checkpoints[el.next];
  const cut = el.cuts[el.next];
  if (cut <= 0) return null;
  const left = at - (snapshot.questionIndex + 1);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-vault-danger/35 bg-[linear-gradient(90deg,rgba(255,90,100,0.12),rgba(207,171,92,0.06))] px-4 py-2.5" role="status">
      <Skull className="h-4 w-4 shrink-0 text-vault-danger" aria-hidden="true" />
      <p className="text-[13.5px] text-vault-ice/85">
        <span className="font-semibold text-vault-ice">Checkpoint after Q{at}:</span> the {cut} lowest {cut === 1 ? "score is" : "scores are"} knocked out
        {left > 0 ? ` · ${left} question${left === 1 ? "" : "s"} to go` : " · this is the one"}.
      </p>
    </div>
  );
}

/** Full-width checkpoint reveal: who got sealed out, who survives. */
export function CheckpointReveal({ snapshot, remaining }: { snapshot: ArenaSnapshot; remaining: number }) {
  const el = snapshot.elimination;
  const cutIds = el?.lastCut ?? [];
  const meOut = cutIds.includes(snapshot.me.userId);
  const at = el && el.next !== null ? el.checkpoints[Math.max(0, el.next - 1)] : FINAL_CHECKPOINTS[FINAL_CHECKPOINTS.length - 1];
  const checkpointNo = el ? (el.next === null ? el.checkpoints.length : el.next) : 1;
  const ranked = [...snapshot.players].sort((a, b) => Number(a.eliminatedAfter !== null) - Number(b.eliminatedAfter !== null) || b.score - a.score);
  const played = useRef<boolean>(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    playSound(meOut ? "wrong" : "correct");
  }, [meOut]);

  return (
    <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-9" aria-labelledby="cp-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-72 w-[620px] -translate-x-1/2 rounded-full bg-vault-danger/[0.08] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-vault-danger">
            <Skull className="h-3.5 w-3.5" aria-hidden="true" /> Checkpoint {checkpointNo} · after Q{at}
          </p>
          <h2 id="cp-title" className="mt-2 font-display text-[32px] font-medium leading-tight text-vault-ice sm:text-[44px]">
            {meOut ? "You've been sealed out" : snapshot.me.role === "player" ? "You survive" : `${cutIds.length} sealed out`}
          </h2>
          <p className="mt-1.5 text-[15px] text-vault-ice/65">
            {meOut ? "Stay and watch. Reactions still count." : `${el?.survivors ?? 0} players fight on.`} Next question in {Math.ceil(remaining)}s.
          </p>
        </div>
      </div>
      <ul className="relative mt-7 grid gap-2 sm:grid-cols-2">
        {ranked.map((p, i) => {
          const justOut = cutIds.includes(p.userId);
          const out = p.eliminatedAfter !== null;
          return (
            <li
              key={p.userId}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all",
                justOut ? "animate-pop-in border-vault-danger/45 bg-vault-danger/[0.07]" : out ? "border-vault-line bg-vault-ink/40 opacity-45" : "border-vault-neon/30 bg-vault-neon/[0.05]",
              )}
              style={justOut ? { animationDelay: `${200 + i * 90}ms` } : undefined}
            >
              <PlayerAvatar name={p.name} size="sm" dimmed={out} highlight={p.userId === snapshot.me.userId} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-vault-ice">{p.name}</span>
              <span className="vault-display text-[14px] tabular text-vault-neonhi">{p.score.toLocaleString("en-US")}</span>
              {out ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-vault-danger/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-vault-danger">
                  <Lock className="h-3 w-3" aria-hidden="true" /> Sealed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-vault-success/40 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.16em] text-vault-success">
                  Safe
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"] as const;

/** Simultaneous vault race: every survivor has their own door, keypad for the racer, live doors for everyone. */
export function VaultRace({ snapshot, remaining, send }: { snapshot: ArenaSnapshot; remaining: number; send: (msg: ClientMessage) => void }) {
  const race = snapshot.race;
  const meId = snapshot.me.userId;
  const length = snapshot.vault?.codeLength ?? 4;
  const known = snapshot.me.digits;
  const mine = race?.racers.find((r) => r.userId === meId) ?? null;
  const racing = Boolean(mine && race?.status === "open" && !mine.cracked && mine.attempts < (race?.attemptsPerRacer ?? 3));
  const [entry, setEntry] = useState<(string | null)[]>(() => known.slice(0, length));
  const lastAttempts = useRef<number>(mine?.attempts ?? 0);
  const outcome = useRef<string | null>(null);
  const [shake, setShake] = useState<number>(0);

  useEffect(() => {
    const n = mine?.attempts ?? 0;
    if (n > lastAttempts.current) {
      lastAttempts.current = n;
      if (!mine?.cracked) {
        playSound("wrong");
        setShake((k) => k + 1);
        setEntry(known.slice(0, length));
      }
    }
  }, [known, length, mine?.attempts, mine?.cracked]);

  useEffect(() => {
    if (!race || race.status !== "done" || outcome.current) return;
    outcome.current = race.winnerId ?? "none";
    playSound(race.winnerId === meId ? "unlock" : race.racers.some((r) => r.cracked) ? "wrong" : "click");
  }, [meId, race]);

  const firstEmpty = entry.findIndex((d) => d === null);
  const full = firstEmpty === -1;

  const press = (key: (typeof KEYS)[number]) => {
    if (!racing) return;
    if (key === "go") {
      if (full) send({ type: "crack", code: entry.join("") });
      return;
    }
    if (key === "back") {
      for (let i = length - 1; i >= 0; i -= 1) {
        if (entry[i] !== null && known[i] === null) {
          setEntry((prev) => prev.map((d, j) => (j === i ? null : d)));
          return;
        }
      }
      return;
    }
    if (firstEmpty >= 0) {
      playSound("click");
      setEntry((prev) => prev.map((d, j) => (j === firstEmpty ? key : d)));
    }
  };

  useEffect(() => {
    if (!racing) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") press("go");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!race) return null;
  const done = race.status === "done";
  const winner = race.racers.find((r) => r.userId === race.winnerId) ?? null;

  return (
    <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-5 sm:p-8" aria-labelledby="race-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-vault-neon/[0.09] blur-3xl" />
      {done && winner?.cracked && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 animate-jackpot-burst rounded-full bg-[radial-gradient(circle,rgba(234,217,168,0.6),rgba(207,171,92,0.2)_45%,transparent_70%)]" />
      )}
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-vault-neon">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> The vault race · {snapshot.vault?.title ?? "Final vault"}
          </p>
          <h2 id="race-title" className="mt-1.5 font-display text-[30px] font-medium leading-tight text-vault-ice sm:text-[42px]">
            {done
              ? winner?.cracked
                ? winner.userId === meId
                  ? "You cracked it first!"
                  : `${winner.name} cracked it first`
                : `Vault holds. ${winner?.name ?? "Top score"} takes it on points`
              : mine
                ? mine.cracked
                  ? "Cracked!"
                  : racing
                    ? "First correct code wins"
                    : "Out of tries. Watch the others"
                : "Survivors are at the vault"}
          </h2>
          <p className="mt-1 text-[14px] text-vault-ice/60">
            {done ? `The code was ${race.code ?? "????"}.` : `${race.racers.length} racers · ${race.attemptsPerRacer} tries each · rival guesses stay hidden until it's over`}
          </p>
        </div>
        {!done && <CountdownRing remaining={remaining} total={FINAL_RACE_MS / 1000} />}
      </div>

      <ul className="relative mt-7 grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${race.racers.length > 3 ? 190 : 230}px, 1fr))` }}>
        {race.racers.map((r) => {
          const isMe = r.userId === meId;
          const won = done && race.winnerId === r.userId;
          const lastCode = [...r.codes].reverse().find((c) => c !== null) ?? null;
          const tiles = done && race.code ? race.code.split("") : isMe ? entry : lastCode ? lastCode.split("") : Array<string | null>(length).fill(null);
          return (
            <li
              key={r.userId}
              className={cn(
                "relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-500",
                won ? "border-vault-neon bg-vault-neon/[0.12] shadow-[0_0_40px_-12px_rgba(207,171,92,0.9)]" : r.cracked ? "border-vault-success/60 bg-vault-success/[0.06]" : "border-vault-line bg-vault-ink/50",
                isMe && !won && "ring-1 ring-vault-neon/40",
              )}
            >
              <div className="flex items-center gap-2.5">
                <PlayerAvatar name={r.name} size="sm" highlight={isMe || won} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-vault-ice">{r.name}</span>
                    {isMe && <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-vault-neon">You</span>}
                  </span>
                  <span className="font-mono text-[10px] text-vault-muted tabular">
                    {r.score.toLocaleString("en-US")} pts · knew {r.knownDigits}/{length}
                  </span>
                </span>
                {won && <Crown className="h-5 w-5 animate-pop-in text-vault-neonhi" aria-label="Champion" />}
              </div>
              <div key={isMe ? shake : undefined} className={cn("grid gap-1.5", isMe && shake > 0 && "animate-shake")} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
                {tiles.map((d, i) => (
                  <DigitTile
                    key={i}
                    size="sm"
                    value={d}
                    state={d === null ? (isMe && racing && i === firstEmpty ? "awaiting" : "locked") : done ? "revealed" : isMe && known[i] !== null ? (snapshot.vault?.freeIndexes.includes(i) ? "free" : "revealed") : "guess"}
                    active={isMe && racing && i === firstEmpty}
                    label={d === null ? `Digit ${i + 1}: empty` : `Digit ${i + 1}: ${d}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5" aria-label={`${r.attempts} of ${race.attemptsPerRacer} tries used`}>
                {Array.from({ length: race.attemptsPerRacer }).map((_, i) => {
                  const code = r.codes[i];
                  const used = i < r.attempts;
                  const right = used && r.cracked && i === r.attempts - 1;
                  return (
                    <span
                      key={i}
                      className={cn(
                        "flex h-6 min-w-0 flex-1 items-center justify-center rounded-full border font-mono text-[10.5px] tracking-[0.14em] tabular",
                        !used && "border-vault-line text-vault-ice/25",
                        used && !right && "border-vault-danger/45 bg-vault-danger/10 text-vault-danger",
                        right && "border-vault-success/60 bg-vault-success/10 text-vault-success",
                      )}
                    >
                      {used ? (code ?? "••••") : i + 1}
                    </span>
                  );
                })}
              </div>
              {r.cracked && r.crackedAtMs !== null && <p className="font-mono text-[10.5px] text-vault-success">Cracked at {formatMs(r.crackedAtMs)}</p>}
            </li>
          );
        })}
      </ul>

      {racing && (
        <div className="relative mx-auto mt-6 grid max-w-sm grid-cols-3 gap-2.5">
          {KEYS.map((key) =>
            key === "go" ? (
              <button key={key} type="button" onClick={() => press(key)} disabled={!full} className="neon-button h-14 px-2 text-[15px]">
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Crack
              </button>
            ) : key === "back" ? (
              <button key={key} type="button" onClick={() => press(key)} className="key-tile h-14" aria-label="Delete digit">
                <Delete className="h-5 w-5" />
              </button>
            ) : (
              <button key={key} type="button" onClick={() => press(key)} disabled={full} className="key-tile h-14">
                {key}
              </button>
            ),
          )}
        </div>
      )}
      {!mine && !done && (
        <p className="relative mt-6 flex items-center justify-center gap-2 text-[14px] text-vault-ice/65">
          <Eye className="h-4 w-4 text-vault-neon" aria-hidden="true" /> Watching live. Submitted tries appear on each door.
        </p>
      )}
      {done && race.story && <p className="relative mt-5 text-center text-[13.5px] leading-relaxed text-vault-ice/65">{race.story}</p>}
      {racing && <p className="relative mt-4 text-center text-[12.5px] text-vault-muted">Your earned digits are filled in. Keys 0–9, Enter to crack.</p>}
    </section>
  );
}

/** Full-screen gold champion reveal with placings and prize payouts. */
export function ChampionReveal({ snapshot }: { snapshot: ArenaSnapshot }) {
  const standings = snapshot.standings ?? [];
  const champ = standings[0];
  const meId = snapshot.me.userId;
  const mine = standings.find((s) => s.userId === meId) ?? null;
  const cracked = Boolean(snapshot.race?.racers.find((r) => r.userId === champ?.userId)?.cracked);
  const played = useRef<boolean>(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    playSound("unlock");
  }, []);

  if (!champ) return null;
  return (
    <div className="flex flex-col gap-5">
      <section className="neon-frame relative overflow-hidden bg-[radial-gradient(ellipse_at_top,rgba(207,171,92,0.28),rgba(11,18,16,0.95)_60%)] px-6 py-10 text-center sm:py-14" aria-labelledby="champ-title">
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-24 h-80 w-80 -translate-x-1/2 animate-jackpot-burst rounded-full bg-[radial-gradient(circle,rgba(234,217,168,0.5),transparent_70%)]" />
        <div className="relative flex flex-col items-center">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-vault-neonhi">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.tournament?.name ?? "Tournament"} champion
          </p>
          <div className="relative mt-6">
            <Crown className="absolute -top-8 left-1/2 h-9 w-9 -translate-x-1/2 animate-pop-in text-vault-neonhi drop-shadow-[0_0_14px_rgba(234,217,168,0.9)]" aria-hidden="true" />
            <PlayerAvatar name={champ.name} size="lg" highlight className="scale-125" />
          </div>
          <h2 id="champ-title" className="mt-7 font-display text-[40px] font-medium leading-none text-vault-ice sm:text-[60px]">
            {champ.userId === meId ? "You're the champion" : champ.name}
          </h2>
          <p className="mt-3 text-[16px] text-vault-ice/75">
            {cracked ? "First to crack the vault" : "Top score after the vault held"} · {champ.score.toLocaleString("en-US")} pts
            {champ.vcEarned > 0 ? ` · ${formatMoney(champ.vcEarned)}` : ""}
          </p>
          {mine && mine.userId !== champ.userId && (
            <p className="mt-4 rounded-full border border-vault-neon/40 bg-vault-ink/60 px-4 py-1.5 text-[14px] text-vault-ice">
              You finished <span className="font-semibold text-vault-neonhi">{ordinal(mine.placement)}</span>
              {mine.vcEarned > 0 ? ` · ${formatMoney(mine.vcEarned)}` : ""}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="neon-card p-4 sm:p-5" aria-labelledby="placings-title">
          <h3 id="placings-title" className="eyebrow-muted pb-3">
            Final placings
          </h3>
          <ol className="flex flex-col gap-1.5">
            {standings.map((s) => (
              <li key={s.userId} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", s.userId === meId ? "border-vault-neon/50 bg-vault-neon/[0.07]" : "border-transparent bg-white/[0.02]")}>
                <span className={cn("w-9 font-mono text-[13px] tabular", s.placement <= 3 ? "text-vault-neonhi" : "text-vault-muted")}>{ordinal(s.placement)}</span>
                <PlayerAvatar name={s.name} size="sm" dimmed={s.eliminatedAfter != null} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[14.5px] font-medium text-vault-ice">{s.name}</span>
                  <span className="font-mono text-[10.5px] text-vault-muted tabular">
                    {s.score.toLocaleString("en-US")} pts · {s.correct}/{s.answered} correct
                    {s.eliminatedAfter != null ? ` · out after Q${s.eliminatedAfter}` : " · vault race"}
                  </span>
                </span>
                {s.vcEarned > 0 && <span className="vault-display text-[14px] tabular text-vault-neonhi">{formatMoney(s.vcEarned)}</span>}
              </li>
            ))}
          </ol>
        </section>
        <aside className="neon-card flex flex-col gap-3 p-5">
          <p className="eyebrow-muted">Prizes</p>
          <p className="text-[14px] leading-relaxed text-vault-ice/75">
            VC prizes are already in winners' Arena balances. Badges and the champion title show on the Arena leaderboard.
          </p>
          {snapshot.tournament && (
            <Link to={`/arena/tournaments/${snapshot.tournament.id}`} className="neon-button h-12">
              <Trophy className="h-4 w-4" aria-hidden="true" /> Tournament page
            </Link>
          )}
          <Link to="/arena/tournaments" className="ghost-neon-button h-12">
            All tournaments
          </Link>
        </aside>
      </div>
    </div>
  );
}

/** Final room lobby: seats for the finalists (away until they connect) and the start countdown. */
export function FinalLobby({ snapshot, remaining }: { snapshot: ArenaSnapshot; remaining: number }) {
  const startsIn = useTicker(snapshot.startsAt);
  const counting = snapshot.phase === "countdown";
  const isFinalist = snapshot.players.some((p) => p.userId === snapshot.me.userId);
  return (
    <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-9" aria-labelledby="fl-title">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-vault-neon/[0.09] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-vault-neon">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.tournament?.name ?? "Tournament"} · live final
          </p>
          <h2 id="fl-title" className="mt-2 font-display text-[32px] font-medium leading-tight text-vault-ice sm:text-[44px]">
            {counting ? "The final is starting" : isFinalist ? "Your seat is ready" : "Finalists are gathering"}
          </h2>
          <p className="mt-1.5 max-w-lg text-[15px] text-vault-ice/65">
            12 questions. Knockouts after Q4 and Q8. Survivors race to crack the vault. {isFinalist ? "Stay on this page." : "You're watching live."}
          </p>
        </div>
        {counting ? (
          <CountdownRing remaining={remaining} total={10} />
        ) : snapshot.startsAt ? (
          <div className="text-right">
            <p className="hud-label text-[9.5px]">Starts in</p>
            <p className="vault-display mt-1 text-[36px] leading-none tabular text-vault-neonhi">{startsIn > 0 ? formatClock(startsIn) : "Any moment"}</p>
          </div>
        ) : null}
      </div>
      <ul className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {snapshot.players.map((p, i) => (
          <li
            key={p.userId}
            className={cn("flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center", p.connected ? "border-vault-neon/40 bg-vault-neon/[0.06]" : "border-dashed border-vault-line bg-vault-ink/40")}
          >
            <PlayerAvatar name={p.name} away={!p.connected} highlight={p.userId === snapshot.me.userId} />
            <span className="max-w-full truncate text-[14px] font-medium text-vault-ice">{p.name}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-vault-muted">
              Seed {i + 1} · {p.connected ? <span className="text-vault-success">here</span> : "away"}
            </span>
          </li>
        ))}
      </ul>
      <p className="relative mt-5 flex items-center gap-2 text-[12.5px] text-vault-muted">
        <Users className="h-3.5 w-3.5" aria-hidden="true" /> {snapshot.spectators} watching
        <ShieldOff className="ml-3 h-3.5 w-3.5" aria-hidden="true" /> No lifelines in the final. Pure knowledge.
      </p>
      {snapshot.notice && <p className="relative mt-3 rounded-lg border border-vault-danger/40 bg-vault-danger/10 px-4 py-2.5 text-[13.5px] text-vault-ice/85">{snapshot.notice}</p>}
    </section>
  );
}

export { Skull };
