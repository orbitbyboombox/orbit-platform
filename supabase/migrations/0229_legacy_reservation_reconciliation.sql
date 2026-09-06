begin;

-- One global reservation predicate for modern and imported historical Events.
-- Legacy records qualify only when the commercial pipeline explicitly says
-- Confirmed and both the canonical Event and financial truth are present.
create or replace function public.project_has_canonical_reservation(p_project_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.crm_reservations r
    where r.project_id=p_project_id
      and upper(coalesce(r.status,'')) in ('CONFIRMED','BOOKED')
  ) or exists (
    select 1
    from public.projects p
    join public.crm_events e on e.project_id=p.id
    join public.financial_event_records f on f.project_id=p.id and upper(coalesce(f.status,''))='CONFIRMED'
    where p.id=p_project_id
      and p.deleted_at is null
      and upper(coalesce(e.status,'')) not in ('CANCELLED','CANCELED','ARCHIVED')
      and upper(coalesce(p.operations->>'commercialStage','')) in ('CONFIRMED','PRODUCTION','FINISHED')
      and upper(coalesce(p.operations->>'stage','')) in ('RESERVA CONFIRMADA','CONFIRMED','RESERVED')
  );
$$;

revoke all on function public.project_has_canonical_reservation(uuid) from public, anon;
grant execute on function public.project_has_canonical_reservation(uuid) to authenticated, service_role;

update public.projects p
set pipeline_stage='GANADO', follow_up_status='CANCELLED', next_action_at=null, next_action_type=null, updated_at=now()
where p.deleted_at is null
  and public.project_has_canonical_reservation(p.id)
  and upper(coalesce(p.pipeline_stage,'')) not in ('PRUEBA','ARCHIVADO','GANADO');

update public.internal_notifications n
set status='RESOLVED', action_required=false, read_at=coalesce(read_at,now())
where n.notification_type like 'SALES_%' and n.status<>'RESOLVED'
  and n.project_id is not null and public.project_has_canonical_reservation(n.project_id);

commit;
