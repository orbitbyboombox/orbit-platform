begin;

alter table public.assignments
  add column if not exists coverage_units integer not null default 1;
alter table public.assignments
  drop constraint if exists assignments_coverage_units_check;
alter table public.assignments
  add constraint assignments_coverage_units_check check (coverage_units between 1 and 99);
create index if not exists assignments_active_coverage_idx
  on public.assignments(project_id, block_id, assignment_type, coverage_units)
  where deleted_at is null and status not in ('CANCELLED','REJECTED');

create or replace function public.guard_event_staff_capacity()
returns trigger language plpgsql security invoker set search_path=public as $$
declare required integer; occupied integer; requested integer;
begin
  if new.assignment_type not in('OPERATOR','ASSEMBLY','DISASSEMBLY') or new.deleted_at is not null or new.status in('CANCELLED','REJECTED') then return new; end if;
  if new.block_id is not null and not exists(select 1 from public.event_operational_blocks where id=new.block_id and project_id=new.project_id) then
    raise exception 'Bloque operacional no encontrado para este Evento.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text||':operational-assignment',0));
  select required_quantity into required from public.event_staff_requirements
    where project_id=new.project_id and role=new.assignment_type and block_id is not distinct from new.block_id;
  requested:=case when new.assignment_type in ('ASSEMBLY','DISASSEMBLY') then greatest(coalesce(new.coverage_units,1),1) else 1 end;
  select coalesce(sum(case when a.assignment_type in ('ASSEMBLY','DISASSEMBLY') then greatest(coalesce(a.coverage_units,1),1) else 1 end),0)
    into occupied from public.assignments a
    where a.project_id=new.project_id and a.assignment_type=new.assignment_type and a.block_id is not distinct from new.block_id
      and a.id<>new.id and a.deleted_at is null and a.status not in('CANCELLED','REJECTED');
  if occupied + requested > coalesce(required,1) then
    raise exception 'La cobertura de % supera el máximo requerido (%).',new.assignment_type,coalesce(required,1);
  end if;
  return new;
end $$;

create or replace function public.set_staff_assignment_coverage(
  p_assignment_id uuid,
  p_coverage_units integer,
  p_allow_overbook boolean default false
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.assignments%rowtype; payment public.event_staff_payments%rowtype;
  required integer; occupied integer; base_rate numeric(14,2); amount numeric(14,2); v_role text;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede gestionar cobertura.'; end if;
  if p_coverage_units is null or p_coverage_units < 1 or p_coverage_units > 99 then raise exception 'Cantidad de unidades inválida.'; end if;
  select * into a from public.assignments where id=p_assignment_id and deleted_at is null and status not in ('CANCELLED','REJECTED') for update;
  if a.id is null then raise exception 'Asignación no disponible.'; end if;
  v_role:=a.assignment_type;
  if v_role not in ('ASSEMBLY','DISASSEMBLY') then
    update public.assignments set coverage_units=1,updated_by=auth.uid() where id=a.id;
    return jsonb_build_object('assignmentId',a.id,'coverageUnits',1,'required',1,'covered',1,'pending',0);
  end if;
  select required_quantity into required from public.event_staff_requirements
    where project_id=a.project_id and event_staff_requirements.role=v_role and block_id is not distinct from a.block_id;
  required:=greatest(coalesce(required,1),1);
  select coalesce(sum(greatest(coalesce(coverage_units,1),1)),0) into occupied
    from public.assignments aa where aa.project_id=a.project_id and aa.assignment_type=v_role and aa.block_id is not distinct from a.block_id
      and aa.id<>a.id and aa.deleted_at is null and aa.status not in ('CANCELLED','REJECTED');
  if not p_allow_overbook and occupied+p_coverage_units>required then raise exception 'La cobertura supera % unidades contratadas.',required; end if;
  update public.assignments set coverage_units=p_coverage_units,resources=coalesce(resources,'{}'::jsonb)||jsonb_build_object('coverageUnits',p_coverage_units),updated_by=auth.uid() where id=a.id;
  select * into payment from public.event_staff_payments where assignment_id=a.id and deleted_at is null and status<>'CANCELLED' for update;
  if payment.id is not null then
    base_rate:=case when v_role='ASSEMBLY' then coalesce(payment.automatic_assembly_payment,payment.assembly_payment,0) else coalesce(payment.automatic_disassembly_payment,payment.disassembly_payment,0) end;
    amount:=round(base_rate*p_coverage_units/required);
    if v_role='ASSEMBLY' then
      update public.event_staff_payments set automatic_assembly_payment=amount,assembly_payment=case when override_assembly_payment is null then amount else assembly_payment end,updated_by=auth.uid() where id=payment.id;
    else
      update public.event_staff_payments set automatic_disassembly_payment=amount,disassembly_payment=case when override_disassembly_payment is null then amount else disassembly_payment end,updated_by=auth.uid() where id=payment.id;
    end if;
  end if;
  return jsonb_build_object('assignmentId',a.id,'coverageUnits',p_coverage_units,'required',required,'covered',occupied+p_coverage_units,'pending',greatest(required-occupied-p_coverage_units,0));
end $$;
grant execute on function public.set_staff_assignment_coverage(uuid,integer,boolean) to authenticated;

-- Preserve the approved FALABELLA exception while making its 2/2 coverage explicit.
update public.assignments a set coverage_units=2
from public.projects p
where p.id=a.project_id and p.event_date='2026-11-29' and upper(p.name) like '%FALABELLA%'
  and a.assignment_type in ('ASSEMBLY','DISASSEMBLY') and a.deleted_at is null and a.status not in ('CANCELLED','REJECTED');

commit;
