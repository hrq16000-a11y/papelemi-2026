import { supabase as papeLemiSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Reuse the destination's canonical client: URL, publishable key, preview auth storage,
// and server-side routing all remain owned by PapeLemi.
export const supabase = papeLemiSupabase as unknown as SupabaseClient<Database>;
