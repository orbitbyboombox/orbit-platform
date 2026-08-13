begin;

with ranked as (
  select id,row_number() over (partition by project_id,staff_id order by (override_at is not null) desc,updated_at desc,created_at desc,id desc) as position
  from public.event_staff_payments where deleted_at is null and status<>'CANCELLED'
)
update public.event_staff_payments payment set status='CANCELLED',deleted_at=now(),updated_at=now()
from ranked where payment.id=ranked.id and ranked.position>1;

create unique index if not exists event_staff_payments_active_event_staff_idx
on public.event_staff_payments(project_id,staff_id) where deleted_at is null and status<>'CANCELLED';

comment on table public.event_staff_payments is 'Liquidación oficial del Evento. Única fuente de pagos operacionales para Operations, Staff y Payroll.';

create or replace function public.refresh_staff_event_payment(p_project_id uuid,p_staff_id uuid,p_actor uuid default auth.uid())
returns uuid language plpgsql security definer set search_path=public as $$
declare selected_assignment uuid;selected_tasks text[];hours integer;operator_amount numeric(14,2):=0;assembly_amount numeric(14,2):=0;disassembly_amount numeric(14,2):=0;existing_payment public.event_staff_payments%rowtype;payment_id uuid;event_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_project_id::text||':'||p_staff_id::text||':event-settlement',0));
  select (array_agg(id order by id))[1],array_agg(distinct assignment_type order by assignment_type) into selected_assignment,selected_tasks
  from public.assignments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null and status not in('CANCELLED','REJECTED') and assignment_type in('OPERATOR','ASSEMBLY','DISASSEMBLY');
  if selected_assignment is null then
    update public.event_staff_payments set status='CANCELLED',deleted_at=coalesce(deleted_at,now()),updated_by=p_actor where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null;
    return null;
  end if;
  select max(duration_hours)::integer into hours from public.project_services where project_id=p_project_id;
  if hours is null then raise exception 'El Evento no tiene una duración oficial configurada.'; end if;
  select orbit_event_id into event_code from public.projects where id=p_project_id;
  if 'OPERATOR'=any(selected_tasks) then
    select amount into operator_amount from public.cost_master_entries where code='OPERATOR_'||hours||'_HOURS' and enabled and deleted_at is null;
    if coalesce(operator_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Operador para % horas.',hours; end if;
  end if;
  if 'ASSEMBLY'=any(selected_tasks) then
    select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY' and enabled and deleted_at is null;
    if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje.'; end if;
  end if;
  if 'DISASSEMBLY'=any(selected_tasks) then
    select amount into disassembly_amount from public.cost_master_entries where code='DISASSEMBLY' and enabled and deleted_at is null;
    if coalesce(disassembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Desmontaje.'; end if;
  end if;
  if 'ASSEMBLY'=any(selected_tasks) and 'DISASSEMBLY'=any(selected_tasks) then
    select amount into assembly_amount from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null;
    if coalesce(assembly_amount,0)<=0 then raise exception 'Falta la tarifa oficial de Montaje + Desmontaje.'; end if;
    disassembly_amount:=assembly_amount-round(assembly_amount/2);assembly_amount:=round(assembly_amount/2);
  end if;
  select * into existing_payment from public.event_staff_payments where project_id=p_project_id and staff_id=p_staff_id and deleted_at is null and status<>'CANCELLED' order by (override_at is not null) desc,updated_at desc limit 1;
  if existing_payment.id is null then
    insert into public.event_staff_payments(project_id,assignment_id,staff_id,orbit_event_id,contracted_hours,tasks,destination_province,assembly_payment,operator_payment,disassembly_payment,automatic_assembly_payment,automatic_operator_payment,automatic_disassembly_payment,created_by,updated_by)
    values(p_project_id,selected_assignment,p_staff_id,event_code,hours,selected_tasks,'SANTIAGO',assembly_amount,operator_amount,disassembly_amount,assembly_amount,operator_amount,disassembly_amount,p_actor,p_actor) returning id into payment_id;
  else
    update public.event_staff_payments set assignment_id=selected_assignment,contracted_hours=hours,tasks=selected_tasks,automatic_assembly_payment=assembly_amount,automatic_operator_payment=operator_amount,automatic_disassembly_payment=disassembly_amount,assembly_payment=case when override_at is null then assembly_amount else assembly_payment end,operator_payment=case when override_at is null then operator_amount else operator_payment end,disassembly_payment=case when override_at is null then disassembly_amount else disassembly_payment end,updated_by=p_actor where id=existing_payment.id returning id into payment_id;
  end if;
  return payment_id;
end $$;

create or replace function public.apply_combined_staff_rate()
returns trigger language plpgsql security definer set search_path=public as $$
declare project_ref uuid:=coalesce(new.project_id,old.project_id);staff_ref uuid:=coalesce(new.staff_id,old.staff_id);
begin
  perform public.refresh_staff_event_payment(project_ref,staff_ref,coalesce(auth.uid(),new.updated_by,old.updated_by));
  return coalesce(new,old);
end $$;

commit;
