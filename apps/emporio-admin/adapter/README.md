# Painel original da Empório — adaptador PapeLemi

Aplicação administrativa isolada baseada nos módulos originais vendorizados em ../source.

- Runtime: React 18 + React Router 7 + Vite 5, isolado do storefront TanStack Start.
- Roteamento interno: HashRouter; a prévia fica em /admin-original.
- Saída estática: public/admin-engine, servida pelo mesmo domínio PapeLemi.
- Banco: somente VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY do projeto Supabase PapeLemi.
- Autorização: RPC has_store_role com store_key=papelemi.
- Marca: PapeLemi; fontes e paleta obtidas dos assets/tokens PapeLemi.

A aplicação ainda depende da reconciliação do schema e dos serviços originais. A compilação não significa que os módulos já estejam conectados ou homologados de ponta a ponta.
