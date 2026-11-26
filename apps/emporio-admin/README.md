# Empório admin engine — source snapshot

Snapshot versionado e imutável do código-fonte de referência, preparado para a transferência do painel administrativo e dos módulos comerciais à PapeLemi.

- Origem: hrq16000-a11y/emporiolelecute-2026
- Branch de origem: main
- Commit fixado: d01d843c266b5a32d03af22eeaac6eda4a7fcf0f
- Manifesto e SHA-256 por arquivo: apps/emporio-admin/source/source-manifest.json

Este lote preserva os módulos de código originais em conjunto. Ainda não é o painel conectado/operacional: a próxima etapa adapta roteamento, identidade PapeLemi, autenticação, contratos de dados e isolamento de tenant.

Não foram copiados .env, .env.example, supabase/config.toml, supabase/seed.sql, src/data, src/assets, public ou mídia comercial da Empório.

A pasta source é referência vendorizada; não importar suas migrations diretamente em Production. O schema será reconciliado de forma aditiva com o banco PapeLemi e homologado isoladamente.

## Contagens transferidas

- src/pages/admin/: 120
- src/components/admin/: 411
- src/components/ui/: 53
- src/hooks/: 69
- src/lib/: 284
- src/stores/: 3
- src/contexts/: 1
- src/integrations/supabase/: 3
- src/integrations/lovable/: 1
- supabase/migrations/: 199
- supabase/functions/: 75
- supabase/tests/: 0
- drizzle/migrations/: 31
- Arquivos totais: 1373
