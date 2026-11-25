# Roadmap — PapeLemi

## Concluído
- [x] Banco de dados: pedidos, produtos, categorias, cupons, frases, papéis de admin
- [x] Vitrine ligada ao banco (catálogo gerenciável)
- [x] Checkout com frete (fixo R$ 19,90, grátis ≥ R$ 199), cupom (BEMVINDO10) e pedido salvo
- [x] Painel /admin com login: pedidos, produtos, categorias, frases, cupons
- [x] Código Mercado Pago pronto (preferência, webhook, confirmação) — testado sem conta conectada

## Pendente (aguardando usuário)
- [ ] Conectar conta Mercado Pago (usuário pulou o cartão de conexão) → pagamento real ativa sozinho depois
- [ ] Liberar acesso admin: usuário cria conta em /admin, confirma e-mail e me avisa para eu dar o papel de admin
- [ ] Frete por CEP via Melhor Envio (precisa de conta/chave do usuário)
- [ ] Dados legais na política/termos (aguardando razão social, CNPJ, e-mail)
- [ ] Publicar a loja (ação do usuário)


## Estado consolidado da publicação PapeLemi — 25/11/2026

- [x] Recuperadas do HTML integral as oito fotografias originais e as fontes DM Sans/DM Serif Display; arquivos servidos localmente pelo projeto.
- [x] Vitrine reconstruída com identidade visual PapeLemi, quatro coleções e os oito produtos originais.
- [x] Catálogo original carregado no Supabase dedicado: quatro categorias e oito produtos com preços e prazos de referência.
- [x] Estrutura de encomendas criada em Supabase; checkout registra dados, endereço, itens, personalização, observações e consentimento de privacidade.
- [x] Frete deixado para confirmação pela PapeLemi; nenhum valor de frete inventado.
- [x] Painel administrativo e autenticação preservados. Atribuição do primeiro papel admin depende da conta/e-mail do proprietário.
- [ ] Conectar credenciais oficiais do Mercado Pago antes de habilitar cobrança online.
- [ ] Conectar LOVABLE_API_KEY ao ambiente de produção para geração de dedicatórias por IA; enquanto isso, o assistente apresenta sugestões editáveis de apoio.
- [ ] Homologar a versão candidata em 390 px e 1440 px e validar uma encomenda sintética controlada em produção.
