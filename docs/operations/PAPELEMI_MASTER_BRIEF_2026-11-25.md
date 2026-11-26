# PapeLemi — Brief mestre, decisões e prompt de continuidade
**Data:** 25/11/2026  
**Repositório oficial:** https://github.com/hrq16000-a11y/papelemi-2026  
**Branch de referência:** `main`  
**HEAD consultado:** `9cb75551fd1086b54c7b96df7d6c1b16c2b76bb5`  
**Domínio oficial documentado:** https://www.papelemi.com.br  
**Vercel:** projeto `papelemi`, equipe `msolus`  
**Supabase PapeLemi existente:** projeto `gpdpfoxpbferjwbppcmb`

> Este documento preserva o escopo original, as decisões acumuladas, o estado conhecido e um prompt reutilizável para Lovable/ChatGPT. Ele é documentação e ordem de trabalho; não autoriza por si só alterações de banco, credenciais, DNS, pagamentos ou publicação.

---

## 1. Visão e posicionamento

Construir a **PapeLemi**, uma loja virtual própria de papelaria personalizada, presentes criativos, lembranças, kits e brindes corporativos. A marca deve transmitir **papelaria com afeto**, criatividade, carinho, qualidade artesanal, memórias afetivas e profissionalismo.

A experiência deve ser exclusiva da PapeLemi. O portal Doobdoo e outras referências servem para estudar padrões de catálogo, navegação, descoberta, organização comercial e experiência; **não copiar código, identidade, textos, imagens ou layout de terceiros**. Usar os ativos e a identidade originais da PapeLemi sempre que disponíveis. Não inventar um logotipo definitivo: preservar o original quando fornecido.

A loja deve ter qualidade comparável a um e-commerce completo como a Empório Lele Cute, mas com identidade, catálogo, conteúdo, pedidos, clientes e operação próprios da PapeLemi.

## 2. Identidade visual e experiência

- Direção editorial, acolhedora, artesanal, limpa e premium; não infantil e sem decoração excessiva.
- Rosa suave como cor principal, branco/off-white/creme, acentos rosados mais intensos e texto grafite de alto contraste. Tons terracota ou lavanda podem aparecer apenas como apoio coerente.
- Tipografia elegante e legível; fotografias de produtos grandes, bem compostas e valorizadas.
- Respiro, hierarquia comercial clara, cards consistentes, ícones modernos e microinterações discretas.
- Animações suaves e funcionais; evitar efeitos que prejudiquem leitura, acessibilidade, carregamento ou conversão.
- Prioridade mobile-first. Homologar 390 px, 768 px e 1440 px; sem overflow horizontal, cortes, menus inacessíveis ou CTA escondidos.
- Preservar os ativos originais já extraídos da vitrine quando adequados: oito fotografias e fontes DM Sans/DM Serif Display em `public/images/papelemi` e `public/fonts/papelemi`.

## 3. Arquitetura e rotas

A base conhecida do repositório é TanStack Start, React, TypeScript, Tailwind CSS e Supabase. Respeitar a arquitetura existente e os padrões documentados em `AGENTS.md`; não reconstruir do zero sem evidência técnica.

Rotas públicas desejadas:
- `/` Home
- `/loja` catálogo completo
- `/categoria/:slug` categoria
- `/produto/:slug` produto
- `/personalizados` experiência de personalização e assistente
- `/kits`
- `/presentes`
- `/sobre`
- `/contato`
- `/carrinho`
- `/checkout`
- `/politica-de-privacidade`
- `/termos-de-uso`

A Home deve contemplar header com logotipo, busca, navegação, conta e carrinho; hero fotográfico com proposta de valor e CTAs; destaque sazonal configurável; categorias/coleções; produtos em destaque; mais vendidos somente quando houver dados reais; personalizados; kits; história da marca; como encomendar; galeria; Instagram se conectado; depoimentos somente se reais e autorizados; newsletter e footer completo.

## 4. Catálogo e dados comerciais

Categorias planejadas:
- Agendas e planners
- Cadernetas e cadernos
- Cadernetas de saúde
- Papelaria personalizada
- Produtos para bebês
- Presentes e lembranças
- Kits personalizados
- Brindes corporativos
- Calendários
- Embalagens, tags e cartões
- Produtos escolares
- Datas comemorativas

Cada produto deve comportar: nome, slug, descrição, fotos, categoria, preço, preço promocional, variações, cores, tamanhos, acabamentos, prazo de produção, estoque, status de publicação e opções de personalização configuráveis por produto.

**Integridade do catálogo:** não inventar produtos, preços, estoque, prazos, avaliações, depoimentos ou disponibilidade. Dados demonstrativos devem estar explicitamente marcados como demonstração. Os oito produtos e quatro coleções recuperados da vitrine atual, com seus preços/prazos de referência, são o ponto de partida já documentado; confirmar os dados com a proprietária antes de tratá-los como definitivos.

Filtros por categoria, preço e características; busca; ordenação; variações; quantidades; cupons; persistência do carrinho e apresentação clara de prazo e condições.

