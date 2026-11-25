# Classificação de dados e guardrails — Empório Lele Cute

**Data:** 25/11/2026  
**Fonte:** colunas observadas nos 150 blocos `COPY public.*` do backup Custom Archive e no código original.  
**Status:** classificação preliminar para desenho de migração; não representa revisão jurídica nem prova de conteúdo de cada linha.

## 1. Evidência de conteúdo do arquivo

O catálogo do backup contém 201 blocos de dados (`COPY`):

| Schema | Blocos de dados |
|---|---:|
| public | 150 |
| auth | 27 |
| storage | 10 |
| realtime | 9 |
| cron | 2 |
| drizzle | 1 |
| supabase_migrations | 1 |
| vault | 1 |
| **Total** | **201** |

Os 150 blocos `COPY public.*` correspondem a 150 tabelas públicas. **Blocos COPY não são contagem de registros**: as quantidades de linhas por tabela continuam pendentes de restauração/extração em PostgreSQL compatível.

O arquivo inclui dados em schemas gerenciados pelo Supabase. Não restaurar diretamente `auth`, `storage`, `realtime`, `vault`, `cron` ou `supabase_migrations` sobre o projeto de destino.

## 2. Classificação preliminar por risco

### P0 — segredos e credenciais

Tabelas/colunas identificadas:

- `internal_function_secrets.value`
- `operational_worker_credentials.token`
- `shipping_providers.api_key`
- `shipping_providers.api_secret`
- `payment_events.raw` (pode conter payloads de provedores e dados sensíveis)

**Tratamento:** nunca copiar valores secretos como dados comuns. Reemitir credenciais por integração, guardar apenas no ambiente de servidor/Vault apropriado e testar com credenciais novas. Inspecionar payloads antes de qualquer migração; remover tokens/segredos por transformação documentada.

### P0 — autenticação, identidade e sessão

Schemas e tabelas identificadas incluem `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, MFA, OAuth e tabelas auxiliares.

**Tratamento:** não fazer restore bruto. Inventariar usuários/identidades e relacionamentos com `profiles`, `customers` e pedidos. Definir procedimento suportado de recriação/migração de identidade, sem sessões, refresh tokens, MFA secrets ou OAuth state antigo.

### P0 — clientes, pedidos e atendimento

Tabelas/colunas incluem:

- `customers`: nome, e-mail, telefone, WhatsApp, cidade, estado, notas e tags.
- `profiles`: e-mail, nome, telefone e CEP.
- `orders`: dados do cliente, endereço, contato, pagamento, frete, tracking e observações.
- `order_items.personalization`: dados personalizados informados para encomendas.
- `support_threads` e `support_messages`: conversas e mensagens.
- `data_deletion_requests`: e-mail, WhatsApp, motivo e informações de processamento.
- `tracking_email_log`, `notification_preferences`, `push_subscriptions`.

**Tratamento:** migrar somente com `store_id` obrigatório, RLS e autorização server-side. Não permitir leitura cruzada entre Empório e PapeLemi. Preservar consentimentos, solicitações de exclusão e histórico de forma rastreável. Não usar dados reais em testes.

### P0 — telemetria e localização

- `visitors` contém IP, país/região/cidade, latitude/longitude derivadas de IP, coordenadas GPS, precisão, timestamps, user-agent, dispositivo e informações de consentimento.
- `visitor_sessions.ip` e `cookie_consents.ip` também guardam IP.
- `visitor_pageviews` guarda caminhos, páginas, produtos e eventos de navegação.

**Tratamento:** não importar telemetria individual por padrão. Primeiro classificar finalidade, base legal, consentimento, retenção e necessidade. Preferir agregados minimizados. Coordenadas GPS, IP e identificadores de dispositivo exigem revisão específica; não migrar automaticamente por estarem no dump.

### P1 — conteúdo e configuração comercial

Inclui catálogo, categorias, ocasiões, coleções, kits, cupons, frete, pós-venda, conteúdo editorial, páginas, FAQs, banners, menus, redirects e SEO.

**Tratamento:** preservar dados e semântica, mas atribuir escopo explícito à loja. Configurações singleton do Empório não podem virar globais compartilhadas por acidente. Credenciais de frete e pagamento ficam fora das tabelas públicas de configuração.

### P1 — analytics, SEO snapshots e auditoria

Inclui famílias `seo_*`, `pdp_*_events`, `admin_usage_aggregates`, `web_vitals_reports`, logs e tabelas de auditoria.

**Tratamento:** classificar como dado operacional da loja ou plataforma. Preservar origem e timestamps; avaliar retenção e utilidade antes de importar todo o histórico. Evitar carregar snapshots sintéticos ou redundantes como se fossem métricas de negócio comprovadas.

### P2 — dados públicos de catálogo e apresentação

Inclui produtos, categorias, avaliações publicadas, depoimentos, conteúdo editorial e imagens.

**Tratamento:** migrar com `store_id`, URLs/redirects canônicos por domínio, referências de mídia estáveis e validação de binários. Não misturar catálogos nem imagens entre marcas.

## 3. Regra de isolamento

- Cada registro comercial pertence a uma loja identificada por UUID.
- Domínio/host é resolvido no servidor; não confiar em `store_id` informado pelo navegador.
- RLS filtra e autoriza por loja.
- Funções SQL, triggers, Edge Functions, cron, relatórios e painéis recebem contexto de loja confiável.
- Proprietário global tem permissão explícita e auditada; administradores de loja não recebem acesso à outra loja por padrão.
- Testes negativos devem tentar ler e alterar dados da loja oposta.

## 4. Não fazer

- Não copiar secrets ou tokens para tabelas públicas.
- Não restaurar schemas internos Supabase em massa.
- Não copiar usuários Auth e sessões diretamente.
- Não migrar IP/GPS/user-agent em lote sem avaliação.
- Não aplicar migrations de tenantização no banco de produção antes do restore isolado.
- Não remover registros legados sem classificação e mapeamento.
- Não declarar migração completa apenas porque as tabelas foram criadas.

## 5. Próximas evidências necessárias

1. Row counts por tabela, extraídos por PostgreSQL compatível.
2. FKs, constraints, índices, sequences, triggers, funções e policies após restore isolado.
3. Mapeamento de cada tabela para `store-owned`, `platform-owned`, `shared-reference` ou `legacy/archive`.
4. Relatório de dados sensíveis e plano de minimização.
5. ZIP físico de mídia com manifesto e hashes.
6. Procedimento de Auth e secrets compatível com Supabase.
