import { Crown, Delete, Gem, KeyRound, Skull, Timer, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PlayerAvatar } from "@/components/arena/ArenaBits";
import { CountdownRing } from "@/components/play/CountdownRing";
import { DigitTile } from "@/components/vault/DigitTile";
import type { ArenaSnapshot, ClientMessage } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { playSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "go"] as const;

const REASON: Record<string, string> = {
  score: "Highest score after 10 questions",
  sudden: "Won the sudden-death tiebreaker",
  time: "Tie broken on total answer time",
  solo: "Last player standing",
};

/** Winner's Jackpot: the match winner cracks the vault while everyone else watches live. */
export function JackpotRound({ snapshot, remaining, send }: { snapshot: ArenaSnapshot; remaining: number; send: (msg: ClientMessage) => void }) {
  const jp = snapshot.jackpot;
  const winner = snapshot.players.find((p) => p.userId === snapshot.winnerId);
  const isWinner = snapshot.me.userId === snapshot.winnerId;
  const length = snapshot.vault?.codeLength ?? 4;
  const known = snapshot.me.digits;
  const [entry, setEntry] = useState<(string | null)[]>(() => (isWinner ? known.slice(0, length) : Array(length).fill(null)));
  const [shakeKey, setShakeKey] = useState<number>(0);
  const lastAttempts = useRef<number>(jp?.attempts.length ?? 0);
  const playedOutcome = useRef<string | null>(null);

  const open = jp?.status === "open";
  const lastAttempt = jp?.attempts[jp.attempts.length - 1] ?? null;

  useEffect(() => {
    const count = jp?.attempts.length ?? 0;
    if (count > lastAttempts.current) {
      lastAttempts.current = count;
      if (lastAttempt && !lastAttempt.correct) {
        playSound("wrong");
        setShakeKey((k) => k + 1);
        if (isWinner) setEntry(known.slice(0, length));
      }
    }
  }, [isWinner, jp?.attempts.length, known, lastAttempt, length]);

  useEffect(() => {
    if (!jp || jp.status === "open" || playedOutcome.current === jp.status) return;
    playedOutcome.current = jp.status;
    playSound(jp.status === "cracked" ? "unlock" : "wrong");
  }, [jp]);

  const firstEmpty = entry.findIndex((d) => d === null);
  const full = firstEmpty === -1;

  const press = (key: (typeof KEYS)[number]) => {
    if (!isWinner || !open) return;
    if (key === "go") {
      if (full) send({ type: "crack", code: entry.join("") });
      return;
    }
    if (key === "back") {
      // Clear the last digit the winner typed (never the ones they've earned).
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
    if (!isWinner || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key as (typeof KEYS)[number]);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Enter") press("go");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const tiles = useMemo(() => {
    if (jp?.code) return jp.code.split("");
    if (isWinner) return entry;
    return lastAttempt ? lastAttempt.code.split("") : Array(length).fill(null);
  }, [entry, isWinner, jp?.code, lastAttempt, length]);

  if (!jp) return null;

  return (
    <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-9" aria-labelledby="jackpot-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-vault-neon/[0.09] blur-3xl" />
      {jp.status === "cracked" && (
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-jackpot-burst rounded-full bg-[radial-gradient(circle,rgba(234,217,168,0.65),rgba(207,171,92,0.2)_45%,transparent_70%)]" />
      )}

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          {winner && <PlayerAvatar name={winner.name} size="lg" highlight />}
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.26em] text-vault-neon">
              <Crown className="h-3.5 w-3.5" aria-hidden="true" /> Match winner
            </p>
            <h2 id="jackpot-title" className="mt-1 font-display text-[30px] font-medium leading-tight text-vault-ice sm:text-[40px]">
              {isWinner ? "You won. Crack the vault." : `${winner?.name ?? "The winner"} is at the vault`}
            </h2>
            <p className="mt-1 text-[14px] text-vault-ice/60">{REASON[snapshot.winReason ?? "score"]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="vault-kicker text-[10px]">Winner's jackpot</p>
            <p className="vault-display flex items-center justify-end gap-2 text-[34px] leading-none tabular text-vault-neonhi sm:text-[44px]">
              <Gem className="h-7 w-7 text-vault-neon" aria-hidden="true" />
              {formatMoney(jp.amount)}
            </p>
          </div>
          {open && <CountdownRing remaining={remaining} total={30} />}
        </div>
      </div>

      <div className="relative mx-auto mt-8 max-w-md">
        <div key={shakeKey} className={cn("grid gap-3", shakeKey > 0 && "animate-shake")} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
          {tiles.map((d, i) => {
            const free = snapshot.vault?.freeIndexes.includes(i);
            const mine = isWinner && known[i] !== null;
            return (
              <DigitTile
                key={i}
                value={d}
                state={d === null ? (open && isWinner && i === firstEmpty ? "awaiting" : "locked") : jp.code ? "revealed" : free || mine ? (free ? "free" : "revealed") : "guess"}
                active={open && isWinner && i === firstEmpty}
                delayMs={i * 90}
                label={d === null ? `Digit ${i + 1}: empty` : `Digit ${i + 1}: ${d}`}
              />
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2" aria-label={`${jp.attemptsLeft} attempts left`}>
          {Array.from({ length: 3 }).map((_, i) => {
            const attempt = jp.attempts[i];
            return (
              <span
                key={i}
                className={cn(
                  "flex h-8 min-w-[72px] items-center justify-center rounded-full border px-3 font-mono text-[12px] tracking-[0.2em] tabular",
                  !attempt && "border-vault-line text-vault-ice/30",
                  attempt && !attempt.correct && "border-vault-danger/50 bg-vault-danger/10 text-vault-danger",
                  attempt?.correct && "border-vault-success/60 bg-vault-success/10 text-vault-success",
                )}
              >
                {attempt ? attempt.code : `TRY ${i + 1}`}
              </span>
            );
          })}
        </div>

        {open && isWinner && (
          <div className="mt-6 grid grid-cols-3 gap-2.5">
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

        {open && !isWinner && (
          <p className="mt-6 flex items-center justify-center gap-2 text-center text-[14px] text-vault-ice/65">
            <Timer className="h-4 w-4 text-vault-neon" aria-hidden="true" />
            Watching live. Each submitted try appears on the tiles.
          </p>
        )}

        {jp.status === "cracked" && (
          <div className="mt-7 animate-pop-in text-center">
            <p className="font-display text-[34px] text-vault-success">Vault cracked</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-[15px] text-vault-ice">
              <Zap className="h-4 w-4 text-vault-neonhi" aria-hidden="true" />
              {winner?.name ?? "The winner"} takes {formatMoney(jp.amount)}
            </p>
          </div>
        )}
        {jp.status === "sealed" && (
          <div className="mt-7 animate-pop-in text-center">
            <p className="flex items-center justify-center gap-2 font-display text-[30px] text-vault-danger">
              <Skull className="h-6 w-6" aria-hidden="true" /> Vault sealed
            </p>
            <p className="mt-1 text-[14px] text-vault-ice/70">The jackpot rolls over and grows by 5,000 VC.</p>
          </div>
        )}
        {jp.story && <p className="mt-4 text-center text-[13.5px] leading-relaxed text-vault-ice/65">{jp.story}</p>}
        {open && isWinner && (
          <p className="mt-4 text-center text-[12.5px] text-vault-muted">Your earned digits are filled in. Guess the rest. Keys 0–9, Enter to crack.</p>
        )}
      </div>
    </section>
  );
}
