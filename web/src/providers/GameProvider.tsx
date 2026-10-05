import createContextHook from "@nkzw/create-context-hook";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { SoundName } from "@/data/assets";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/providers/AuthProvider";
import { DEFAULT_EPISODE_ID, getEpisode, type Episode } from "@/lib/episode";
import {
  advance,
  answerQuestion,
  applyFiftyFifty,
  applyShield,
  applySwap,
  buildDemoState,
  continueAfterRound,
  createInitialState,
  currentQuestion,
  currentSlot,
  knownDigitIndexes,
  missingDigitIndexes,
  pickReserve,
  runStatus,
  startRound,
  submitVaultCode,
  totalPayout,
  type GameState,
} from "@/lib/gameEngine";
import { multiplierForStreak } from "@/lib/scoring";
import { playSound, preloadSounds } from "@/lib/sound";

interface PersistedData {
  activeEpisodeId: string;
  runs: Record<string, GameState>;
  /** Epoch ms of each run's last local change; used to reconcile with the cloud copy. */
  runUpdatedAt: Record<string, number>;
  soundOn: boolean;
  /** Device-only preference: move to the next question automatically after feedback. */
  autoAdvance: boolean;
}

interface CloudProgress {
  runs: Record<string, { state: GameState; updatedAt: number }>;
  prefs: { soundOn: boolean; activeEpisodeId: string | null } | null;
}

export type SyncStatus = "syncing" | "synced" | "error";

// Device cache is scoped per account so two players on one browser never see each other's runs.
const STORAGE_PREFIX = "the-vault:v3:";
// Pre-auth guest progress; imported once into the first account that signs in on this device.
const LEGACY_STORAGE_KEY = "the-vault:v2";
const SYNC_DEBOUNCE_MS = 900;
const SYNC_RETRY_MS = 15000;
// Safety net on top of the debounce: re-push dirty state periodically and when
// the tab hides/unloads so a refresh mid-round never loses digit progress.
const AUTOSAVE_INTERVAL_MS = 15000;

function isValidRun(run: unknown, episodeId: string): run is GameState {
  const candidate = run as Partial<GameState> | null;
  return Boolean(candidate && candidate.version === 1 && candidate.episodeId === episodeId && getEpisode(episodeId));
}

function parsePersisted(raw: string | null): PersistedData | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<PersistedData>;
  const runs: Record<string, GameState> = {};
  const runUpdatedAt: Record<string, number> = {};
  Object.entries(parsed.runs ?? {}).forEach(([id, run]) => {
    if (!isValidRun(run, id)) return;
    runs[id] = run;
    runUpdatedAt[id] = parsed.runUpdatedAt?.[id] ?? 0;
  });
  return {
    activeEpisodeId: parsed.activeEpisodeId && getEpisode(parsed.activeEpisodeId) ? parsed.activeEpisodeId : DEFAULT_EPISODE_ID,
    runs,
    runUpdatedAt,
    soundOn: parsed.soundOn ?? true,
    autoAdvance: parsed.autoAdvance ?? true,
  };
}

function loadPersisted(userId: string): PersistedData {
  const fallback: PersistedData = { activeEpisodeId: DEFAULT_EPISODE_ID, runs: {}, runUpdatedAt: {}, soundOn: true, autoAdvance: true };
  try {
    const own = parsePersisted(window.localStorage.getItem(STORAGE_PREFIX + userId));
    if (own) return own;
    const legacy = parsePersisted(window.localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy) {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      return legacy;
    }
    return fallback;
  } catch {
    console.warn("[vault] Could not read saved progress; starting fresh.");
    return fallback;
  }
}

async function fetchCloudProgress(userId: string): Promise<CloudProgress> {
  const [runsResult, profileResult] = await Promise.all([
    supabase.from("game_runs").select("episode_id, state, updated_at"),
    supabase.from("profiles").select("sound_on, active_episode_id").eq("id", userId).maybeSingle(),
  ]);
  if (runsResult.error) throw runsResult.error;
  if (profileResult.error) throw profileResult.error;

  const runs: CloudProgress["runs"] = {};
  runsResult.data.forEach((row) => {
    if (isValidRun(row.state, row.episode_id)) {
      runs[row.episode_id] = { state: row.state, updatedAt: Date.parse(row.updated_at) || 0 };
    }
  });
  const profile = profileResult.data;
  return {
    runs,
    prefs: profile ? { soundOn: profile.sound_on, activeEpisodeId: profile.active_episode_id } : null,
  };
}

interface SyncPayload {
  runIds: string[];
  prefs: boolean;
  snapshot: PersistedData;
}

