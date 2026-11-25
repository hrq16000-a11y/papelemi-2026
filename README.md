# PapeLemi

Loja de papelaria personalizada com afeto. O projeto usa TanStack Start, React, TypeScript e Tailwind CSS.

## Referência de produto e identidade

A Home está sendo reconstruída a partir da vitrine original PapeLemi, usando a captura de tela enviada pelo proprietário em 25/11/2026 e o conteúdo recuperado da página pública.

A estrutura visual contempla:
- Cabeçalho editorial com busca, navegação por coleção e carrinho.
- Hero dividido com mensagem de marca e fotografia.
- Benefícios, quatro coleções e grade de oito produtos.
- Seção editorial, instruções de encomenda, CTA, privacidade, FAQ e rodapé.

## Catálogo de referência

A vitrine original apresenta oito itens em quatro coleções: Cadernetas, Planners & blocos, Mimos & lembranças e Brindes personalizados.

Os preços e prazos são referências. A PapeLemi confirma disponibilidade, personalização, frete e pagamento antes da produção.

**Importante:** o catálogo no código ainda é conteúdo de referência, não uma integração com banco de dados. As oito fotografias originais e as fontes DM Sans/DM Serif Display foram recuperadas do HTML integral da vitrine e agora são servidas localmente pelo projeto.

## Personalização com IA

O assistente de dedicatórias funciona em sete etapas:
1. Produto.
2. Ocasião.
3. Estilo.
4. Detalhes opcionais.
5. Geração de três sugestões.
6. Edição, seleção e favoritos.
7. Aplicação ao produto ou carrinho.

As sugestões são executadas exclusivamente no servidor por meio do Lovable AI Gateway. O servidor resolve o produto e o limite de caracteres a partir do catálogo.

## Estado funcional conhecido

- Carrinho local no navegador.
- Personalização e assistente de frases por IA.
- Não há checkout, cobrança ou pagamento integrado nesta etapa.
- A integração do banco multi-loja com Empório Lele Cute está planejada para uma etapa posterior, após inventário e backup integral dos dados e arquivos.

## Desenvolvimento

Instale as dependências com npm install, execute npm run dev para desenvolvimento e npm run build para a compilação.

O projeto foi inicialmente criado no Lovable. A branch conectada ao editor é main; mudanças desta rodada ficam isoladas em branch de trabalho e PR Draft até homologação e autorização.
