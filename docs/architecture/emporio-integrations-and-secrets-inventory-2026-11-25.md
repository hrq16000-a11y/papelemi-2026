# Inventário de integrações e credenciais — Empório Lele Cute

**Data:** 25/11/2026  
**Fonte:** busca estática em `Deno.env.get`, `process.env`, `import.meta.env`, configurações e código das 54 Edge Functions do ZIP original.  
**Status:** nomes e consumidores identificados; valores de segredo deliberadamente não lidos nem reproduzidos.

## 1. Backend de origem

- `supabase/config.toml` no código Empório aponta para `xfqffqxqiuqauefrrcxn`.
- O `.env` incluído no ZIP contém apenas variáveis `VITE_*` (project ID, URL e publishable key); não contém service-role key.
- O código usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` em Edge Functions.
- A existência do endpoint e do backup não prova acesso administrativo do proprietário ao projeto de origem. Tratar o backend como Lovable-managed, conforme a decisão do proprietário.

## 2. Integrações encontradas

| Integração | Variáveis encontradas | Consumidores / observações |
|---|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Base das 54 Edge Functions; service role é segredo crítico |
| Lovable AI / Connector Gateway | `LOVABLE_API_KEY` | Chat/SEO/notificações; chamadas passam pelo gateway Lovable |
| Resend | `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `STORE_NOTIFICATION_EMAIL` | E-mail de pedidos, alertas, notificações e sitemap |
| Mercado Pago | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | Webhook e fluxo de pagamento |
| Google Search Console | `GOOGLE_SEARCH_CONSOLE_API_KEY` | Analytics, cobertura, snapshot, indexação e envio de sitemap |
| Instagram | `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID` | Sincronização do feed |
| Semrush | `SEMRUSH_API_KEY` | Snapshot SEO |
| Web Push | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | Preferências e envio de notificações push |
| Frete | `LELECUTE_ORIGIN_CEP`, `MELHOR_ENVIO_TOKEN` | Encontrados em fixture/teste de `calculate-shipping`; não presumir que estejam configurados em produção |

## 3. Credenciais armazenadas em dados

Além das variáveis de ambiente, o schema público inclui:

- `shipping_providers.api_key` e `shipping_providers.api_secret`;
- `internal_function_secrets.value`;
- `operational_worker_credentials.token`;
- `payment_events.raw`, que pode conter payloads de webhook.

Não exportar esses valores para documentação, Git, logs, seed, planilhas ou tabelas de configuração pública.

## 4. Estratégia para o destino central

- Criar/registrar cada integração como configuração por loja, com secrets guardados fora do schema público.
- Reemitir tokens e segredos no destino; não reutilizar cegamente credenciais do backend Lovable.
- Separar credenciais do Empório e da PapeLemi, mesmo quando ambas usam o mesmo provedor.
- Validar assinatura do webhook, idempotência e escopo do pedido antes de ativar pagamentos.
- Validar contas/domínios de envio e remetentes antes de habilitar e-mails.
- Migrar GSC, Semrush e Instagram por autorização/conta, não por cópia de valor do banco.
- Não habilitar push até recriar o par VAPID e validar consentimento/inscrição.
- O `.env` do ZIP não é fonte suficiente para reconstruir as credenciais de servidor.

## 5. Regras de segurança

- Nunca solicitar ou exibir valores de service-role, access tokens, webhook secrets, API keys, VAPID private keys ou tokens operacionais.
- Não usar o banco de produção para testar pagamentos, envio de e-mail ou webhooks.
- Usar credenciais de sandbox/teste até a homologação final.
- Armazenar segredos por loja e validar autorização no servidor.
- Documentar apenas nome, finalidade, consumidor, estado de provisionamento e data de rotação.
