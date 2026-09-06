begin;

-- Make the canonical reservation state authoritative in the commercial projection.
update public.projects p
   set pipeline_stage = 'GANADO',
       follow_up_status = 'CANCELLED',
       next_action_at = null,
       next_action_type = null,
       updated_at = now()
 where p.deleted_at is null
   and exists (
     select 1 from public.crm_reservations r
      where r.project_id = p.id
        and upper(coalesce(r.status, '')) in ('CONFIRMED', 'BOOKED')
   )
   and upper(coalesce(p.pipeline_stage, '')) not in ('PRUEBA', 'ARCHIVADO');

create or replace function public.close_closed_sales_alerts()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare affected integer := 0;
begin
  if auth.role() <> 'service_role' and not public.can_administer() then
    raise exception 'Solo Founder o Administración puede reconciliar pendientes.';
  end if;
  update internal_notifications n
     set status = 'RESOLVED', action_required = false, read_at = coalesce(read_at, now())
    from projects p
   where n.project_id = p.id
     and n.notification_type like 'SALES_%'
     and n.status <> 'RESOLVED'
     and upper(coalesce(p.pipeline_stage, p.operations->>'pipelineStage', 'NUEVO'))
         in ('GANADO','PERDIDO','CANCELADO','PRUEBA','ARCHIVADO');
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.close_closed_sales_alerts() from public, anon;
grant execute on function public.close_closed_sales_alerts() to authenticated, service_role;
commit;
