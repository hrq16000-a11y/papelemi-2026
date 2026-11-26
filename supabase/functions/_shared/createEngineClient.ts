import { createClient, type SupabaseClientOptions } from "npm:@supabase/supabase-js@2";

export function createEngineClient(
  supabaseUrl: string,
  supabaseKey: string,
  options: SupabaseClientOptions<"papelemi_engine"> = {},
) {
  return createClient(supabaseUrl, supabaseKey, {
    ...options,
    db: {
      ...(options.db ?? {}),
      schema: "papelemi_engine",
    },
  });
}
