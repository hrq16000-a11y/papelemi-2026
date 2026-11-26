# PapeLemi — transferência do schema operacional Empório

**Status:** migration candidata versionada na PR #13. Não aplicada ao Supabase Production e não publicada.

## Origem e evidência

- Repositório de origem: `hrq16000-a11y/emporiolelecute-2026`
- Commit-fonte fixado: `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`
- O schema foi reconstruído por replay local das 199 migrations do repositório de origem, sem consultar o banco hospedado do Empório.
- A reconstrução contém 144 tabelas, 84 funções, 94 triggers, 234 políticas RLS, 306 índices, 4 views e 5 tipos enum.
- A reconstrução não é apresentada como inventário confirmado do banco hospedado.

## Estado atual da PapeLemi

Consulta read-only ao projeto dedicado `gpdpfoxpbferjwbppcmb` em 26/11/2026:

- Schema `public`: 15 tabelas, 4 funções, 0 triggers, 30 políticas RLS, 40 índices e 0 views.
- Dados preservados: 8 produtos, 4 categorias, 0 cupons, 0 clientes, 0 encomendas e 0 itens de encomenda.
- Existe 1 papel administrativo em `public.user_roles` para `store_key='papelemi'`.
- Não havia buckets em `storage.buckets` na consulta.

## Estratégia desta etapa

A migration `20261126000000_create_papelemi_engine_schema.sql` cria o schema isolado `papelemi_engine` no mesmo projeto Supabase da PapeLemi. Isso evita sobrescrever as 15 tabelas atuais de `public`, cujos contratos diferem do schema original.

- Reproduz os 144 objetos de tabela, 84 funções, 94 triggers, 234 políticas RLS, 306 índices, 4 views e 5 enums.
- Mantém RLS habilitado em todas as 144 tabelas.
- O cliente do painel original encaminha `.from()` e `.rpc()` para `papelemi_engine`; Auth e Storage continuam no mesmo projeto PapeLemi.
- Copia somente o papel `admin` já existente da PapeLemi para `papelemi_engine.user_roles` no momento da aplicação.
- Não copia catálogo, clientes, encomendas, mídias, usuários ou segredos do Empório.
- Cria o bucket vazio `product-images` somente se não existir; se já existir com configuração diferente, a migration aborta em vez de sobrescrever.
- Acesso ao schema fica restrito a `authenticated` e `service_role` nesta fase. `anon` não recebe grants de tabelas ou RPCs. A vitrine continua usando o schema público existente.
- Funções usam `search_path` fixo, priorizando `papelemi_engine`, depois `pg_catalog` e os schemas auxiliares necessários.
- Referências de URL, storage, domínio e defaults de marca foram adaptadas para PapeLemi.

## Segurança e limites

- Não há `DROP TABLE`, `TRUNCATE` ou importação de dados comerciais nesta migration.
- Grants de `TRUNCATE`, `TRIGGER` e `REFERENCES` foram removidos dos papéis de API.
- Grants diretos a `anon` no schema do motor foram removidos nesta fase.
- O backup `emporiolelecute_261125.backup.zip` foi localizado em quatro cópias na Biblioteca (10.947.064 bytes cada), mas a ferramenta não liberou os bytes para inspeção/restauração. Não foi possível validar sua data ou conteúdo.
- A conexão do projeto Supabase de origem não está autorizada. Não houve leitura ou escrita no banco do Empório.
- Nenhuma migration foi aplicada em Production. Nenhum deployment Production foi iniciado.

## Bloqueio funcional ainda aberto

A vitrine PapeLemi continua usando `public`; o painel original passa a usar `papelemi_engine`. As 8 linhas de produto e 4 categorias atuais continuam preservadas em `public` e ainda não foram copiadas para o novo schema.

Portanto, esta etapa entrega a estrutura isolada e o adaptador de consultas do painel, mas **a loja ainda não está em paridade ponta a ponta**. A próxima etapa precisa mapear os dados próprios da PapeLemi, unificar catálogo/checkout/pedidos entre vitrine e painel, revisar as 75 Edge Functions e seus segredos, e só então homologar os fluxos completos.

A aplicação em Production permanece bloqueada até que o backup seja acessível, o plano de rollback esteja comprovado e a migration passe no replay local e na revisão final.
