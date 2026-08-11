begin;

create table if not exists public.reservation_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  customer_id uuid,
  orbit_event_id text not null,
  action text not null check (action in ('ARCHIVE','RESTORE','CANCEL','PERMANENT_DELETE')),
  reason text not null check (length(trim(reason)) >= 3),
  actor_id uuid not null references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reservation_lifecycle_project_idx on public.reservation_lifecycle_events(project_id,created_at desc);
alter table public.reservation_lifecycle_events enable row level security;
drop policy if exists reservation_lifecycle_founder_read on public.reservation_lifecycle_events;
create policy reservation_lifecycle_founder_read on public.reservation_lifecycle_events for select using(public.can_administer());
revoke insert,update,delete,truncate on public.reservation_lifecycle_events from public,anon,authenticated;

-- Every descendant of a Project is lifecycle-owned by that Project. Cascades make
-- permanent deletion atomic and prevent a partial purge from leaving child rows.
do $$
declare item record; definition text;
begin
  for item in
    with recursive descendants(parent_oid,child_oid) as (
      select 'public.projects'::regclass::oid,c.conrelid
      from pg_constraint c where c.contype='f' and c.confrelid='public.projects'::regclass
      union
      select d.child_oid,c.conrelid from descendants d join pg_constraint c on c.contype='f' and c.confrelid=d.child_oid
    )
    select distinct c.conrelid::regclass as child_table,c.conname,pg_get_constraintdef(c.oid) as definition
    from descendants d join pg_constraint c on c.contype='f' and c.conrelid=d.child_oid and c.confrelid=d.parent_oid
  loop
    definition:=regexp_replace(item.definition,' ON DELETE (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)','', 'i')||' ON DELETE CASCADE';
    execute format('alter table %s drop constraint %I',item.child_table,item.conname);
    execute format('alter table %s add constraint %I %s',item.child_table,item.conname,definition);
  end loop;
end $$;

create or replace function public.transition_reservation_lifecycle(
  p_project_id uuid,
  p_action text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid(); p public.projects%rowtype; normalized text:=upper(trim(p_action));
  occurred_at timestamptz:=now(); snapshot jsonb; previous_status text;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Administración puede gestionar el ciclo de vida de una reserva.'; end if;
  if normalized not in ('ARCHIVE','RESTORE','CANCEL','PERMANENT_DELETE') then raise exception 'Acción de ciclo de vida no válida.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Debes registrar un motivo.'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if not found then raise exception 'Reserva no encontrada.'; end if;

  snapshot:=jsonb_build_object('project',to_jsonb(p),'invoiceIds',coalesce((select jsonb_agg(id) from public.invoices where project_id=p.id),'[]'::jsonb),'portalTokenIds',coalesce((select jsonb_agg(id) from public.customer_portal_tokens where project_id=p.id),'[]'::jsonb));
  insert into public.reservation_lifecycle_events(project_id,customer_id,orbit_event_id,action,reason,actor_id,snapshot)
  values(p.id,p.customer_id,p.orbit_event_id,normalized,trim(p_reason),actor,snapshot);

  if normalized='ARCHIVE' then
    update public.projects set status='Archived',health='BLOCKED',approval_reason=p_reason,deleted_at=null,deleted_by=null,updated_by=actor where id=p.id;
    update public.customer_portal_tokens set revoked_at=occurred_at,updated_by=actor where project_id=p.id and revoked_at is null;
    update public.invoices set status='CANCELLED',cancelled_at=occurred_at,approval_reason=p_reason,updated_by=actor where project_id=p.id and status<>'PAID' and deleted_at is null;
  elsif normalized='CANCEL' then
    update public.projects set status='CANCELLED',health='BLOCKED',approval_reason=p_reason,deleted_at=occurred_at,deleted_by=actor,updated_by=actor where id=p.id;
    update public.customer_portal_tokens set revoked_at=occurred_at,updated_by=actor where project_id=p.id and revoked_at is null;
    update public.invoices set status='CANCELLED',cancelled_at=occurred_at,approval_reason=p_reason,updated_by=actor where project_id=p.id and status<>'PAID' and deleted_at is null;
  elsif normalized='RESTORE' then
    select coalesce(e.snapshot->'project'->>'status','Confirmed') into previous_status from public.reservation_lifecycle_events e where e.project_id=p.id and e.action in('ARCHIVE','CANCEL') order by e.created_at desc limit 1;
    if upper(previous_status) in('ARCHIVED','CANCELLED','CANCELED') then previous_status:='Confirmed'; end if;
    update public.projects set status=previous_status,health='ATTENTION',approval_reason=p_reason,deleted_at=null,deleted_by=null,updated_by=actor where id=p.id;
    update public.customer_portal_tokens set revoked_at=null,updated_by=actor where project_id=p.id;
    update public.invoices set status=case when paid_amount>=amount and amount>0 then 'PAID' when paid_amount>0 then 'PARTIALLY_PAID' when issue_date is null then 'DRAFT' when due_date<current_date then 'OVERDUE' else 'PENDING' end,cancelled_at=null,approval_reason=p_reason,updated_by=actor where project_id=p.id and deleted_at is null;
  else
    delete from public.projects where id=p.id;
    return jsonb_build_object('projectId',p.id,'action',normalized,'deleted',true);
  end if;

  insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
  values(p.customer_id,p.id,p.orbit_event_id,'RESERVATION_'||normalized,case normalized when 'ARCHIVE' then 'Reserva archivada' when 'RESTORE' then 'Reserva restaurada' else 'Reserva cancelada' end,p_reason,actor,'Founder','Administrator','RESERVATION_'||normalized,'Project',p.id,p_reason,'lifecycle:'||p.id||':'||normalized||':'||gen_random_uuid(),p_reason,actor);
  return jsonb_build_object('projectId',p.id,'action',normalized,'status',(select status from public.projects where id=p.id));
end $$;

revoke all on function public.transition_reservation_lifecycle(uuid,text,text) from public,anon;
grant execute on function public.transition_reservation_lifecycle(uuid,text,text) to authenticated;

create or replace function public.validate_expense_operational_owner() returns trigger language plpgsql set search_path=public as $$
declare metadata jsonb; association text;
begin
  metadata:=case when nullif(new.approval_reason,'') is null then '{}'::jsonb else new.approval_reason::jsonb end;
  association:=upper(coalesce(metadata->>'associationType',''));
  if association not in('EVENT','VEHICLE','STAFF','EQUIPMENT','RESOURCE','GENERAL') then raise exception 'Selecciona una asociación operacional válida para el gasto.'; end if;
  if association='EVENT' and new.project_id is null then raise exception 'El gasto debe quedar asociado a una reserva real.'; end if;
  if association='VEHICLE' and nullif(new.vehicle_id,'') is null then raise exception 'El gasto debe quedar asociado a un vehículo real.'; end if;
  if association='RESOURCE' and new.supply_id is null then raise exception 'El gasto debe quedar asociado a un recurso real.'; end if;
  if association in('STAFF','EQUIPMENT') and nullif(metadata->>'associationId','') is null then raise exception 'El gasto debe quedar asociado a un registro real.'; end if;
  if association='GENERAL' and new.category<>'ADMINISTRATION' then raise exception 'Los gastos generales deben utilizar la categoría Administración.'; end if;
  return new;
exception when invalid_text_representation then raise exception 'La asociación operacional del gasto no es válida.';
end $$;
drop trigger if exists expenses_require_operational_owner on public.expenses;
create trigger expenses_require_operational_owner before insert or update of project_id,vehicle_id,supply_id,category,approval_reason on public.expenses for each row execute function public.validate_expense_operational_owner();

commit;