## 5. Assistente de personalização com IA — fluxo de sete etapas

Criar um único mecanismo reutilizável, configurável por produto, categoria, ocasião e estilo. Disponibilizar em `/personalizados` e como painel/modal contextual em `/produto/:slug`.

**Etapa 1 — Produto:** listar e selecionar somente produtos que aceitam personalização.  
**Etapa 2 — Ocasião:** Nascimento, Chá de bebê, Batizado, Aniversário, Casamento, Dia das Mães, Dia dos Pais, Amizade, Formatura, Agradecimento, Presente especial, Uso pessoal, Eventos corporativos e ocasião digitada livremente.  
**Etapa 3 — Estilo:** Afetuoso, Delicado, Emocionante, Inspirador, Divertido, Elegante, Religioso (somente quando solicitado), Profissional e Minimalista.  
**Etapa 4 — Detalhes opcionais:** nome de quem recebe, nome de quem presenteia, relação entre as pessoas, sentimento/mensagem desejada e limite de caracteres.  
**Etapa 5 — Geração:** produzir três alternativas distintas e refinadas, contextualizadas pelo produto/ocasião/estilo e respeitando limites.  
**Etapa 6 — Edição:** editar livremente, gerar novamente, copiar, favoritar temporariamente e escolher a versão final.  
**Etapa 7 — Aplicação:** inserir a dedicatória na configuração do produto e transportar todos os dados ao carrinho e checkout.

Contextos sugeridos:
- Cadernetas de saúde e bebê: nascimento, maternidade e mensagens afetivas.
- Agendas/planners: motivação, organização e incentivo.
- Cadernos/diários: reflexão, inspiração e mensagens pessoais.
- Presentes: dedicatórias para pessoas especiais.
- Lembranças/kits: mensagens curtas para eventos.
- Brindes corporativos: comunicação institucional e profissional.

Regras técnicas:
- Chamadas de IA exclusivamente no servidor via Lovable AI Gateway, mantendo `LOVABLE_API_KEY` fora do navegador.
- No código atual, a convenção documentada é `src/lib/ai.functions.ts` e função server-side `suggestPhrases`; validar a implementação antes de alterar.
- Validar entradas e limites com Zod. O servidor deve resolver produto, contexto e limite a partir do catálogo por slug; não confiar em contexto ou limite enviados pelo browser.
- Tratar 429, créditos esgotados, timeout e indisponibilidade com mensagens claras e fallback editável, sem perder o pedido.
- Impedir chamadas duplicadas durante carregamento.
- Preservar a frase escolhida e a configuração do produto no carrinho, inclusive após navegação/atualização.
- Permitir salvar frases favoritas no navegador para visitas futuras, com opção de remover e sem exigir conta. Distinguir favoritos locais de dados persistidos em conta.
- Exibir prévia visual realista da dedicatória aplicada ao produto antes de adicionar ao carrinho; a prévia deve refletir fonte, cor, posição e limite realmente suportados pelo produto, sem prometer impressão/arte final inexistente.

## 6. Analytics

Implementar eventos mensuráveis e consistentes, sem enviar dados pessoais, conteúdo de dedicatórias ou informações sensíveis:
- `personalization_started`: início do gerador.
- `personalization_suggestions_generated`: sugestões geradas (registrar quantidade, produto/categoria e sucesso/erro).
- `personalization_phrase_selected`: frase escolhida (não enviar o texto da frase).
- `personalization_phrase_favorited`: favorito salvo/removido, se aplicável.
- `personalization_preview_viewed`: prévia visualizada.
- `add_to_cart`: produto/configuração adicionados ao carrinho.
- Eventos adicionais de checkout/pedido apenas se definidos e validados.

Documentar nomes, propriedades permitidas, origem, consentimento, deduplicação e destino. Criar uma visualização administrativa/relatório que permita acompanhar início do gerador, geração, escolha e adição ao carrinho. Não afirmar que Analytics está ativo sem verificar eventos reais chegando ao destino. Não coletar nome, telefone, e-mail, endereço ou conteúdo privado em propriedades de analytics.

## 7. Carrinho, checkout e operação comercial

O carrinho deve persistir e manter produto, variações, quantidade, preço confirmado, personalização e dedicatória. O checkout deve coletar somente os dados necessários, apresentar resumo, política de privacidade, frete, cupom e estado do pedido.

Estado conhecido: o README registra que o carrinho/checkout já salva encomendas na tabela `orders`, incluindo itens, endereço, observações e consentimento; o frete está pendente de cálculo externo e é confirmado pela loja após revisar o CEP. O roadmap registra código de integração Mercado Pago (preferência, webhook e confirmação) preparado, porém ainda sem conta conectada/teste com credenciais reais.

**Mercado Pago:** conectar a conta oficial da proprietária via fluxo seguro de autorização/Secrets. Não pedir nem registrar access token no chat, frontend ou Git. Validar assinatura/autenticidade do webhook, idempotência, correspondência pedido/pagamento, moeda/valor e transições de estado. Somente marcar `pago` após confirmação confiável do provedor; nunca simular pagamento aprovado. Testar em sandbox antes de habilitar produção.

