import { Check, Copy, Gem, Link2, Loader2, Play, Share2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LiveDot, PlayerAvatar } from "@/components/arena/ArenaBits";
import { CountdownRing } from "@/components/play/CountdownRing";
import { inviteLink, POOL_OPTIONS } from "@/lib/arena/api";
import { ARENA_MAX_PLAYERS, type ArenaSnapshot, type ClientMessage } from "@/lib/arena/protocol";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";

interface WaitingRoomProps {
  snapshot: ArenaSnapshot;
  remaining: number;
  send: (msg: ClientMessage) => void;
}

/** Lobby + start countdown: seats, room code, host settings. */
export function WaitingRoom({ snapshot, remaining, send }: WaitingRoomProps) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const isPrivate = snapshot.kind === "private";
  const isHost = snapshot.hostId === snapshot.me.userId;
  const seated = snapshot.players.filter((p) => !p.left);
  const live = seated.filter((p) => p.connected);
  const isCountdown = snapshot.phase === "countdown";
  const pool = POOL_OPTIONS.find((o) => o.id === snapshot.pool) ?? POOL_OPTIONS[0];
  const emptySeats = Math.max(0, ARENA_MAX_PLAYERS - seated.length);

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? (snapshot.code ?? "") : inviteLink(snapshot.roomId);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast.error("Couldn't copy. Select it and copy manually.");
    }
  };

  const share = async () => {
    const url = inviteLink(snapshot.roomId);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join my Vault Arena room", text: `Room code ${snapshot.code}. Can you outplay me?`, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    void copy("link");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <section className="neon-frame animate-rise-in relative overflow-hidden bg-vault-panel p-6 sm:p-8" aria-labelledby="room-title">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-vault-neon/[0.08] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.26em] text-vault-neon">
              <LiveDot />
              {isPrivate ? "Private room" : "Public room"} · match {snapshot.matchNumber + 1}
            </p>
            <h2 id="room-title" className="mt-3 font-display text-[34px] font-medium leading-tight text-vault-ice sm:text-[44px]">
              {isCountdown ? "Starting soon" : live.length < 2 ? "Waiting for players" : isPrivate ? "Ready when the host is" : "Get ready"}
            </h2>
            <p className="mt-2 text-[15px] text-vault-ice/65">
              {isCountdown
                ? "Questions drop for everyone at the same moment."
                : live.length < 2
                  ? isPrivate
                    ? "Share the code. You need at least 2 players."
                    : "The match starts 20 seconds after a second player joins."
                  : isPrivate
                    ? isHost
                      ? "Start whenever you're ready, or wait for more friends."
                      : "The host will start the match."
                    : "Hang tight."}
            </p>
            {snapshot.notice && <p className="mt-2 text-[13px] text-vault-neon">{snapshot.notice}</p>}
          </div>
          {isCountdown && <CountdownRing remaining={remaining} total={isPrivate ? 5 : 20} />}
        </div>

        <ul className="relative mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Players">
          {seated.map((p, i) => (
            <li
              key={p.userId}
              className={cn(
                "animate-pop-in flex flex-col items-center gap-2 rounded-xl border px-2 py-4 text-center",
                p.userId === snapshot.me.userId ? "border-vault-neon/50 bg-vault-neon/[0.07]" : "border-vault-line bg-vault-ink/40",
              )}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <PlayerAvatar name={p.name} size="lg" host={p.isHost} away={!p.connected} highlight={p.userId === snapshot.me.userId} />
              <span className="w-full truncate text-[14px] font-medium text-vault-ice">{p.name}</span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-vault-muted">
                {!p.connected ? "Reconnecting" : p.userId === snapshot.me.userId ? "You" : p.isHost ? "Host" : "Ready"}
              </span>
            </li>
          ))}
          {Array.from({ length: Math.min(emptySeats, 8 - seated.length) }).map((_, i) => (
            <li key={`empty-${i}`} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-vault-line/70 px-2 py-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-vault-line text-vault-ice/15">
                <Users className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-vault-ice/25">Open seat</span>
            </li>
          ))}
        </ul>
        {snapshot.me.role === "spectator" && (
          <p className="relative mt-4 rounded-lg border border-vault-line bg-vault-ink/50 px-4 py-3 text-[13.5px] text-vault-ice/70">
            The room is full. You're watching and will take the next open seat.
          </p>
        )}

        {isPrivate && isHost && !isCountdown && (
          <div className="relative mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => send({ type: "start" })} disabled={live.length < 2} className="neon-button h-14 text-lg">
              <Play className="h-5 w-5" aria-hidden="true" />
              Start match
            </button>
            {live.length < 2 && <span className="text-[13px] text-vault-muted">Waiting for one more player…</span>}
          </div>
        )}
        {!isPrivate && live.length < 2 && (
          <p className="relative mt-6 inline-flex items-center gap-2 text-[13.5px] text-vault-ice/60">
            <Loader2 className="h-4 w-4 animate-spin text-vault-neon" aria-hidden="true" />
            Searching the floor for opponents…
          </p>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <div className="neon-card animate-rise-in p-5" style={{ animationDelay: "80ms" }}>
          <p className="eyebrow-muted">{isPrivate ? "Private" : "Public"} jackpot</p>
          <p className="mt-2 flex items-center gap-2.5">
            <Gem className="h-6 w-6 text-vault-neon" aria-hidden="true" />
            <span className="vault-display text-[30px] leading-none tabular text-vault-neonhi">{formatMoney(snapshot.jackpotAmount)}</span>
          </p>
          <p className="mt-2 text-[13px] text-vault-ice/60">The match winner gets one shot at the vault. Every sealed vault adds 5,000 VC.</p>
        </div>

        {isPrivate && snapshot.code && (
          <div className="neon-card animate-rise-in p-5" style={{ animationDelay: "140ms" }}>
            <p className="eyebrow-muted">Room code</p>
            <div className="mt-3 flex gap-1.5" aria-label={`Room code ${snapshot.code.split("").join(" ")}`}>
              {snapshot.code.split("").map((ch, i) => (
                <span key={i} className="neon-tile flex h-14 flex-1 items-center justify-center font-display text-[24px] text-vault-neonhi">
                  {ch}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => copy("code")} className="ghost-neon-button h-11 px-2 text-[13px]">
                {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Code
              </button>
              <button type="button" onClick={() => copy("link")} className="ghost-neon-button h-11 px-2 text-[13px]">
                {copied === "link" ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                Link
              </button>
              <button type="button" onClick={share} className="ghost-neon-button h-11 px-2 text-[13px]">
                <Share2 className="h-4 w-4" />
                Share
              </button>
            </div>
          </div>
        )}

        <div className="neon-card animate-rise-in p-5" style={{ animationDelay: "200ms" }}>
          <p className="eyebrow-muted">Question pool</p>
          {isPrivate && isHost && !isCountdown ? (
            <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Question pool">
              {POOL_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={snapshot.pool === o.id}
                  onClick={() => send({ type: "pool", pool: o.id })}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors",
                    snapshot.pool === o.id ? "border-vault-neon/60 bg-vault-neon/10 text-vault-neonhi" : "border-vault-line text-vault-ice/70 hover:border-vault-neon/40",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[15px] text-vault-ice">{pool.label}</p>
          )}
          <p className="mt-3 text-[12.5px] text-vault-muted">10 questions · 15s each · 2 gold digit questions · 50/50 + Shield</p>
        </div>
      </aside>
    </div>
  );
}
