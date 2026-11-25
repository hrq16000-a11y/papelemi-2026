# Paridade operacional e administrativa — Empório Lele Cute → PapeLemi

**Data:** 25/11/2026  
**Status:** baseline comparativa e plano de portabilidade; sem alteração estrutural de banco.

## 1. Decisão funcional

A PapeLemi deve alcançar **paridade operacional e administrativa com o Empório Lele Cute**: mesma amplitude de gestão, mesmas classes de operação, mesmos padrões de controle, auditoria, filtros e indicadores, adaptados à identidade e aos processos comerciais da PapeLemi.

A referência é o comportamento do painel e o modelo de domínio do Empório, não uma cópia cega de componentes ou de dados. O Empório usa Vite/React Router; a PapeLemi usa TanStack Start. A portabilidade deve respeitar a arquitetura TanStack existente e manter autorização server-side.

## 2. Plataforma e isolamento

- O Supabase dedicado da PapeLemi (`gpdpfoxpbferjwbppcmb`, São Paulo) é o destino central planejado para a plataforma.
- Empório Lele Cute e PapeLemi permanecem lojas distintas, com identidade, catálogo, clientes, pedidos, pagamentos, estoque, cupons, frete, conteúdo, configurações e métricas isolados por loja.
- O backend atual do Empório é Lovable-managed; não há conexão administrativa direta disponível para consultar seu banco vivo. A referência é o código Git e o backup fornecido.
- O objetivo multi-loja futuro requer `store_id` explícito em todas as tabelas store-owned, associação usuário–loja, RLS por loja e isolamento de Storage. O `store_key` atual apenas em `orders` não é isolamento multi-tenant suficiente.
- Não importar dados do Empório nem executar restore/migration nesta fase.

## 3. Evidência comparativa

| Área | Empório (referência) | PapeLemi (estado atual consultado) |
|---|---|---|
| Aplicação | Vite, React, React Router | TanStack Start, React, TypeScript |
| Banco | Backup com 150 tabelas públicas | 6 tabelas públicas |
| Migrações de origem | 199 Supabase + 15 Drizzle | 6 migrações Supabase |
| Segurança | 242 políticas públicas, 95 triggers públicos | 21 políticas, 0 triggers |
| Storage | Bucket de mídia e 224 ativos catalogados; ZIP físico ainda pendente | 0 buckets |
| Edge Functions | 54 funções no repositório | 0 implantadas |
| Admin | Painel modular com dashboard, operações, conteúdo, usuários, auditoria e ferramentas de sistema | Pedidos, produtos, categorias, frases e cupons; dashboard e segurança em PRs Draft |

### Tabelas PapeLemi existentes

- `categories`: 4 registros
- `products`: 8 registros
- `curated_phrases`: 10 registros
- `orders`: 0 registros
- `coupons`: 0 registros
- `user_roles`: 1 associação `admin` verificada

O painel atual não possui tabelas próprias para CRM de clientes, itens normalizados de pedido, eventos/ledger de pagamento, frete, produção, auditoria, preferências, mídia ou configurações avançadas. Os itens e endereços do pedido atual ficam em JSONB. A tabela `orders` é acessada pelo servidor com service role somente após a validação do papel administrativo.

## 4. Módulos de referência do Empório

### A. Núcleo comercial
- Dashboard e atividade recente
- Pedidos, detalhes, status, rastreamento e notificações
- Ateliê, produção e pós-venda
- Pagamentos e eventos financeiros
- Clientes/CRM e histórico
- Produtos, variações, personalização, estoque e imagens
- Categorias, ocasiões, tags, taxonomias, kits e coleções
- Cupons e regras comerciais
- Frete, cotações e transportadoras

### B. Conteúdo e experiência
- Home, banners e seções
- Páginas, blog, FAQ e menus
- Depoimentos, reviews e prova social
- Conteúdo por produto/PDP
- Instagram e conteúdo editorial

