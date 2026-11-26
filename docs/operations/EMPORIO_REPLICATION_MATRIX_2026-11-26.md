# PapeLemi — matriz de replicação Empório Lele Cute

**Checkpoint:** 2026-11-26  
**Destino:** `hrq16000-a11y/papelemi-2026`  
**Fonte:** `hrq16000-a11y/emporiolelecute-2026`  
**SHA fixado da fonte:** `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`  
**PR principal:** #13 — `feat/catalog-admin-parity-01-20261125`  
**HEAD auditado:** `6aceaf83b9268cc7f8d26960dd7a02301814bbe9`

## 1. Transferência de código comprovada

O manifesto registra **1.373 arquivos reutilizados** (aprox. 6,24 MB de texto):

- 563 componentes;
- 69 hooks;
- 284 módulos de bibliotecas/serviços;
- 120 páginas administrativas;
- 124 entradas de rotas administrativas;
- 119 imports dinâmicos de páginas administrativas;
- 54 diretórios de Edge Functions com 75 arquivos;
- 199 migrations copiadas para projeto Supabase local isolado.

A rota `/admin` monta o runtime administrativo original em shell client-only do TanStack Start. O adaptador Supabase do runtime usa o cliente da PapeLemi, não as credenciais da Empório.

**Limite:** build e SSR smoke de `/admin/login` não comprovam autenticação, permissões, CRUD nem operação comercial ponta a ponta.

## 2. Matriz de paridade

| Módulo | Copiado | Adaptado | Conectado | Homologado |
|---|---|---|---|---|
| Painel administrativo | Sim | Parcial | Parcial | Não — smoke SSR apenas |
| Produtos e catálogo | Sim | Parcial | Parcial | Não |
| Categorias e coleções | Sim | Parcial | Parcial | Não |
| Estoque e variações | Sim | Parcial | Parcial | Não |
| Clientes e CRM | Sim | Parcial | Parcial | Não |
| Pedidos e histórico | Sim | Parcial | Parcial | Não |
| Personalizações | Sim | Parcial | Parcial | Não |
| Pagamentos | Código copiado | Parcial | Não comprovado | Não |
| Fretes e transportadoras | Sim | Parcial | Parcial | Não |
| Relatórios, SEO e analytics | Sim | Parcial | Não comprovado | Não |
| Automações e Edge Functions | 54 diretórios / 75 arquivos | Parcial | Não — 0 implantadas | Não |
| Banco de dados | 199 migrations locais | Não integrado | Não | Não |

## 3. Banco — Supabase PapeLemi (read-only)

Projeto `gpdpfoxpbferjwbppcmb`, região `sa-east-1`, Postgres 17.12, `ACTIVE_HEALTHY`:

- 15 tabelas públicas;
- 10 migrations aplicadas;
- 4 funções públicas;
- 0 triggers públicos;
- 40 índices públicos;
- 30 políticas RLS;
- 0 views públicas;
- 3 enums públicos;
- 0 Edge Functions implantadas.

## 4. Banco — reconstrução local da fonte

A execução GitHub Actions **45753255048** concluiu o replay isolado de todas as 199 migrations, sem seed e sem dados comerciais.

O dump do schema público registrou:

| Objeto | Replay local Empório |
|---|---:|
| Tabelas públicas | 144 |
| Funções públicas | 84 |
| Views públicas | 4 |
| Índices públicos | 306 |
| Policies públicas | 234 |
| Triggers públicos | 0 |

O arquivo de tipos versionado da fonte declara 150 tabelas e 63 funções. A diferença entre os tipos versionados e o replay das 199 migrations indica drift ou versões diferentes; não deve ser resolvida por suposição.

### Comparação de tabelas

- 150 tabelas declaradas nos tipos da fonte;
- 15 tabelas públicas no destino;
- 12 nomes em comum;
- 138 tabelas declaradas na fonte ausentes do destino.

Diferenças de colunas nas tabelas centrais:

| Tabela | Fonte | PapeLemi | Diferença |
|---|---:|---:|---|
| `products` | 41 | 23 | faltam campos originais de SEO, busca, categoria e personalização |
| `categories` | 18 | 6 | faltam identificadores, SEO e metadados editoriais |
| `orders` | 32 | 20 | faltam código, endereço normalizado, pagamento e rastreamento |
| `coupons` | 13 | 4 | faltam tipo/valor de desconto, validade, limites e contadores |
| `user_roles` | 4 | 4 | fonte tem `created_at`; destino adiciona `store_key` |

