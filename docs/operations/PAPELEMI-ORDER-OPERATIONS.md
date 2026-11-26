# PapeLemi — operação de encomendas e produção

## Banco e isolamento

- Projeto Supabase dedicado: `gpdpfoxpbferjwbppcmb`.
- Catálogo público: `categories`, `products`, `curated_phrases`.
- Encomendas: `orders` mantém o snapshot JSON legado para compatibilidade; `order_items` armazena itens e personalizações normalizados por linha.
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


## Operação 360° e auditoria do ciclo do pedido

A migration `20261125220000_add_order_360_operations.sql` acrescenta código legível do pedido, endereço normalizado, status de pagamento separado do status operacional, dados de frete/rastreamento, histórico de status, eventos de pagamento, logs de e-mail e notificações.

A PR #15 conecta esses dados ao painel: consulta do histórico e dos eventos, edição de status/frete/rastreamento e atualização pela RPC `admin_update_order`, após validação administrativa no servidor e com escopo da PapeLemi.

**Implantação:** a migration e o código estão em branches de homologação e são reproduzidos no Supabase local do GitHub Actions. Não aplicar em Production antes da homologação autenticada e da autorização de implantação.

O retorno da compra e o webhook consultam o estado diretamente no Mercado Pago, validam valor e moeda BRL antes de aprovar, atualizam o estado normalizado do pagamento e registram eventos idempotentes em `payment_events`. O formulário operacional não permite marcar pagamento como aprovado manualmente. O payload armazenado é minimizado e não inclui dados de cartão ou pagador. Nenhuma cobrança real ou estorno é executado nesta rodada.