**Melhor Envio:** substituir frete provisório por cotação real via servidor, usando credenciais fornecidas e guardadas em Secrets. Mostrar opções, prazo, preço e serviço selecionado no checkout e no pedido. Validar CEPs, dimensões/peso e resposta da API. Se indisponível, informar claramente e oferecer fluxo manual de cotação, sem inventar valores.

**WhatsApp e e-mail:** atualizar canais somente com contatos oficiais confirmados pela proprietária. Mensagens devem incluir resumo do pedido sem expor segredos.

## 8. Painel administrativo

A rota `/admin` deve ser independente da loja pública, autenticada e autorizada no servidor. Funcionalidades desejadas:
- Dashboard com pedidos, indicadores, alertas e status de produção.
- CRUD de produtos/categorias, imagens, preços, estoque, variações e personalizações.
- Gestão de pedidos, clientes, cupons/campanhas e prazos.
- Gestão de frases/modelos e configurações do assistente.
- Relatórios de analytics do gerador, sugestões, frases escolhidas, prévias e carrinho.
- Controle de produção, observações e histórico de alterações.

Estado conhecido: o projeto tem Supabase Auth, tabela de papéis `user_roles` e painel descrito no roadmap. A primeira conta precisa ser criada/confirmada e receber papel `admin` por procedimento seguro. Não conceder privilégios por e-mail arbitrário nem expor endpoints administrativos. Confirmar a identidade/e-mail da proprietária antes de atribuir o papel. Garantir RLS e autorização server-side em todas as operações.

## 9. Banco de dados — decisão de arquitetura compartilhada com Empório Lele Cute

A intenção mais recente da proprietária é avaliar e construir uma arquitetura conjunta para que **Empório Lele Cute e PapeLemi possam compartilhar a mesma infraestrutura/banco e os mesmos recursos de plataforma**, mantendo cada negócio totalmente separado nos dados e na experiência.

Princípio obrigatório: **compartilhar tecnologia não significa misturar negócios**. Catálogo, produtos, preços, clientes, pedidos, pagamentos, cupons, estoque, faturamento, conteúdo, identidade e analytics devem permanecer isolados por loja/tenant.

Antes de qualquer migração:
1. Inventariar integralmente o banco atual da PapeLemi e o banco original da Empório Lele Cute: tabelas, colunas, tipos, constraints, índices, relacionamentos, triggers, funções, policies/RLS, buckets, objetos, Edge Functions, migrações e contagens de registros.
2. Gerar e verificar backups completos de dados, schema, arquivos e configurações recuperáveis dos dois projetos. Não declarar backup integral se houver lacunas.
3. Estudar diferenças de schema e mapear entidades compartilháveis versus específicas de cada loja.
4. Propor arquitetura multi-tenant explícita (por exemplo `store_id`/tenant, chaves compostas, isolamento RLS, escopo de Storage, políticas, auditoria e testes de acesso cruzado).
5. Definir estratégia de migração reversível, validação de contagens/checksums e plano de rollback.
6. Só então apresentar o plano e solicitar autorização explícita para qualquer mudança real.

Não sobrescrever, esvaziar, fundir ou alterar o banco da Empório nem o Supabase atual da PapeLemi durante auditoria. Não copiar credenciais. Não criar um banco compartilhado improvisado nem assumir que os schemas são compatíveis. Até a aprovação e execução formal da migração, manter o estado atual sem alterações destrutivas.

**Observação de governança:** `AGENTS.md` proíbe editar manualmente `supabase/migrations/` e `drizzle/`; alterações de schema devem ser solicitadas pelo fluxo Lovable gerenciado e documentadas. Respeitar essa regra.

## 10. SEO, acessibilidade e desempenho

- SSR quando suportado pelo TanStack Start existente; conteúdo indexável e URLs amigáveis.
- Metadados individuais, canonical, Open Graph, robots.txt e sitemap.xml dinâmico.
- Dados estruturados Organization e Product somente com dados verdadeiros.
- Links internos entre Home, coleções, categorias e produtos.
- Imagens otimizadas, dimensões reservadas, lazy loading abaixo da dobra e prioridade adequada para hero.
- Core Web Vitals, navegação por teclado, foco visível, labels, contraste, alt text e semântica.
- O repositório já possui sitemap dinâmico documentado no HEAD consultado; confirmar comportamento em produção e não duplicar sua implementação.

## 11. Privacidade, segurança e dados legais

- Não expor chaves secretas no frontend, em variáveis `VITE_*`, commits, logs ou prompts.
- Não usar Supabase service role no browser.
- RLS em dados de clientes/pedidos e autorização no servidor.
- Consentimento e minimização de dados; não registrar conteúdo pessoal de dedicatórias em analytics.
- Política de privacidade e termos devem conter razão social, CNPJ e e-mail oficiais fornecidos pela proprietária. Não inventar dados legais.
- Verificar retenção, acesso, exclusão e proteção de dados pessoais.
- Não publicar dados reais em ambientes de teste; usar dados sintéticos.

