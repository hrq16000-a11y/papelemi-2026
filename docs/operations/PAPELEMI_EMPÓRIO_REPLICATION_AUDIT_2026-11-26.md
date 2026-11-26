# PapeLemi — auditoria de paridade Empório e transferência

**Data:** 26/11/2026  
**Repositório destino:** hrq16000-a11y/papelemi-2026  
**Repositório fonte:** hrq16000-a11y/emporiolelecute-2026  
**Fonte fixada:** main @ d01d843c266b5a32d03af22eeaac6eda4a7fcf0f  
**Destino main:** f29417de4ead641d0b2b275535a963208b2360a3  
**Branch de transferência:** feat/emporio-admin-replica-01-20261126

## 1. Paridade de código comprovada

| Métrica | Empório | PapeLemi no HEAD atual da PR #13 |
|---|---:|---:|
| Arquivos versionados | 1.526 | 187 |
| Páginas em src/pages/admin | 120 | 0 |
| Componentes em src/components/admin | 411 | 2 |
| Hooks | 69 | — |
| Bibliotecas em src/lib | 284 | — |
| Migrations SQL Supabase | 199 | 12 |
| Migrations SQL Drizzle | 15 | 2 |
| Arquivos em supabase/functions | 75 | 0 |
| Edge Functions de entrada | 54 | 0 |

Dos caminhos existentes nos dois repositórios, 75 têm o mesmo caminho e apenas 6 possuem blob idêntico. Esses seis são drizzle.config.ts, drizzle/schema.ts, src/components/ui/aspect-ratio.tsx, src/hooks/use-mobile.tsx, src/integrations/supabase/previewAuthStorage.ts e src/lib/utils.ts. Nenhum representa uma página administrativa original completa.

## 2. Diferença arquitetural relevante

- Empório: Vite 5, React 18, React Router 7, TanStack Query, Supabase e uma aplicação com 120 páginas administrativas.
- PapeLemi: Vite 8, React 19 e TanStack Start/Router, com SSR e uma única rota administrativa atual src/routes/admin.tsx, organizada em nove abas.
- Portanto, a transferência não deve sobrescrever a aplicação PapeLemi nem importar páginas isoladas sem resolver router, dependências, auth e contratos de dados.
- A transferência inicial preserva o código original em apps/emporio-admin/source; a etapa seguinte o integra como aplicação administrativa isolada, preservando o storefront SSR da PapeLemi.

## 3. PRs e branches preservadas

- PR #12: frete e checkout, aberta Draft.
- PR #13: catálogo e ciclo de vida, aberta Draft; HEAD observado 73cd9895eedc237830ba490e62f549d75665ab65.
- PR #15: operações de pedidos 360°, aberta Draft; HEAD be731c1befb968197867213fd89e6929be387001. Sua base registrada era anterior ao HEAD mais recente da PR #13; requer reconciliação antes de integração.
- PR #16: eventos idempotentes de pagamento, aberta Draft; HEAD ebb07f966fd9bd0256cce80a2f09670346fe4e66.
- Nenhuma dessas PRs foi integrada ou descartada nesta etapa.

## 4. Banco PapeLemi — estado hospedado read-only

Projeto gpdpfoxpbferjwbppcmb, região sa-east-1, estado ACTIVE_HEALTHY.

- 15 tabelas públicas, 30 policies RLS, 4 funções públicas, 0 views, 0 triggers, 3 enums, 0 buckets Storage e 0 Edge Functions implantadas.
- 10 migrations registradas no Supabase Production.
- Dados existentes observados: 4 categorias, 8 produtos, 10 frases, 0 cupons, 0 pedidos e 1 usuário/registro de papel administrativo.
- As migrations de catálogo lifecycle e Order 360 presentes nos branches ainda não constam na lista de migrations aplicadas em Production.

## 5. Banco Empório — limite de acesso