/** Shared game state for the signed-in player's runs: cached on-device, synced to their account. */
export const [GameProvider, useGame] = createContextHook(() => {
  const { user } = useAuth();
  const userId = user?.id ?? "guest";
  const [data, setData] = useState<PersistedData>(() => loadPersisted(userId));
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [dirtyRuns, setDirtyRuns] = useState<string[]>([]);
  const [prefsDirty, setPrefsDirty] = useState<boolean>(false);
  const [syncFailed, setSyncFailed] = useState<boolean>(false);
  const errorToastShown = useRef<boolean>(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — the cloud copy still holds progress.
    }
  }, [data, userId]);

  const cloudQuery = useQuery({
    queryKey: ["cloud-progress", userId],
    queryFn: () => fetchCloudProgress(userId),
    enabled: Boolean(user),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // Merge once: newest copy of each run wins; device-only or newer local runs get uploaded.
  useEffect(() => {
    const cloud = cloudQuery.data;
    if (!cloud || hydrated) return;
    const runs = { ...data.runs };
    const runUpdatedAt = { ...data.runUpdatedAt };
    const upload: string[] = [];
    Object.entries(cloud.runs).forEach(([id, remote]) => {
      if (!runs[id] || remote.updatedAt >= (runUpdatedAt[id] ?? 0)) {
        runs[id] = remote.state;
        runUpdatedAt[id] = remote.updatedAt;
      }
    });
    Object.keys(runs).forEach((id) => {
      if (!cloud.runs[id] || (runUpdatedAt[id] ?? 0) > cloud.runs[id].updatedAt) upload.push(id);
    });
    const remoteEpisode = cloud.prefs?.activeEpisodeId;
    setData({
      autoAdvance: data.autoAdvance,
      runs,
      runUpdatedAt,
      soundOn: cloud.prefs?.soundOn ?? data.soundOn,
      activeEpisodeId: remoteEpisode && getEpisode(remoteEpisode) ? remoteEpisode : data.activeEpisodeId,
    });
    setDirtyRuns(upload);
    setPrefsDirty(!cloud.prefs?.activeEpisodeId);
    setHydrated(true);
  }, [cloudQuery.data, data, hydrated]);

  useEffect(() => {
    if (!cloudQuery.isError || errorToastShown.current) return;
    errorToastShown.current = true;
    setSyncFailed(true);
    toast.error("Couldn't load your saved progress", { description: "Playing from this device for now. Refresh to retry." });
  }, [cloudQuery.isError]);

  const syncMutation = useMutation({
    mutationFn: async ({ runIds, prefs, snapshot }: SyncPayload) => {
      const rows = runIds.flatMap((id) => {
        const run = snapshot.runs[id];
        const ep = getEpisode(id);
        if (!run || !ep) return [];
        return [
          {
            user_id: userId,
            episode_id: id,
            state: run as unknown as Json,
            status: runStatus(run),
            total_vc: totalPayout(run, ep),
          },
        ];
      });
      if (rows.length) {
        const { error } = await supabase.from("game_runs").upsert(rows, { onConflict: "user_id,episode_id" });
        if (error) throw error;
      }
      if (prefs) {
        const { error } = await supabase
          .from("profiles")
          .upsert({ id: userId, email: user?.email ?? null, sound_on: snapshot.soundOn, active_episode_id: snapshot.activeEpisodeId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setSyncFailed(false);
      errorToastShown.current = false;
    },
    onError: (error, vars) => {
      console.warn("[vault] Progress sync failed:", (error as { code?: string }).code ?? "unknown");
      setSyncFailed(true);
      if (!errorToastShown.current) {
        errorToastShown.current = true;
        toast.error("Couldn't save progress to your account", { description: "It's safe on this device. We'll keep retrying." });
      }
      window.setTimeout(() => {
        setDirtyRuns((prev) => Array.from(new Set([...prev, ...vars.runIds])));
        if (vars.prefs) setPrefsDirty(true);
      }, SYNC_RETRY_MS);
    },
  });
  const { mutate: pushSync, isPending: isSyncing } = syncMutation;

  // Immediate flush of whatever is dirty right now (used by the autosave timer
  // and by visibility/pagehide so progress survives a refresh). One in-flight
  // request at a time is already enforced by the shared mutation.
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    flushRef.current = () => {
      if (!hydrated || !user || isSyncing) return;
      if (dirtyRuns.length === 0 && !prefsDirty) return;
      const runIds = dirtyRuns;
      const prefs = prefsDirty;
      const snapshot = data;
      setDirtyRuns((prev) => prev.filter((id) => !runIds.includes(id)));
      setPrefsDirty(false);
      pushSync({ runIds, prefs, snapshot });
    };
  });

  useEffect(() => {
    const flush = () => flushRef.current();
    const interval = window.setInterval(flush, AUTOSAVE_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // Debounced push of changed runs/prefs; one request in flight at a time keeps writes ordered.
  useEffect(() => {
    if (!hydrated || !user || isSyncing || (dirtyRuns.length === 0 && !prefsDirty)) return;
    const timer = window.setTimeout(() => {
      const runIds = dirtyRuns;
      setDirtyRuns((prev) => prev.filter((id) => !runIds.includes(id)));
      setPrefsDirty(false);
      pushSync({ runIds, prefs: prefsDirty, snapshot: data });
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [data, dirtyRuns, hydrated, isSyncing, prefsDirty, pushSync, user]);

  const syncStatus: SyncStatus = syncFailed
    ? "error"
    : !hydrated || isSyncing || dirtyRuns.length > 0 || prefsDirty
      ? "syncing"
      : "synced";

  useEffect(() => {
    preloadSounds();
  }, []);

  const episode: Episode = getEpisode(data.activeEpisodeId) ?? (getEpisode(DEFAULT_EPISODE_ID) as Episode);
  const state: GameState = data.runs[episode.id] ?? createInitialState(episode.id);

  const sfx = useCallback(
    (name: SoundName) => {
      if (data.soundOn) playSound(name);
    },
    [data.soundOn],
  );

  const setRun = useCallback((next: GameState) => {
    setData((prev) => ({
      ...prev,
      runs: { ...prev.runs, [next.episodeId]: next },
      runUpdatedAt: { ...prev.runUpdatedAt, [next.episodeId]: Date.now() },
    }));
    setDirtyRuns((prev) => (prev.includes(next.episodeId) ? prev : [...prev, next.episodeId]));
  }, []);

  const commit = useCallback(
    (next: GameState) => {
      if (next !== state) setRun(next);
      return next;
    },
    [setRun, state],
  );

  const answer = useCallback(
    (choiceIndex: number | null, timedOut = false) => {
      const next = commit(answerQuestion(state, episode, choiceIndex, timedOut));
      if (next === state) return;
      const record = next.answers[next.answers.length - 1];
      if (record.correct && record.type === "bonus") sfx("click");
      else sfx(record.correct ? "correct" : "wrong");
    },
    [commit, episode, sfx, state],
  );

  const submitCode = useCallback(
    (code: string[]) => {
      const next = commit(submitVaultCode(state, episode, code));
      if (next.vaultOutcome === "cracked") sfx("unlock");
      else sfx("wrong");
      return next;
    },
    [commit, episode, sfx, state],
  );

  const actions = useMemo(
    () => ({
      startRound: () => commit(startRound(state)),
      answer,
      next: () => commit(advance(state, episode)),
      continueAfterRound: () => commit(continueAfterRound(state, episode)),
      activateFiftyFifty: () => commit(applyFiftyFifty(state, episode, Math.random)),
      activateShield: () => commit(applyShield(state, episode)),
      activateSwap: () => commit(applySwap(state, episode)),
      submitCode,
      resetRun: () => setRun(createInitialState(episode.id)),
      loadDemo: () => setRun(buildDemoState(episode)),
      selectEpisode: (id: string) => {
        if (!getEpisode(id)) return;
        setData((prev) => ({ ...prev, activeEpisodeId: id }));
        setPrefsDirty(true);
      },
      toggleSound: () => {
        setData((prev) => ({ ...prev, soundOn: !prev.soundOn }));
        setPrefsDirty(true);
      },
      toggleAutoAdvance: () => setData((prev) => ({ ...prev, autoAdvance: !prev.autoAdvance })),
    }),
    [answer, commit, episode, setRun, state, submitCode],
  );

  const derived = useMemo(() => {
    const slot = currentSlot(state, episode);
    const question = currentQuestion(state, episode);
    return {
      slot,
      question,
      status: runStatus(state),
      total: totalPayout(state, episode),
      multiplier: multiplierForStreak(state.streak),
      knownDigits: knownDigitIndexes(state, episode),
      missingDigits: missingDigitIndexes(state, episode),
      canSwap: Boolean(pickReserve(state, episode)),
    };
  }, [episode, state]);

  return {
    episode,
    state,
    runs: data.runs,
    runUpdatedAt: data.runUpdatedAt,
    soundOn: data.soundOn,
    autoAdvance: data.autoAdvance,
    syncStatus,
    sfx,
    ...derived,
    ...actions,
  };
});
