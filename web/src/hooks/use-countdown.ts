import { useEffect, useRef, useState } from "react";

/**
 * Counts down from `seconds` whenever `key` changes while `running` is true.
 * Calls `onExpire` exactly once per key when time runs out.
 */
export function useCountdown(key: string, seconds: number, running: boolean, onExpire: () => void): number {
  const [remaining, setRemaining] = useState<number>(seconds);
  const deadlineRef = useRef<number>(0);
  const firedRef = useRef<string | null>(null);
  const expireRef = useRef<() => void>(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    deadlineRef.current = performance.now() + seconds * 1000;
    firedRef.current = null;
    setRemaining(seconds);
  }, [key, seconds]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const left = Math.max(0, (deadlineRef.current - performance.now()) / 1000);
      setRemaining(left);
      if (left <= 0 && firedRef.current !== key) {
        firedRef.current = key;
        expireRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [key, running]);

  return remaining;
}