### C. Administração e governança
- Usuários, papéis e solicitações de acesso
- Auditoria de alterações e trilha de eventos
- Configurações da loja e preferências operacionais
- Suporte e atendimento
- Backup de dados e mídia
- Segurança, diagnósticos e controles de catálogo

### D. Crescimento e observabilidade
- SEO, sitemap, redirects, robots e merchant feed
- Busca, relatórios e analytics
- Saúde de conteúdo, imagens e catálogo
- Performance, Web Vitals, telemetria e tarefas agendadas

Módulos experimentais/labs do Empório serão inventariados e classificados separadamente; não devem ser confundidos com o núcleo operacional obrigatório.

## 5. Sequência de implementação

| Rodada | Escopo | Condição de conclusão |
|---|---|---|
| 0 | Acesso, autenticação, segurança e dashboard | Login proprietário, alteração de senha, visão geral e preview homologado |
| 1 | Shell administrativo e núcleo comercial | Navegação modular; pedidos, CRM, produtos, variações e estoque |
| 2 | Financeiro e operação | Pagamentos, eventos, frete, produção, pós-venda e notificações |
| 3 | Governança | Usuários/papéis por loja, permissões, auditoria, suporte e configurações |
| 4 | Conteúdo | CMS, home, páginas, blog, FAQs, coleções, kits e prova social |
| 5 | Crescimento e sistema | SEO, busca, analytics, mídia, backup, segurança e observabilidade |
| 6 | Homologação integrada | E2E com dados sintéticos, isolamento entre lojas, 390/768/1440 e gates de release |

As rodadas são micro-PRs independentes. Cada entrega deve ter escopo pequeno, Preview e validação antes da próxima.

## 6. Estado inicial já iniciado

- Conta administrativa da PapeLemi criada no Auth e confirmada.
- Papel `admin` atribuído e verificado em `public.user_roles`.
- PR #5: remoção do cadastro público de administradores e aba de alteração de senha. Draft; Preview Vercel READY.
- PR #7: primeira visão geral operacional, com encomendas, pendências, catálogo, categorias, clientes derivados dos pedidos e atalhos. Draft empilhada sobre PR #5; Preview Vercel READY.
- Nenhuma PR foi integrada. Nenhuma alteração de Production foi feita.

## 7. Bloqueios obrigatórios antes de DDL ou migração

1. Restaurar o dump PostgreSQL do Empório em ambiente isolado compatível e extrair row counts, FKs, sequences, órfãos e integridade.
2. Obter e verificar o ZIP físico dos 224 ativos de mídia; o dump não contém os binários.
3. Resolver a divergência entre o `project_id` em `supabase/config.toml` e o projeto PapeLemi conectado.
4. Confirmar um ambiente Supabase de homologação que não use o banco Production.
5. Resolver a autoridade de schema: o `AGENTS.md` atual proíbe editar manualmente `supabase/migrations/` e `drizzle/`; não contornar essa regra sem decisão documentada.
6. Mapear dependências das 199 migrações, 54 Edge Functions, funções, triggers e policies antes de escolher o subconjunto que compõe a plataforma.

## 8. Regras de segurança

- Não executar restore bruto de schemas internos gerenciados pelo Supabase (`auth`, `storage`, `realtime`, `vault`, `cron`).
- Não copiar sessões, refresh tokens, MFA, OAuth internos ou valores de secrets.
- Não apagar, substituir ou renomear as seis tabelas atuais da PapeLemi.
- Não misturar registros comerciais das lojas.
- Não expor service role no navegador.
- Cada operação administrativa deve validar o usuário e a loja no servidor; RLS deve impedir acesso cruzado.
- Não criar pedidos ou clientes sintéticos em Production.
- Não integrar ou publicar sem homologação e autorização explícita.

## 9. Critério de paridade

A paridade será considerada alcançada quando cada domínio obrigatório do Empório tiver um módulo equivalente funcional na PapeLemi, com os mesmos controles operacionais necessários, usando o schema central multi-loja com isolamento verificável. A existência de uma rota, card ou tela vazia não conta como implementação.
