# Decisão de produto e prioridade — PapeLemi como primeira implantação do motor Empório

**Data:** 25/11/2026  
**Repositório:** `hrq16000-a11y/papelemi-2026`  
**PR de referência:** #8 — `feat: integrate the full Emporio operational engine into PapeLemi`

## Decisão do proprietário

A prioridade imediata é fazer a **PapeLemi funcionar comercial e operacionalmente**, aproveitando uma cópia o mais fiel e completa possível da estrutura que já funciona na Empório Lele Cute.

A Empório é a referência do motor existente. Não se deseja criar uma versão reduzida, redesenhar toda a plataforma multi-loja antes de entregar a loja, nem repetir ciclos extensos de planejamento e inventário. O trabalho deve aproveitar o código, as migrations, os serviços, as funções, os componentes e os fluxos já identificados no projeto de referência.

## Direção aprovada

1. **PapeLemi primeiro:** concentrar a execução na PapeLemi e colocá-la em operação funcional usando o motor da Empório.
2. **Paridade integral como alvo:** trazer para a PapeLemi a estrutura de banco de dados e os recursos operacionais do Empório — schema, tabelas, relações, índices, funções/RPCs, views, triggers, RLS, Storage, serviços, Edge Functions, regras de negócio e painel administrativo — validando cada parte efetivamente integrada.
3. **Painel administrativo fiel:** portar o painel da Empório com seus módulos e capacidades reais, não apenas copiar aparência ou criar telas sem persistência. Adaptar identidade e conteúdo à PapeLemi, mantendo a funcionalidade.
4. **Supabase dedicado PapeLemi como destino inicial:** consolidar nele o motor compartilhado. Não tratar inventário, código importado ou migrations preparadas como prova de que o banco já foi aplicado ou está operacional.
5. **Empório depois:** em etapa posterior, migrar a própria Empório Lele Cute para utilizar a infraestrutura central, após validar a PapeLemi e planejar a migração sem perda de dados.
6. **Visão futura de multi-loja:** Letícia é proprietária da Empório Lele Cute, PapeLemi e outras lojas. A experiência futura deverá permitir alternar de loja com um clique, com identidade e operações próprias para cada negócio. Essa camada mais complexa de gestão multi-loja não deve bloquear a entrega imediata da PapeLemi.

## Limite essencial: motor compartilhado, negócios separados

Compartilhar o motor e a infraestrutura não autoriza misturar os dados comerciais. Cada loja deverá manter seu próprio contexto e isolamento, incluindo produtos, categorias, clientes, pedidos, preços, estoque, pagamentos, faturamento, arquivos, conteúdo, configurações, domínio e SEO.

Não copiar dados pessoais, credenciais, segredos, pedidos ou conteúdo comercial da Empório para a PapeLemi como consequência automática da cópia do motor. Qualquer migração de dados entre lojas exige escopo e autorização próprios. A meta de integração integral refere-se à estrutura e às capacidades operacionais, com os dados de cada loja preservados e isolados.

## Ordem de execução — sem recomeçar do zero

- Retomar o checkpoint e a PR #8, preservar os commits e aproveitar o trabalho já realizado.
- Fechar primeiro as dependências necessárias para a PapeLemi operar: banco, autenticação e permissões, catálogo, produtos, estoque conforme o modelo comercial, carrinho, personalização, checkout, pedidos, pagamentos, frete e gestão administrativa.
- Portar e conectar os módulos administrativos da Empório por conjuntos funcionais, incluindo serviços server-side e políticas RLS seguras. Não expor pedidos ou dados privados no navegador.
- Integrar as demais capacidades do motor Empório, sem descartar módulos apenas por não serem necessários na primeira tela.
- Homologar fluxos reais com dados sintéticos e confirmar persistência, isolamento, autorização e comportamento em Preview antes de qualquer publicação.
- Depois da PapeLemi estável, planejar a migração da Empório para a infraestrutura central e, em etapa própria, a alternância multi-loja com um clique.

## Regras de segurança e entrega

- Preservar a Production atual e os dados existentes da PapeLemi.
- Fazer migrações aditivas e reversíveis sempre que possível; nunca aplicar dump destrutivo às cegas.
- Não alterar o banco hospedado da Empório sem autorização específica.
- Não declarar paridade integral com base apenas em quantidade de arquivos, telas ou componentes importados.
- Distinguir claramente o que está **portado**, **conectado**, **aplicado ao banco**, **homologado** e **publicado**.
- Não realizar merge ou deploy de Production sem os gates e a autorização aplicáveis.
- Evitar auditorias e testes repetidos sem evidência de necessidade. Corrigir bloqueios concretos e avançar em micro-rodadas.

## Critério de sucesso desta fase

A fase será bem-sucedida quando a PapeLemi operar de ponta a ponta com o motor da Empório: banco consolidado e seguro, painel administrativo efetivamente funcional, catálogo e personalizações persistidos, pedidos administráveis e integrações comerciais funcionando conforme as credenciais e serviços disponíveis.

**Instrução de continuidade:** prosseguir do estado real da PR #8. Priorizar o que coloca a PapeLemi em funcionamento agora. A migração da Empório e a plataforma multi-loja completa são etapas posteriores, não pré-requisitos para entregar a PapeLemi.
