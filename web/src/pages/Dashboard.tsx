import { ArrowRight, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

import { EpisodePicker } from "@/components/vault/EpisodePicker";
import { IMAGES } from "@/data/assets";
import { ACTIVE_MODULE } from "@/data/modules";
import { useGame } from "@/providers/GameProvider";
import { useShellUI } from "@/providers/ShellUIProvider";

function Hero() {
  const { episode, status, state } = useGame();
  const { openLeaderboard } = useShellUI();
  const cta =
    status === "fresh"
      ? { to: "/play", label: "Enter the Vault" }
      : status === "playing"
        ? { to: "/play", label: `Continue Round ${state.roundIndex + 1}` }
        : status === "vault"
          ? { to: "/vault", label: "Open the Vault Chamber" }
          : { to: "/results", label: "View your results" };

  return (
    <section className="neon-frame animate-rise-in overflow-hidden bg-vault-ink" aria-labelledby="hero-title">
      <img
        src={IMAGES.vaultDoor}
        alt=""
        className="absolute inset-y-0 right-0 h-full w-full object-cover object-[70%_50%] opacity-60 sm:w-[78%] sm:opacity-100"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#0B1210_0%,#0B1210_30%,rgba(11,18,16,0.75)_52%,rgba(11,18,16,0.05)_80%)]" />
      <div className="relative flex min-h-[calc(100vh-220px)] items-stretch sm:min-h-[460px]">
        <div className="flex flex-1 flex-col justify-center px-6 py-8 sm:px-9">
          <div className="flex items-center gap-3">
            <span className="eyebrow">{episode.id}</span>
            <span className="h-px w-8 bg-vault-neon/70" />
            <span className="truncate text-xs text-vault-ice/60">{episode.title}</span>
          </div>
          <h1 id="hero-title" className="mt-3 font-display text-[44px] font-medium leading-[0.95] text-vault-ice sm:text-[64px] xl:text-[76px]">
            {ACTIVE_MODULE.name}
          </h1>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link to={cta.to} className="neon-button h-14 text-lg">
              {cta.label}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => openLeaderboard("standings")}
              className="ghost-neon-button h-14"
              aria-haspopup="dialog"
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
              Leaderboard
            </button>
            {episode.status === "draft" && (
              <span className="rounded-full border border-vault-ice/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-vault-ice/70">
                Draft episode
              </span>
            )}
          </div>
          <EpisodePicker className="mt-5" />
        </div>
      </div>
    </section>
  );
}

/** Core dashboard: the featured episode. Run progress lives in the HUD's journey track. */
export default function Dashboard() {
  return <Hero />;
}
