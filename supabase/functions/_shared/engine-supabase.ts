import { createClient as baseCreateClient } from "npm:@supabase/supabase-js@2.56.0";
export * from "npm:@supabase/supabase-js@2.56.0";

/**
 * Every Emporio-derived Edge Function is scoped to the PapeLemi engine schema.
 * Auth and Storage APIs remain global Supabase services; PostgREST table/RPC
 * calls use papelemi_engine by default.
 */
export function createClient(url: string, key: string, options: any = {}) {
  return baseCreateClient(url, key, {
    ...options,
    db: {
      ...(options?.db ?? {}),
      schema: "papelemi_engine",
    },
  });
}
