import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Lock, ShieldCheck, UserMinus, UserPlus, UsersRound, Wand2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Field, INPUT, Panel } from "@/components/admin/fields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminRole } from "@/hooks/use-admin-role";
import { adminErrorMessage, createAdminAccount, fetchRoster, formatWhen, promoteAdmin, revokeAdmin, type RosterEntry } from "@/lib/admin/api";
import { cn } from "@/lib/utils";
import { initialsFor, useAuth } from "@/providers/AuthProvider";

type FormMode = "promote" | "create";

const promoteSchema = z.object({ email: z.string().trim().min(1, "Enter an email.").email("Enter a valid email address.") });
const createSchema = z.object({
  displayName: z.string().trim().min(2, "At least 2 characters.").max(40, "Keep it under 40 characters."),
  email: z.string().trim().min(1, "Enter an email.").email("Enter a valid email address."),
  password: z.string().min(10, "Use at least 10 characters.").max(72, "Keep it under 72 characters."),
});

interface PromoteValues {
  email: string;
}
interface CreateValues {
  displayName: string;
  email: string;
  password: string;
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function RosterRow({ entry, isMe, canRevoke, onRevoke }: { entry: RosterEntry; isMe: boolean; canRevoke: boolean; onRevoke: () => void }) {
  const founder = entry.role === "founder";
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-3">
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-[12px]",
          founder ? "border-vault-neon/70 bg-vault-neon/15 text-vault-neonhi" : "border-vault-line text-vault-ice/80",
        )}
        aria-hidden="true"
      >
        {initialsFor(entry.displayName || entry.email)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-medium text-vault-ice">{entry.displayName}</span>
          {isMe && <span className="rounded-sm bg-vault-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-vault-neon">You</span>}
        </span>
        <span className="block truncate text-[12.5px] text-vault-muted">{entry.email}</span>
        <span className="block font-mono text-[10.5px] text-vault-muted/80 tabular">
          {founder ? "Founding admin" : `Added ${formatWhen(entry.createdAt)}${entry.grantedByName ? ` by ${entry.grantedByName}` : ""}`}
        </span>
      </span>
      <span
        className={cn(
          "hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] sm:inline-flex",
          founder ? "border-vault-neon/50 bg-vault-neon/10 text-vault-neonhi" : "border-vault-line text-vault-ice/70",
        )}
      >
        {founder ? <Crown className="h-3 w-3" aria-hidden="true" /> : <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
        {founder ? "Founder" : "Admin"}
      </span>
      {canRevoke && !founder && !isMe && (
        <button
          type="button"
          onClick={onRevoke}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-vault-muted transition-colors hover:bg-vault-danger/10 hover:text-vault-danger"
          aria-label={`Remove admin access for ${entry.displayName}`}
        >
          <UserMinus className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function PromoteForm() {
  const queryClient = useQueryClient();
  const form = useForm<PromoteValues>({ resolver: zodResolver(promoteSchema), defaultValues: { email: "" } });
  const mutation = useMutation({
    mutationFn: (v: PromoteValues) => promoteAdmin(v.email.trim()),
    onSuccess: (_d, v) => {
      toast.success(`${v.email} is now an admin`);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["admin-roster"] });
    },
    onError: (error) => form.setError("email", { message: adminErrorMessage(error, "Couldn't promote that account.") }),
  });
  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-vault-ice/65">Give admin access to someone who already plays The Vault. Enter the email they signed up with.</p>
      <Field label="Player email" htmlFor="promote-email">
        <input id="promote-email" type="email" autoComplete="off" className={cn(INPUT, form.formState.errors.email && "border-vault-danger/70")} {...form.register("email")} />
      </Field>
      {form.formState.errors.email && (
        <p className="text-[13px] text-vault-danger" role="alert">
          {form.formState.errors.email.message}
        </p>
      )}
      <button type="submit" disabled={mutation.isPending} className="neon-button mt-1 h-11">
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        Promote to admin
      </button>
    </form>
  );
}

function CreateForm() {
  const queryClient = useQueryClient();
  const form = useForm<CreateValues>({ resolver: zodResolver(createSchema), defaultValues: { displayName: "", email: "", password: "" } });
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null);
  const mutation = useMutation({
    mutationFn: (v: CreateValues) => createAdminAccount({ email: v.email.trim(), password: v.password, displayName: v.displayName.trim() }),
    onSuccess: (_d, v) => {
      toast.success(`Admin account created for ${v.email}`);
      setLastCreated({ email: v.email.trim(), password: v.password });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["admin-roster"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't create the account."),
  });
  const err = form.formState.errors;
  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-vault-ice/65">
        Create a brand-new, pre-confirmed account with admin access. Share the temporary password privately. They can change it by resetting their password from the sign-in screen.
      </p>
      <Field label="Display name" htmlFor="create-name">
        <input id="create-name" className={cn(INPUT, err.displayName && "border-vault-danger/70")} autoComplete="off" {...form.register("displayName")} />
      </Field>
      {err.displayName && <p className="text-[13px] text-vault-danger">{err.displayName.message}</p>}
      <Field label="Email" htmlFor="create-email">
        <input id="create-email" type="email" className={cn(INPUT, err.email && "border-vault-danger/70")} autoComplete="off" {...form.register("email")} />
      </Field>
      {err.email && <p className="text-[13px] text-vault-danger">{err.email.message}</p>}
      <Field label="Temporary password" htmlFor="create-password">
        <div className="flex gap-2">
          <input id="create-password" type="text" className={cn(INPUT, "font-mono", err.password && "border-vault-danger/70")} autoComplete="new-password" {...form.register("password")} />
          <button
            type="button"
            onClick={() => form.setValue("password", generatePassword(), { shouldValidate: true })}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-vault-line px-3 text-[13px] text-vault-ice/80 transition-colors hover:border-vault-neon/40 hover:text-vault-neon"
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            Generate
          </button>
        </div>
      </Field>
      {err.password && <p className="text-[13px] text-vault-danger">{err.password.message}</p>}
      <button type="submit" disabled={mutation.isPending} className="neon-button mt-1 h-11">
        {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
        Create admin account
      </button>
      {lastCreated && (
        <div className="rounded-lg border border-vault-success/40 bg-vault-success/[0.06] p-3 text-[13px]" role="status">
          <p className="text-vault-success">Account ready. Share these details privately:</p>
          <p className="mt-1.5 break-all font-mono text-[12px] text-vault-ice/90">{lastCreated.email}</p>
          <p className="break-all font-mono text-[12px] text-vault-ice/90">{lastCreated.password}</p>
          <button
            type="button"
            className="mt-2 text-link text-[12.5px]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${lastCreated.email}\n${lastCreated.password}`);
                toast.success("Copied");
              } catch {
                toast.error("Couldn't copy");
              }
            }}
          >
            Copy credentials
          </button>
        </div>
      )}
    </form>
  );
}

