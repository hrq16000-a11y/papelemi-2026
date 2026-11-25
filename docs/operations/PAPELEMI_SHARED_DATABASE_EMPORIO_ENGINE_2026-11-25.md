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
- O projeto de referência Empório está declarado em `supabase/config.toml` como `xfqffqxqiuqauefrrcxn`, mas não aparece nas contas Supabase conectadas e a leitura direta foi negada; o snapshot versionado veio das migrations locais, não de um dump do banco hospedado.
- O isolamento multi-loja começa na primeira migration: registro em `stores`, `store_key` nas entidades comerciais, chaves compostas e RLS por loja.
- A autenticação pode usar a mesma infraestrutura, mas papéis e dados comerciais são vinculados ao tenant. Clientes, pedidos e itens permanecem acessíveis apenas por operações server-side autorizadas.
- PapeLemi é o primeiro tenant. O tenant Empório só será provisionado depois da tenantização dos módulos restantes e sem copiar dados comerciais, mídia ou secrets.
- O seletor de loja em um clique é uma etapa de interface posterior; não adia o isolamento estrutural no banco e nos serviços.

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

- O projeto Supabase hospedado do Empório `xfqffqxqiuqauefrrcxn` não está disponível na conexão atual. O schema de referência foi reconstruído a partir das 199 migrations versionadas; isso comprova o modelo de código, não o estado do banco hospedado.
- A criação de uma branch Supabase de desenvolvimento exige confirmação de custo. Nenhuma branch adicional foi provisionada; o replay de migrations será executado em Supabase local no GitHub Actions.
- O snapshot Empório ainda não foi reconciliado integralmente com o modelo multi-tenant. Cada módulo importado precisa receber `store_key`, RLS e consultas server-side antes de ser considerado integrado.
- Preview READY e CI de frontend não comprovam integração do motor completo nem autorizam publicação em Production.

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


## 11. Estado aplicado do motor central (25/11/2026)\n\n- Migration `20261125213419_add_store_scoped_crm_and_order_items` aplicada no Supabase dedicado PapeLemi.\n- Migration `20261125214907_add_store_scoped_shipping_engine` aplicada no mesmo projeto.\n- CRM, itens normalizados, tabelas de frete, regras, provedores, auditoria e rate limit existem no banco hospedado.\n- O módulo de frete permanece desabilitado até configurar CEP de origem e credenciais próprias do provedor.\n- Nenhum dado comercial, usuário, arquivo ou segredo do Empório foi importado.\n\n## 12. Governança de migrations e aplicação

O bloco gerenciado do Lovable em `AGENTS.md` é preservado, mas o override explícito do proprietário autoriza este workstream a manter migrations versionadas no GitHub e aplicá-las de forma controlada ao Supabase dedicado PapeLemi.

- A migration deve ser aditiva, revisada no Git e validada por replay local no GitHub Actions.
- Não aplicar migrations históricas Empório cegamente sobre o banco PapeLemi.
- Não executar DDL em Production sem confirmar backup/rollback adequado e revisar o SQL final.
- A criação de uma branch Supabase de desenvolvimento retornou exigência de confirmação de custo; nenhuma branch paga foi criada. A validação desta rodada usa Supabase local em CI.
- A aplicação em Production permanece separada da validação de código/Preview; não houve alteração no banco hospedado nesta rodada.
