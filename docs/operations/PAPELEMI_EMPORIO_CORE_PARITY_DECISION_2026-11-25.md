# Decisão de execução — paridade operacional Empório → PapeLemi

**Data:** 25/11/2026  
**Status:** direção aprovada pelo proprietário; execução em etapas.  
**Projeto prioritário:** PapeLemi — `hrq16000-a11y/papelemi-2026`.  
**Supabase dedicado PapeLemi:** `gpdpfoxpbferjwbppcmb` (São Paulo).

## 1. Objetivo atual

A PapeLemi será a primeira implantação da estrutura operacional da Empório Lele Cute.

A referência Empório será usada para reproduzir, com fidelidade funcional, os processos, os módulos administrativos, as entidades de banco, as regras de negócio e os serviços que fazem uma loja operar. A PapeLemi permanece uma loja independente, com marca, catálogo, preços, clientes, pedidos, mídia e conteúdo próprios.

**Não é uma migração dos dados comerciais do Empório. É a reprodução da estrutura e dos recursos operacionais na PapeLemi.**

## 2. O que copiar e o que não copiar

### Copiar/adaptar para PapeLemi

- Estrutura e navegação do painel administrativo.
- Dashboard e indicadores operacionais.
- Gestão de pedidos, clientes, catálogo, categorias e taxonomias.
- Kits, coleções, cupons, personalização e regras de catálogo.
- Pagamentos, eventos, frete, expedição e pós-venda.
- Conteúdo, páginas, banners, menus, FAQs e depoimentos.
- Mídia/Storage com biblioteca própria da PapeLemi.
- Atendimento, notificações, usuários, permissões e auditoria.
- SEO, sitemap, redirects, analytics e ferramentas de saúde do site.
- Estrutura relacional, constraints, índices, funções, triggers e RLS necessárias a esses módulos.

### Não copiar do Empório

- Fotografias, vídeos, logos ou arquivos de marca.
- Produtos, preços, variantes, estoque ou catálogo comercial.
- Clientes, contatos, perfis, pedidos ou históricos.
- Cupons, avaliações, depoimentos, campanhas ou conteúdo editorial.
- Credenciais, tokens, secrets, integrações ou configurações comerciais.
- Domínio, canonical, dados legais ou perfis de redes sociais.

A PapeLemi terá Storage e mídia próprios. O backup de mídia do Empório não faz parte desta implantação e não deve ser importado para a PapeLemi.

## 3. Isolamento multi-loja obrigatório desde a primeira migration

A separação dos negócios não fica adiada. A infraestrutura compartilhada deve nascer com escopo de loja no banco, nos serviços e nas permissões.

- Cadastro central de lojas pela tabela `stores`, com identificador estável `store_key`.
- Chaves naturais de catálogo e cupons compostas por loja, permitindo slugs iguais sem colisão.
- Papéis administrativos associados à loja; a autorização PapeLemi é validada por `has_store_role`.
- RLS e consultas server-side devem filtrar o escopo da loja; pedidos, clientes e itens permanecem privados no servidor.
- Cada loja mantém catálogo, preços, clientes, pedidos, pagamentos, estoque, mídia, conteúdo e configurações separados.
- PapeLemi é o primeiro tenant provisionado. O tenant Empório será criado somente na migração posterior, sem importar dados comerciais, mídia ou secrets.
- O seletor visual de loja em um clique para Letícia permanece etapa posterior; a separação de dados e permissões é requisito imediato.

A primeira migration de paridade cobre o núcleo comercial PapeLemi (categorias, produtos, cupons, frases, papéis, pedidos, clientes e itens). A tenantização dos demais módulos do snapshot Empório — CMS, logística, pós-venda, mídia, analytics, suporte, auditoria e automações — é gate obrigatório antes de cadastrar a Empório no mesmo banco.

## 4. Stack e preservação

- Preservar TanStack Start, React, TypeScript e a arquitetura atual da PapeLemi.
- Não substituir o projeto pela stack React/Vite da Empório.
- Portar capacidades e modelos de domínio, não copiar indiscriminadamente componentes acoplados à marca ou ao backend Lovable.
- Manter a identidade editorial, as fotografias, fontes, produtos e rotas da PapeLemi.
- Continuar usando o Supabase dedicado da PapeLemi em São Paulo.
- Nenhum secret do Empório será reutilizado.

## 5. Estado real da PapeLemi no checkpoint

Consulta read-only ao Supabase dedicado em 25/11/2026:

| Tabela pública | Registros |
|---|---:|
| categories | 4 |
| products | 8 |
| curated_phrases | 10 |
| coupons | 0 |
| orders | 0 |
| user_roles | 1 |

O schema público atual contém seis tabelas: `categories`, `products`, `coupons`, `curated_phrases`, `orders` e `user_roles`.

