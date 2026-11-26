# PapeLemi — transferência das Edge Functions do Empório

Fonte: `apps/emporio-admin/source/supabase/functions`, fixada no commit `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`.

Foram copiados 54 entrypoints e seus arquivos compartilhados para `supabase/functions`. Os testes de origem não foram publicados como funções.

## Isolamento

O import map de `supabase/functions/deno.json` redireciona os imports de Supabase JS usados pela origem para `_shared/engine-supabase.ts`. O wrapper preserva as opções do cliente e força `db.schema = papelemi_engine`. Assim, as Edge Functions não consultam as tabelas legadas do schema `public`.

Nenhum valor de segredo, token, chave privada ou credencial da origem foi copiado. Os valores de `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` devem ser os fornecidos pelo projeto PapeLemi.

## Funções transferidas

- `admin-backup-export`
- `admin-backup-import`
- `admin-create-user`
- `admin-media-backup`
- `admin-system-audit`
- `admin-usage-ingest`
- `calculate-shipping`
- `chat`
- `cleanup-orphan-product-images`
- `data-deletion-request`
- `generate-sitemap`
- `health`
- `instagram-oembed`
- `instagram-sync`
- `media-backup-cron`
- `mercadopago-webhook`
- `merchant-feed`
- `merchant-feed-audit`
- `notification-prefs`
- `notification-test`
- `notify-admins-new-request`
- `notify-order-status`
- `notify-role-change`
- `order-stream`
- `prerender`
- `process-image-jobs`
- `robots-txt`
- `security-scan`
- `send-order-email`
- `seo-autopilot`
- `seo-bing-verify`
- `seo-checks`
- `seo-control-plane`
- `seo-crawler-probe`
- `seo-daily-guard`
- `seo-gsc-analytics`
- `seo-gsc-coverage`
- `seo-gsc-snapshot`
- `seo-image-audit`
- `seo-index-audit`
- `seo-indexation-monitor`
- `seo-jsonld-audit`
- `seo-jsonld-autofix`
- `seo-jsonld-hubs`
- `seo-product-audit`
- `seo-semrush-snapshot`
- `seo-sitemap-auto-resubmit`
- `seo-title-optimizer`
- `seo-vitals-alert`
- `submit-sitemap`
- `support-chat`
- `telemetry-alert-monitor`
- `track-order`
- `track-visit`

## Variáveis externas identificadas no código

- `RESEND_API_KEY`
- `LOVABLE_API_KEY`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `IG_ACCESS_TOKEN`
- `IG_BUSINESS_ACCOUNT_ID`
- `GOOGLE_SEARCH_CONSOLE_API_KEY`
- `SEMRUSH_API_KEY`
- `STORE_NOTIFICATION_EMAIL`
- `NOTIFY_FROM_EMAIL`
- `DEPLOY_VERSION`

A presença desses nomes no código não comprova que os valores estejam configurados no projeto PapeLemi. Não foi possível consultar os valores/nomes atuais dos secrets pelo conector disponível.

## Configuração

As quatro funções que a origem expõe sem JWT foram mantidas com `verify_jwt = false`: `mercadopago-webhook`, `track-visit`, `order-stream` e `notify-order-status`. A validação própria de webhook/segredo continua sendo responsabilidade de cada função.

## Limite de execução

O código está no GitHub, mas não foi implantado no Supabase Production. A implantação depende da aplicação aprovada da migration do schema `papelemi_engine` e da configuração dos secrets próprios da PapeLemi.
