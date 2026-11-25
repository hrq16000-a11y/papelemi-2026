# PapeLemi — Banco central e motor operacional integral da Empório Lele Cute

**Data:** 25/11/2026  
**Prioridade:** máxima — PapeLemi primeiro  
**Repositório PapeLemi:** https://github.com/hrq16000-a11y/papelemi-2026  
**Repositório de referência:** https://github.com/hrq16000-a11y/emporiolelecute-2026  
**Destino Supabase central:** `gpdpfoxpbferjwbppcmb` (São Paulo)  
**Referência Supabase Empório:** `xfqffqxqiuqauefrrcxn` (não acessível na conexão atual)

## 1. Decisão do proprietário

O Supabase dedicado da PapeLemi será a base central planejada. A PapeLemi receberá o motor operacional integral da Empório Lele Cute e será homologada primeiro. Posteriormente, a Empório passará a utilizar o mesmo projeto Supabase.

A PapeLemi deve funcionar como e-commerce completo, com o painel administrativo Empório integral, adaptado somente na identidade, catálogo, configurações e dados próprios da PapeLemi.

## 2. Inventário de código Empório

Referência: branch `main`, HEAD `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`.

| Ativo | Quantidade |
|---|---:|
| Migrations SQL Supabase | 199 |
| Tabelas tipadas | 155 |
| Funções/RPCs tipadas | 63 |
| Views tipadas | 5 |
| Edge Functions | 54 |
| Páginas administrativas | 120 |
| Componentes administrativos | 411 |

O painel está organizado em Core, Content, Discovery, Executive, Intelligence, System, Site, Settings, SEO Advanced e Labs.

## 3. Destino e isolamento

- Projeto Supabase central: `gpdpfoxpbferjwbppcmb`, região `sa-east-1`, status `ACTIVE_HEALTHY`.
- A URL pública de produção da PapeLemi foi confirmada no Vercel como `https://gpdpfoxpbferjwbppcmb.supabase.co`.
- O projeto de referência Empório está declarado em `supabase/config.toml` como `xfqffqxqiuqauefrrcxn`, mas não aparece nas contas Supabase conectadas e a leitura direta foi negada.
- A arquitetura final deve permitir um único banco PostgreSQL e isolamento absoluto dos dados por loja. O mecanismo (schemas separados ou tenancy/RLS) será decidido após análise das migrations e homologação.
- A autenticação poderá ser compartilhada, mas papéis, catálogo, pedidos, clientes, mídia e configurações permanecem separados por loja.
- O seletor de loja em um clique é uma etapa posterior à conclusão da PapeLemi.

## 4. O que será integrado

O motor completo necessário do Empório: estrutura relacional, tabelas, constraints, índices, enums, funções, views, triggers, políticas RLS, Storage, Edge Functions, regras comerciais, operações de catálogo e pedidos, CRM, pagamentos, frete, pós-venda, conteúdo, SEO, analytics, suporte, auditoria, usuários e todas as telas administrativas.

Não omitir módulos avançados do painel: devem ser trazidos e classificados como operacionais, avançados ou experimentais, sem removê-los da estrutura.

## 5. O que não será importado

Não copiar os dados comerciais ou os ativos de marca da Empório: produtos, preços, estoque, clientes, pedidos, cupons, reviews, depoimentos, campanhas, fotos, vídeos, logo, conteúdo editorial, domínio, credenciais, tokens ou secrets.

Copiar o motor e o código; manter os dados e a identidade de cada loja próprios.

## 6. Compatibilidade atual

O Supabase PapeLemi possui 6 migrations e as tabelas públicas:
- `categories`: 4 registros;
- `products`: 8 registros;
- `curated_phrases`: 10 registros;
- `coupons`: 0 registros;
- `orders`: 0 registros;
- `user_roles`: 1 registro.

Há diferenças de modelo que precisam ser reconciliadas. Por exemplo, PapeLemi usa endereço/itens em JSONB em `orders`; Empório tem colunas de endereço e tabela normalizada `order_items`. Produtos e categorias também têm campos e chaves diferentes.

Preservar os dados PapeLemi e criar compatibilidade por migrations aditivas e funções de transição. Não restaurar dump bruto, não apagar tabelas e não sobrescrever dados.

## 7. Sequência de execução

1. Recuperar schema completo e histórico de migrations Empório, reconciliando o código versionado com o banco hospedado.
2. Definir a arquitetura de isolamento e o contrato de autenticação/roles.
3. Integrar o schema completo ao Supabase central PapeLemi, preservando o catálogo existente.
4. Atualizar tipos gerados e repositórios/server functions da PapeLemi.
5. Portar o painel administrativo integral (120 páginas/411 componentes), mantendo funcionalidades e identidade PapeLemi.
6. Integrar as 54 Edge Functions e dependências realmente necessárias, com secrets próprios PapeLemi.
7. Homologar pedidos, CRM, catálogo, personalização, pagamento, frete, pós-venda, CMS, mídia, SEO, analytics, suporte, auditoria e permissões.
8. Depois da PapeLemi aprovada, preparar a migração da Empório para o mesmo projeto, sem importar dados de uma loja na outra.

Cada etapa deve ser entregue em micro-PR, com build, testes e validação de banco apropriados. Nenhuma alteração em Production antes de validação do caminho de migração.

## 8. Bloqueios objetivos atuais

- A conexão Supabase atual dá acesso ao projeto PapeLemi, mas não ao projeto Empório `xfqffqxqiuqauefrrcxn`. É necessário conectar esse projeto ou fornecer dump/schema completo sem dados pessoais e sem secrets para confirmar o estado hospedado.
- O `AGENTS.md` do PapeLemi mantém instrução gerenciada pelo Lovable para alterações de schema. A conexão Lovable falhou nesta sessão; não editar migrations manualmente nem aplicar DDL diretamente enquanto a governança não for resolvida.
- O projeto PapeLemi já tem Preview READY e CI aprovado para a base inicial, mas isso não significa que o motor Empório esteja integrado.

## 9. Critério de 100%

Somente declarar concluído após validar schema/RLS/Storage, todos os módulos administrativos, Edge Functions, persistência, autenticação, pagamentos, frete, webhooks, privacidade, dados próprios PapeLemi, responsividade 390/768/1440 e fluxos reais de ponta a ponta.


## 10. Achados de segurança/compatibilidade do Supabase PapeLemi — 25/11/2026

Consulta dos advisors Supabase no projeto central:

- \`public.orders\`: RLS habilitado, sem políticas. O advisor classifica como INFO. A implementação atual protege pedidos com acesso server-side; a função \`listOrders\` usa cliente privilegiado somente depois de \`requireAdmin\`.
- O painel Empório atual consulta pedidos diretamente do browser em componentes como \`AdminDashboard\` e \`AdminOrders\`. Essas consultas não funcionarão sem adaptação no PapeLemi.
- **Decisão técnica para a portabilidade:** manter pedidos privados no browser e adaptar os módulos administrativos para server functions com autorização de administrador, salvo se uma política RLS administrativa estreita e comprovadamente segura for necessária. Não abrir leitura pública de pedidos.
- Auth: proteção contra senhas vazadas está desabilitada (advisor WARN). Deve ser habilitada antes da liberação comercial.
- Quatro índices foram classificados como não utilizados. Como a loja ainda tem zero pedidos, não remover índices neste momento; reavaliar após tráfego real.

Esses achados demonstram por que copiar as páginas administrativas sem adaptar a camada de dados não constitui integração funcional.
