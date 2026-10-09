import { supabase } from "@/integrations/supabase/client";

import type { ArenaAdminState, ArenaExclusions, ArenaLeaderboard, ArenaOverview } from "./protocol";

/** Same-origin path to the Cloudflare backend on every Rork web host. */
export const BACKEND_PATH = "/~api";

export const POOL_OPTIONS: { id: string; label: string; short: string }[] = [
  { id: "all", label: "All released episodes", short: "All eras" },
  { id: "pre90", label: "Classic era · before 1990", short: "Classic" },
  { id: "90s", label: "The '90s", short: "'90s" },
  { id: "2000s", label: "2000s and beyond", short: "2000s+" },
];

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${BACKEND_PATH}${path}`, { ...init, headers });
  } catch {
    throw new Error("Can't reach the Arena. Check your connection.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("The Arena is warming up. Try again in a moment.");
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message ?? "The Arena is unavailable right now.");
  }
  return data as T;
}

export const fetchArenaOverview = () => request<ArenaOverview>("/arena/overview");
export const fetchArenaLeaderboard = () => request<ArenaLeaderboard>("/arena/leaderboard");
export const joinPublicArena = () => request<{ roomId: string }>("/arena/public/join", { method: "POST" });
export const createPrivateRoom = () => request<{ roomId: string }>("/arena/private", { method: "POST" });
export const fetchRoomInfo = (roomId: string) =>
  request<{ exists: boolean; kind?: string; phase?: string; players?: number }>(`/arena/room/${encodeURIComponent(roomId)}`);

export const fetchArenaAdminState = () => request<ArenaAdminState>("/arena/admin/state");
export const saveArenaExclusions = (exclusions: ArenaExclusions) =>
  request<ArenaExclusions>("/arena/admin/exclusions", { method: "POST", body: JSON.stringify(exclusions) });
export const closeArenaRoom = (roomId: string) => request<{ ok: true }>("/arena/admin/close", { method: "POST", body: JSON.stringify({ roomId }) });
export const kickArenaPlayer = (roomId: string, userId: string) =>
  request<{ ok: true }>("/arena/admin/kick", { method: "POST", body: JSON.stringify({ roomId, userId }) });

/** Accepts "ABC123", "abc-123", or a pasted invite link. */
export function normalizeRoomCode(input: string): string {
  const fromLink = input.match(/arena\/room\/([A-Za-z0-9-]+)/)?.[1] ?? input;
  return fromLink.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

export function inviteLink(roomId: string): string {
  return `${window.location.origin}/arena/room/${roomId}`;
}
