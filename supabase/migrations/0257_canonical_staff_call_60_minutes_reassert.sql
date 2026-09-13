-- Reassert the Founder-approved 60 minute Staff Call rule after 0256.
create or replace function public.calculate_staff_call_at(p_service_start_at timestamptz)
returns timestamptz
language sql
stable
as $$ select p_service_start_at - interval '60 minutes' $$;

comment on function public.calculate_staff_call_at(timestamptz) is
  'Canonical staff call: service start minus 60 minutes in America/Santiago, unless Founder override is persisted.';

alter table public.assignments drop constraint if exists assignments_staff_call_source_check;
alter table public.assignments add constraint assignments_staff_call_source_check
  check (staff_call_source is null or staff_call_source in ('DEFAULT_60_MINUTES','DEFAULT_90_MINUTES','FOUNDER_OVERRIDE','LEGACY'));

update public.assignments a
set staff_call_at = public.calculate_staff_call_at(c.service_start_at),
    staff_call_source = 'DEFAULT_60_MINUTES',
    updated_at = now()
from public.project_operational_contracts c
where c.project_id = a.project_id
  and a.staff_call_source <> 'FOUNDER_OVERRIDE'
  and a.deleted_at is null
  and a.status not in ('CANCELLED','REJECTED')
  and c.service_start_at is not null;
