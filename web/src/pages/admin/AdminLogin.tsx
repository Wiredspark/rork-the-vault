import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { AuthField } from "@/components/auth/AuthField";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { useAdminRole } from "@/hooks/use-admin-role";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

interface LoginValues {
  email: string;
  password: string;
}

/** Admin sign-in: email/password session, then a server-side roster check before the hub opens. */
export default function AdminLogin() {
  const { user, isReady, signIn, signOut } = useAuth();
  const { isAdmin, isLoading } = useAdminRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/admin";
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  if (!isReady || (user && isLoading && !form.formState.isSubmitting)) return <AuthLoading />;
  if (user && isAdmin) return <Navigate to={from.startsWith("/admin") ? from : "/admin"} replace />;

  const onSubmit = async (values: LoginValues) => {
    setFormError(null);
    try {
      await signIn(values);
      const { data, error } = await supabase.rpc("my_admin_role");
      if (error) throw new Error("Couldn't verify admin access. Try again.");
      if (data !== "founder" && data !== "admin") {
        await signOut().catch(() => undefined);
        setFormError("This account doesn't have admin access.");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-role"] });
      navigate(from.startsWith("/admin") ? from : "/admin", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Sign-in failed. Try again.");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-vault-neon/[0.07] blur-3xl" />
      <div className="relative w-full max-w-[420px]">
        <Link to="/" className="text-link mb-6">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to the game
        </Link>
        <div className="neon-card p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg border border-vault-neon/50 bg-vault-neon/10">
              <ShieldCheck className="h-5 w-5 text-vault-neon" aria-hidden="true" />
            </span>
            <div>
              <p className="vault-kicker text-[10px]">Restricted</p>
              <h1 className="font-display text-[22px] font-medium leading-tight text-vault-ice">Admin sign-in</h1>
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-vault-ice/65">
            For the Vault's content team. Access is checked against the admin roster on every visit.
          </p>

          {user && !isAdmin && (
            <div className="mt-5 flex gap-2.5 rounded-lg border border-vault-danger/40 bg-vault-danger/[0.07] p-3 text-[13.5px] text-vault-ice/85" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-vault-danger" aria-hidden="true" />
              <span>
                You're signed in as <span className="font-medium text-vault-ice">{user.email}</span>, which isn't an admin. Sign in with an admin account below.
              </span>
            </div>
          )}

          <form className="mt-6 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <AuthField id="admin-email" label="Email" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register("email")} />
            <AuthField
              id="admin-password"
              label="Password"
              type="password"
              autoComplete="current-password"
              error={form.formState.errors.password?.message}
              {...form.register("password")}
            />
            {formError && (
              <p className="flex items-center gap-2 text-[13.5px] text-vault-danger" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {formError}
              </p>
            )}
            <button type="submit" disabled={form.formState.isSubmitting} className="neon-button mt-1 h-12">
              {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              Enter admin hub
            </button>
          </form>
          <p className="mt-5 text-center text-[12.5px] text-vault-muted">
            Forgot your password? Reset it from the <Link to="/auth" className="text-vault-neon hover:text-vault-neonhi">player sign-in</Link>.
          </p>
        </div>
      </div>
    </div>
  );
}
