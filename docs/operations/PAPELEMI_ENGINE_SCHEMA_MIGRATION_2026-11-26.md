# PapeLemi — schema operacional isolado do Empório

## Origem e limite de evidência

- Snapshot: `docs/operations/reference/EMPORIO_PUBLIC_SCHEMA_2026-11-25.sql`
- Repositório de origem: `hrq16000-a11y/emporiolelecute-2026`
- Commit de origem: `d01d843c266b5a32d03af22eeaac6eda4a7fcf0f`
- O snapshot foi reconstruído por replay local das migrations fixadas; não é uma consulta direta ao banco Production do Empório.
- O projeto Supabase de origem não está disponível nas conexões atuais. O backup anteriormente catalogado não teve seus bytes disponibilizados para comparação.

## Conteúdo do snapshot

144 tabelas, 84 funções, 94 triggers, 234 políticas RLS, 306 índices, 4 views e 5 tipos.

A instrução de limpeza da tabela temporária `tmp_users_pag` foi excluída da migration da PapeLemi.

## Estratégia

A migration cria o schema `papelemi_engine` dentro do Supabase dedicado da PapeLemi. O schema `public` atual permanece preservado, inclusive seus produtos, categorias, configurações e demais registros.

O adaptador do painel original passa a consultar `papelemi_engine`. A identidade Auth já existente da proprietária e somente sua atribuição administrativa PapeLemi são reutilizadas. Nenhum usuário, produto, cliente, pedido, mídia ou segredo do Empório é importado.

O bucket vazio `product-images` é criado com as configurações públicas e limites da origem. Os arquivos de mídia não são copiados.

## Estado da publicação

Esta é uma migration versionada e candidata, ainda não aplicada ao Supabase Production. A aplicação exige backup verificável, revisão final do SQL, plano de rollback e autorização explícita da proprietária.
