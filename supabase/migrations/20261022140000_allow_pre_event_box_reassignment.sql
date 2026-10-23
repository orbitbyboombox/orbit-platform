begin;

-- A pre-event Caja replacement returns the previous assignment, but it is not
-- an operational paper closeout. Keep the closeout guard for every other
-- return path, including manual removal and staff check-in.
create or replace function public.phase_c5_require_paper_closeout()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.assignment_status='RETURNED'
     and old.assignment_status is distinct from 'RETURNED'
     and coalesce(new.release_reason,'') <> 'Reemplazo manual desde Event 360'
     and exists(
       select 1
       from public.event_paper_snapshots s
       where s.asset_assignment_id=new.id
         and s.paper_required
         and s.status not in('CONFIRMED','OVERRIDDEN')
     ) then
    raise exception 'Falta registrar el papel restante de la impresora. Ingresa la cantidad antes de finalizar el cierre del evento.';
  end if;
  return new;
end;
$$;

commit;
