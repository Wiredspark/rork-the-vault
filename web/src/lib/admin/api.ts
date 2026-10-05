import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { RawEpisode } from "@/lib/episode";

export type DbEpisodeStatus = "draft" | "scheduled" | "published";

export interface AdminEpisodeRow {
  id: string;
  title: string;
  status: DbEpisodeStatus;
  publishAt: string | null;
  updatedAt: string;
}

export interface AdminEpisodeFull extends AdminEpisodeRow {
  content: RawEpisode;
}

export interface RosterEntry {
  userId: string;
  email: string;
  displayName: string;
  role: "founder" | "admin";
  createdAt: string;
  grantedByName: string | null;
}

/** Translates database/RPC errors into admin-facing copy. */
export function adminErrorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  const e = error as { message?: string; code?: string } | null;
  const msg = e?.message ?? "";
  if (e?.code === "23505") return "That episode ID is already taken.";
  if (e?.code === "42501" || msg.includes("NOT_ADMIN") || msg.includes("row-level security")) return "Your account doesn't have admin access.";
  if (msg.includes("NOT_FOUNDER")) return "Only the founding admin can manage roles.";
  if (msg.includes("USER_NOT_FOUND")) return "No account uses that email. Create a new admin account instead.";
  if (msg.includes("ALREADY_ADMIN")) return "That account is already an admin.";
  if (msg.includes("CANNOT_REVOKE_SELF")) return "You can't remove your own access.";
  if (msg.includes("NOT_REVOCABLE")) return "That admin can't be removed.";
  if (msg.toLowerCase().includes("failed to fetch")) return "Can't reach the server. Check your connection.";
  return fallback;
}

function toRow(row: { id: string; title: string; status: string; publish_at: string | null; updated_at: string }): AdminEpisodeRow {
  return {
    id: row.id,
    title: row.title,
    status: (row.status as DbEpisodeStatus) ?? "draft",
    publishAt: row.publish_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchAdminEpisodes(): Promise<AdminEpisodeRow[]> {
  const { data, error } = await supabase.from("episodes").select("id, title, status, publish_at, updated_at").order("id");
  if (error) throw error;
  return (data ?? []).map(toRow);
}

export async function fetchAdminEpisode(id: string): Promise<AdminEpisodeFull | null> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, title, status, publish_at, updated_at, content")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...toRow(data), content: data.content as unknown as RawEpisode };
}

export interface SaveEpisodeInput {
  content: RawEpisode;
  status: DbEpisodeStatus;
  publishAt: string | null;
  /** Existing row id to update; omit to insert a new row. */
  existingId?: string;
}

export async function saveEpisode({ content, status, publishAt, existingId }: SaveEpisodeInput): Promise<AdminEpisodeRow> {
  const row = {
    id: content.episodeId,
    module_id: "rnb",
    title: content.title,
    status,
    publish_at: status === "draft" ? null : publishAt,
    content: content as unknown as Json,
  };
  const query = existingId
    ? supabase.from("episodes").update(row).eq("id", existingId)
    : supabase.from("episodes").insert(row);
  const { data, error } = await query.select("id, title, status, publish_at, updated_at").single();
  if (error) throw error;
  return toRow(data);
}

export async function deleteEpisode(id: string): Promise<void> {
  const { error } = await supabase.from("episodes").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchRoster(): Promise<RosterEntry[]> {
  const { data, error } = await supabase.rpc("admin_roster");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    role: r.role === "founder" ? "founder" : "admin",
    createdAt: r.created_at,
    grantedByName: r.granted_by_name ?? null,
  }));
}

export async function promoteAdmin(email: string): Promise<void> {
  const { error } = await supabase.rpc("admin_promote", { p_email: email });
  if (error) throw error;
}

export async function revokeAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_revoke", { p_user_id: userId });
  if (error) throw error;
}

export interface CreateAdminInput {
  email: string;
  password: string;
  displayName: string;
}

/** Founder-only: server function creates a confirmed account and grants admin. */
export async function createAdminAccount(input: CreateAdminInput): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("admin-create-user", { body: input });
  if (error) {
    let message = "Couldn't create the account. Try again.";
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const body = (await context.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        // keep fallback
      }
    }
    throw new Error(message);
  }
  if (!data?.ok) throw new Error(data?.error ?? "Couldn't create the account. Try again.");
}

/** "in 3 days", "2h ago", or a date for anything older than a week. */
export function formatWhen(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  const diff = t - now;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const label =
    mins < 1 ? "just now" : mins < 60 ? `${mins}m` : mins < 60 * 24 ? `${Math.round(mins / 60)}h` : mins < 60 * 24 * 7 ? `${Math.round(mins / 1440)}d` : null;
  if (label === "just now") return label;
  if (label) return diff > 0 ? `in ${label}` : `${label} ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
