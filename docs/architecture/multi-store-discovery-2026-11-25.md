# Plataforma multi-loja — descoberta e decisão arquitetural inicial

**Data:** 25/11/2026  
**Status:** descoberta documentada; arquitetura proposta; nenhuma migração de banco aplicada.  
**Repositório desta documentação:** \`hrq16000-a11y/papelemi-2026\`

## 1. Decisão de direção

O Supabase dedicado da **PapeLemi** será a infraestrutura central da plataforma.

O Empório Lele Cute não será tratado como um segundo Supabase acessível. Seu backend atual é gerenciado pela Lovable. A fonte disponível para recuperação é o código exportado e o backup PostgreSQL fornecidos pelo proprietário.

O resultado pretendido é:

- uma única instância Supabase dedicada, hospedada em São Paulo;
- duas aplicações e marcas independentes;
- dados comerciais isolados por loja;
- serviços compartilhados quando fizer sentido;
- possibilidade de implementar mecanismos comuns uma vez e disponibilizá-los às duas aplicações.

**Compartilhar infraestrutura não significa compartilhar dados comerciais.** Catálogo, clientes, pedidos, pagamentos, estoque, cupons, frete, configurações e SEO permanecem associados à loja correta.

## 2. Evidências recuperadas

### 2.1 Empório Lele Cute — código-fonte

Arquivo recebido: \`emporiolelecute(1).zip\`

- ZIP: 3.769.173 bytes.
- Conteúdo extraído: 8.791.216 bytes.
- Arquivos no ZIP: 1.526.
- Arquivos TypeScript/TSX: 1.097.
- Migrações Supabase: 199 arquivos SQL.
- Migrações Drizzle: 15 arquivos SQL.
- Diretórios de Edge Functions: 54 funções, além de diretórios compartilhados e testes.
- Branch \`main\` do repositório de origem consultada: \`d01d843c266b5a32d03af22eeaac6eda4a7fcf0f\`.

SHA-256 do ZIP recebido:

\`8a6642b78ddf683a3588087a5934c9fd2d8de2310f8de0f6e24fb3a6c34633fb\`

O ZIP contém um arquivo \`.env\` com nomes de variáveis públicas \`VITE_*\`. Seus valores não são reproduzidos nesta documentação. Nenhum segredo deve ser copiado para Git, artefatos públicos ou variáveis de navegador.

### 2.2 Empório Lele Cute — backup PostgreSQL

Arquivo recebido: \`emporiolelecute_261125.backup(2).zip\`

- ZIP: 10.947.064 bytes.
- Arquivo interno: 10.946.908 bytes.
- Formato identificado: PostgreSQL Custom Archive (\`PGDMP\`).
- Cabeçalho do arquivo: servidor PostgreSQL 17.6; ferramenta de dump 18.7.
- SHA-256 do ZIP recebido:

\`235a523965b8fd8cf2812a2afe59209c4f4af4b86fcdff140b3765edeef60896\`

O inventário abaixo vem do catálogo do arquivo custom, não de uma restauração executada. A contagem de registros por tabela ainda precisa ser extraída e conferida em ambiente isolado.

| Objeto no catálogo do backup | Quantidade |
|---|---:|
| Definições de tabelas | 199 |
| Entradas de dados de tabela (COPY) | 201 |
| Tabelas no schema \`public\` | 150 |
| Funções PostgreSQL | 143 |
| Triggers | 108 |
| Índices | 403 |
| Políticas | 250 |
| Views | 4 |
| Materialized views | 1 |
| Foreign keys | 68 |
| Constraints | 253 |
| Types | 20 |
| Extensions declaradas | 8 |
| Schemas | 10 |

O backup inclui objetos de aplicação e schemas internos do Supabase, como \`auth\`, \`storage\`, \`realtime\`, \`vault\`, \`cron\`, \`drizzle\` e \`supabase_migrations\`.

Esses schemas internos **não devem ser restaurados cegamente** sobre o projeto Supabase de destino. Devem ser recriados/geridos pelos serviços nativos do Supabase e migrados apenas pelos procedimentos compatíveis.

### 2.3 PapeLemi — Supabase dedicado atual

Projeto conectado e consultado: \`gpdpfoxpbferjwbppcmb\`.

- Região: \`sa-east-1\` (São Paulo).
- Estado: \`ACTIVE_HEALTHY\`.
- PostgreSQL: 17.12.
- Tabelas públicas: 6.
- Políticas RLS públicas: 21.
- Funções públicas: 2.
- Triggers públicos: 0.
- Índices públicos: 11.
- Buckets Storage: 0.
- Edge Functions implantadas: 0.
- Dados atuais: 4 categorias, 8 produtos, 10 frases; 0 pedidos, 0 cupons e 0 papéis administrativos.

Migrações aplicadas: 6.

O schema atual tem \`store_key\` somente em \`orders\`. Categorias, produtos, cupons, frases e papéis ainda não formam um modelo multi-loja completo. Não existe cadastro central de lojas nem associação de administradores por loja.

### 2.4 Divergência de configuração a resolver

No estado consultado do repositório PapeLemi, \`supabase/config.toml\` aponta para \`jqrltspasvgygrmdlgag\`, enquanto o README e o projeto Supabase conectado/ativo apontam para \`gpdpfoxpbferjwbppcmb\`.

Não executar comandos de migração via Supabase CLI até reconciliar essa divergência e confirmar o vínculo do projeto. Esta documentação não altera a configuração.

## 3. O que significa importar integralmente

A meta é preservar todos os dados de negócio e os recursos de aplicação recuperáveis do Empório, mas não executar um restore bruto do banco gerenciado da Lovable.

A importação será dividida por domínio:

1. **Schema de aplicação:** tabelas, colunas, tipos, constraints, índices, views, materialized views, funções, triggers e políticas, revisados e adaptados ao modelo multi-loja.
2. **Dados de aplicação:** registros de todas as tabelas públicas, com contagens de origem/destino, chaves, relações e checksums quando aplicáveis.
3. **Auth:** não copiar tabelas internas de sessões, refresh tokens, MFA e OAuth diretamente. Inventariar usuários e identidades e definir procedimento suportado de migração/recriação, preservando relações de usuário com os dados.
4. **Storage:** migrar metadados e binários. O dump contém metadados de Storage, mas não os binários dos objetos.
5. **Secrets e integrações:** não copiar credenciais em texto ou ciphertext de um ambiente para outro. Recriar credenciais no Vault/ambiente de servidor e atualizar as referências.
6. **Jobs e serviços gerenciados:** recriar cron, Realtime, Auth e demais recursos por configuração/API suportada, não por cópia das tabelas internas.
7. **Edge Functions:** auditar individualmente as 54 funções, dependências, variáveis, permissões e compatibilidade; portar somente após revisão.

## 4. Mídia — dependência externa ao dump

\`docs/disaster-recovery-media.md\` do Empório documenta 224 ativos catalogados no bucket \`product-images\` e um fluxo separado de exportação física em ZIP, com manifesto, tamanho e SHA-256.

O backup PostgreSQL fornecido não contém os binários desses 224 arquivos. O ZIP do código contém 17 arquivos em \`public/\`, que não substituem o backup físico do Storage.

Portanto, a migração de mídia só poderá ser declarada completa depois de receber/exportar o ZIP físico correspondente e verificar 100% dos arquivos por tamanho e checksum.

## 5. Arquitetura multi-loja proposta

### 5.1 Identidade da loja

Criar um registro central de lojas com identificador UUID imutável e chave legível única, por exemplo:

- \`papelemi\`
- \`emporio-lele-cute\`

Manter domínios/canonical hosts associados à loja em registro próprio. A aplicação deve resolver a loja pelo host configurado no servidor; não confiar exclusivamente em um \`store_key\` enviado pelo navegador.

### 5.2 Dados comerciais

Adicionar \`store_id\` com FK para a loja em todas as tabelas cujo conteúdo pertença a uma operação comercial. Isso inclui, conforme inventário e dependências, catálogo, taxonomias, kits, coleções, clientes, pedidos, itens, pagamentos, cupons, frete, pós-venda, conteúdo, configurações, mídia e SEO.

Índices e constraints de unicidade devem considerar \`store_id\` quando a unicidade for local à loja. Preservar os IDs de origem sempre que possível e manter mapeamentos de IDs durante a migração.

A coluna \`orders.store_key\` atual da PapeLemi deve ser mantida temporariamente por compatibilidade, com backfill para a nova referência central antes de qualquer remoção futura.

### 5.3 Auth e autorização

A identidade de autenticação pode ser central, mas o acesso comercial será concedido por associação explícita usuário–loja:

- proprietário/plataforma: acesso global auditado;
- proprietário/administrador da loja: acesso somente à loja concedida;
- operadores e consulta: permissões específicas por loja.

O papel global \`admin\` atual da PapeLemi não é suficiente para o modelo final. A autorização precisa ser verificada no servidor e reforçada por RLS em cada tabela tenantizada.

### 5.4 Recursos compartilhados

Compartilhar implementação e serviços não significa compartilhar configurações comerciais. Cada loja terá credenciais e configurações próprias para pagamentos, frete, e-mail, domínio, SEO e integrações.

Secrets ficam em mecanismos de servidor/Vault, nunca em colunas públicas ou bundles \`VITE_*\`. Buckets e caminhos de mídia terão isolamento por loja e política própria.

### 5.5 Dados compartilhados de propósito

Qualquer dado realmente global deverá ser explicitamente classificado como compartilhado. Não usar \`store_id IS NULL\` como atalho para misturar registros comerciais.

## 6. Regras de segurança e integridade

- Não executar restore direto no Supabase de produção.
- Não apagar nem substituir as seis tabelas atuais da PapeLemi.
- Não importar \`auth.users\`, sessões, MFA, refresh tokens ou \`vault.secrets\` em massa sem procedimento compatível e homologado.
- Não copiar \`internal_function_secrets\` ou \`operational_worker_credentials\` como dados comuns.
- Preservar dados originais e IDs; documentar qualquer transformação.
- Não reativar tracking com IP/GPS/dispositivo sem revisar consentimento, finalidade, retenção e base legal.
- RLS deve impedir que uma loja leia ou altere pedidos, clientes, pagamentos ou dados privados da outra.
- Testes de isolamento devem tentar explicitamente acesso cruzado entre as duas lojas.
- Não usar o banco de produção em testes destrutivos ou de carga.
- Nenhuma troca de conexão do Empório para o novo banco antes de backup, homologação e plano de rollback.

## 7. Plano de execução em rodadas

| Rodada | Escopo | Gate de saída |
|---|---|---|
| 1 | Inventário do backup e restore isolado | Catálogo completo, row counts e integridade conferidos |
| 2 | Mapeamento das 150 tabelas públicas e dependências | Matriz por loja/global/operacional/legado aprovada |
| 3 | Modelo multi-loja e plano de migração | DDL revisado, RLS e plano de rollback |
| 4 | Migração em ambiente isolado | Dados e relações conferidos sem tocar produção |
| 5 | Storage, Auth, Edge Functions e secrets | Binários e identidades reconciliados; funções homologadas |
| 6 | Integração da PapeLemi | Fluxos comerciais isolados e aprovados |
| 7 | Integração do Empório | Aplicação aponta para a plataforma central em homologação |
| 8 | Corte controlado | Backup final, validação ponta a ponta e autorização de produção |

## 8. Pendências antes da primeira alteração de banco

- Extrair o inventário completo do custom dump usando ferramentas PostgreSQL compatíveis e restaurá-lo em ambiente isolado.
- Obter row counts e dependências de todas as tabelas.
- Obter o ZIP físico de mídia do Empório, com manifesto e hashes.
- Definir como migrar identidades Auth sem importar sessões e segredos internos.
- Resolver a divergência de \`supabase/config.toml\`.
- Criar um ambiente de homologação separado do banco de produção.
- Classificar as 54 Edge Functions e as 143 funções PostgreSQL por dependência e criticidade.

## 9. Estado desta entrega

Esta rodada é **somente descoberta e documentação**.

Nenhuma migration foi criada/aplicada. Nenhum dado foi importado. Nenhuma tabela, usuário, bucket, função, segredo ou política foi alterado. Nenhum domínio ou deployment foi modificado.

A próxima execução deve começar pela restauração isolada e pelo inventário de dados, não pela aplicação de SQL no banco de produção.