O repositório Empório declara o projeto Supabase de origem xfqffqxqiuqauefrrcxn. O projeto não aparece nas conexões Supabase disponíveis nesta sessão; a tentativa de leitura recebeu permissão negada. Assim, os 155 tabelas, 63 funções/RPCs, 5 views e 54 Edge Functions são inventário do código versionado/documentação do repositório, não uma inspeção atual do banco hospedado.

## 6. Segurança da transferência

A origem permanece somente leitura. O snapshot não copia .env, .env.example, supabase/config.toml, supabase/seed.sql, src/data, src/assets, public, mídia, catálogo, dados de clientes/pedidos, arquivos comerciais ou credenciais da Empório.

As 199 migrations e 54 Edge Functions serão tratadas como código-fonte para reconciliação. Não serão reproduzidas cegamente nem aplicadas diretamente em Production. O banco PapeLemi e seus registros atuais serão preservados.

## 7. Próxima integração

1. Integrar o snapshot administrativo original como aplicação isolada sob /admin, com identidade visual PapeLemi e Supabase PapeLemi.
2. Adaptar autenticação e autorização ao papel admin com store_key='papelemi'.
3. Reconciliar o schema original com as tabelas atuais sem apagar registros; homologar migrations em banco local/isolado.
4. Conectar Storage, Edge Functions e serviços, um conjunto funcional por vez.
5. Homologar dashboard, catálogo, clientes, pedidos, pagamentos, fretes, personalizações e demais módulos antes de qualquer publicação.

**Estado desta etapa:** auditoria concluída; transferência em lote do código original iniciada em branch isolada. Sem merge, sem deploy Production e sem alterações no Supabase hospedado.

## 8. Reconciliação dos tipos e divergência do schema

A leitura dos tipos gerados em src/integrations/supabase/types.ts acrescenta uma verificação importante:

- Empório: 150 definições de tabelas no tipo público gerado.
- PapeLemi: 15 definições de tabelas no tipo público gerado.
- 12 nomes de tabelas coincidem; 138 nomes do snapshot Empório não aparecem no tipo PapeLemi.
- PapeLemi possui três tabelas próprias no snapshot de tipos: curated_phrases, shipping_quote_rate_limits e stores.
- O inventário/documentação anterior da Empório informa 155 tabelas, cinco a mais que as 150 presentes no arquivo types.ts. Essa diferença precisa ser reconciliada com o schema hospedado quando houver acesso de leitura ao projeto de origem.

As 12 tabelas com nomes coincidentes são categories, coupons, customers, order_items, orders, product_personalizations, products, shipping_carrier_services, shipping_providers, shipping_rate_rules, shipping_zones e user_roles. Seus contratos não são iguais: products, orders, categories, coupons e order_items apresentam diferenças relevantes de colunas. Portanto, não se pode substituir o types.ts ou as tabelas atuais por cópia direta.

A migration Order 360 da PR #15 já adiciona parte das tabelas de histórico e pagamento que ainda não aparecem no types.ts gerado. A etapa de schema deverá atualizar os tipos após a reconciliação, sem perder essas contribuições.

## 9. Aplicação administrativa original — adaptação iniciada

Foi criada a aplicação isolada em apps/emporio-admin/adapter, reutilizando as páginas originais e 119 declarações de carregamento de rotas administrativas extraídas do App.tsx da Empório.

- React 18, React Router 7 e Vite 5 permanecem isolados do storefront TanStack Start.
- O HashRouter preserva as rotas administrativas originais dentro do bundle estático.
- A prévia privada está disponível na rota /admin-original.
- A autenticação aponta para as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY da PapeLemi.
- A checagem administrativa foi adaptada para has_store_role com store_key=papelemi.
- Logo, nome, paleta e tipografia foram adaptados para PapeLemi.
- Dados de contato e redes sociais padrão da Empório foram retirados da página de configurações; o e-mail padrão foi substituído pelo e-mail administrativo informado para PapeLemi.

O build isolado está sendo homologado no GitHub Actions. O painel ainda depende da reconciliação do schema, das Edge Functions e dos serviços para operar integralmente.
