import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

const SUPABASE_URL = import.meta.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Supabase is not configured: EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required.");
}

/** The single shared Supabase client. Sessions persist in localStorage and refresh automatically. */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "the-vault-auth",
  },
});
