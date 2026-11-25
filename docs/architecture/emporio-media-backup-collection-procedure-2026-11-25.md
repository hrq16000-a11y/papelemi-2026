# Procedimento de coleta do backup físico de mídia — Empório Lele Cute

**Data:** 25/11/2026  
**Fonte:** `docs/disaster-recovery-media.md`, `src/pages/admin/AdminMediaBackup.tsx`, `src/components/admin/MediaExportPanel.tsx` e `supabase/functions/admin-media-backup/index.ts` no ZIP original.  
**Status:** procedimento conferido estaticamente; exportação ainda não executada nesta sessão.

## 1. O que falta

O backup PostgreSQL contém metadados de Storage, mas não os bytes das imagens. O código do Empório implementa um exportador físico separado, que gera um ZIP autossuficiente com `manifest.json`, binários e SHA-256.

O inventário documentado no projeto tinha 224 assets catalogados na última evidência disponível. O número atual deve ser confirmado no painel; não presumir que permaneceu igual.

## 2. Caminho exato no Empório

1. Entrar no Empório com uma conta administrativa autorizada.
2. Abrir `https://emporiolelecute.com.br/admin/media-backup`.
3. Selecionar a aba **Backup completo**.
4. Conferir os indicadores:
   - Catalogados.
   - Exportados.
   - Hashes válidos.
   - Cobertura.
   - Faltantes.
5. Acionar **Gerar backup completo (ZIP)**.
6. Aguardar a conclusão da exportação e a mensagem de backup completo.
7. Guardar o arquivo baixado, cujo nome segue `emporio-media-backup-YYYY-MM-DD.zip`.

O endpoint exige sessão autenticada e papel `admin`. Não compartilhar senha, token ou chave de serviço.

## 3. Critérios de aceite

O ZIP só será considerado backup completo se:

- o resultado da tela informar **Backup completo e validado**;
- exportados = total de assets elegíveis;
- falhas = 0;
- a cobertura exibida for 100%;
- o contador de imagens faltantes for 0;
- `manifest.json` declarar `complete: true`;
- cada item do manifesto tiver o binário correspondente em `files/<img_ref>.<ext>`;
- tamanho e SHA-256 de cada binário corresponderem ao manifesto.

A exportação consulta assets com status `active` e `archived`. Itens marcados como `missing` não são baixados. Por isso, cobertura de backup de 100% sem verificar também o contador de faltantes não prova que todas as referências do catálogo estejam recuperáveis.

## 4. O que o exportador faz

- Solicita o manifesto dos assets ativos e arquivados.
- Baixa cada binário a partir da URL pública do Storage.
- Calcula SHA-256 dos bytes efetivamente baixados.
- Empacota os arquivos em `files/`.
- Gera `manifest.json` versão 2 com referência estável `img_ref`, caminho de Storage, tipo de conteúdo, tamanho, SHA-256 e metadados de associação.
- Registra a execução e os checksums no banco de origem por meio de `confirm_backup`.
- Só marca `backed_up_at` quando a execução inteira foi concluída e validada.

A confirmação grava metadados de auditoria de backup no banco do Empório. Não executa restore, exclusão ou limpeza do bucket.

## 5. Preservação do arquivo recebido

- Enviar o ZIP original sem extrair, renomear ou recomprimir.
- Não editar o `manifest.json`.
- Não publicar o arquivo em GitHub, site ou armazenamento público.
- O manifesto inclui URLs e caminhos internos; tratar o pacote como material operacional privado.
- Manter uma cópia local intacta até concluir a validação de checksums e a migração.

## 6. Limites

Este pacote contém **mídia**, não substitui o backup PostgreSQL nem o código-fonte. A migração de dados, Storage, Auth e Edge Functions continuará sendo validada separadamente.

Não usar a aba **Restaurar** no Empório nesta etapa. Não executar limpeza/GC. A coleta é apenas exportação física e validação de backup.