Lacunas estruturais já identificadas em relação ao modelo Empório:
- PapeLemi não possui tabela `customers`.
- PapeLemi guarda itens do pedido em JSONB `orders.items`, sem `order_items` normalizada.
- Não possui módulos/tabelas de kits e coleções.
- Não possui o conjunto operacional de frete (`shipping_settings`, `shipping_providers`, `shipping_rules`, logs).
- Não possui a estrutura de CMS e administração de mídia do Empório.
- Não possui o conjunto de tabelas de atendimento, pós-venda, reviews, analytics e auditoria do Empório.

Essas lacunas são parte do trabalho futuro de paridade de banco; não devem ser mascaradas por telas demonstrativas.

## 6. Entregas já existentes e preservadas

As branches/PRs abertas foram recuperadas e estão sendo consolidadas sem reescrever histórico:

- PR #4 — catálogo Supabase como fonte de verdade.
- PR #5 — acesso administrativo provisionado e alteração de senha.
- PR #6 — validação de personalização, preços, cupom e idempotência do checkout; CI unitário/ESLint/TypeScript aprovado no HEAD consultado.
- PR #7 — dashboard operacional inicial.

A branch de trabalho `feat/papelemi-emp-or-core-baseline-01` reúne essas alterações e adiciona o primeiro módulo de relacionamento: diretório de clientes derivado dos snapshots de pedidos.

### Limite do diretório de clientes nesta fase

O diretório novo agrupa e-mails de pedidos, conta pedidos e mostra o contato mais recente. Ele é uma primeira superfície funcional, não substitui a tabela CRM `customers` da Empório. A tabela canônica e o vínculo normalizado entre cliente e pedido serão adicionados na rodada de banco correspondente.

## 7. Sequência de paridade operacional

| Etapa | Domínio | Resultado esperado |
|---|---|---|
| 1 | Base de loja e segurança | Catálogo Supabase, acesso admin seguro, checkout íntegro, dashboard |
| 2 | Pedidos e clientes | Ficha completa do pedido, clientes normalizados, histórico e vínculo cliente-pedido |
| 3 | Catálogo avançado | Produtos completos, taxonomias, ocasiões, tags, kits, coleções e reviews |
| 4 | Pagamentos e logística | Eventos de pagamento, configurações/provedores/regras de frete, expedição e tracking |
| 5 | Operação e relacionamento | Pós-venda, suporte, notificações, preferências e filas |
| 6 | Conteúdo e merchandising | Páginas, banners, home/PDP sections, menus, FAQs, blog e prova social |
| 7 | Mídia e crescimento | Storage PapeLemi, biblioteca, SEO, sitemap, redirects, analytics e relatórios |
| 8 | Gestão completa | Auditoria, papéis, usuários, configurações e homologação ponta a ponta |

Cada etapa terá micro-PR própria, migração versionada quando necessária, testes de RLS, dados sintéticos e validação antes da seguinte.

## 8. Regras de banco

- Usar as migrations do Empório como fonte de referência para o modelo operacional.
- Não restaurar cegamente o dump inteiro, pois inclui schemas internos gerenciados pelo Supabase e segredos de outro ambiente.
- Não importar dados de negócio do Empório para PapeLemi.
- Não copiar `auth.users`, sessões, refresh tokens, MFA ou Vault do Empório.
- Não copiar valores de `internal_function_secrets`, `operational_worker_credentials`, tokens de pagamento/frete/e-mail ou payloads sensíveis.
- Criar as estruturas PapeLemi em migrações controladas, mantendo IDs e relacionamentos da PapeLemi atual quando possível.
- Fazer backup antes de mudanças estruturais; validar schema, FKs, índices, funções, triggers, grants e RLS.
- Usar ambiente isolado para ensaios destrutivos. Não apontar Preview para Production.
- Credenciais e integrações serão provisionadas separadamente para PapeLemi.

## 9. Critério de conclusão

PapeLemi será considerada operacionalmente equivalente ao núcleo da Empório quando os módulos de gestão acima tiverem fluxos reais e persistência verificada, sem páginas demonstrativas, sem perda de dados PapeLemi e sem conteúdo comercial do Empório.

A fase multi-loja só começa depois que a PapeLemi estiver sólida como loja independente e o proprietário aprovar essa nova etapa.


## 10. Governança antes da próxima etapa de banco

O AGENTS.md ainda contém o bloco gerenciado pelo Lovable que proíbe editar migrations/Drizzle manualmente e orienta mudanças de schema pelo fluxo Lovable. A decisão atual usa o Supabase dedicado PapeLemi e o GitHub como base do trabalho.

Antes de criar/aplicar a primeira migration de paridade, reconciliar essa regra de governança explicitamente no repositório, sem apagar o bloco gerenciado. A migration deverá ser revisada no Git, aplicada ao Supabase correto somente após homologação e autorização, e os tipos gerados deverão ser atualizados pelo mecanismo oficial.

O arquivo supabase/config.toml foi alinhado nesta branch ao projeto dedicado confirmado `gpdpfoxpbferjwbppcmb`. Isso corrige apenas o identificador usado pela CLI; não aplica migrations nem altera o banco.


## 11. Matriz de paridade operacional — referência Empório

