# Confirmação: backend de origem é single-store

**Data:** 25/11/2026  
**Fonte:** ZIP do código Empório Lele Cute, branch \`main\` consultada e catálogo do backup PostgreSQL.  
**Status:** análise estática; sem alteração de código ou banco.

## Resultado

A busca estática em \`src/\`, \`supabase/\` e \`drizzle/\` não encontrou os marcadores \`store_id\`, \`tenant_id\`, \`store_key\`, \`tenant_key\` ou \`store_slug\`.

O Empório foi construído como uma aplicação de loja única. O nome \`store_settings\` não representa isolamento multi-loja: é uma tabela de configuração chave/valor consultada por frontend e Edge Functions usando a chave de configuração, sem identificador de loja.

Também há configurações singleton, por exemplo \`shipping_settings\` e \`social_proof_settings\`, que hoje representam uma única operação comercial.

## Impacto

Não basta adicionar uma coluna de loja em \`orders\`.

O isolamento precisa cobrir:

- as 150 tabelas de aplicação;
- as 143 funções PostgreSQL;
- as 108 triggers;
- as 250 políticas do catálogo do backup;
- as 54 Edge Functions;
- os consumidores no frontend e no painel administrativo.

Cada query, RPC, trigger, worker, cron e relatório que lê ou altera dados comerciais precisa receber e validar o contexto da loja.

## Requisitos de tenantização

1. Definir uma loja por UUID imutável.
2. Resolver o domínio da requisição no servidor e obter o \`store_id\` confiável.
3. Adicionar FK \`store_id\` às tabelas de domínio comercial.
4. Atualizar unique constraints e índices para incluir \`store_id\` quando a unicidade for local.
5. Atualizar funções SQL, triggers e policies para filtrar e autorizar pelo \`store_id\`.
6. Atualizar Edge Functions para resolver a loja e impedir que o cliente escolha outra loja por payload.
7. Atualizar hooks, consultas e painéis para sempre operar no escopo autorizado.
8. Criar testes negativos de acesso cruzado para cada domínio sensível.

## Configurações e serviços

Configurações de SEO, frete, redes sociais, notificações, pós-venda, CMS e tracking não devem permanecer singleton quando representam a operação comercial.

Credenciais de integração são separadas por loja e armazenadas em segredos de servidor/Vault, nunca em configurações públicas.

## Conclusão

O backup do Empório continua sendo a fonte para recuperar a estrutura e os dados. Entretanto, o schema original precisa passar por uma transformação multi-loja sistemática. Restaurá-lo literalmente na PapeLemi manteria o comportamento single-store e criaria risco de mistura de dados.
