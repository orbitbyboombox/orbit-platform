begin;

-- Keep the commercial projection synchronized whenever the canonical
-- reservation reaches a confirmed/booked state. This is intentionally
-- fail-closed for QA/archive records and never mutates the reservation itself.
create or replace function public.sync_pipeline_from_confirmed_reservation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if upper(coalesce(new.status,'')) in ('CONFIRMED','BOOKED') then
    update public.projects p
       set pipeline_stage='GANADO',
           follow_up_status='CANCELLED',
           next_action_at=null,
           next_action_type=null,
           updated_at=now()
     where p.id=new.project_id
       and p.deleted_at is null
       and upper(coalesce(p.pipeline_stage,'')) not in ('PRUEBA','ARCHIVADO');

    update public.internal_notifications n
       set status='RESOLVED', action_required=false, read_at=coalesce(read_at,now())
     where n.project_id=new.project_id
       and n.notification_type like 'SALES_%'
       and n.status<>'RESOLVED';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_reservations_pipeline_sync on public.crm_reservations;
create trigger crm_reservations_pipeline_sync
after insert or update of status on public.crm_reservations
for each row execute function public.sync_pipeline_from_confirmed_reservation();

revoke all on function public.sync_pipeline_from_confirmed_reservation() from public, anon;
grant execute on function public.sync_pipeline_from_confirmed_reservation() to service_role;

commit;
