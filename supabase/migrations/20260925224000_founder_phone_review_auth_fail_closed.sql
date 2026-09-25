begin;

create or replace function public.review_customer_phone(
  p_customer_ids uuid[],
  p_decision text,
  p_phone text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  canonical text := public.normalize_phone_e164(p_phone);
  row_customer public.customers%rowtype;
  conflicting_id uuid;
  audit_orbit_event_id text;
  reviewed_count integer := 0;
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select role into actor_role from public.profiles where id = actor;
  if actor_role is null or actor_role not in ('CEO', 'ADMINISTRATOR') then raise exception 'PHONE_REVIEW_FORBIDDEN'; end if;
  if p_customer_ids is null or cardinality(p_customer_ids) = 0 then raise exception 'PHONE_REVIEW_CUSTOMER_REQUIRED'; end if;
  if p_decision not in ('CANONICALIZED','KEEP_SEPARATE','MARK_REVIEWED','NO_PHONE','LEFT_UNRESOLVED') then raise exception 'PHONE_REVIEW_DECISION_INVALID'; end if;
  if p_decision = 'CANONICALIZED' and (cardinality(p_customer_ids) <> 1 or canonical is null) then raise exception 'PHONE_CANONICAL_REQUIRED'; end if;
  if p_decision <> 'CANONICALIZED' and p_phone is not null and nullif(trim(p_phone), '') is not null then raise exception 'PHONE_REVIEW_PHONE_NOT_ALLOWED'; end if;
  if p_decision = 'NO_PHONE' and cardinality(p_customer_ids) <> 1 then raise exception 'PHONE_REVIEW_SINGLE_CUSTOMER_REQUIRED'; end if;
  if exists (select 1 from public.customers c where c.id = any(p_customer_ids) and c.deleted_at is not null) then raise exception 'PHONE_REVIEW_CUSTOMER_INACTIVE'; end if;
  if (select count(*) from public.customers c where c.id = any(p_customer_ids)) <> cardinality(p_customer_ids) then raise exception 'PHONE_REVIEW_CUSTOMER_NOT_FOUND'; end if;
  if canonical is not null then
    select c.id into conflicting_id from public.customers c where c.deleted_at is null and c.phone_e164 = canonical and not (c.id = any(p_customer_ids)) limit 1;
    if conflicting_id is not null then raise exception 'PHONE_CANONICAL_CONFLICT'; end if;
  end if;
  for row_customer in select * from public.customers c where c.id = any(p_customer_ids) order by c.id for update loop
    update public.customers
    set phone = case when p_decision = 'CANONICALIZED' then canonical else row_customer.phone end,
        phone_e164 = case when p_decision = 'CANONICALIZED' then canonical else row_customer.phone_e164 end,
        phone_e164_status = case when p_decision = 'CANONICALIZED' then 'VALID_E164' when p_decision = 'NO_PHONE' then 'EMPTY' else row_customer.phone_e164_status end,
        phone_reviewed_at = now(), phone_reviewed_by = actor, phone_review_decision = p_decision,
        updated_by = actor, updated_at = now()
    where id = row_customer.id;
    select coalesce((select p.orbit_event_id from public.projects p where p.customer_id = row_customer.id and p.deleted_at is null and nullif(trim(p.orbit_event_id), '') is not null order by p.event_date desc nulls last, p.created_at desc limit 1), 'CRM-CUSTOMER-' || row_customer.id::text) into audit_orbit_event_id;
    insert into public.timeline_events(customer_id, orbit_event_id, event_type, title, description, actor_id, actor_label, source, action, entity_type, entity_id, human_message, correlation_id, created_by)
    values(row_customer.id, audit_orbit_event_id, 'CUSTOMER_PHONE_REVIEWED', 'Revisión de teléfono', jsonb_build_object('decision', p_decision, 'oldPhone', row_customer.phone, 'oldPhoneE164', row_customer.phone_e164, 'newPhoneE164', case when p_decision = 'CANONICALIZED' then canonical else row_customer.phone_e164 end, 'reviewedAt', now())::text, actor, case when actor_role = 'CEO' then 'Founder' else 'Administrador' end, 'Administrator', 'CUSTOMER_PHONE_REVIEW', 'Customer', row_customer.id, 'Revisión de teléfono registrada por Administración.', 'customer-phone-review:' || row_customer.id::text || ':' || extract(epoch from clock_timestamp())::bigint, actor);
    reviewed_count := reviewed_count + 1;
  end loop;
  return jsonb_build_object('reviewedCount', reviewed_count, 'decision', p_decision);
end;
$$;

revoke all on function public.review_customer_phone(uuid[], text, text) from public, anon;
grant execute on function public.review_customer_phone(uuid[], text, text) to authenticated;

commit;
