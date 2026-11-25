# Bloqueios e pré-condições — plataforma multi-loja

**Data:** 25/11/2026  
**Status:** registro de descoberta; sem alteração de produção.

## 1. Governança do repositório ainda aponta para o backend antigo

O \`AGENTS.md\` atual da PapeLemi contém instruções do bloco Lovable que dizem que o banco é gerenciado pela Lovable e proíbem editar \`supabase/migrations/\` diretamente.

Isso conflita com a decisão atual do proprietário: usar o Supabase dedicado da PapeLemi como banco central e conduzir a evolução controlada pelo GitHub.

Não remover nem sobrescrever o bloco automaticamente. Antes da primeira migration central, revisar a governança do projeto, confirmar como a sincronização Lovable está sendo usada e registrar a autoridade de schema no Supabase dedicado.

## 2. Identificador de projeto Supabase divergente

- Projeto conectado e ativo: \`gpdpfoxpbferjwbppcmb\`.
- Região: \`sa-east-1\`.
- \`supabase/config.toml\` no Git atual: \`jqrltspasvgygrmdlgag\`.

O identificador do arquivo local não corresponde ao projeto conectado consultado. Não executar \`supabase link\`, \`db push\`, \`migration up\` ou restore até reconciliar o vínculo.

## 3. Não existe ambiente de homologação confirmado

O projeto Supabase consultado é a base dedicada ativa da PapeLemi. Não foi confirmado um banco separado de staging.

Antes de restaurar ou aplicar mudanças estruturais, provisionar/confirmar um ambiente isolado. Vercel Preview não deve apontar para o banco de produção para testes de migração, seed destrutivo, pagamentos ou pedidos sintéticos.

## 4. Backup físico do Storage ausente

A documentação do Empório informa 224 ativos catalogados e um fluxo de exportação física separado. O pacote recebido contém código e dump PostgreSQL, não o ZIP autossuficiente de mídia.

Solicitar o ZIP de mídia com \`manifest.json\`, tamanho e SHA-256. Não declarar migração completa de Storage apenas porque \`storage.objects\` foi restaurado.

## 5. Autenticação e segredos precisam de migração própria

O dump contém schemas internos do Supabase e tabelas de credenciais operacionais. Não restaurar diretamente sessões, refresh tokens, MFA, OAuth interno ou Vault.

Inventariar usuários e vínculos, escolher um fluxo suportado para recriar/migrar identidades, e reemitir credenciais externas no ambiente de destino.

## 6. Contagem de registros ainda pendente

O catálogo do arquivo custom confirma definições e objetos, mas as contagens de registros por tabela ainda não foram extraídas. A próxima etapa técnica é restaurar o dump em PostgreSQL isolado compatível, gerar relatório de contagens, FKs órfãs, sequences, checksums e integridade.

## Regra de bloqueio

Enquanto os itens acima não estiverem resolvidos, limitar o trabalho a inventário, documentação, desenho e testes isolados. Não alterar o schema de produção nem redirecionar o Empório para a base PapeLemi.


## 7. Restaurador PostgreSQL indisponível no executor desta rodada

Os arquivos ZIP foram localizados e lidos no ambiente de trabalho. Entretanto, este executor não possui `pg_restore`, `psql` ou Docker instalados, e não conseguiu acessar o repositório de pacotes para instalar o cliente PostgreSQL.

O dump é um PostgreSQL Custom Archive (servidor 17.6, dump tool 18.7). Não tentar tratá-lo como SQL texto nem executar seu conteúdo diretamente em produção.

A restauração precisa ocorrer em um ambiente PostgreSQL isolado e compatível, com `pg_restore` adequado. Até lá, manter a atividade em inventário estático e documentação.

## 8. Homologação Supabase isolada e custo

A opção de criar uma development branch no projeto PapeLemi foi consultada. O preço retornado para a branch é **US$ 0,01344 por hora**. Nenhuma branch foi criada.

A criação exige aprovação explícita do proprietário para esse custo recorrente. Uma branch Supabase também nasce sem os dados de produção; ela serve para testar migrações e RLS, não substitui o restore do backup Empório.
