import { createClient } from "@supabase/supabase-js";

// No fallback on purpose: a missing VITE_SUPABASE_URL/ANON_KEY at build time
// (frontend/.env not present) should fail loudly right away, not silently
// point every login at a nonexistent placeholder project — that failure mode
// is much harder to diagnose than a build-time crash.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
