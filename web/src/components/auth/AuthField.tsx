import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils";

interface AuthFieldProps extends ComponentPropsWithRef<"input"> {
  label: string;
  error?: string;
  hint?: string;
}

/** Labelled input for the auth screens with inline error and an optional password reveal toggle. */
export function AuthField({ label, error, hint, id, type = "text", className, ...props }: AuthFieldProps) {
  const [revealed, setRevealed] = useState<boolean>(false);
  const isPassword = type === "password";
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="hud-label text-vault-ice/70">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && revealed ? "text" : type}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            "h-12 w-full rounded-md border bg-vault-panel px-4 text-[15px] text-vault-ice placeholder:text-vault-muted/60 transition-colors focus:outline-none focus-visible:outline-none",
            "focus:border-vault-neon/70 focus:shadow-[0_0_0_3px_rgba(207,171,92,0.12)]",
            error ? "border-vault-danger/70" : "border-vault-line hover:border-vault-neon/30",
            isPassword && "pr-12",
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-vault-muted transition-colors hover:text-vault-neon"
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-vault-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-vault-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
