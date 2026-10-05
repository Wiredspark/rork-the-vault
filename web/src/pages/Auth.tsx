import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, MailCheck, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

import { AuthField } from "@/components/auth/AuthField";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { BrandMark } from "@/components/shell/BrandMark";
import { IMAGES } from "@/data/assets";
import { getEpisodesForModule } from "@/lib/episode";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";

type Mode = "signin" | "signup" | "forgot" | "check-email" | "reset";

const emailSchema = z.string().trim().min(1, "Enter your email.").email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(72, "Keep it under 72 characters.");

const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.") });
const signUpSchema = z.object({
  displayName: z.string().trim().min(2, "At least 2 characters.").max(32, "Keep it under 32 characters."),
  email: emailSchema,
  password: passwordSchema,
});
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Passwords don't match.", path: ["confirm"] });

interface SignInValues {
  email: string;
  password: string;
}
interface SignUpValues {
  displayName: string;
  email: string;
  password: string;
}
interface ForgotValues {
  email: string;
}
interface ResetValues {
  password: string;
  confirm: string;
}

interface CheckEmailState {
  email: string;
  kind: "confirm" | "reset";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-vault-danger/40 bg-vault-danger/[0.08] px-4 py-3 text-sm text-vault-ice">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-vault-danger" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function SubmitButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="neon-button mt-2 h-12 w-full text-[15px]">
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
}

function SignInForm({ onForgot }: { onForgot: () => void }) {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn({ email: values.email.trim(), password: values.password });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormError message={formError} />
      <AuthField id="signin-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" error={formState.errors.email?.message} {...register("email")} />
      <div className="flex flex-col gap-2">
        <AuthField id="signin-password" label="Password" type="password" autoComplete="current-password" placeholder="••••••••" error={formState.errors.password?.message} {...register("password")} />
        <button type="button" onClick={onForgot} className="self-end text-[13px] font-medium text-vault-neon transition-colors hover:text-vault-neonhi">
          Forgot password?
        </button>
      </div>
      <SubmitButton busy={formState.isSubmitting}>
        Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}

function SignUpForm({ onCheckEmail }: { onCheckEmail: (email: string) => void }) {
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await signUp({ displayName: values.displayName.trim(), email: values.email.trim(), password: values.password });
      if (result.needsConfirmation) onCheckEmail(values.email.trim());
      else toast.success(`Welcome to the vault, ${values.displayName.trim()}.`);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormError message={formError} />
      <AuthField id="signup-name" label="Player name" autoComplete="nickname" placeholder="What should we call you?" error={formState.errors.displayName?.message} {...register("displayName")} />
      <AuthField id="signup-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" error={formState.errors.email?.message} {...register("email")} />
      <AuthField
        id="signup-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        hint="At least 8 characters."
        error={formState.errors.password?.message}
        {...register("password")}
      />
      <SubmitButton busy={formState.isSubmitting}>
        Create account <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </SubmitButton>
    </form>
  );
}

function ForgotForm({ onSent, onBack }: { onSent: (email: string) => void; onBack: () => void }) {
  const { requestPasswordReset } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) });

  const submit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await requestPasswordReset(email.trim());
      onSent(email.trim());
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <p className="text-[15px] leading-relaxed text-vault-ice/70">Enter your account email and we'll send you a link to set a new password.</p>
      <FormError message={formError} />
      <AuthField id="forgot-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" error={formState.errors.email?.message} {...register("email")} />
      <SubmitButton busy={formState.isSubmitting}>Send reset link</SubmitButton>
      <BackLink onClick={onBack} />
    </form>
  );
}

function ResetForm() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) });

  const submit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await updatePassword(password);
      toast.success("Password updated", { description: "You're signed in." });
      navigate("/", { replace: true });
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormError message={formError} />
      <AuthField id="reset-password" label="New password" type="password" autoComplete="new-password" placeholder="At least 8 characters" error={formState.errors.password?.message} {...register("password")} />
      <AuthField id="reset-confirm" label="Confirm password" type="password" autoComplete="new-password" placeholder="Type it again" error={formState.errors.confirm?.message} {...register("confirm")} />
      <SubmitButton busy={formState.isSubmitting}>Save new password</SubmitButton>
    </form>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center justify-center gap-2 text-sm font-medium text-vault-ice/70 transition-colors hover:text-vault-neon">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
    </button>
  );
}

