import createContextHook from "@nkzw/create-context-hook";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  displayName: string;
}

export interface SignUpResult {
  needsConfirmation: boolean;
}

function redirectUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/** Maps Supabase auth errors to player-facing copy without leaking internals. */
export function friendlyAuthError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (code === "invalid_credentials" || message.includes("invalid login")) return "That email and password don't match. Try again.";
  if (code === "email_not_confirmed" || message.includes("not confirmed")) return "Confirm your email first. The link is in your inbox.";
  if (code === "user_already_exists" || message.includes("already registered")) return "An account with this email already exists. Sign in instead.";
  if (code === "weak_password" || message.includes("password should")) return "Pick a stronger password with at least 8 characters.";
  if (code === "same_password") return "Your new password must be different from the old one.";
  if (code.startsWith("over_") || message.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (message.includes("failed to fetch") || message.includes("network")) return "Can't reach the vault. Check your connection.";
  return "Something went wrong. Please try again.";
}

function fail(action: string, error: AuthError): never {
  console.warn(`[auth] ${action} failed:`, error.code ?? error.status ?? error.name);
  throw new Error(friendlyAuthError(error));
}

/** Display name from sign-up metadata, falling back to the email handle. */
export function displayNameFor(user: User | null): string {
  const meta: unknown = user?.user_metadata?.display_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user?.email?.split("@")[0] ?? "Player";
}

export function initialsFor(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
}

/** Supabase email/password session state plus the auth actions used by the auth screens. */
export const [AuthProvider, useAuth] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isRecovery, setIsRecovery] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.warn("[auth] Could not restore session:", error.name);
      setSession(data.session);
      setIsReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setIsReady(true);
      if (event === "PASSWORD_RECOVERY") setIsRecovery(true);
      if (event === "SIGNED_OUT") setIsRecovery(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async ({ email, password }: Credentials): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) fail("sign-in", error);
  }, []);

  const signUp = useCallback(async ({ email, password, displayName }: SignUpInput): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName }, emailRedirectTo: redirectUrl("/") },
    });
    if (error) fail("sign-up", error);
    // With email confirmation on, Supabase hides existing accounts by returning a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error("An account with this email already exists. Sign in instead.");
    }
    return { needsConfirmation: !data.session };
  }, []);

  const resendConfirmation = useCallback(async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectUrl("/") } });
    if (error) fail("resend", error);
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl("/auth") });
    if (error) fail("password-reset", error);
  }, []);

  const updatePassword = useCallback(async (password: string): Promise<void> => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) fail("update-password", error);
    setIsRecovery(false);
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) fail("sign-out", error);
    queryClient.clear();
  }, [queryClient]);

  const user = session?.user ?? null;

  return useMemo(
    () => ({
      session,
      user,
      isReady,
      isRecovery,
      displayName: displayNameFor(user),
      signIn,
      signUp,
      resendConfirmation,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [isReady, isRecovery, requestPasswordReset, resendConfirmation, session, signIn, signOut, signUp, updatePassword, user],
  );
});
