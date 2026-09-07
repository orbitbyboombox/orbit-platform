-- Final confirmation gate: cover direct CONFIRMED inserts and serialize the
-- last-unit check. Draft quotations remain informational and never commit
-- capacity.
begin;

create or replace function public.enforce_reservation_capacity_gate()
returns trigger language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if new.status='CONFIRMED' and coalesce(old.status,'')<>'CONFIRMED' then
    perform pg_advisory_xact_lock(hashtextextended('orbit:reservation-capacity',0));
    result:=public.preflight_reservation_capacity(new.project_id);
    if result->>'status'='UNAVAILABLE' then
      raise exception 'Reserva bloqueada por capacidad operativa: %',result->>'reasonCode'
        using errcode='P0001',detail=result::text;
    end if;
    if result->>'status'='REVIEW_REQUIRED' then
      raise exception 'Reserva requiere revisión de capacidad: %',result->>'reasonCode'
        using errcode='P0001',detail=result::text;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_reservations_capacity_gate on public.crm_reservations;
create trigger crm_reservations_capacity_gate
before insert or update of status on public.crm_reservations
for each row execute function public.enforce_reservation_capacity_gate();

commit;
