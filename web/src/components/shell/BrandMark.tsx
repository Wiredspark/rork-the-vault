import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link to="/" className="flex items-center rounded-md" aria-label="The Vault — dashboard">
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-semibold uppercase tracking-[0.32em] text-vault-neon">The</span>
        <span className="font-display text-[34px] font-medium leading-[0.95] text-vault-neon">VAULT</span>
        <span className="mt-1 text-[8.5px] font-semibold uppercase tracking-[0.2em] text-vault-ice/70">
          Music trivia lives here
        </span>
      </span>
    </Link>
  );
}
