import { ArrowRight, CircleX, Delete, Lock, LockOpen, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { LifelineBar } from "@/components/play/LifelineBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { DigitTile, type DigitTileState } from "@/components/vault/DigitTile";
import { VaultDial } from "@/components/vault/VaultDial";
import { IMAGES } from "@/data/assets";
import { VAULT_MAX_ATTEMPTS } from "@/lib/gameEngine";
import { formatMoney } from "@/lib/scoring";
import { cn } from "@/lib/utils";
import { useGame } from "@/providers/GameProvider";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function CrackedPanel() {
  const { episode, total } = useGame();
  return (
    <section className="neon-frame relative animate-door-reveal overflow-hidden bg-vault-ink" aria-labelledby="cracked-title">
      <img src={IMAGES.vaultOpen} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(14,13,18,0.35),rgba(14,13,18,0.92)_75%)]" />
      <div className="relative flex flex-col items-center px-6 py-12 text-center sm:py-16">
        <p className="eyebrow flex items-center gap-2">
          <LockOpen className="h-4 w-4" aria-hidden="true" /> Vault cracked
        </p>
        <h2 id="cracked-title" className="mt-3 font-display text-7xl font-medium text-vault-neonhi tabular drop-shadow-[0_0_30px_rgba(207,171,92,0.5)] sm:text-8xl">
          {episode.vaultYear}
        </h2>
        <p className="mt-3 text-2xl text-vault-ice">+{formatMoney(episode.vaultPrize)} vault bonus</p>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-vault-ice/85">{episode.vaultStory}</p>
        <p className="mt-6 text-sm text-vault-ice/60">Final payout {formatMoney(total)}</p>
        <Link to="/results" className="neon-button mt-6 h-14 text-lg">
          See your results <ArrowRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function SealedPanel() {
  const { episode } = useGame();
  return (
    <section className="neon-card animate-rise-in p-6 text-center sm:p-10" aria-labelledby="sealed-title">
      <Lock className="mx-auto h-10 w-10 text-vault-muted" aria-hidden="true" />
      <h2 id="sealed-title" className="mt-4 font-display text-4xl font-medium text-vault-ice">The vault stays sealed</h2>
      <p className="mx-auto mt-3 max-w-xl text-vault-ice/70">
        Out of attempts. The code was <span className="font-display text-2xl text-vault-neonhi tabular">{episode.vaultYear}</span>.
      </p>
      <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-vault-ice/75">{episode.vaultStory}</p>
      <Link to="/results" className="neon-button mt-7 h-12">
        See your results <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

/** Vault Chamber: inspect the code, guess missing digits on the keypad, and run the unlock sequence. */
export default function VaultChamber() {
  const { episode, state, status, knownDigits, missingDigits, submitCode, sfx } = useGame();
  const [guesses, setGuesses] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState<number>(0);
  const [unlocking, setUnlocking] = useState<boolean>(false);

  const ready = state.roundsComplete && state.vaultOutcome === "pending";
  const attemptsLeft = VAULT_MAX_ATTEMPTS - state.vaultAttempts;
  const cursor = missingDigits.find((i) => guesses[i] === undefined) ?? null;
  const filled = missingDigits.every((i) => guesses[i] !== undefined);

  const code = useMemo(
    () => episode.vaultCode.map((digit, i) => (knownDigits.includes(i) ? digit : (guesses[i] ?? ""))),
    [episode.vaultCode, guesses, knownDigits],
  );

  const press = useCallback(
    (digit: string) => {
      if (!ready || unlocking || cursor === null) return;
      setError(null);
      sfx("click");
      setGuesses((prev) => ({ ...prev, [cursor]: digit }));
    },
    [cursor, ready, sfx, unlocking],
  );

  const backspace = useCallback(() => {
    if (!ready || unlocking) return;
    const lastFilled = [...missingDigits].reverse().find((i) => guesses[i] !== undefined);
    if (lastFilled === undefined) return;
    setError(null);
    setGuesses((prev) => {
      const next = { ...prev };
      delete next[lastFilled];
      return next;
    });
  }, [guesses, missingDigits, ready, unlocking]);

  const unlock = useCallback(() => {
    if (!ready || unlocking || !filled) return;
    setUnlocking(true);
    window.setTimeout(() => {
      const next = submitCode(code);
      setUnlocking(false);
      if (next.vaultOutcome === "cracked") return;
      setShakeKey((k) => k + 1);
      setGuesses({});
      const left = VAULT_MAX_ATTEMPTS - next.vaultAttempts;
      if (next.vaultOutcome === "sealed") {
        toast.error("Wrong code. The vault has sealed.");
      } else {
        const message = `Wrong code. Try again. ${left} attempt${left === 1 ? "" : "s"} left.`;
        setError(message);
        toast.error("Wrong code. Try again.", { description: `${left} attempt${left === 1 ? "" : "s"} left.` });
      }
    }, 1100);
  }, [code, filled, ready, submitCode, unlocking]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) unlock();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backspace, press, unlock]);

  const tileState = (i: number): { state: DigitTileState; value: string | null } => {
    if (state.vaultOutcome !== "pending") return { state: "revealed", value: episode.vaultCode[i] };
    if (episode.freeDigitIndexes.includes(i)) return { state: "free", value: episode.vaultCode[i] };
    if (state.revealed.includes(i)) return { state: "revealed", value: episode.vaultCode[i] };
    if (guesses[i] !== undefined) return { state: "guess", value: guesses[i] };
    if (ready) return { state: "awaiting", value: null };
    const roundForDigit = episode.rounds.find((r) => r.bonus.bonus?.codeDigitIndex === i);
    const roundDone = roundForDigit ? state.roundsComplete || roundForDigit.index < state.roundIndex : false;
    return { state: roundDone ? "scrambled" : "locked", value: null };
  };

  const subtitle = ready
    ? missingDigits.length === 0
      ? `All ${episode.vaultCode.length} digits collected. Press Unlock to open ${episode.id}.`
      : `Enter the missing digit${missingDigits.length > 1 ? "s" : ""} to unlock ${episode.id} and claim ${formatMoney(episode.vaultPrize)}.`
    : state.vaultOutcome === "pending"
      ? `Collect digits from each round's bonus question. Finish all ${episode.rounds.length} rounds to attempt the code.`
      : "The chamber has spoken.";

  return (
    <div className="flex flex-col gap-6">
      <div className="relative">
        <img
          src={IMAGES.vaultDoor}
          alt=""
          className="pointer-events-none absolute -top-6 right-0 hidden h-[260px] w-[60%] object-cover object-[60%_45%] opacity-50 [mask-image:linear-gradient(90deg,transparent,black_45%,black_70%,transparent)] md:block"
        />
        <div className="relative">
          <PageHeader crumb="Vault Chamber" title="Vault Chamber" subtitle={subtitle} />
        </div>
      </div>

      {state.vaultOutcome === "cracked" && <CrackedPanel />}
      {state.vaultOutcome === "sealed" && <SealedPanel />}

      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div key={shakeKey} className={cn("grid grid-cols-4 gap-3 sm:gap-5", shakeKey > 0 && "animate-shake")} aria-label="Vault code">
          {episode.vaultCode.map((_, i) => {
            const t = tileState(i);
            return (
              <DigitTile
                key={i}
                value={t.value}
                state={t.state}
                active={ready && cursor === i && !unlocking}
                delayMs={state.vaultOutcome === "cracked" ? i * 140 : 0}
                label={t.value ? `Digit ${i + 1}: ${t.value}` : `Digit ${i + 1}: ${t.state === "scrambled" ? "scrambled" : "unknown"}`}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="flex animate-rise-in items-center gap-3 rounded-lg border border-vault-danger/60 bg-vault-danger/10 px-5 py-4 text-vault-danger"
            >
              <CircleX className="h-6 w-6 shrink-0" aria-hidden="true" />
              <span className="text-lg font-medium">{error}</span>
            </div>
          )}
          {unlocking && (
            <div className="flex items-center gap-3 text-vault-neonhi" aria-live="polite">
              <VaultDial className="h-10 w-10" spinning />
              <span>Turning the tumblers…</span>
            </div>
          )}
          <p className="text-lg leading-relaxed text-vault-ice/55">
            Four digits. One vault.
            <br />
            The music is waiting.
          </p>
          {ready && (
            <p className="text-sm text-vault-muted tabular">
              {attemptsLeft} of {VAULT_MAX_ATTEMPTS} attempts left
            </p>
          )}
        </div>
      </div>

      {state.vaultOutcome === "pending" && (
        <section className="neon-card grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]" aria-label="Keypad and lifelines">
          <div className="mx-auto grid w-full max-w-[420px] grid-cols-3 gap-3">
            {KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className="key-tile h-16 sm:h-[72px]"
                onClick={() => press(k)}
                disabled={!ready || unlocking || cursor === null}
                aria-label={`Digit ${k}`}
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              className="key-tile h-16 sm:h-[72px]"
              onClick={backspace}
              disabled={!ready || unlocking || missingDigits.every((i) => guesses[i] === undefined)}
              aria-label="Delete last digit"
            >
              <Delete className="h-7 w-7" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="key-tile h-16 sm:h-[72px]"
              onClick={() => press("0")}
              disabled={!ready || unlocking || cursor === null}
              aria-label="Digit 0"
            >
              0
            </button>
          </div>

          <div className="hidden bg-vault-neon/15 lg:block" />

          <div className="flex flex-col">
            <h2 className="font-display text-3xl font-medium text-vault-ice">Lifelines</h2>
            <p className="mb-4 mt-1 text-vault-ice/65">
              {state.roundsComplete ? "Lifelines are for questions — the vault is all you." : "Use a lifeline in play if you're stuck."}
            </p>
            <LifelineBar used={state.lifelinesUsed} size="lg" />
            <div className="hairline my-6" />
            {ready ? (
              <button type="button" onClick={unlock} disabled={!filled || unlocking} className="neon-button h-16 text-2xl">
                <Lock className="h-6 w-6" aria-hidden="true" />
                {unlocking ? "Unlocking…" : "Unlock"}
              </button>
            ) : (
              <Link to="/play" className="neon-button h-16 text-xl">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                {status === "fresh" ? "Start Round 1" : `Continue Round ${state.roundIndex + 1}`}
              </Link>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
