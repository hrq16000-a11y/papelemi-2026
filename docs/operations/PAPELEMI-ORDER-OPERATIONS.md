# PapeLemi — operação de encomendas e produção

## Banco e isolamento

- Projeto Supabase dedicado: `gpdpfoxpbferjwbppcmb`.
- Catálogo público: `categories`, `products`, `curated_phrases`.
- Encomendas: `orders`; os itens e personalizações são snapshots JSON no registro da encomenda.
- Cada pedido recebe `store_key = 'papelemi'` para permitir futura consolidação multi-loja sem misturar dados.
- RLS permanece habilitado. Leitura e alteração de pedidos exigem papel admin; inserções do checkout são feitas no servidor com segredo Supabase, nunca no navegador.
- Campos pessoais: nome, e-mail, telefone, endereço, observações e consentimento. O consentimento é obrigatório no checkout.

## Regras comerciais atuais

- Preços e prazos exibidos são referências recuperadas da vitrine original.
- Frete fica como "a confirmar"; não há tabela de frete ou integração Melhor Envio ativa.
- Nenhuma cobrança é feita no fluxo padrão. Mercado Pago só será ativado quando a conexão e as credenciais oficiais forem configuradas e testadas.
- O pedido é registrado como recebido; a PapeLemi confirma disponibilidade, personalização, prazo, frete e pagamento.

## Operação do painel

- Acesso em `/admin`.
- O usuário deve autenticar-se no Supabase e receber o papel `admin` em `public.user_roles`.
- Não existe usuário administrador inicial pré-criado. Atribuir o papel somente ao e-mail confirmado pelo proprietário.

## Dependências externas

- Lovable AI Gateway: requer `LOVABLE_API_KEY` no ambiente de servidor. Sem ela, o assistente mostra sugestões de apoio editáveis.
- Mercado Pago: requer conexão oficial/credenciais; o código não deve iniciar cobrança sem essa configuração.
- Domínio: `papelemi.com.br` e `www.papelemi.com.br` já estão vinculados ao projeto Vercel. Não alterar DNS nesta etapa.