/** Admin roster with founder-only promote / create / revoke controls. */
export default function AdminRoles() {
  const { user } = useAuth();
  const { isFounder } = useAdminRole();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<FormMode>("promote");
  const [revoking, setRevoking] = useState<RosterEntry | null>(null);
  const roster = useQuery({ queryKey: ["admin-roster"], queryFn: fetchRoster, staleTime: 15_000 });

  const revokeMutation = useMutation({
    mutationFn: (entry: RosterEntry) => revokeAdmin(entry.userId),
    onSuccess: (_d, entry) => {
      toast.success(`${entry.displayName} is no longer an admin`);
      queryClient.invalidateQueries({ queryKey: ["admin-roster"] });
    },
    onError: (error) => toast.error(adminErrorMessage(error, "Couldn't remove admin access.")),
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="vault-kicker text-[10.5px]">Access</p>
        <h1 className="mt-1.5 font-display text-[34px] font-medium leading-none text-vault-ice sm:text-[42px]">Admins</h1>
        <p className="mt-2 text-[15px] text-vault-ice/65">Who can edit and release episodes. Only the founding admin can grant or remove access.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel title="Admin roster" icon={UsersRound} id="roster-title" action={roster.data && <span className="font-mono text-[11px] text-vault-muted tabular">{roster.data.length} total</span>}>
          {roster.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-vault-muted" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span className="vault-kicker text-[11px]">Loading roster</span>
            </div>
          ) : roster.isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
              <p className="text-vault-ice/80">{adminErrorMessage(roster.error, "Couldn't load the roster.")}</p>
              <button type="button" className="ghost-neon-button h-10" onClick={() => roster.refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <ul className="-mx-3 flex flex-col divide-y divide-vault-line/70">
              {roster.data.map((entry) => (
                <RosterRow key={entry.userId} entry={entry} isMe={entry.userId === user?.id} canRevoke={isFounder} onRevoke={() => setRevoking(entry)} />
              ))}
            </ul>
          )}
        </Panel>

        {isFounder ? (
          <Panel title="Add an admin" icon={UserPlus} id="add-title">
            <div role="tablist" aria-label="How to add" className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-vault-line bg-vault-ink/60 p-1">
              {(
                [
                  { id: "promote", label: "Promote existing" },
                  { id: "create", label: "Create account" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === t.id}
                  onClick={() => setMode(t.id)}
                  className={cn(
                    "h-9 rounded-md text-[13px] font-medium transition-colors",
                    mode === t.id ? "bg-vault-neon/15 text-vault-neonhi shadow-[inset_0_0_0_1px_rgba(207,171,92,0.45)]" : "text-vault-ice/60 hover:text-vault-ice",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {mode === "promote" ? <PromoteForm /> : <CreateForm />}
          </Panel>
        ) : (
          <Panel title="Add an admin" icon={Lock} id="add-title">
            <p className="text-[14px] leading-relaxed text-vault-ice/70">
              Only the founding admin can grant or remove access. Ask them to promote anyone who needs to edit episodes.
            </p>
          </Panel>
        )}
      </div>

      <AlertDialog open={Boolean(revoking)} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent className="border-vault-danger/30 bg-vault-panel text-vault-ice">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove {revoking?.displayName}?</AlertDialogTitle>
            <AlertDialogDescription className="text-vault-ice/70">
              They keep their player account and progress but lose access to the admin hub immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-vault-line bg-transparent text-vault-ice hover:bg-white/5 hover:text-vault-ice">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-vault-danger text-vault-ink hover:bg-vault-danger/90"
              onClick={() => {
                if (revoking) revokeMutation.mutate(revoking);
                setRevoking(null);
              }}
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