A PapeLemi também possui campos próprios de isolamento por `store_key` e snapshots comerciais que não podem ser removidos. A reconciliação deverá ser aditiva e preservar os dados existentes.

O inventário histórico anterior da base hospedada da Empório registrava 150 tabelas, 88 funções, 95 triggers, 309 índices e 242 policies. Esses valores ainda precisam de confirmação no projeto remoto original.

## 5. Edge Functions e credenciais

O código contém 54 diretórios de funções (75 arquivos). O Supabase PapeLemi registra **0 funções implantadas**.

A varredura inicial de funções críticas identificou estes nomes de variáveis:

- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`;
- Mercado Pago: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`;
- E-mail/notificações: `RESEND_API_KEY`, `STORE_NOTIFICATION_EMAIL`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`;
- Instagram: `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`;
- SEO/integrações: `GOOGLE_SEARCH_CONSOLE_API_KEY`, `LOVABLE_API_KEY`, `SEMRUSH_API_KEY`.

A lista é inicial, não exaustiva. Nenhum valor de segredo foi lido ou copiado. Antes de implantação, todas as funções precisam de revisão de isolamento por `store_key`, RLS e credenciais próprias da PapeLemi.

## 6. PRs e branches preservadas

- **#8:** aberta, Draft; fundação multi-loja; base da #12.
- **#12:** aberta, Draft; consolidação administrativa/checkout; base da #13.
- **#13:** aberta, Draft; transferência em lote; frente principal.
- **#14:** fechada sem merge; contém mudanças próprias de ciclo de vida do catálogo, a avaliar e portar seletivamente.
- **#15:** aberta, Draft; operações 360° de pedidos; branch precisa ser atualizada após estabilização da #13.
- `feat/emporio-admin-replica-01-20261126`: branch experimental divergente, sem PR; preservada, não integrada.

## 7. CI, deploy e segurança

- Run `45753924111`: 38 testes, lint direcionado, TypeScript e replay de migrations PapeLemi — SUCCESS.
- Run `45753672669`: transferência, build, smoke SSR e replay das 199 migrations Empório — SUCCESS.
- Production permanece no commit `f29417de`, deployment READY.
- Preview conhecido da #13 está READY no commit anterior `13790de`; não representa o HEAD auditado.
- A Vercel reportou limite de novas implantações com retry em 24 horas.
- O projeto Supabase remoto original da Empório não está disponível nas conexões desta sessão.
- O backup ZIP existente na Biblioteca não pôde ser materializado como bytes nesta execução; nenhum restore ou importação de dados foi feito.

Nenhuma alteração foi feita no banco original. Nenhuma migration foi aplicada no Supabase hospedado da PapeLemi. Nenhum dado comercial foi importado. Nenhuma Edge Function foi implantada. Nenhuma publicação Production foi realizada.

Não aplicar as 199 migrations cegamente. O destino deverá receber migrations aditivas reconciliadas, preservando `store_key`, dados existentes, RLS e recursos atuais. Qualquer aplicação hospedada exige SQL revisado, backup/rollback confirmado e aprovação explícita do proprietário.

## 8. Próximos passos

1. Gerar e inspecionar artefato schema-only com tipos, métricas por schema, nomes das tabelas e buckets.
2. Comparar as 144 tabelas reconstruídas com os 150 tipos versionados e com a estrutura hospedada atual da Empório.
3. Obter conexão ao Supabase remoto original ou backup legível para reconciliar drift.
4. Criar migrations aditivas para tabelas e colunas ausentes, com isolamento por `store_key`.
5. Portar seletivamente os avanços úteis das PRs #14 e #15.
6. Homologar autenticação, catálogo, estoque, clientes, pedidos, personalização, pagamentos, fretes e painel.
7. Implantar Edge Functions somente após revisão de tenant isolation e configuração de segredos próprios.
8. Somente após todos os gates, solicitar aprovação para aplicar migrations hospedadas e publicar.


## 9. Ajustes de continuidade — 2026-11-26

- O route contract test agora verifica a correspondência da URL `/admin` sem exigir que o route ID seja literalmente `/admin`; o TanStack gera `/admin/$` para a rota-coringa.
- O workflow de replay fixa Supabase CLI 3.4.0, evitando a consulta `latest` que sofreu rate limit.
- O workflow agora deve publicar artefato temporário schema-only (DDL público, tipos, métricas, nomes de tabelas e buckets), sem dados comerciais.
- Os scripts substituem URLs Supabase hospedadas por URL local por regex genérica, sem armazenar project ref da origem.
- A validação combinada com `papelemi_legacy` permanece exclusivamente local e estrutural; não move dados nem autoriza DDL hospedado.


## 10. Correção do workflow de artefato

O primeiro disparo do workflow de schema-only falhou antes do replay porque a versão 3.4.0 foi aplicada indevidamente ao setup do Bun. A configuração foi corrigida: Bun volta a `latest`, Supabase CLI permanece fixado em 3.4.0, as expressões `runner.temp` são avaliadas pelo GitHub Actions e a expressão de redaction do project ref usa escapes corretos. Nenhum banco hospedado foi afetado.


## 11. Contrato de rota administrativa

O teste de contrato confirma que `/admin` é resolvido pelo route tree, que o componente e a função de head existem, e que a rota entrega `robots: noindex, nofollow`. A expectativa do teste foi alinhada ao valor completo real. Isso protege o painel administrativo contra indexação pública.


## 12. Rodada de replicação em lote — 2026-11-26 05:37 UTC

### Estado Git e transferência

- Empório `main` de origem: `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`.
- PapeLemi `main` preservada: `f29417de4ead641d0b2b275535a963208b2360a3`.
- PR #13: aberta, Draft, 1.429 arquivos alterados; checkpoint de código validado em `4013d259b5367d2aa2b1d955e078b5e838c404bd`.
- Manifesto da transferência: 1.373 arquivos reutilizados.
- Distribuição física da PR: 1.055 arquivos em `src/emp-orio/`, 201 em `tools/emp-orio-supabase/`, 76 em `supabase/functions/` e 97 arquivos de suporte, documentação, testes e configuração.
- Runtime copiado: 563 componentes, 69 hooks, 284 módulos de bibliotecas/serviços, 120 páginas administrativas, 124 entradas de rota e 119 imports dinâmicos.
- O route handler `/admin` monta o aplicativo administrativo original da Empório; não é apenas uma tela reconstruída.

### Schema do motor e seed PapeLemi

As migrations candidatas de integração são:

1. `20261126000000_create_papelemi_engine_schema.sql`
2. `20261126001000_replay_emporio_drizzle_operational_schema.sql`
3. `20261126010000_bootstrap_papelemi_engine_admin.sql`
4. `20261126015000_extend_papelemi_engine_storefront_contract.sql`
5. `20261126020000_seed_papelemi_engine_with_store_data.sql`

A migration `20261125223000_add_catalog_lifecycle_management.sql`, originada do trabalho útil da PR #14, também está preservada na linha de integração.

O replay isolado e os contratos SQL passaram no CI. O schema local contém:

- 150 tabelas de origem + 1 tabela auxiliar PapeLemi (`shipping_quote_rate_limits`);
- 88 funções de origem + 2 helpers PapeLemi (`sync_papelemi_admin_roles` e `consume_shipping_quote_rate_limit`);
- 95 triggers, 246 policies RLS, 4 views e 5 enums;
- 309 índices de origem + 2 índices auxiliares PapeLemi;
- RLS habilitado nas 151 tabelas do schema.

O seed copia exclusivamente linhas com `store_key = 'papelemi'` do schema público para `papelemi_engine`. O schema público e seus registros permanecem intactos. O seed inclui catálogo, personalizações, clientes, cupons, configurações de frete, provedores, regras, auditoria, pedidos e itens quando existentes. Nenhum dado comercial do Empório é importado.

Os oito produtos atuais não têm peso cadastrado. O seed usa 0,150 kg como padrão inicial, valor já definido no RPC original `apply_default_weight` e na configuração de frete PapeLemi. O peso permanece editável por produto.

### CI e situação dos ambientes

- GitHub Actions run `45762789548`: SUCCESS — testes, lint, TypeScript, replay das migrations e contratos SQL.
- A reconstrução remota do Supabase original da Empório ficou SKIPPED por ausência de conexão ao projeto de origem.
- Supabase hospedado PapeLemi: 15 tabelas públicas, 10 migrations, 4 funções, 40 índices, 30 policies, 3 enums, 0 views e 0 Edge Functions implantadas.
- O schema hospedado `papelemi_engine` ainda não existe. Nenhuma migration desta integração foi aplicada ao Supabase hospedado.
- Vercel Production permanece READY no SHA `f29417de`. O Preview READY mais recente identificado é do SHA antigo `a2482340`; não existe Preview confirmado para o HEAD `4013d259`.
- `SUPABASE_URL` e chaves publicáveis estão configuradas para Preview; service role/secret permanecem somente em Production. Não copiar a chave de produção para Preview, pois isso daria a um deploy de revisão acesso privilegiado ao banco real.

### Divergências e limites ainda abertos

- O projeto Supabase remoto original da Empório não está conectado nesta sessão.
- O backup ZIP está listado na Biblioteca, mas a materialização dos bytes falhou; não foi restaurado nem importado.
- Os tipos versionados da origem declaram 150 tabelas e 63 funções; o replay SQL local valida 150 tabelas e 88 funções de origem.
- O inventário remoto histórico registra 242 policies, enquanto o replay local atual valida 246. A diferença exige confirmação no banco original/backup; não deve ser resolvida por suposição.
- As 75 Edge Function files foram copiadas, mas 0 funções estão implantadas. Segredos não foram lidos nem copiados.
- A branch experimental `feat/emporio-admin-replica-01-20261126` permanece preservada e divergente; não foi mesclada na PR #13.

### Cadeia de PRs preservada

- #8 → #12 → #13 é a cadeia de fundação e transferência.
- #14 foi fechada sem merge; o lifecycle útil foi portado seletivamente.
- #15 continua Draft e precisa ser reconciliada após estabilização da #13.
- #16 continua dependente da #15.
- Nenhuma PR foi integrada à `main`.

### Próxima execução segura

1. Obter conexão read-only ao Supabase original da Empório ou reanexar o backup ZIP como arquivo de conversa legível para confirmar o drift.
2. Obter um Preview do HEAD atual e homologar a interface; manter operações administrativas bloqueadas enquanto Preview não tiver banco isolado e credenciais próprias.
3. Atualizar a base da PR #15 e preservar a contribuição da #16.
4. Revisar a migration final e o rollback. Aplicação hospedada continua pendente de aprovação explícita e de confirmação da fonte.
5. Somente após homologação autenticada e gates completos, integrar e publicar.

**Limite desta rodada:** código e migrations passaram no ambiente local isolado. Não houve DDL hospedado, alteração no banco original, merge, deploy Production ou implantação de Edge Functions.


## 13. PR #15 — preservação e port seletivo para o Admin original

A PR #15 foi revisada contra o motor copiado. Ela deve permanecer aberta e em Draft, mas não pode ser mesclada integralmente sobre a PR #13:

- `src/routes/admin.tsx` da #15 é a interface administrativa legada da PapeLemi. Mesclá-la por cima substituiria a montagem do aplicativo original da Empório em `/admin`.
- Os handlers e a migration `20261125220000_add_order_360_operations.sql` usam o schema `public` e `store_key = 'papelemi'`; não devem ser aplicados diretamente ao motor `papelemi_engine`.
- O motor original já contém `payment_events`, `tracking_email_log`, `order_status_notifications` e `check_resend_email_cooldown`.
- As peças realmente ausentes no motor são principalmente `order_status_history` e `admin_update_order`; devem ser adaptadas ao schema `papelemi_engine`, às permissões do papel admin do motor e à execução privilegiada no servidor.
- A validação, os testes e os conceitos de interface da #15 devem ser preservados e portados para o `src/emp-orio/pages/admin/AdminOrders.tsx` original.

Comentário de revisão registrado na [PR #15](https://github.com/hrq16000-a11y/papelemi-2026/pull/15#issuecomment-7183807569).

**Decisão:** preservar #15 e #16, mas portar apenas o que ainda falta no motor original. Não criar uma segunda fonte de pedidos no schema público e não substituir a rota administrativa original.
