-- Local-only replay shim: the source project already has these jobs; a fresh local DB does not.
DO $$
DECLARE
  v_job_id integer;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'submit-sitemap-weekly' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'weekly-sitemap-submission' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'submit-sitemap-12h' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'seo-sitemap-auto-resubmit-15m' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.alter_job(v_job_id, schedule := '7 * * * *'); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'telemetry-alert-monitor-15m' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.alter_job(v_job_id, schedule := '23 * * * *'); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'instagram-sync-hourly' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.alter_job(v_job_id, schedule := '0 */6 * * *'); END IF;
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'instagram-bulk-refresh-hourly' ORDER BY jobid LIMIT 1;
  IF v_job_id IS NOT NULL THEN PERFORM cron.alter_job(v_job_id, schedule := '17 */6 * * *'); END IF;
END;
$$;

-- Validação diária com gate de diff (só reenvia quando algo mudou)
SELECT cron.schedule(
  'seo-daily-guard',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'http://127.0.0.1:54321/functions/v1/seo-daily-guard',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.internal_function_secrets WHERE key = 'service_role_key')
    ),
    body := '{"force": false}'::jsonb
  );
  $$
);