function CheckEmail({ state, onBack }: { state: CheckEmailState; onBack: () => void }) {
  const { resendConfirmation, requestPasswordReset } = useAuth();
  const [busy, setBusy] = useState<boolean>(false);

  const resend = async () => {
    setBusy(true);
    try {
      if (state.kind === "confirm") await resendConfirmation(state.email);
      else await requestPasswordReset(state.email);
      toast.success("Email sent again");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-vault-neon/40 bg-vault-neon/[0.08] shadow-[0_0_40px_-8px_rgba(207,171,92,0.5)]">
        <MailCheck className="h-7 w-7 text-vault-neon" aria-hidden="true" />
      </span>
      <p className="text-[15px] leading-relaxed text-vault-ice/75">
        {state.kind === "confirm" ? "We sent a confirmation link to " : "We sent a password reset link to "}
        <span className="font-semibold text-vault-ice">{state.email}</span>.{" "}
        {state.kind === "confirm" ? "Open it to activate your account, then sign in." : "Open it on this device to choose a new password."}
      </p>
      <p className="text-[13px] text-vault-muted">Nothing there? Check spam, or resend below.</p>
      <button type="button" onClick={resend} disabled={busy} className="ghost-neon-button h-11 w-full">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "Resend email"}
      </button>
      <BackLink onClick={onBack} />
    </div>
  );
}

const HEADINGS: Record<Mode, { kicker: string; title: string }> = {
  signin: { kicker: "Welcome back", title: "Sign in" },
  signup: { kicker: "New player", title: "Create account" },
  forgot: { kicker: "Account recovery", title: "Reset password" },
  "check-email": { kicker: "One more step", title: "Check your inbox" },
  reset: { kicker: "Account recovery", title: "New password" },
};

/** Sign in, sign up, password reset and email-confirmation screens. */
export default function Auth() {
  const { user, isReady, isRecovery } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [checkEmail, setCheckEmail] = useState<CheckEmailState | null>(null);
  const episodeCount = getEpisodesForModule("rnb").length;

  if (!isReady) return <AuthLoading />;
  const activeMode: Mode = isRecovery ? "reset" : mode;
  if (user && !isRecovery) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/auth" ? from : "/"} replace />;
  }

  const heading = HEADINGS[activeMode];
  const showTabs = activeMode === "signin" || activeMode === "signup";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-vault-line lg:block">
        <img src={IMAGES.vaultDoor} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" aria-hidden="true" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,18,16,0.55)_0%,rgba(11,18,16,0.15)_40%,rgba(11,18,16,0.92)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
          <BrandMark />
          <div className="max-w-md animate-rise-in">
            <p className="vault-kicker">The R&B Vault · {episodeCount} episodes live</p>
            <h1 className="vault-display mt-4 text-[44px] font-semibold leading-[1.05] text-vault-ice xl:text-[52px]">
              Your runs.
              <br />
              <span className="text-vault-neon drop-shadow-[0_0_24px_rgba(207,171,92,0.45)]">Your vault.</span>
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-vault-ice/70">
              Sign in to keep every episode, streak and cracked code on your account. Pick up on any device where you left off.
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm text-vault-ice/60">
              <ShieldCheck className="h-4 w-4 text-vault-neon" aria-hidden="true" />
              Your progress is private. Only you can see your runs.
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <BrandMark />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <div key={activeMode} className="animate-rise-in">
            <p className="vault-kicker">{heading.kicker}</p>
            <h2 className="vault-display mt-3 text-[32px] font-semibold leading-tight text-vault-ice">{heading.title}</h2>
          </div>

          {showTabs && (
            <div role="tablist" aria-label="Account" className="mt-7 grid grid-cols-2 rounded-lg border border-vault-line bg-vault-panel p-1">
              {(["signin", "signup"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeMode === tab}
                  onClick={() => setMode(tab)}
                  className={cn(
                    "h-10 rounded-md font-mono text-[11px] font-medium uppercase tracking-[0.2em] transition-all",
                    activeMode === tab
                      ? "bg-vault-neon/[0.12] text-vault-neonhi shadow-[inset_0_0_0_1px_rgba(207,171,92,0.45)]"
                      : "text-vault-muted hover:text-vault-ice",
                  )}
                >
                  {tab === "signin" ? "Sign in" : "Sign up"}
                </button>
              ))}
            </div>
          )}

          <div className="neon-card mt-6 p-6 sm:p-7">
            {activeMode === "signin" && <SignInForm onForgot={() => setMode("forgot")} />}
            {activeMode === "signup" && (
              <SignUpForm
                onCheckEmail={(email) => {
                  setCheckEmail({ email, kind: "confirm" });
                  setMode("check-email");
                }}
              />
            )}
            {activeMode === "forgot" && (
              <ForgotForm
                onBack={() => setMode("signin")}
                onSent={(email) => {
                  setCheckEmail({ email, kind: "reset" });
                  setMode("check-email");
                }}
              />
            )}
            {activeMode === "check-email" && checkEmail && <CheckEmail state={checkEmail} onBack={() => setMode("signin")} />}
            {activeMode === "reset" && <ResetForm />}
          </div>

          {showTabs && (
            <p className="mt-6 text-center text-sm text-vault-muted">
              {activeMode === "signin" ? "New to The Vault? " : "Already have an account? "}
              <button
                type="button"
                onClick={() => setMode(activeMode === "signin" ? "signup" : "signin")}
                className="font-semibold text-vault-neon transition-colors hover:text-vault-neonhi"
              >
                {activeMode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