## 12. Estado conhecido no repositório em 25/11/2026

Fontes consultadas: `README.md`, `AGENTS.md`, `roadmap.md`, árvore da branch `main` e commit HEAD.
- Projeto: TanStack Start, React, TypeScript, Tailwind e Supabase.
- Home/vitrine reconstruída a partir do HTML integral e ativos originais.
- Quatro coleções e oito produtos recuperados; catálogo descrito como carregado no Supabase dedicado.
- Carrinho/checkout salva encomendas; frete ainda é confirmado manualmente pela loja.
- Painel administrativo e autenticação existem; atribuição do primeiro papel admin depende da conta/e-mail da proprietária.
- Código Mercado Pago está preparado, mas a conta não foi conectada/testada com credenciais reais.
- Assistente tem fluxo de dedicatórias; gateway depende de `LOVABLE_API_KEY` no ambiente. Sem a chave, há sugestões de apoio editáveis.
- Sitemap dinâmico e referência no robots.txt estão no HEAD `9cb75551`.
- Pendências registradas: Mercado Pago, admin da proprietária, Melhor Envio, dados legais, chave do AI Gateway, homologação mobile e teste sintético.
- Não considerar publicação/homologação final concluída sem verificar domínio, deployment Production, fluxo real e eventos de analytics.

Este retrato é um checkpoint, não substitui a inspeção atual do código, do Supabase, da Vercel e dos conectores antes de executar qualquer etapa.

---

# 13. PROMPT MESTRE PARA LOVABLE / CHATGPT

Copie o texto abaixo para iniciar a próxima sessão. Trabalhe em rodadas curtas, com validação entre elas.

---

**CONTINUAR — PAPELEMI | EVOLUÇÃO CONTROLADA DA LOJA**

Repositório oficial: `hrq16000-a11y/papelemi-2026`  
Branch de referência: `main`  
Domínio: `https://www.papelemi.com.br`  
Projeto Vercel: `papelemi`, equipe `msolus`  
Stack conhecida: TanStack Start, React, TypeScript, Tailwind e Supabase.

## OBJETIVO

Consolidar e evoluir a PapeLemi para uma loja virtual exclusiva, completa, responsiva e comercialmente preparada, preservando o trabalho existente. A marca é papelaria personalizada, presentes, lembranças, kits e brindes corporativos, com conceito **papelaria com afeto**.

Use o Doobdoo apenas como referência funcional de padrões de catálogo e navegação. Use a Empório Lele Cute como referência de maturidade de recursos e operação, nunca para copiar identidade ou misturar negócios. A PapeLemi precisa ter design, conteúdo, ativos e experiência próprios.

## REGRA ZERO — RECUPERAR ANTES DE ALTERAR

1. Leia `AGENTS.md`, `README.md`, `roadmap.md` e este documento.
2. Confira HEAD, branch, árvore de arquivos, alterações recentes, rotas, componentes, schema/migrações existentes, variáveis configuradas (somente nomes/escopos, nunca valores), projeto Vercel e estado real do Supabase.
3. Compare cada requisito deste documento com a implementação real e classifique: **já funciona / parcial / ausente / bloqueado por credencial ou decisão**.
4. Não reimplemente o que já funciona. Não apague, reescreva ou substitua componentes sem necessidade comprovada.
5. Entregue uma matriz objetiva de estado e proponha a menor sequência de micro-rodadas. Comece pela primeira rodada de implementação segura e de maior valor; não execute tudo de uma vez.

## ESCOPO FUNCIONAL A PRESERVAR E COMPLETAR

- Home editorial premium, identidade rosa suave/off-white/creme, imagens originais, navegação, busca e CTAs.
- Catálogo, categorias, páginas de produto, kits, presentes, personalizados, sobre e contato.
- Produtos e opções de personalização configuráveis por produto; não inventar preços, estoque, prazo, avaliações ou depoimentos.
- Assistente de dedicatórias com as sete etapas descritas neste documento, três sugestões, edição, cópia, favoritos persistidos localmente, prévia aplicada ao produto e integração com carrinho.
- IA somente server-side pelo Lovable AI Gateway; validação Zod, contexto/limites derivados do catálogo, tratamento de falhas e proteção contra chamadas duplicadas.
- Carrinho persistente e checkout que preservem variações e personalização.
- Analytics com eventos `personalization_started`, `personalization_suggestions_generated`, `personalization_phrase_selected`, `personalization_preview_viewed` e `add_to_cart`, sem dados pessoais ou texto da frase.
- Painel /admin com autenticação, autorização server-side, CRUD de catálogo, pedidos, clientes, cupons, frases e indicadores.
- Mercado Pago com webhook validado e transição para pago somente após confirmação real.
- Melhor Envio com cotação real e valor/prazo salvos no pedido; nunca inventar frete.
- SEO, SSR, metadados, sitemap dinâmico, robots, canonical, schema.org, acessibilidade e Core Web Vitals.
- Políticas legais com dados oficiais, somente após recebê-los.

## DECISÃO SOBRE BANCO COMPARTILHADO COM EMPÓRIO LELE CUTE

