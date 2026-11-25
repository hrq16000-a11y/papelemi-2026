# Compatibilidade de schema — Empório Lele Cute × PapeLemi

**Data:** 25/11/2026  
**Status:** análise preliminar; sem DDL ou alteração de dados.

Este documento registra diferenças concretas entre o schema público do backup do Empório e as seis tabelas públicas atuais da PapeLemi. A decisão final de modelo será feita depois do restore isolado e da análise de todas as dependências.

## 1. Catálogo

| Conceito | Empório (backup) | PapeLemi (atual) | Consequência |
|---|---|---|---|
| Produto PK | \`products.id UUID\` | \`products.slug TEXT\` | Não reutilizar slug como PK no modelo central |
| Produto slug | coluna \`slug\` | PK \`slug\` | Preservar slug e criar unicidade por loja |
| Categoria PK | \`categories.id UUID\` | \`categories.slug TEXT\` | Mapear IDs e manter slug por loja |
| Relação produto-categoria | \`products.category_id UUID\` | \`products.category_slug TEXT\` | Preservar relação e construir mapeamento |
| Preço original | \`price\`, \`original_price\`, \`pix_discount\` | \`price\`, \`promo_price\` | Definir semântica explícita, não copiar campos por nome |
| Personalização | \`personalization_enabled\`, label/placeholder e \`personalization_options\` | \`personalizable\`, \`personalization\` JSONB | Normalizar opções sem perder o formato original |
| Logística do produto | peso, dimensões, \`requires_shipping\`, prazo numérico | estoque, \`production_days\` texto, tamanhos/cores/acabamentos | Unificar com colunas tipadas e preservar valores de origem |
| SEO | campos SEO, editorial, indexação e referências de imagem | descrição e dados básicos do catálogo | Preservar conteúdo e regras SEO do Empório |

O modelo central deve usar UUID como identidade estável e slug como identificador de rota, com unicidade por loja. A migração deve manter uma tabela de mapeamento entre ID/slug de origem e ID/slug de destino.

## 2. Pedidos e pagamentos

| Conceito | Empório (backup) | PapeLemi (atual) | Consequência |
|---|---|---|---|
| Pedido PK | UUID | UUID | Compatível em tipo; preservar IDs |
| Código público | \`order_code\` | não existe | Incluir código independente por loja |
| Endereço | colunas normalizadas | JSONB \`address\` | Preservar dados e padronizar representação |
| Itens | tabela \`order_items\` | JSONB \`orders.items\` | Criar \`order_items\` canônico e manter snapshot JSON se necessário |
| Pagamento | status, método, ID, data de pagamento e \`payment_events\` | \`mp_payment_id\` e status simples | Normalizar pagamentos/eventos com escopo de loja |
| Frete | método, empresa, prazo e preço | valor numérico e confirmação posterior | Manter regras e credenciais por loja |
| Envio | tracking code/carrier/URL e shipped_at | não há estrutura equivalente | Incorporar tracking do Empório |
| Consentimento | regras do checkout do Empório | accepted_privacy e privacy_consent_at | Preservar evidência de consentimento por pedido |
| Escopo de loja | sem tenant no backup | \`orders.store_key\` | Migrar para FK \`store_id\`; manter store_key temporariamente |

A tabela de pedidos não deve ser substituída por uma estrutura simplificada. O desenho final precisa comportar encomendas da PapeLemi e pedidos com pagamento/envio do Empório, sem misturar os fluxos comerciais.

## 3. Clientes, Auth e administração

- O Empório possui \`customers\`, \`profiles\`, \`user_roles\`, auditorias de perfil e de promoção de papel.
- A PapeLemi possui \`user_roles\` com papel global \`admin\`, mas não possui uma tabela comercial de clientes.
- O destino precisa separar identidade global de autenticação e associação comercial usuário/loja.
- Dados de cliente e histórico comercial devem ter escopo de loja; uma conta autenticada pode ter associação a uma ou às duas lojas.
- O acesso global do proprietário deve ser explícito, auditado e distinto do administrador de uma única loja.
- Não copiar sessões, refresh tokens, MFA ou OAuth internos como se fossem perfis de usuário.

## 4. Configurações, conteúdo e SEO

O Empório possui domínios próprios para configurações de loja, CMS, navegação, SEO, redirecionamentos, coleções, kits, conteúdo editorial, frete, pós-venda e provas sociais.

Esses dados não podem virar configurações globais compartilhadas por acidente. Cada tabela deve ser classificada como:

1. **store-owned:** pertence a uma loja e recebe \`store_id\`;
2. **platform-owned:** configuração técnica global, sem conteúdo comercial de uma loja;
3. **shared-reference:** dado realmente comum, explicitamente aprovado;
4. **legacy/archive:** preservado e acessível somente para auditoria, se não houver consumidor ativo.

SEO, sitemap, redirects, canonical URLs, dados estruturados, preços e feeds devem sempre resolver o domínio e a loja de origem.

## 5. Extensões PostgreSQL

O catálogo do backup declara oito extensões: \`pg_cron\`, \`pg_net\`, \`pg_stat_statements\`, \`pg_trgm\`, \`pgcrypto\`, \`supabase_vault\`, \`unaccent\` e \`uuid-ossp\`.

O projeto PapeLemi atualmente tem instaladas: \`pg_stat_statements\`, \`pgcrypto\`, \`plpgsql\`, \`supabase_vault\` e \`uuid-ossp\`.

As quatro extensões adicionais presentes no backup (\`pg_cron\`, \`pg_net\`, \`pg_trgm\` e \`unaccent\`) devem ser avaliadas por dependência real, disponibilidade no plano e segurança antes de habilitar. Não executar \`CREATE EXTENSION\` em produção nesta fase.

## 6. Direção de compatibilidade

- Não renomear nem remover as seis tabelas atuais da PapeLemi nesta fase.
- Não copiar a tabela \`products\` do Empório por cima da PapeLemi.
- Construir um modelo central que preserve UUIDs, slugs, relações, snapshots e semântica dos campos de ambas.
- Migrar registros com contagens antes/depois, FKs, constraints e amostras verificadas.
- Manter compatibilidade temporária com a aplicação PapeLemi atual até a troca controlada para o modelo central.
- O banco final deverá identificar explicitamente a loja em todo registro comercial.

## 7. Itens que exigem evidência adicional

- Row counts por tabela e existência de dados sensíveis.
- Constraints/FKs completos e funções que fazem joins por ID/slug.
- Consumers de cada tabela nas 54 Edge Functions e no frontend.
- Compatibilidade das 143 funções PostgreSQL com a versão do PostgreSQL de destino.
- Estado real e cobertura do ZIP físico dos 224 ativos de mídia.
- Mapeamento de usuários Auth para registros \`profiles\`, \`customers\`, \`orders\` e auditorias.
