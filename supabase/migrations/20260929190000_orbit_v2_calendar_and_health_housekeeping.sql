begin;

update public.calendar_sync cs
   set status = 'DELETED',
       retry_count = 0,
       next_retry_at = null,
       sync_started_at = null,
       last_error = null,
       last_error_code = null,
       updated_at = now()
  from public.projects p
 where p.id = cs.project_id
   and cs.status = 'FAILED'
   and upper(coalesce(p.status,'')) in ('CANCELLED','CANCELED','CANCELADO','CANCELADA')
   and cs.last_error->>'message' = 'CALENDAR_MAPPING_MISSING';

update public.system_health_alerts
   set status='RESOLVED',
       resolved_at=now(),
       metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
         'v2_certification_resolution', true,
         'reason',
         case
           when alert_key='health:auditoría' then 'Audit trail active and recording current rows.'
           else 'Supabase Realtime is not an ORBIT BOOMBOX V2 runtime dependency.'
         end
       )
 where status='OPEN'
   and alert_key in ('health:auditoría','health:realtime');

commit;
