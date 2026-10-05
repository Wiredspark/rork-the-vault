import { VaultDial } from "@/components/vault/VaultDial";

/** Full-screen placeholder while the stored session is restored. */
export function AuthLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5" role="status" aria-live="polite">
      <VaultDial className="h-20 w-20 animate-dial-spin [animation-iteration-count:infinite]" />
      <p className="vault-kicker">Opening the vault</p>
    </div>
  );
}
