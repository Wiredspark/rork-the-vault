import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";

import { AuthLoading } from "@/components/auth/AuthLoading";
import { supabase } from "@/integrations/supabase/client";
import { registerRemoteEpisodes, type RawEpisode } from "@/lib/episode";

async function fetchReleasedEpisodes(): Promise<RawEpisode[]> {
  const { data, error } = await supabase
    .from("episodes")
    .select("id, content")
    .neq("status", "draft")
    .lte("publish_at", new Date().toISOString());
  if (error) throw error;
  const raws = (data ?? []).map((row) => row.content as unknown as RawEpisode);
  registerRemoteEpisodes(raws);
  return raws;
}

/** Loads released episodes from the admin hub into the catalog before game state mounts. */
export function EpisodeCatalogGate({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["released-episodes"],
    queryFn: fetchReleasedEpisodes,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const warned = useRef<boolean>(false);

  useEffect(() => {
    if (!query.isError || warned.current) return;
    warned.current = true;
    toast.error("Couldn't load the newest episodes", { description: "Playing the built-in library for now." });
  }, [query.isError]);

  if (query.isPending) return <AuthLoading />;
  return <>{children}</>;
}
