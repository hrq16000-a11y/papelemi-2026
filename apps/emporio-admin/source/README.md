# Snapshot original Empório Lele Cute

Snapshot versionado do repositório de origem, sem dados comerciais, segredos, arquivos de mídia ou configuração apontando para o projeto Supabase de produção.

- Repositório: hrq16000-a11y/emporiolelecute-2026
- Commit de origem: d01d843c266b5a32d03af22eeaac6eda4a7fcf0f
- Manifesto de arquivos e SHA-256: source-manifest.json
- Supabase migrations: supabase/migrations
- Edge Functions: supabase/functions
- Drizzle: drizzle

O arquivo supabase/config.toml neste diretório é um harness LOCAL de auditoria, com project_id=emporio-local e portas isoladas. Não é o config.toml original e não se conecta ao Supabase hospedado da Empório.

O schema-manifest.json é gerado por scripts/audit-emporio-schema.mjs. O replay de migrations ocorre apenas em Supabase local, sem seed.
