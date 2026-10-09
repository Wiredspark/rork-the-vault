import { useCallback, useEffect, useRef, useState } from "react";

import { accessToken, BACKEND_PATH } from "@/lib/arena/api";
import type { ArenaSnapshot, ClientMessage, Reaction, ServerMessage } from "@/lib/arena/protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface ArenaReactionEvent {
  id: number;
  userId: string;
  name: string;
  emoji: Reaction;
}

interface UseArenaRoom {
  snapshot: ArenaSnapshot | null;
  status: ConnectionStatus;
  /** Set when the room refused us for good (not found, kicked, closed). */
  fatal: string | null;
  reactions: ArenaReactionEvent[];
  send: (msg: ClientMessage) => void;
  /** Local clock + offset ≈ server clock. */
  serverNow: () => number;
}

const MAX_BACKOFF_MS = 8_000;

/** Live connection to one Arena room with auto-reconnect and server clock sync. */
export function useArenaRoom(roomId: string): UseArenaRoom {
  const [snapshot, setSnapshot] = useState<ArenaSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [fatal, setFatal] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ArenaReactionEvent[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const offsetRef = useRef<number>(0);
  const bestRttRef = useRef<number>(Infinity);
  const reactionId = useRef<number>(0);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  useEffect(() => {
    let disposed = false;
    let attempt = 0;
    let retryTimer: number | undefined;
    let pingTimer: number | undefined;
    let gaveUp = false;
    setFatal(null);
    setSnapshot(null);
    bestRttRef.current = Infinity;

    const connect = async () => {
      if (disposed) return;
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      const token = await accessToken();
      if (disposed) return;
      if (!token) {
        setFatal("Your session expired. Sign in again to play.");
        setStatus("closed");
        return;
      }
      const url = new URL(`${BACKEND_PATH}/arena/room/${encodeURIComponent(roomId)}/ws`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("token", token);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      const ping = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", clientSentAt: Date.now() } satisfies ClientMessage));
      };

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        ping();
        window.clearInterval(pingTimer);
        pingTimer = window.setInterval(ping, 10_000);
      };

      ws.onmessage = (event: MessageEvent<string>) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "state") {
          // Fallback offset until the first ping round-trip lands.
          if (bestRttRef.current === Infinity) offsetRef.current = msg.serverNow - Date.now();
          setSnapshot(msg);
        } else if (msg.type === "pong") {
          const now = Date.now();
          const rtt = now - msg.clientSentAt;
          if (rtt >= 0 && rtt <= bestRttRef.current) {
            bestRttRef.current = rtt;
            offsetRef.current = msg.serverNow + rtt / 2 - now;
          }
        } else if (msg.type === "reaction") {
          reactionId.current += 1;
          const item: ArenaReactionEvent = { id: reactionId.current, userId: msg.userId, name: msg.name, emoji: msg.emoji };
          setReactions((prev) => [...prev.slice(-11), item]);
          window.setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== item.id)), 2_600);
        } else if (msg.type === "kicked") {
          gaveUp = true;
          setFatal(msg.message);
        } else if (msg.type === "error") {
          window.dispatchEvent(new CustomEvent<string>("arena:error", { detail: msg.message }));
        }
      };

      ws.onclose = (event: CloseEvent) => {
        window.clearInterval(pingTimer);
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        if (event.code === 4404) {
          setFatal("That room doesn't exist or has closed.");
          gaveUp = true;
        } else if (event.code === 4403 || event.code === 4410) {
          gaveUp = true;
        } else if (event.code === 4000) {
          setFatal("This room is open in another tab.");
          gaveUp = true;
        }
        if (gaveUp) {
          setStatus("closed");
          return;
        }
        attempt += 1;
        setStatus("reconnecting");
        const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(attempt, 4));
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    const onVisible = () => {
      if (document.visibilityState === "visible" && !socketRef.current && !gaveUp && !disposed) {
        window.clearTimeout(retryTimer);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      window.clearInterval(pingTimer);
      document.removeEventListener("visibilitychange", onVisible);
      const ws = socketRef.current;
      socketRef.current = null;
      ws?.close(1000, "leaving");
    };
  }, [roomId]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { snapshot, status, fatal, reactions, send, serverNow };
}

/** Seconds remaining until a server-clock deadline, ticking ~10×/s. */
export function useServerCountdown(endsAt: number | null, serverNow: () => number): number {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (endsAt === null) {
      setRemaining(0);
      return;
    }
    const update = () => setRemaining(Math.max(0, (endsAt - serverNow()) / 1000));
    update();
    const id = window.setInterval(update, 100);
    return () => window.clearInterval(id);
  }, [endsAt, serverNow]);
  return remaining;
}
