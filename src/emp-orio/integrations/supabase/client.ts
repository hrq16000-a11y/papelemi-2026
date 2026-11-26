import { supabase as papeLemiSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
export const supabase = papeLemiSupabase as unknown as SupabaseClient<Database>;