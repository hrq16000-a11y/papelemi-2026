import { supabase as papeLemiSupabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type EngineClient = SupabaseClient<Database>;

function engineClient() {
  return (papeLemiSupabase as unknown as EngineClient).schema("papelemi_engine");
}

// Auth and Storage stay on the same PapeLemi project client.
// Original admin data queries and RPCs use the isolated Emporio schema.
export const supabase = new Proxy(papeLemiSupabase as unknown as EngineClient, {
  get(target, property, receiver) {
    if (property === "from") {
      const engine = engineClient();
      return engine.from.bind(engine);
    }
    if (property === "rpc") {
      const engine = engineClient();
      return engine.rpc.bind(engine);
    }
    return Reflect.get(target, property, receiver);
  },
});
