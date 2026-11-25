# Inventário do schema público — Empório Lele Cute

**Fonte:** arquivo \`emporiolelecute_261125.backup(2).zip\`, arquivo interno PostgreSQL Custom Archive.  
**Data do inventário:** 25/11/2026.  
**Status:** nomes extraídos do catálogo do dump; classificação funcional preliminar. Quantidades de registros ainda não foram extraídas.

O catálogo contém 150 tabelas no schema \`public\`. A lista abaixo é um inventário nominal, não uma decisão de descartar ou importar tabelas. Todas devem ser reconciliadas com as 199 migrações e com as dependências de código antes da migração.

## Lista completa (ordem alfabética)

\`\`\`text
access_request_notifications
admin_access_requests
admin_usage_aggregates
after_sales_followups
after_sales_rules
blog_posts
catalog_security_approvals
categories
collection_products
collections
combination_pages_registry
contact_migration_audit
cookie_consent_config
cookie_consents
coupon_uses
coupons
customers
data_deletion_requests
editorial_stories
faqs
hero_slides
home_section_audit
home_sections
homepage_blocks
image_processing_jobs
instagram_embed_failures
instagram_feed_embeds
instagram_post_attempts
instagram_posts
instagram_sync_history
internal_function_secrets
kit_products
kits
media_assets
media_audit_runs
media_backup_runs
menu_items
merchant_feed_snapshots
notification_preferences
occasion_landings
occasions
operational_settings
operational_worker_credentials
order_items
order_status_notifications
orders
page_versions
pages
payment_events
pdp_badge_events
pdp_funnel_events
pdp_section_audit
pdp_sections
product_faqs
product_occasions
product_reviews
product_segments
product_slugs
product_tags
product_versions
products
profile_change_audit
profiles
push_subscriptions
redirects
reserved_slugs
review_import_audit
role_promotion_audit
search_audit_log
search_boosts
search_query_log
search_synonyms
security_scan_runs
segments
seo_adaptive_memory
seo_alert_log
seo_causality_registry
seo_check_runs
seo_civilization_snapshots
seo_cluster_memory
seo_cognitive_snapshots
seo_coherence_conflicts
seo_coherence_matrix_snapshots
seo_consciousness_fabric_snapshots
seo_consciousness_memory
seo_consolidation_snapshots
seo_continuum_snapshots
seo_decision_lineage
seo_engine_conflicts
seo_engine_registry
seo_entity_snapshots
seo_execution_log
seo_execution_orchestrator_snapshots
seo_executive_core_snapshots
seo_executive_snapshots
seo_final_governance_snapshots
seo_governance_matrix_snapshots
seo_gsc_snapshots
seo_integrity_grid_snapshots
seo_kernel_snapshots
seo_meta_governance_snapshots
seo_meta_reasoning_snapshots
seo_metric_consistency
seo_metric_lineage
seo_metric_registry
seo_nervous_system_snapshots
seo_nexus_convergence_snapshots
seo_operating_fabric_snapshots
seo_operational_reality_snapshots
seo_operational_snapshots
seo_reasoning_conflicts
seo_reasoning_drift_registry
seo_simulation_runs
seo_snapshots
seo_stability_fabric_snapshots
seo_strategic_reality_snapshots
seo_strategy_alignment_registry
seo_strategy_memory
seo_strategy_simulations
seo_structural_dependencies
seo_submission_log
seo_system_finalization_snapshots
seo_system_health_snapshots
seo_systemic_risk_registry
seo_unified_bus_snapshots
seo_unified_nexus_snapshots
seo_url_status
shipping_audit_logs
shipping_providers
shipping_quote_cache
shipping_rules
shipping_settings
social_proof_settings
stale_bundle_logs
store_settings
support_messages
support_threads
tags
telemetry_alert_state
testimonials
theme_hubs
tracking_email_log
user_preferences
user_roles
visitor_pageviews
visitor_sessions
visitors
web_vitals_reports
wishlist_shares
wishlists
\`\`\`

## Classificação preliminar por domínio

A classificação final exige mapear FKs, funções, triggers, policies, Edge Functions e consumidores no frontend.

| Domínio | Tabelas / famílias principais |
|---|---|
| Catálogo, taxonomias e merchandising | \`products\`, \`categories\`, \`product_*\`, \`occasions\`, \`segments\`, \`tags\`, \`kits\`, \`kit_products\`, \`collections\`, \`collection_products\`, \`testimonials\`, \`social_proof_settings\` |
| Pedidos, pagamentos e pós-venda | \`orders\`, \`order_items\`, \`payment_events\`, \`coupons\`, \`coupon_uses\`, \`shipping_*\`, \`after_sales_*\`, \`order_status_notifications\`, \`tracking_email_log\` |
| Clientes, conta e atendimento | \`customers\`, \`profiles\`, \`user_preferences\`, \`wishlists\`, \`wishlist_shares\`, \`support_*\`, \`notification_preferences\`, \`push_subscriptions\`, \`data_deletion_requests\` |
| CMS, conteúdo e navegação | \`pages\`, \`page_versions\`, \`blog_posts\`, \`editorial_stories\`, \`faqs\`, \`hero_slides\`, \`home_sections\`, \`homepage_blocks\`, \`menu_items\`, \`occasion_landings\`, \`theme_hubs\` |
| SEO e descoberta | \`redirects\`, \`reserved_slugs\`, \`combination_pages_registry\`, \`seo_*\`, \`merchant_feed_snapshots\` |
| Mídia e redes sociais | \`media_assets\`, \`media_audit_runs\`, \`media_backup_runs\`, \`image_processing_jobs\`, \`instagram_*\` |
| Analytics e observabilidade | \`visitors\`, \`visitor_sessions\`, \`visitor_pageviews\`, \`cookie_*\`, \`pdp_*_events\`, \`search_*_log\`, \`web_vitals_reports\`, \`admin_usage_aggregates\`, \`telemetry_alert_state\`, \`stale_bundle_logs\` |
| Administração, auditoria e operação | \`user_roles\`, \`admin_access_requests\`, \`access_request_notifications\`, \`role_promotion_audit\`, \`profile_change_audit\`, \`contact_migration_audit\`, \`operational_settings\`, \`security_scan_runs\`, \`catalog_security_approvals\` |
| Credenciais e segredos — tratamento especial | \`internal_function_secrets\`, \`operational_worker_credentials\` |

## Regras de migração para este inventário

- Nenhuma tabela será descartada apenas por parecer antiga ou não utilizada.
- Tabelas comerciais devem receber escopo de loja.
- Tabelas de configuração e integrações devem ser classificadas por loja ou plataforma.
- Tabelas de auditoria e analytics devem preservar origem e política de retenção.
- Tabelas que armazenam segredos não devem ter valores copiados como registros comuns.
- Tabelas de usuários e perfis devem ser reconciliadas com Auth, preservando vínculos.
- O inventário de Storage exige também os binários; os metadados SQL não são backup físico das imagens.