A intenção atual é compartilhar infraestrutura/banco e recursos de plataforma entre Empório Lele Cute e PapeLemi, com isolamento absoluto dos dois negócios. Antes de qualquer migração, faça apenas inventário e planejamento: backup verificável de ambos, schema completo, dados, Storage, funções, policies/RLS, contagens, mapeamento multi-tenant, plano de migração reversível e rollback. Não alterar nenhum banco, não migrar dados, não sobrescrever o banco da Empório nem o Supabase PapeLemi sem autorização explícita posterior. Manter `store_id`/tenant e isolamento RLS como requisito arquitetural. Não editar migrations/Drizzle manualmente: seguir o fluxo Lovable indicado em `AGENTS.md`.

## EXECUÇÃO EM RODADAS

**Rodada A — Auditoria curta e plano:** somente leitura. Comparar requisitos e estado real, listar bloqueios e indicar a menor sequência. Não repetir auditorias já documentadas sem necessidade.

**Rodada B — Fechamento da experiência PapeLemi:** corrigir apenas lacunas comprovadas da Home, catálogo, produto, rotas, responsividade e fluxo de personalização; manter o que já funciona. Validar 390/768/1440 px.

**Rodada C — Assistente, favoritos, prévia e analytics:** completar fluxo de sete etapas, persistência local de favoritos, prévia realista e eventos instrumentados; verificar recebimento dos eventos sem PII.

**Rodada D — Checkout e administração:** confirmar pedidos persistidos, segurança/RLS, acesso administrativo da proprietária, gestão de catálogo e pedidos. Não liberar papel admin sem confirmar a conta correta.

**Rodada E — Integrações comerciais:** conectar Mercado Pago e Melhor Envio somente com credenciais fornecidas pela proprietária, armazenadas em Secrets. Sandbox primeiro; webhook/idempotência; frete real; nenhuma cobrança simulada.

**Rodada F — Arquitetura Empório + PapeLemi:** inventário e plano multi-tenant com backups completos e rollback. Implementação somente depois de aprovação explícita do plano.

**Rodada G — Homologação e publicação:** dados sintéticos; testes de fluxo, segurança, mobile, acessibilidade, SEO, analytics e pagamento sandbox. Publicar em Production apenas após gates verdes e autorização explícita. Uma única publicação consolidada; registrar SHA e URL.

## LIMITES INEGOCIÁVEIS

- Preservar o projeto e os dados existentes; não iniciar reconstrução.
- Não executar migração, SQL destrutivo, alteração de RLS, conexão de banco compartilhado, troca de credenciais, DNS ou publicação sem autorização explícita correspondente.
- Não ativar pagamento real sem credenciais e teste aprovado.
- Não incluir secrets no Git, frontend, logs ou mensagens.
- Não usar Max Mode; otimizar créditos. Não agrupar auditoria, implementação, testes completos e publicação no mesmo turno.
- Fazer uma tarefa unitária por rodada, validar e reportar. Sem testes repetidos sem motivo.
- Respeitar `AGENTS.md`, inclusive a proibição de editar manualmente `supabase/migrations/` e `drizzle/`.
- Não reescrever histórico Git nem force push. Manter branch conectada ao Lovable em estado funcional.
- Não declarar funcionalidade concluída sem evidência verificável.

## FORMATO OBRIGATÓRIO DO RELATÓRIO DE CADA RODADA

1. Objetivo e escopo executado.
2. Arquivos/rotas/componentes alterados.
3. O que já existia e foi preservado.
4. Evidências e validações realizadas (com viewport e resultado).
5. O que está realmente funcional.
6. Bloqueios que dependem da proprietária (credenciais, dados legais, autorização).
7. Commit/PR/HEAD e deployment, se houver; nunca presumir.
8. Próxima micro-rodada sugerida — sem iniciá-la automaticamente.

**Comece pela Rodada A, faça a recuperação do estado atual e apresente a matriz de requisitos. Depois prossiga somente com a primeira micro-rodada segura, sem tocar em bancos, credenciais, DNS ou produção.**

---

## 14. Dados que ainda dependem da proprietária

- Conta Mercado Pago e autorização de conexão.
- Conta/chave Melhor Envio e dados logísticos reais dos produtos (peso e dimensões).
- Conta/e-mail correto da proprietária para conceder papel administrativo.
- Razão social, CNPJ e e-mail oficial para documentos legais.
- WhatsApp e e-mail oficiais de atendimento, caso sejam diferentes dos já cadastrados.
- Autorização explícita para qualquer migração multi-tenant, alteração de banco ou publicação Production.

## 15. Critério de conclusão

A PapeLemi só pode ser considerada pronta quando catálogo e personalização funcionarem de ponta a ponta; pedidos forem persistidos; administração estiver protegida; frete e pagamento forem reais e comprovados (ou claramente indisponíveis); analytics receber eventos; políticas estiverem corretas; SEO e acessibilidade forem validados; mobile estiver homologado; e a publicação Production tiver SHA/URL confirmados. Tudo isso sem misturar dados da Empório Lele Cute e da PapeLemi.


