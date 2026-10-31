begin;

-- Founder/Admin assignments are operational corrections, not demand fulfillment.
-- Requirements remain reporting guidance; this removes the artificial capacity
-- rejection while preserving block validity and the existing unique indexes.
create or replace function public.guard_event_staff_capacity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.assignment_type not in ('OPERATOR', 'ASSEMBLY', 'DISASSEMBLY')
     or new.deleted_at is not null
     or new.status in ('CANCELLED', 'REJECTED') then
    return new;
  end if;

  if new.block_id is not null
     and not exists (
       select 1
       from public.event_operational_blocks
       where id = new.block_id
         and project_id = new.project_id
     ) then
    raise exception 'Bloque operacional no encontrado para este Evento.';
  end if;

  return new;
end;
$$;

comment on function public.guard_event_staff_capacity() is
  'Requirements guide staffing coverage; Founder/Admin may add or replace assignments without an artificial capacity ceiling.';

commit;
