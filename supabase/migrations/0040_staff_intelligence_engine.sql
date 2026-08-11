begin;

alter table public.staff drop constraint if exists staff_capabilities_check;
alter table public.staff add constraint staff_capabilities_check check (
  capabilities <@ array['OPERATOR','ASSEMBLY','DISASSEMBLY','DRIVER','PHOTOGRAPHER','COORDINATOR','TECHNICIAN']::text[]
);

alter table public.event_staff_payments
  add column if not exists automatic_assembly_payment numeric(14,2) not null default 0,
  add column if not exists automatic_operator_payment numeric(14,2) not null default 0,
  add column if not exists automatic_disassembly_payment numeric(14,2) not null default 0,
  add column if not exists override_reason text,
  add column if not exists override_by uuid references auth.users(id),
  add column if not exists override_at timestamptz;

create unique index if not exists assignments_active_responsibility_idx
  on public.assignments(project_id,staff_id,assignment_type)
  where deleted_at is null and status not in ('CANCELLED','REJECTED');

update public.cost_master_entries set amount=24000 where code='OPERATOR_4_HOURS' and coalesce(amount,0)=0;
update public.cost_master_entries set amount=7000 where code in('ASSEMBLY','DISASSEMBLY') and coalesce(amount,0)=0;

create or replace function public.refresh_staff_event_payment(p_project_id uuid,p_staff_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare
  selected_assignment uuid;
  selected_tasks text[];
  hours integer;
  operator_amount numeric(14,2):=0;
  assembly_amount numeric(14,2):=0;
  disassembly_amount numeric(14,2):=0;
  existing_payment public.event_staff_payments%rowtype;
  payment_id uuid;
  event_code text;
begin
  select (array_agg(id order by id))[1],array_agg(distinct assignment_type order by assignment_type)
  into selected_assignment,selected_tasks
  from public.assignments
  where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null
    and status not in('CANCELLED','REJECTED')
    and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY');
  if selected_assignment is null then
    update public.event_staff_payments set status='CANCELLED',deleted_at=coalesce(deleted_at,now()),updated_by=p_actor
    where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null;
    return null;
  end if;

  select greatest(2,least(10,coalesce(max(duration_hours),4)))::integer into hours
  from public.project_services where project_id=p_project_id;
  select orbit_event_id into event_code from public.projects where id=p_project_id;
  if 'OPERATOR'=any(selected_tasks) then
    select coalesce(amount,0) into operator_amount from public.cost_master_entries
    where code='OPERATOR_'||hours||'_HOURS' and enabled and deleted_at is null;
  end if;
  if 'ASSEMBLY'=any(selected_tasks) then
    select coalesce(amount,0) into assembly_amount from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null;
  end if;
  if 'DISASSEMBLY'=any(selected_tasks) then
    select coalesce(amount,0) into disassembly_amount from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null;
  end if;

  select * into existing_payment from public.event_staff_payments
  where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null
  order by (assignment_id=selected_assignment) desc,created_at limit 1;

  if existing_payment.id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,destination_province,
      assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by)
    values(p_project_id,selected_assignment,p_staff_id,event_code,hours,selected_tasks,'SANTIAGO',assembly_amount,operator_amount,disassembly_amount,
      assembly_amount,operator_amount,disassembly_amount,p_actor,p_actor) returning id into payment_id;
  else
    update public.event_staff_payments set assignment_id=selected_assignment,contracted_hours=hours,tasks=selected_tasks,
      automatic_assembly_payment=assembly_amount,automatic_operator_payment=operator_amount,automatic_disassembly_payment=disassembly_amount,
      assembly_payment=case when override_at is null then assembly_amount else assembly_payment end,
      operator_payment=case when override_at is null then operator_amount else operator_payment end,
      disassembly_payment=case when override_at is null then disassembly_amount else disassembly_payment end,updated_by=p_actor
    where id=existing_payment.id returning id into payment_id;
  end if;
  update public.event_staff_payments set status='CANCELLED',deleted_at=now(),updated_by=p_actor
  where project_id=p_project_id and staff_id=p_staff_id and id<>payment_id and deleted_at is null;
  return payment_id;
end $$;

create or replace function public.set_staff_payment_override(p_payment_id uuid,p_operator numeric,p_assembly numeric,p_disassembly numeric,p_reason text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not public.can_administer() then raise exception 'Solo Administración puede ajustar pagos de Staff.'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'El motivo del ajuste es obligatorio.'; end if;
  if least(p_operator,p_assembly,p_disassembly)<0 then raise exception 'Los pagos no pueden ser negativos.'; end if;
  update public.event_staff_payments set operator_payment=p_operator,assembly_payment=p_assembly,disassembly_payment=p_disassembly,
    override_reason=trim(p_reason),override_by=auth.uid(),override_at=now(),updated_by=auth.uid()
  where id=p_payment_id and deleted_at is null;
  if not found then raise exception 'Pago de Staff no encontrado.'; end if;
end $$;

create or replace function public.sync_staff_payment_from_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.refresh_staff_event_payment(coalesce(new.project_id,old.project_id),coalesce(new.staff_id,old.staff_id),coalesce(auth.uid(),new.updated_by,old.updated_by));
  return coalesce(new,old);
end $$;

drop trigger if exists assignments_staff_payment_sync on public.assignments;
create trigger assignments_staff_payment_sync after insert or update of assignment_type,status,deleted_at or delete on public.assignments
for each row execute function public.sync_staff_payment_from_assignment();

do $$ declare item record; begin
  for item in select distinct a.project_id,a.staff_id from public.assignments a
    join public.staff s on s.id=a.staff_id and s.status='ACTIVE' and s.deleted_at is null
    where a.deleted_at is null and a.status not in('CANCELLED','REJECTED')
      and a.assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY')
  loop
    perform public.refresh_staff_event_payment(item.project_id,item.staff_id,auth.uid());
  end loop;
end $$;

commit;
