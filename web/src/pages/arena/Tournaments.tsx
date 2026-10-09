import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CloudAlert, Crown, KeyRound, Loader2, Swords, Trophy } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { EntryChips, formatWhen, PhaseCountdown, PrizeStack, StatusPill } from "@/components/tournaments/TournamentBits";
import { fetchTournaments } from "@/lib/arena/api";
import type { TournamentSummary } from "@/lib/arena/protocol";
import { cn } from "@/lib/utils";

const LIVE = new Set(["qualifying", "locking", "checkin", "final"]);

function myBadge(t: TournamentSummary): string | null {
  const me = t.me;
  if (!me) return null;
  if (me.placement) return `You placed ${me.placement === 1 ? "1st" : `#${me.placement}`}`;
  if (me.finalist) return "You're a finalist";
  if (me.registered && me.rank) return `You're #${me.rank}`;
  if (me.registered) return "Registered";
  return null;
}

function TournamentCard({ t, featured }: { t: TournamentSummary; featured?: boolean }) {
  const badge = myBadge(t);
  return (
    <Link
      to={`/arena/tournaments/${t.id}`}
      className={cn(
        "group relative flex flex-col gap-5 overflow-hidden rounded-[10px] border p-5 transition-all duration-200 hover:-translate-y-0.5 sm:p-6",
        featured ? "neon-frame bg-vault-panel" : "border-vault-line bg-[linear-gradient(180deg,#141D19,#0F1613)] hover:border-vault-neon/45",
      )}
    >
      {featured && <span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-vault-neon/[0.08] blur-3xl" />}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={t.status} paused={t.paused} />
            {badge && <span className="rounded-full bg-vault-neon/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-vault-neonhi">{badge}</span>}
          </div>
          <h3 className={cn("mt-3 font-display font-medium leading-tight text-vault-ice", featured ? "text-[30px] sm:text-[38px]" : "text-[22px]")}>{t.config.name}</h3>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-vault-muted">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            Final {formatWhen(t.config.finalsAt)} · {t.entrants} {t.entrants === 1 ? "entrant" : "entrants"}
          </p>
        </div>
        <PhaseCountdown t={t} size={featured ? "lg" : "md"} className="items-end text-right" />
      </div>
      {t.status === "completed" && t.championName && (
        <p className="relative inline-flex w-fit items-center gap-2 rounded-lg border border-vault-neon/40 bg-vault-neon/[0.07] px-3 py-2 text-[14px] text-vault-ice">
          <Crown className="h-4 w-4 text-vault-neonhi" aria-hidden="true" /> Champion: <span className="font-semibold text-vault-neonhi">{t.championName}</span>
        </p>
      )}
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <PrizeStack t={t} compact={!featured} />
        <div className="flex flex-col items-end gap-3">
          <EntryChips t={t} className="justify-end" />
          <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-vault-neon transition-colors group-hover:text-vault-neonhi">
            {t.status === "final" ? "Watch the final" : t.me?.registered || t.status === "completed" ? "Open" : "View & enter"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** Tournaments hub: live and upcoming events up top, history below, invite code entry. */
export default function Tournaments() {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<string>("");
  const query = useQuery({ queryKey: ["tournaments"], queryFn: fetchTournaments, refetchInterval: 15_000 });

  const { live, upcoming, past } = useMemo(() => {
    const all = query.data ?? [];
    return {
      live: all.filter((t) => LIVE.has(t.status)).sort((a, b) => a.config.finalsAt - b.config.finalsAt),
      upcoming: all.filter((t) => t.status === "scheduled").sort((a, b) => a.config.qualStart - b.config.qualStart),
      past: all.filter((t) => t.status === "completed" || t.status === "cancelled").sort((a, b) => b.config.finalsAt - a.config.finalsAt),
    };
  }, [query.data]);

  const onInvite = (e: FormEvent) => {
    e.preventDefault();
    const link = invite.match(/tournaments\/(t-[a-z0-9]{8})(?:\?invite=([A-Z0-9]+))?/i);
    if (link) navigate(`/arena/tournaments/${link[1].toLowerCase()}${link[2] ? `?invite=${link[2].toUpperCase()}` : ""}`);
  };

  const featured = live[0] ?? upcoming[0] ?? null;
  const rest = [...live, ...upcoming].filter((t) => t !== featured);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[14px]">
            <Link to="/arena" className="font-medium text-vault-neon hover:text-vault-neonhi">
              Arena
            </Link>
            <span className="text-vault-muted">/</span>
            <span className="text-vault-ice/70" aria-current="page">
              Tournaments
            </span>
          </nav>
          <h1 className="mt-2 font-display text-[44px] font-medium leading-none text-vault-ice sm:text-[60px]">Tournaments</h1>
          <p className="mt-3 max-w-xl text-lg text-vault-ice/75">Post your best qualifier score. The top 8 meet in a live elimination final, and the survivors race to crack the vault.</p>
        </div>
        <form onSubmit={onInvite} className="flex w-full max-w-sm gap-2 sm:w-auto">
          <label htmlFor="invite-link" className="sr-only">
            Invite link
          </label>
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-vault-muted" aria-hidden="true" />
            <input
              id="invite-link"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="Paste an invite link"
              className="h-12 w-full rounded-md border border-vault-line bg-vault-ink/60 pl-9 pr-3 text-[14px] text-vault-ice placeholder:text-vault-muted focus:border-vault-neon/60 focus:outline-none"
            />
          </div>
          <button type="submit" className="ghost-neon-button h-12 px-4" disabled={!/tournaments\/t-/i.test(invite)}>
            Open
          </button>
        </form>
      </header>

      {query.isPending ? (
        <div className="flex items-center justify-center gap-2 py-24 text-vault-muted" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-vault-neon" aria-hidden="true" /> Loading tournaments…
        </div>
      ) : query.isError ? (
        <div className="neon-card flex flex-col items-center gap-2 p-8 text-center" role="alert">
          <CloudAlert className="h-7 w-7 text-vault-danger" aria-hidden="true" />
          <p className="text-vault-ice/80">{query.error.message}</p>
          <button type="button" onClick={() => query.refetch()} className="neon-button mt-2 h-11">
            Retry
          </button>
        </div>
      ) : !featured && past.length === 0 ? (
        <div className="neon-frame flex flex-col items-center gap-3 bg-vault-panel px-6 py-16 text-center">
          <Trophy className="h-10 w-10 text-vault-neon" aria-hidden="true" />
          <h2 className="font-display text-[26px] text-vault-ice">No tournaments scheduled yet</h2>
          <p className="max-w-md text-[15px] text-vault-ice/65">Events are announced here. In the meantime, sharpen up in the live Arena. Your rating comes with you.</p>
          <Link to="/arena" className="neon-button mt-2 h-12">
            <Swords className="h-4 w-4" aria-hidden="true" /> Play the Arena
          </Link>
        </div>
      ) : (
        <>
          {featured && <TournamentCard t={featured} featured />}
          {rest.length > 0 && (
            <section aria-labelledby="more-title">
              <h2 id="more-title" className="eyebrow-muted pb-3">
                Live & upcoming
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {rest.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}
          {past.length > 0 && (
            <section aria-labelledby="past-title">
              <h2 id="past-title" className="eyebrow-muted pb-3">
                History
              </h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {past.map((t) => (
                  <TournamentCard key={t.id} t={t} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
