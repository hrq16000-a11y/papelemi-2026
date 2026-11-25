<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- The live catalog source of truth is Supabase (`categories` and `products`). `src/data/catalog.ts` is a local fallback/reference only; never treat it as authoritative when the database is available. Keep per-product personalization options in the database and validate them server-side.
- AI phrase suggestions run only in the `suggestPhrases` server function (`src/lib/ai.functions.ts`) via the Lovable AI Gateway SDK; never call models from browser code.
- Cart is client-side (localStorage) for round one; validate stored items before use. Checkout quotes and order creation must re-read published products and active coupons from Supabase, validate variations/personalization and minimum quantities on the server, and never trust client prices. Use the existing orders.id primary key as an idempotency key; do not add or edit migrations manually. No real payments until a gateway is approved.
- AI writing context (styles, occasions, per-category/product profiles) lives in `src/data/ai-config.ts`; the server resolves the published product and field limit from the live Supabase catalog by slug, so clients cannot inject product context or exceed field limits.
