# PapeLemi — inventário do schema original Empório

Origem: hrq16000-a11y/emporiolelecute-2026 @ d01d843c266b5a32d03af22eeaac6eda4a7fcf0f

## Contagens

| Item | Empório | PapeLemi |
|---|---:|---:|
| Migrations Supabase | 199 | — |
| Migrations Drizzle | 15 | — |
| Edge Functions | 54 | — |
| Tabelas criadas em SQL | 144 | — |
| Tabelas em types.ts | 150 | 15 |
| Funções SQL/RPC em migrations | 85 | — |
| Views em migrations | 4 | — |
| Enums | 5 | — |
| Triggers | 93 | — |
| Policies public | 240 | — |
| Policies Storage | 11 | — |
| Extensões | 4 | — |

## Reconciliação de tabelas

Nomes coincidentes: 12. Somente Empório: 138. Somente PapeLemi: 3.

A documentação anterior informava 155 tabelas Empório; o types.ts versionado contém 150. Diferença: 5. A contagem SQL e o replay local ajudam a identificar a origem da divergência.

### Tabelas presentes apenas no tipo Empório

- access_request_notifications
- admin_access_requests
- admin_usage_aggregates
- after_sales_followups
- after_sales_rules
- blog_posts
- catalog_security_approvals
- collection_products
- collections
- combination_pages_registry
- contact_migration_audit
- cookie_consent_config
- cookie_consents
- coupon_uses
- data_deletion_requests
- editorial_stories
- faqs
- hero_slides
- home_section_audit
- home_sections
- homepage_blocks
- image_processing_jobs
- instagram_embed_failures
- instagram_feed_embeds
- instagram_post_attempts
- instagram_posts
- instagram_sync_history
- internal_function_secrets
- kit_products
- kits
- media_assets
- media_audit_runs
- media_backup_runs
- menu_items
- merchant_feed_snapshots
- notification_preferences
- occasion_landings
- occasions
- operational_settings
- operational_worker_credentials
- order_status_notifications
- page_versions
- pages
- payment_events
- pdp_badge_events
- pdp_funnel_events
- pdp_section_audit
- pdp_sections
- product_faqs
- product_occasions
- product_reviews
- product_segments
- product_slugs
- product_tags
- product_versions
- profile_change_audit
- profiles
- push_subscriptions
- redirects
- reserved_slugs
- review_import_audit
- role_promotion_audit
- search_audit_log
- search_boosts
- search_query_log
- search_synonyms
- security_scan_runs
- segments
- seo_adaptive_memory
- seo_alert_log
- seo_causality_registry
- seo_check_runs
- seo_civilization_snapshots
- seo_cluster_memory
- seo_cognitive_snapshots
- seo_coherence_conflicts
- seo_coherence_matrix_snapshots
- seo_consciousness_fabric_snapshots
- seo_consciousness_memory
- seo_consolidation_snapshots
- seo_continuum_snapshots
- seo_decision_lineage
- seo_engine_conflicts
- seo_engine_registry
- seo_entity_snapshots
- seo_execution_log
- seo_execution_orchestrator_snapshots
- seo_executive_core_snapshots
- seo_executive_snapshots
- seo_final_governance_snapshots
- seo_governance_matrix_snapshots
- seo_gsc_snapshots
- seo_integrity_grid_snapshots
- seo_kernel_snapshots
- seo_meta_governance_snapshots
- seo_meta_reasoning_snapshots
- seo_metric_consistency
- seo_metric_lineage
- seo_metric_registry
- seo_nervous_system_snapshots
- seo_nexus_convergence_snapshots
- seo_operating_fabric_snapshots
- seo_operational_reality_snapshots
- seo_operational_snapshots
- seo_reasoning_conflicts
- seo_reasoning_drift_registry
- seo_simulation_runs
- seo_snapshots
- seo_stability_fabric_snapshots
- seo_strategic_reality_snapshots
- seo_strategy_alignment_registry
- seo_strategy_memory
- seo_strategy_simulations
- seo_structural_dependencies
- seo_submission_log
- seo_system_finalization_snapshots
- seo_system_health_snapshots
- seo_systemic_risk_registry
- seo_unified_bus_snapshots
- seo_unified_nexus_snapshots
- seo_url_status
- social_proof_settings
- stale_bundle_logs
- store_settings
- support_messages
- support_threads
- tags
- telemetry_alert_state
- testimonials
- theme_hubs
- tracking_email_log
- user_preferences
- visitor_pageviews
- visitor_sessions
- visitors
- web_vitals_reports
- wishlist_shares
- wishlists

### Tabelas próprias do tipo PapeLemi

- curated_phrases
- shipping_quote_rate_limits
- stores

### Tabelas tipadas sem CREATE TABLE localizado nas migrations

- after_sales_followups
- after_sales_rules
- editorial_stories
- support_messages
- support_threads
- user_preferences

### CREATE TABLE sem entrada no types.ts original

- Nenhuma

## Inventário SQL

### Tabelas

