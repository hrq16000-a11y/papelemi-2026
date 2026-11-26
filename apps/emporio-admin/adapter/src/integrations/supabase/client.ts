import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY precisam apontar para o Supabase da PapeLemi.");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  db: { schema: "papelemi_engine" } as any,
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
