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

## 3. Escopo explicitamente adiado

A arquitetura multi-loja definitiva fica para uma fase posterior:

- cadastro central de várias lojas;
- seletor de loja com troca em um clique para Letícia;
- associação usuário/loja e permissões globais;
- tenantização de todas as tabelas;
- isolamento multi-tenant de RLS, Storage, serviços e integrações;
- migração do Empório para a infraestrutura compartilhada.

Por enquanto, PapeLemi opera como uma única loja no próprio Supabase dedicado. O campo `store_key = 'papelemi'` existente em pedidos será preservado por compatibilidade, sem implementar agora o seletor multi-loja.

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