Legenda: **Implementado** = existe no código/fluxo da PapeLemi; **Parcial** = há uma primeira versão, mas faltam recursos de paridade; **Pendente** = ainda não existe como módulo operacional PapeLemi.

| Domínio/módulo | Estado PapeLemi | Observação objetiva |
|---|---|---|
| Dashboard | Parcial | Indicadores básicos e encomendas recentes na PR #8; faltam indicadores completos e alertas operacionais |
| Pedidos | Parcial | Lista, itens JSONB e mudança de status; falta ficha detalhada, filtros, timeline, envio/tracking e eventos normalizados |
| Clientes | Parcial | Diretório derivado de pedidos na PR #8; falta CRM persistente, edição, tags, notas e histórico unificado |
| Produtos | Parcial | CRUD básico e fonte Supabase; faltam atributos logísticos, versões, mídia, reviews e controles avançados |
| Categorias | Implementado (básico) | CRUD e ordenação simples |
| Ocasiões e tags | Pendente | Sem taxonomias relacionais completas |
| Kits | Pendente | Sem tabelas e editor |
| Coleções | Pendente | Sem tabelas e editor |
| Cupons | Implementado (básico) | CRUD e validação percentual; falta histórico de uso e regras avançadas |
| Personalização | Parcial | Campos JSON por produto e assistente de dedicatórias; falta prévia de produção e histórico completo |
| Checkout | Parcial | Revalidação server-side, cupom, personalização e idempotência; frete ainda manual |
| Pagamentos | Parcial | Integração Mercado Pago no código; conta/webhook real ainda não homologados |
| Frete e expedição | Pendente | Sem configuração de origem, provedores, regras, cotações persistidas e tracking |
| Ateliê e pós-venda | Pendente | Sem filas, follow-ups e regras de pós-venda |
| Atendimento/suporte | Pendente | Sem inbox e histórico de conversas |
| Notificações | Pendente | Sem centro de notificações e preferências administrativas |
| Usuários e permissões | Parcial | Login provisionado e papel admin; falta matriz de papéis e auditoria |
| Auditoria operacional | Pendente | Sem trilha unificada das alterações administrativas |
| CMS/páginas/blog | Pendente | Rotas públicas existentes, mas sem CMS administrativo equivalente |
| Home/PDP configuráveis | Pendente | Estrutura ainda não gerida por tabelas de seções |
| Mídia/Storage PapeLemi | Pendente | Sem bucket próprio no Supabase consultado |
| SEO/sitemap | Parcial | Sitemap dinâmico e metadados básicos; falta cockpit operacional completo |
| Analytics/telemetria | Pendente | Eventos do projeto não foram comprovados em um destino analítico |
| Segurança e LGPD | Parcial | RLS e consentimento no checkout; falta gestão operacional de solicitações e auditoria |

### Fora do núcleo atual

Os módulos experimentais de SEO/“intelligence labs” existentes no código Empório não serão copiados nesta fase. Primeiro concluiremos os fluxos de comércio, administração, conteúdo, logística, relacionamento e segurança que sustentam a operação diária. A adoção de cada laboratório avançado exigirá evidência de uso e benefício real para a PapeLemi.

Esta matriz é o controle de conclusão da paridade; o status só muda para Implementado após código, persistência e validação verificáveis.


---

## 12. Retificação aprovada pelo proprietário — 25/11/2026

A decisão mais recente do proprietário substitui a orientação anterior de manter Empório e PapeLemi em bancos totalmente independentes.

**Novo objetivo:** o Supabase dedicado da PapeLemi (\`gpdpfoxpbferjwbppcmb\`) passa a ser a base central planejada. A PapeLemi receberá o motor operacional integral da Empório e será homologada primeiro. Posteriormente, a Empório passará a usar o mesmo projeto Supabase.

O escopo agora inclui o esquema completo do motor, regras, RPCs, views, triggers, RLS, Storage, Edge Functions e as 120 páginas administrativas com seus 411 componentes. A referência versionada Empório está no HEAD \`d01d843c266b5a32d03af22eeaac6eda4a7fcf0f\`, com 199 migrations SQL, 155 tabelas, 63 RPCs, 5 views e 54 Edge Functions.

A PapeLemi não receberá produtos, clientes, pedidos, imagens, vídeos, preços, campanhas, conteúdo ou credenciais da Empório. Somente estrutura e funcionalidades. O isolamento de dados por loja é obrigatório no banco central; o mecanismo será definido após a revisão integral das migrations e homologação.

O projeto Empório declara o Supabase \`xfqffqxqiuqauefrrcxn\`, mas ele não está disponível nas conexões atuais. Não afirmar inspeção do banco hospedado. O projeto PapeLemi está acessível e ativo.

**A arquitetura multi-loja deixa de estar totalmente adiada:** o banco central e a capacidade de isolamento por loja entram no escopo estrutural agora. A interface de troca de loja em um clique e a migração dos dados Empório permanecem para depois da homologação integral da PapeLemi.

Documento de referência: \`docs/operations/PAPELEMI_SHARED_DATABASE_EMPORIO_ENGINE_2026-11-25.md\`.