---

## 16. Atualização de prioridade aprovada pelo proprietário — 25/11/2026

Esta decisão mais recente **substitui temporariamente a ordem de execução multi-loja descrita na seção 9 e no prompt mestre antigo**.

### Prioridade atual: paridade operacional Empório → PapeLemi

A PapeLemi será a primeira loja a receber a estrutura operacional e o modelo de banco de dados da Empório Lele Cute, adaptados à marca e aos dados próprios da PapeLemi.

- Reproduzir os módulos e fluxos operacionais reais da Empório na PapeLemi.
- Usar as migrations e o código Empório como referência de estrutura e regras.
- Preservar a stack TanStack Start atual da PapeLemi.
- Manter o Supabase dedicado PapeLemi em São Paulo.
- Criar estruturas PapeLemi próprias; não importar produtos, clientes, pedidos, preços, imagens, vídeos, conteúdo, campanhas ou credenciais do Empório.
- Não usar mídia do Empório na PapeLemi.
- Não fazer restore bruto do dump PostgreSQL nem copiar schemas internos/segredos do Supabase.

### Adiado para fase futura

A centralização definitiva de várias lojas, o seletor de loja em um clique para Letícia, a tenantização completa, as permissões globais e a migração do Empório ficam adiados até a PapeLemi operar de forma sólida como loja independente.

### Primeira entrega de implementação

A consolidação de trabalho existente em #4 (catálogo Supabase), #5 (segurança administrativa), #6 (integridade do checkout) e #7 (dashboard), mais o diretório inicial de clientes derivado dos pedidos.

O diretório de clientes não substitui o CRM relacional da Empório; a tabela `customers` e os vínculos normalizados serão portados numa etapa de banco posterior.

Documento operacional desta decisão: `docs/operations/PAPELEMI_EMPORIO_CORE_PARITY_DECISION_2026-11-25.md`.

**Regra de precedência:** em caso de conflito com a seção 9 ou o prompt mestre anterior, seguir esta atualização mais recente. Não iniciar multi-loja antes de autorização e conclusão da paridade operacional da PapeLemi.


---

## 17. Decisão mais recente do proprietário — banco central e motor Empório integral (25/11/2026)

Esta decisão **substitui a orientação anterior de manter as duas bases de banco totalmente independentes**.

### Objetivo obrigatório

A PapeLemi será a primeira loja a receber o motor operacional completo da Empório Lele Cute. O Supabase dedicado da PapeLemi passa a ser a base central planejada; depois da homologação da PapeLemi, a Empório migrará para esse mesmo projeto Supabase.

**Não basta copiar algumas telas. O objetivo é reproduzir o esquema completo, as regras de negócio, RPCs, views, triggers, políticas RLS, Edge Functions, Storage e o painel administrativo integral.**

### Referências confirmadas

