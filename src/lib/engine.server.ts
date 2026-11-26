import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database as EngineDatabase } from "@/emp-orio/integrations/supabase/types";

// All storefront reads/writes that must share the original Emporio engine use
// this server-only client. The service-role key never enters the browser bundle.
export function engineAdmin() {
  const client = supabaseAdmin as unknown as SupabaseClient<EngineDatabase>;
  return client.schema("papelemi_engine");
}
