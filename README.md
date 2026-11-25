# PapeLemi

Loja de papelaria personalizada com afeto. Aplicação construída com TanStack Start, React, TypeScript, Tailwind CSS e Supabase.

## Produção

- Domínio oficial: https://papelemi.com.br
- Repositório: https://github.com/hrq16000-a11y/papelemi-2026
- Projeto Vercel: `papelemi` (equipe `msolus`)
- Banco dedicado Supabase: projeto `gpdpfoxpbferjwbppcmb`

## Vitrine original

A Home foi reconstruída com base na captura e no HTML integral da vitrine PapeLemi. As oito fotografias originais e as fontes DM Sans/DM Serif Display foram extraídas do HTML e são servidas localmente em `public/images/papelemi` e `public/fonts/papelemi`.

A estrutura inclui hero editorial, benefícios, quatro coleções, oito produtos, seção de marca, instruções de encomenda, privacidade, FAQ e rodapé.

## Catálogo e encomendas

O catálogo do Supabase contém os oito produtos recuperados da vitrine, seus preços e prazos de referência, as quatro coleções e as opções de personalização. O carrinho e o checkout registram encomendas na tabela `orders`, com itens, endereço, observações e consentimento de privacidade.

O frete é confirmado pela PapeLemi após revisar o CEP. Não há cobrança nesta etapa enquanto a integração de pagamento não estiver conectada. Os preços e prazos são referências e precisam ser confirmados antes da produção.

## Assistente de dedicatórias

O fluxo permite escolher produto, ocasião, estilo, destinatário e sentimento, editar as sugestões e aplicar a frase ao produto. Quando `LOVABLE_API_KEY` está disponível, usa o Lovable AI Gateway; sem a chave, oferece sugestões de apoio editáveis para não interromper a encomenda.

## Painel administrativo

A rota `/admin` usa Supabase Auth e permissões de administrador. O primeiro usuário precisa criar a conta e receber o papel `admin` na tabela `user_roles` antes de acessar os dados de gestão.

## Banco de dados

As migrações aplicadas estão versionadas em `supabase/migrations`. O projeto usa RLS; dados pessoais e pedidos são acessíveis somente por código confiável do servidor e administradores autorizados.

## Desenvolvimento

```sh
npm install
npm run dev
npm run build
```

Não coloque chaves secretas no código ou em variáveis `VITE_*`. O segredo Supabase deve permanecer apenas no ambiente de servidor da Vercel.