- Supabase PapeLemi (destino central): \`gpdpfoxpbferjwbppcmb\`, região \`sa-east-1\`, status \`ACTIVE_HEALTHY\`.
- Vercel Production da PapeLemi: \`VITE_SUPABASE_URL\` confirmado como \`https://gpdpfoxpbferjwbppcmb.supabase.co\`.
- Supabase de origem Empório (referência do repositório): \`xfqffqxqiuqauefrrcxn\`, declarado em \`supabase/config.toml\` do Empório.
- O projeto Supabase Empório não está disponível nas conexões Supabase atualmente autorizadas nesta sessão; a consulta de acesso retornou permissão negada. Não afirmar que seu banco hospedado foi inspecionado.

### Inventário comprovado no repositório Empório, branch main, HEAD \`d01d843c266b5a32d03af22eeaac6eda4a7fcf0f\`

- 199 migrations SQL Supabase.
- 155 tabelas no tipo gerado \`src/integrations/supabase/types.ts\`.
- 63 funções/RPCs tipadas.
- 5 views tipadas.
- 54 Edge Functions.
- 120 páginas administrativas.
- 411 componentes administrativos.
- A árvore de navegação contém módulos Core, Content, Discovery, Executive, Intelligence, System, Site, Settings, SEO Advanced e Labs.

Este inventário é a referência de código versionado, não substitui o dump/schema real do banco hospedado.

### Arquitetura central planejada

- Um único projeto Supabase dedicado: \`gpdpfoxpbferjwbppcmb\`.
- PapeLemi é a primeira implantação e continua com catálogo, clientes, pedidos, arquivos, marca e conteúdo próprios.
- O motor operacional Empório será portado integralmente para o schema operacional PapeLemi, preservando os dados atuais.
- A futura migração da Empório utilizará o mesmo projeto Supabase, com isolamento de dados por loja. A implementação deverá escolher e homologar o mecanismo final de isolamento (schemas dedicados ou tenancy/RLS) antes de mover dados; não misturar registros de lojas.
- Autenticação global poderá ser compartilhada quando apropriado, mas papéis, permissões e dados comerciais deverão respeitar o escopo da loja.
- A troca de loja em um clique é parte do desenho final, porém a prioridade imediata é fazer a PapeLemi funcionar integralmente.

### Dados que NÃO serão copiados do Empório para a PapeLemi

Não importar produtos, preços, estoque, clientes, pedidos, cupons, avaliações, depoimentos, campanhas, fotos, vídeos, logo, conteúdo editorial, domínio, credenciais, tokens ou secrets da Empório. Somente estrutura, código, regras e recursos operacionais.

### Estado atual da PapeLemi

Consulta read-only do Supabase dedicado:
- \`categories\`: 4 registros.
- \`products\`: 8 registros.
- \`curated_phrases\`: 10 registros.
- \`coupons\`: 0 registros.
- \`orders\`: 0 registros.
- \`user_roles\`: 1 registro.
- 10 migrations registradas (confirmadas por consulta read-only em 25/11/2026).

As tabelas existentes têm diferenças relevantes do Empório. Exemplo: PapeLemi \`orders\` armazena endereço/itens em JSONB; Empório utiliza endereço relacional e \`order_items\`. Produtos e categorias também têm modelos diferentes. A migração precisa ser aditiva e preservar compatibilidade, não substituir tabelas às cegas.

### Governança e bloqueios

- O \`AGENTS.md\` mantém um bloco gerenciado pelo Lovable que proíbe editar migrations manualmente e manda solicitar alterações de schema pelo Lovable.
- A conexão das ferramentas Lovable falhou nesta sessão. Não contornar a regra nem aplicar DDL diretamente até o fluxo de governança estar resolvido.
- O Supabase Empório \`xfqffqxqiuqauefrrcxn\` não está acessível nas conexões atuais. Para reconciliar 100% o estado hospedado, é necessário conectar esse projeto ou fornecer um schema dump completo sem dados pessoais/segredos.
- Nenhuma migration Empório foi aplicada no Supabase PapeLemi nesta rodada.
- Nenhuma migração de dados Empório foi iniciada.

### Critério de conclusão

A PapeLemi só será declarada 100% funcional quando:
1. o esquema necessário do motor Empório estiver integrado e validado no Supabase central;
2. as 120 páginas administrativas e seus fluxos reais estiverem presentes, com a identidade PapeLemi;
3. as 54 Edge Functions e dependências necessárias estiverem implantadas/configuradas para o destino correto;
4. pedidos, clientes, catálogo, personalização, pagamentos, frete, conteúdo, mídia, SEO, suporte, auditoria e permissões tiverem persistência real;
5. RLS, Storage, autenticação, webhooks e secrets estiverem homologados;
6. os dados existentes da PapeLemi permanecerem íntegros;
7. a homologação funcional e mobile estiver aprovada.

Não classificar como concluído apenas porque o build ou o Preview ficou READY.


---

## 2026-11-25 — Rodada PR #13: paridade operacional do catálogo

**Base técnica:** PR #12, branch \`feat/papelemi-consolidated-admin-checkout-01-20261125\`, HEAD \`f9cefbf362d3a1fc5afc397cf82035059033e625\`.

**Entrega:** PR #13, branch \`feat/catalog-admin-parity-01-20261125\`, commit inicial \`4d0bd0ed7da83a5828bb9db3cae55969865d33d2\`.

### Implementado no código

- Editor de campos de personalização por produto: texto, escolha, observações, limite de caracteres e permissão de sugestão por IA.
- Persistência server-side da configuração de personalização, sem sobrescrever os campos existentes durante uma edição.
- Gestão dos dados de embalagem já presentes no schema: peso, comprimento, largura, altura e exigência de envio.
- Validação de imagens HTTPS e caminhos locais seguros em \`/images/\`.
- Validação de preço promocional, campos duplicados/reservados e dimensões de embalagem.
- Renomeação de produtos e categorias atualizando o registro original. A FK de produtos para categorias foi confirmada com \`ON UPDATE CASCADE\`.
- Testes unitários para validação administrativa e mapeamento dos dados de frete.

### Estado read-only do Supabase PapeLemi

Projeto \`gpdpfoxpbferjwbppcmb\`, região \`sa-east-1\`, Postgres 17.12, status \`ACTIVE_HEALTHY\`.

| Estrutura | Registros |
|---|---:|
| Categorias | 4 |
| Produtos | 8 |
| Frases | 10 |
| Cupons | 0 |
| Clientes | 0 |
| Pedidos | 0 |
| Itens de pedidos | 0 |
| Papéis de usuário | 1 |

As 10 migrations registradas no projeto são:

- \`20261125075644_create_papelemi_order_request_tables\`
- \`20261125080520_create_papelemi_shop_schema\`
- \`20261125080558_seed_papelemi_original_catalog\`
- \`20261125080624_add_store_order_privacy_and_store_scope\`
- \`20261125081940_tighten_storefront_rls_and_role_checks\`
- \`20261125082207_restrict_order_table_to_server_role\`
- \`20261125213419_add_store_scoped_crm_and_order_items\`
- \`20261125214907_add_store_scoped_shipping_engine\`
- \`20261125215858_add_store_lookup_indexes\`
- \`20261125215901_lock_shipping_provider_credentials\`

A migration \`20261125220000_add_order_360_operations.sql\` continua fora da lista aplicada em Production. Não foi executada nesta rodada.

### Homologação da PR #13

- GitHub Actions run \`45723524452\`: testes unitários, lint direcionado, TypeScript e replay local das migrations/contratos de banco concluídos com SUCCESS.
- Vercel Preview: deployment \`dpl_48HaMfm9mgxg8XeVzbS5V43rk8eK\`, estado READY.
- Preview \`/\`: HTTP 200.
- Preview \`/admin\`: HTTP 200 e \`noindex\`.
- Preview \`/produto/caderneta-saude-ursinho-clean\`: HTTP 500 por ausência das variáveis \`SUPABASE_URL\` e \`SUPABASE_PUBLISHABLE_KEY\` no ambiente Preview. O mesmo erro foi reproduzido na Preview da base PR #12; a rota correspondente em Production respondeu HTTP 200. Não é regressão introduzida pela PR #13.
- O job de reconstrução do schema hospedado do Empório permaneceu SKIPPED, sem acesso ao banco de origem.

### Limites preservados

- Nenhuma migration, DDL, policy RLS ou dado comercial foi alterado no Supabase Production.
- Nenhuma configuração de ambiente Vercel foi alterada.
- Nenhum pedido de teste, pagamento ou frete real foi executado.
- PR #12 e PR #13 permanecem abertas; sem merge e sem publicação Production.

### Próxima etapa

Configurar, mediante autorização, as variáveis Supabase do ambiente Preview para permitir homologação autenticada e do catálogo. Em seguida, avançar para estoque transacional e integração completa de pedidos/pagamentos/fretes, sem assumir que o campo de estoque atual representa reserva automática.


---

## 2026-11-26 — Replicação fiel do motor Empório Lele Cute

A estratégia passa a ser transferência em lote do sistema original, com o repositório Empório como fonte de código e a PapeLemi como destino independente. A evidência e a matriz de paridade estão em [EMPORIO_REPLICATION_MATRIX_2026-11-26.md](./EMPORIO_REPLICATION_MATRIX_2026-11-26.md).

A PR #13 contém 1.373 arquivos reutilizados, runtime administrativo original com 124 entradas de rota e 119 imports dinâmicos, 54 diretórios de Edge Functions com 75 arquivos, e as 199 migrations em projeto local isolado. O build, o smoke SSR e o replay isolado das migrations concluíram com sucesso. O cliente Supabase do runtime foi adaptado para usar o cliente da PapeLemi.

O replay local produziu 144 tabelas públicas, 84 funções, 4 views, 306 índices e 234 policies. Os tipos versionados da fonte declaram 150 tabelas e 63 funções. A diferença exige confirmação contra o Supabase remoto original; não será resolvida por suposição.

O Supabase PapeLemi permanece com 15 tabelas públicas e 10 migrations aplicadas. As diferenças de colunas em `products`, `categories`, `orders` e `coupons` impedem declarar o painel plenamente conectado. Nenhuma migration hospedada, importação de dados ou alteração na Production foi executada.

O inventário inicial de funções críticas encontrou dependências de `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `RESEND_API_KEY`, `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `GOOGLE_SEARCH_CONSOLE_API_KEY`, `LOVABLE_API_KEY`, `SEMRUSH_API_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` e `STORE_NOTIFICATION_EMAIL`, além das variáveis Supabase. Nenhum valor de segredo foi lido ou copiado; as funções ainda não foram implantadas.

O projeto Supabase remoto da Empório não está disponível nas conexões atuais desta sessão. A aplicação de migrations hospedadas continuará condicionada à reconciliação completa, revisão do SQL, backup/rollback confirmado e aprovação explícita do proprietário.


---

## 2026-11-26 — Correção do replay isolado e reconciliação do clone

A branch de integração preserva o runtime original da Empório e as correções de compatibilidade TypeScript. O último conjunto de verificações aprovado no HEAD anterior confirmou 38 testes, lint direcionado e TypeScript; o teste adicional de rota foi ajustado para considerar o route ID gerado pelo TanStack Router (`/admin/$`), sem confundir route ID com URL pública.

O replay isolado das 199 migrations já foi executado com sucesso anteriormente. O workflow foi ajustado para fixar o Supabase CLI em 3.4.0 e produzir um artefato schema-only com DDL público, tipos gerados, nomes de tabelas, métricas por schema e buckets. O artefato não inclui dados comerciais e redige referências de projetos hospedados e URLs locais.

A pasta combinada `tools/papelemi-combined-supabase` é somente um teste estrutural descartável: move as 12 tabelas sobrepostas da PapeLemi para um schema legado local e aplica as migrations originais no schema público. Não representa migração de dados nem arquitetura final e não pode ser aplicada em Production.

Os scripts de replay substituem URLs de projeto Supabase por endereço local via padrão genérico; nenhum project ref hospedado fica hardcoded nos scripts. Nenhuma alteração foi feita no banco original ou no Supabase hospedado da PapeLemi.
