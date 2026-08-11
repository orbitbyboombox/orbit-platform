begin;

create table if not exists public.crm_profile_diagnostics (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null,
  module text not null,
  failed_component text not null,
  exception text not null,
  suggested_cause text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.crm_profile_diagnostics enable row level security;
drop policy if exists crm_profile_diagnostics_founder_read on public.crm_profile_diagnostics;
create policy crm_profile_diagnostics_founder_read on public.crm_profile_diagnostics
for select using (public.can_administer());
revoke insert,update,delete,truncate on public.crm_profile_diagnostics from public,anon,authenticated;

create or replace function public.record_crm_diagnostic(
  p_customer_id uuid,
  p_customer_name text,
  p_module text,
  p_failed_component text,
  p_exception text,
  p_suggested_cause text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if auth.uid() is null or not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;
  insert into crm_profile_diagnostics(customer_id,customer_name,module,failed_component,exception,suggested_cause,actor_id)
  values(p_customer_id,coalesce(nullif(trim(p_customer_name),''),'Cliente legacy'),p_module,p_failed_component,p_exception,p_suggested_cause,auth.uid())
  returning id into result;
  return result;
end $$;
revoke all on function public.record_crm_diagnostic(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.record_crm_diagnostic(uuid,text,text,text,text,text) to authenticated;

-- Reconcile legacy ownership without deleting operational history.
update public.crm_events e set customer_id=p.customer_id,updated_at=now()
from public.projects p where e.project_id=p.id and e.customer_id is distinct from p.customer_id;

update public.crm_reservations r set customer_id=e.customer_id,updated_at=now()
from public.crm_events e where r.event_id=e.id and r.customer_id is distinct from e.customer_id;

update public.timeline_events t set customer_id=p.customer_id,crm_event_id=e.id
from public.projects p left join public.crm_events e on e.project_id=p.id
where t.project_id=p.id and (t.customer_id is distinct from p.customer_id or (t.crm_event_id is null and e.id is not null));

update public.quotations q set customer_id=p.customer_id,updated_at=now()
from public.projects p where q.project_id=p.id and q.customer_id is distinct from p.customer_id;

update public.invoices i set customer_id=p.customer_id,updated_at=now()
from public.projects p where i.project_id=p.id and i.customer_id is distinct from p.customer_id;

select public.audit_crm_integrity();

commit;
