import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const adapterRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adapterRoot, "../../..");
const sourceSrc = path.resolve(adapterRoot, "../source/src");
const papelemiSrc = path.resolve(repoRoot, "src");

export default defineConfig({
  root: adapterRoot,
  base: "/admin-engine/",
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.resolve(adapterRoot, "src/integrations/supabase/client.ts") },
      { find: "@/hooks/useAuth", replacement: path.resolve(adapterRoot, "src/hooks/useAuth.ts") },
      { find: "@/pages/admin/AdminLayout", replacement: path.resolve(adapterRoot, "src/pages/admin/AdminLayout.tsx") },
      { find: "@/pages/admin/AdminLogin", replacement: path.resolve(adapterRoot, "src/pages/admin/AdminLogin.tsx") },
      { find: "@/pages/admin/AdminSettings", replacement: path.resolve(adapterRoot, "src/pages/admin/AdminSettings.tsx") },
      { find: "@/assets/logo.webp", replacement: path.resolve(adapterRoot, "src/assets/papelemi-logo.svg") },
      { find: "@/data", replacement: path.resolve(papelemiSrc, "data") },
      { find: "@", replacement: sourceSrc },
    ],
  },
  server: { fs: { allow: [repoRoot, sourceSrc, adapterRoot] } },
  css: { postcss: path.resolve(adapterRoot, "postcss.config.js") },
  publicDir: false,
  build: {
    outDir: path.resolve(repoRoot, "public/admin-engine"),
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
  },
});
