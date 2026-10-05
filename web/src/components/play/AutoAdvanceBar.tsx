import { FastForward, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const TICK_MS = 100;

/** Reading time for the feedback panel: a 3.5s floor plus ~190ms per word of the fun fact, capped at 9s. */
export function autoAdvanceDelay(fact: string): number {
  const words = fact.trim() ? fact.trim().split(/\s+/).length : 0;
  return Math.min(9000, 3500 + words * 190);
}

interface AutoAdvanceBarProps {
  durationMs: number;
  /** Externally paused (e.g. pointer over the feedback panel). */
  holding: boolean;
  label: string;
  onDone: () => void;
  onDisable: () => void;
}

/** Countdown strip under the feedback panel that advances automatically; pausable, skippable, and can be switched off. */
export function AutoAdvanceBar({ durationMs, holding, label, onDone, onDisable }: AutoAdvanceBarProps) {
  const [elapsed, setElapsed] = useState<number>(0);
  const [paused, setPaused] = useState<boolean>(false);
  const doneRef = useRef<() => void>(onDone);
  doneRef.current = onDone;
  const fired = useRef<boolean>(false);
  const stopped = paused || holding;

  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => setElapsed((e) => Math.min(durationMs, e + TICK_MS)), TICK_MS);
    return () => window.clearInterval(id);
  }, [durationMs, stopped]);

  useEffect(() => {
    if (elapsed < durationMs || fired.current) return;
    fired.current = true;
    doneRef.current();
  }, [durationMs, elapsed]);

  const pct = Math.min(100, (elapsed / durationMs) * 100);
  const secondsLeft = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));

  return (
    <div className="mt-5 flex flex-col gap-2.5">
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
        <div
          className={cn("h-full rounded-full bg-round transition-[width] duration-100 ease-linear", stopped && "opacity-50")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onDone} className="neon-button h-11" autoFocus>
          <FastForward className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="ghost-neon-button h-11"
          aria-pressed={paused}
        >
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
          {paused ? "Resume" : "Pause"}
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-vault-muted tabular" aria-live="off">
          {stopped ? "Paused" : `Next in ${secondsLeft}s`}
        </span>
        <button
          type="button"
          onClick={onDisable}
          className="ml-auto rounded-md px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-vault-muted transition-colors hover:text-vault-neon"
        >
          Turn off auto-advance
        </button>
      </div>
    </div>
  );
}
