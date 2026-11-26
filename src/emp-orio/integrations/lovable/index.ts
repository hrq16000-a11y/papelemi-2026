import { supabase } from "../supabase/client";
type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };
export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft" | "lovable", options?: SignInOptions) => {
      if (provider !== "google") return { error: new Error("Este provedor não está habilitado na autenticação da PapeLemi.") };
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: options?.redirect_uri } });
      return { redirected: Boolean(data?.url), error: error ?? null };
    },
  },
};