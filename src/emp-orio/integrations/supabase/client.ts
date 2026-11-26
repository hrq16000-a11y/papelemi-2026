import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
function getEnvironment(name: string): string | undefined {
  const viteValue = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
  if (viteValue) return viteValue;
  if (typeof process !== "undefined") return process.env[name];
  return undefined;
}
function createPapeLemiClient() {
  const url = getEnvironment("VITE_SUPABASE_URL") || getEnvironment("SUPABASE_URL");
  const key = getEnvironment("VITE_SUPABASE_PUBLISHABLE_KEY") || getEnvironment("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("PapeLemi Supabase environment is not configured.");
  return createClient<Database>(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
let instance: ReturnType<typeof createPapeLemiClient> | undefined;
export const supabase = new Proxy({} as ReturnType<typeof createPapeLemiClient>, {
  get(_target, property, receiver) { if (!instance) instance = createPapeLemiClient(); return Reflect.get(instance, property, receiver); },
});