- access_request_notifications
- admin_access_requests
- admin_usage_aggregates
- blog_posts
- catalog_security_approvals
- categories
- collection_products
- collections
- combination_pages_registry
- contact_migration_audit
- cookie_consent_config
- cookie_consents
- coupon_uses
- coupons
- customers
- data_deletion_requests
- faqs
- hero_slides
- home_section_audit
- home_sections
- homepage_blocks
- image_processing_jobs
- instagram_embed_failures
- instagram_feed_embeds
- instagram_post_attempts
- instagram_posts
- instagram_sync_history
- internal_function_secrets
- kit_products
- kits
- media_assets
- media_audit_runs
- media_backup_runs
- menu_items
- merchant_feed_snapshots
- notification_preferences
- occasion_landings
- occasions
- operational_settings
- operational_worker_credentials
- order_items
- order_status_notifications
- orders
- page_versions
- pages
- payment_events
- pdp_badge_events
- pdp_funnel_events
- pdp_section_audit
- pdp_sections
- product_faqs
- product_occasions
- product_reviews
- product_segments
- product_slugs
- product_tags
- product_versions
- products
- profile_change_audit
- profiles
- push_subscriptions
- redirects
- reserved_slugs
- review_import_audit
- role_promotion_audit
- search_audit_log
- search_boosts
- search_query_log
- search_synonyms
- security_scan_runs
- segments
- seo_adaptive_memory
- seo_alert_log
- seo_causality_registry
- seo_check_runs
- seo_civilization_snapshots
- seo_cluster_memory
- seo_cognitive_snapshots
- seo_coherence_conflicts
- seo_coherence_matrix_snapshots
- seo_consciousness_fabric_snapshots
- seo_consciousness_memory
- seo_consolidation_snapshots
- seo_continuum_snapshots
- seo_decision_lineage
- seo_engine_conflicts
- seo_engine_registry
- seo_entity_snapshots
- seo_execution_log
- seo_execution_orchestrator_snapshots
- seo_executive_core_snapshots
- seo_executive_snapshots
- seo_final_governance_snapshots
- seo_governance_matrix_snapshots
- seo_gsc_snapshots
- seo_integrity_grid_snapshots
- seo_kernel_snapshots
- seo_meta_governance_snapshots
- seo_meta_reasoning_snapshots
- seo_metric_consistency
- seo_metric_lineage
- seo_metric_registry
- seo_nervous_system_snapshots
- seo_nexus_convergence_snapshots
- seo_operating_fabric_snapshots
- seo_operational_reality_snapshots
- seo_operational_snapshots
- seo_reasoning_conflicts
- seo_reasoning_drift_registry
- seo_simulation_runs
- seo_snapshots
- seo_stability_fabric_snapshots
- seo_strategic_reality_snapshots
- seo_strategy_alignment_registry
- seo_strategy_memory
- seo_strategy_simulations
- seo_structural_dependencies
- seo_submission_log
- seo_system_finalization_snapshots
- seo_system_health_snapshots
- seo_systemic_risk_registry
- seo_unified_bus_snapshots
- seo_unified_nexus_snapshots
- seo_url_status
- shipping_audit_logs
- shipping_providers
- shipping_quote_cache
- shipping_rules
- shipping_settings
- social_proof_settings
- stale_bundle_logs
- store_settings
- tags
- telemetry_alert_state
- testimonials
- theme_hubs
- tracking_email_log
- user_roles
- visitor_pageviews
- visitor_sessions
- visitors
- web_vitals_reports
- wishlist_shares
- wishlists

### Funções

- admin_audit_anomalies
- apply_default_weight
- approve_catalog_security
- audit_home_sections
- audit_pdp_sections
- audit_role_revocation
- audit_system_dump
- auto_create_redirect_on_slug_change
- bump_search_cache_version
- catalog_security_status
- check_resend_email_cooldown
- check_taxonomy_slug_unique
- claim_image_processing_jobs
- cleanup_pdp_badge_events
- cleanup_pdp_funnel_events
- cleanup_seo_url_status
- cleanup_stale_bundle_logs
- cleanup_web_vitals_history
- create_order_with_items
- enforce_catalog_security
- enforce_product_category
- enforce_product_weight_on_insert
- ensure_external_ref
- fill_product_google_category
- gen_external_ref
- gen_img_ref
- get_unified_profile
- get_unified_timeline
- guard_profiles_access_requested
- handle_new_user
- has_role
- link_visitor_to_customer
- list_admin_audit_timeline
- list_all_users
- list_all_users_paginated
- list_contact_migration_audit
- list_cron_jobs
- list_cron_runs
- list_user_audit
- log_search
- log_search_config_change
- mark_sitemap_dirty
- mark_visitor_as_lead
- media_gc_candidates
- media_relink_references
- migrate_customer_to_user_link
- migrate_visitor_to_customer
- normalize_phone_digits
- normalize_search
- normalize_slug
- notify_admins_on_access_request
- notify_order_status_change
- notify_role_change
- operational_worker_headers
- pdp_badge_stats
- pdp_funnel_stats
- product_slugs_normalize
- products_refresh_search_text
- promote_user_to_admin
- rebuild_media_inventory
- rebuild_media_inventory_internal
- record_coupon_use
- record_product_slug_hit
- refresh_admin_audit_timeline
- reject_admin_request
- request_admin_access
- resolve_product_slug
- retry_image_processing_job
- revert_product_version
- save_product_full
- search_boosts_normalize
- search_products
- set_user_role
- sync_product_slugs_from_products
- track_heartbeat
- track_pageview
- track_pdp_funnel_batch
- track_product_version
- tracking_email_log_set_actor
- trim_shipping_audit_logs
- unresolved_catalog_security_scan
- update_updated_at_column
- update_user_profile
- users_source_counts
- validate_coupon

### Views

- customer_overview
- product_review_stats
- search_insights_summary
- taxonomy_registry

### Enums

- app_role
- kit_bundle_type
- payment_status
- shipping_condition_type
- shipping_discount_type

### Buckets

- elo7-review-images
- product-images

## Limites

- Este relatório analisa arquivos versionados; não consulta o Supabase hospedado da Empório.
- O replay das migrations é executado em Supabase local isolado, com project_id emporio-local, sem seed e sem credenciais de produção.
- Nenhum dado comercial, cliente, pedido, arquivo ou credencial é importado.
- A contagem de funções, triggers, policies e buckets é inventário textual das migrations; não substitui a inspeção do catálogo PostgreSQL após o replay.
