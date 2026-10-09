import { supabase } from "@/integrations/supabase/client";

import type {
  ArenaAdminState,
  ArenaExclusions,
  ArenaInsights,
  ArenaLeaderboard,
  ArenaOverview,
  TournamentAdminView,
  TournamentConfig,
  TournamentDetail,
  TournamentSummary,
} from "./protocol";

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

export const fetchTournaments = () => request<TournamentSummary[]>("/arena/tournaments");
export const fetchTournament = (id: string) => request<TournamentDetail>(`/arena/tournaments/${encodeURIComponent(id)}`);
export const registerTournament = (id: string, code: string | null) =>
  request<TournamentSummary>(`/arena/tournaments/${encodeURIComponent(id)}/register`, { method: "POST", body: JSON.stringify({ code }) });
export const startQualifierRun = (id: string) =>
  request<{ roomId: string; resumed: boolean }>(`/arena/tournaments/${encodeURIComponent(id)}/run`, { method: "POST", body: "{}" });
export const checkInTournament = (id: string) =>
  request<TournamentSummary>(`/arena/tournaments/${encodeURIComponent(id)}/checkin`, { method: "POST", body: "{}" });

export const fetchAdminTournaments = () => request<{ tournaments: TournamentAdminView[]; insights: ArenaInsights }>("/arena/admin/tournaments");
export const saveTournament = (body: { id?: string; config: TournamentConfig; publish?: boolean }) =>
  request<TournamentAdminView>("/arena/admin/tournaments/save", { method: "POST", body: JSON.stringify(body) });
export const saveTournamentInvites = (id: string, invites: string[]) =>
  request<TournamentAdminView>("/arena/admin/tournaments/invites", { method: "POST", body: JSON.stringify({ id, invites }) });
export type TournamentAdminAction =
  | "publish"
  | "pause"
  | "resume"
  | "cancel"
  | "delete"
  | "duplicate"
  | "prize-sent"
  | "prize-unsent"
  | "disqualify"
  | "reinstate"
  | "skip"
  | "regen-code";
export const tournamentAction = (id: string, action: TournamentAdminAction, userId?: string) =>
  request<TournamentAdminView | { deleted: true } | { id: string }>("/arena/admin/tournaments/action", {
    method: "POST",
    body: JSON.stringify({ id, action, userId }),
  });

export function tournamentLink(id: string, code?: string): string {
  return `${window.location.origin}/arena/tournaments/${id}${code ? `?invite=${code}` : ""}`;
}

/** Valid live room ids: private codes, public rooms, qualifier runs and finals. */
export function isValidRoomId(id: string): boolean {
  return /^pub-[a-z0-9]{6}$/.test(id) || /^[A-HJ-NP-Z2-9]{6}$/.test(id) || /^q-[a-z0-9]{10}$/.test(id) || /^f-[a-z0-9]{8}$/.test(id);
}

export function normalizeRoomId(raw: string): string {
  const lower = raw.toLowerCase();
  return /^(pub|q|f)-/.test(lower) ? lower : raw.toUpperCase();
}

/** Accepts "ABC123", "abc-123", or a pasted invite link. */
export function normalizeRoomCode(input: string): string {
  const fromLink = input.match(/arena\/room\/([A-Za-z0-9-]+)/)?.[1] ?? input;
  return fromLink.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
}

export function inviteLink(roomId: string): string {
  return `${window.location.origin}/arena/room/${roomId}`;
}
