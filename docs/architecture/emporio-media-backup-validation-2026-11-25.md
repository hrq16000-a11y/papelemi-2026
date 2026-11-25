# Validação do backup físico de mídia — Empório Lele Cute

**Data da conferência:** 25/11/2026  
**Arquivo recebido:** `emporio-media-backup-2026-11-25.zip`  
**Status:** integridade dos arquivos incluídos aprovada; cobertura global parcial.  
**Uso:** evidência de recuperação do Empório. Não importar para a PapeLemi.

## 1. Identificação do pacote

- Tamanho do ZIP: 140.525.533 bytes.
- SHA-256 do ZIP: `8017c093042fbbef620abc76386eb4a87d8d9b8fb6a33abe29bcf1cdc264dd03`.
- Manifesto: versão 2, tipo `full_binary`.
- Gerado em: `2026-11-25T14:07:20.162Z`.
- Bucket de origem declarado: `product-images`.
- Entradas ZIP: 446 (diretório `files/`, 444 binários e `manifest.json`).
- Teste de integridade estrutural do ZIP: aprovado, sem entrada corrompida.

## 2. Resultado do manifesto

| Campo | Valor |
|---|---:|
| `total_assets` | 451 |
| `exported_count` | 444 |
| Binários presentes | 444 |
| `complete` | `false` |
| Não exportados | 7 |

O pacote é **parcial**: 444 de 451 assets elegíveis foram exportados. Os sete itens que faltam não estão listados no array `assets` do manifesto, e o pacote não contém os nomes/caminhos nem a causa individual das falhas. Não é possível identificar esses sete somente pelo ZIP recebido.

O código original `MediaExportPanel.tsx` confirma que o exportador tenta baixar cada URL, captura falhas por asset e define `complete=false` quando há qualquer falha ou diferença entre exportados e elegíveis. A lista de erros é mostrada no painel durante a execução, mas não é gravada no manifesto. A confirmação persistida registra somente a quantidade de falhas em `notes`.

## 3. Integridade dos 444 binários presentes

| Verificação | Resultado |
|---|---:|
| Arquivos listados no manifesto | 444 |
| Binários correspondentes encontrados | 444 |
| Tamanhos iguais ao manifesto | 444/444 |
| SHA-256 iguais ao manifesto | 444/444 |
| Imagens decodificadas com formato esperado | 444/444 |
| Caminhos extras/ausentes no ZIP | 0 |
| Referências `img_ref` duplicadas | 0 |
| Caminhos duplicados no manifesto | 0 |

Formatos:
- 224 JPEG/JPG.
- 220 WebP.

Todos os 444 arquivos puderam ser decodificados como imagem e corresponderam ao `content_type` declarado.

Foram identificados 15 pares de assets com conteúdo binário idêntico (mesmo SHA-256, referências diferentes). Isso pode representar reutilização de uma imagem em mais de um contexto; não deduplicar nem excluir durante a migração sem validar as referências.

## 4. Decisão

- Preservar o ZIP original intacto como evidência parcial.
- Não marcar a recuperação de mídia como completa.
- Não restaurar nem carregar esses binários no Supabase da PapeLemi.
- Não usar imagens do Empório no catálogo ou na identidade da PapeLemi.
- Quando o Empório for migrado para o Supabase central, os binários serão destinados a um bucket exclusivo do Empório, com políticas e caminhos separados.

## 5. Próxima ação necessária no Empório

Reexecutar a exportação em `/admin/media-backup`, aba **Backup completo**, e guardar a lista de erros mostrada no painel.

Antes de aceitar um novo pacote:
1. `complete: true`;
2. `total_assets = exported_count`;
3. todos os binários presentes;
4. todos os tamanhos e SHA-256 conferidos;
5. zero falhas;
6. conferir no painel também o contador de assets `missing`, pois itens ausentes no catálogo podem não integrar o conjunto `active + archived` exportado.

Se a exportação voltar a falhar, registrar os sete (ou novos) `storage_path` e o erro HTTP individual antes de repetir. Não presumir que as falhas sejam imagens permanentemente ausentes; podem ser falhas transitórias de download.

## 6. Escopo da validação

Esta conferência validou o ZIP e os 444 binários que ele contém. Não acessou o bucket de origem, não restaurou arquivos, não consultou o banco do Empório, não modificou o Supabase e não realizou importação.
