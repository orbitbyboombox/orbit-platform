begin;

create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  orbit_event_id text not null unique,
  event_type text not null,
  event_date date,
  status text not null default 'UPCOMING',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_reservations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete cascade,
  event_id uuid not null unique references public.crm_events(id) on delete cascade,
  reservation_method text not null default 'MANUAL' check (reservation_method in ('MANUAL','AUTOMATIC')),
  status text not null default 'DRAFT',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.timeline_events add column if not exists crm_event_id uuid references public.crm_events(id) on delete cascade;
create index if not exists crm_events_customer_idx on public.crm_events(customer_id,event_date desc);
create index if not exists crm_reservations_customer_idx on public.crm_reservations(customer_id,created_at desc);
create index if not exists timeline_events_crm_event_idx on public.timeline_events(crm_event_id,occurred_at desc);

create table if not exists public.crm_customer_merges (
  duplicate_customer_id uuid primary key references public.customers(id) on delete restrict,
  master_customer_id uuid not null references public.customers(id) on delete restrict,
  reason text not null,
  merged_by uuid not null references auth.users(id),
  merged_at timestamptz not null default now(),
  check(master_customer_id<>duplicate_customer_id)
);
alter table public.crm_customer_merges enable row level security;
drop policy if exists crm_customer_merges_internal_read on public.crm_customer_merges;
create policy crm_customer_merges_internal_read on public.crm_customer_merges for select using(public.is_internal_user());
revoke insert,update,delete,truncate on public.crm_customer_merges from public,anon,authenticated;
create or replace view public.crm_customer_timeline with(security_invoker=true) as
select t.id,coalesce(m.master_customer_id,t.customer_id) customer_id,t.project_id,t.crm_event_id,t.title,t.human_message,t.occurred_at
from public.timeline_events t left join public.crm_customer_merges m on m.duplicate_customer_id=t.customer_id;

alter table public.crm_events enable row level security;
alter table public.crm_reservations enable row level security;
drop policy if exists crm_events_internal_all on public.crm_events;
create policy crm_events_internal_all on public.crm_events for all using(public.is_internal_user()) with check(public.is_internal_user());
drop policy if exists crm_reservations_internal_all on public.crm_reservations;
create policy crm_reservations_internal_all on public.crm_reservations for all using(public.is_internal_user()) with check(public.is_internal_user());

insert into public.crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
select p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,
  case when upper(p.status) in ('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'UPCOMING' end,
  p.created_by,p.updated_by
from public.projects p
where not exists(select 1 from public.crm_events e where e.project_id=p.id)
on conflict(project_id) do nothing;

insert into public.crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
select p.customer_id,p.id,e.id,coalesce(nullif(upper(p.operations->>'reservationMethod'),''),'MANUAL'),
  case when upper(p.status) in ('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,
  p.created_by,p.updated_by
from public.projects p join public.crm_events e on e.project_id=p.id
where not exists(select 1 from public.crm_reservations r where r.project_id=p.id)
on conflict(project_id) do nothing;

-- Timeline es append-only. El historial conserva su vínculo por project_id y los
-- nuevos registros escriben crm_event_id desde la transacción customer-first.

create table if not exists public.crm_data_integrity_issues (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null,
  entity_type text not null,
  entity_id uuid,
  related_ids uuid[] not null default '{}',
  details jsonb not null default '{}',
  status text not null default 'OPEN' check(status in('OPEN','REPAIRED','IGNORED')),
  detected_at timestamptz not null default now(),
  repaired_at timestamptz,
  unique(issue_type,entity_type,entity_id)
);
alter table public.crm_data_integrity_issues enable row level security;
drop policy if exists crm_integrity_founder_read on public.crm_data_integrity_issues;
create policy crm_integrity_founder_read on public.crm_data_integrity_issues for select using(public.can_administer());
revoke insert,update,delete,truncate on public.crm_data_integrity_issues from public,anon,authenticated;

create or replace function public.audit_crm_integrity() returns jsonb
language plpgsql security definer set search_path=public as $$
declare repaired_events integer:=0; repaired_reservations integer:=0; repaired_timeline integer:=0; duplicate_groups integer:=0;
begin
  if auth.uid() is not null and not public.can_administer() then raise exception 'Solo Administración puede auditar el CRM.'; end if;
  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
  select p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,'UPCOMING',p.created_by,p.updated_by from projects p
  where not exists(select 1 from crm_events e where e.project_id=p.id) on conflict(project_id) do nothing;
  get diagnostics repaired_events=row_count;
  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
  select p.customer_id,p.id,e.id,coalesce(nullif(upper(p.operations->>'reservationMethod'),''),'MANUAL'),'CONFIRMED',p.created_by,p.updated_by
  from projects p join crm_events e on e.project_id=p.id where not exists(select 1 from crm_reservations r where r.project_id=p.id)
  on conflict(project_id) do nothing;
  get diagnostics repaired_reservations=row_count;
  repaired_timeline:=0;
  insert into crm_data_integrity_issues(issue_type,entity_type,entity_id,related_ids,details)
  select 'DUPLICATE_CUSTOMER','Customer',(array_agg(c.id order by c.created_at))[1],array_agg(c.id order by c.created_at),
    jsonb_build_object('matchKey',k,'count',count(*))
  from customers c cross join lateral(values(
    coalesce(nullif(regexp_replace(upper(c.rut),'[^0-9K]','','g'),''),nullif(lower(trim(c.email)),''),nullif(regexp_replace(c.phone,'[^0-9]','','g'),''))
  )) key(k)
  where c.deleted_at is null and k is not null group by k having count(*)>1
  on conflict(issue_type,entity_type,entity_id) do update set related_ids=excluded.related_ids,details=excluded.details,status='OPEN',detected_at=now();
  get diagnostics duplicate_groups=row_count;
  return jsonb_build_object('eventsRepaired',repaired_events,'reservationsRepaired',repaired_reservations,'timelineRepaired',repaired_timeline,'duplicateGroups',duplicate_groups);
end $$;

create or replace function public.merge_crm_customers(p_master_customer_id uuid,p_duplicate_customer_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); master customers%rowtype; duplicate customers%rowtype; moved_events integer:=0;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede fusionar clientes.'; end if;
  if p_master_customer_id=p_duplicate_customer_id then raise exception 'Selecciona dos clientes distintos.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'El motivo de la fusión es obligatorio.'; end if;
  select * into master from customers where id=p_master_customer_id and deleted_at is null for update;
  select * into duplicate from customers where id=p_duplicate_customer_id and deleted_at is null for update;
  if master.id is null or duplicate.id is null then raise exception 'Uno de los clientes ya no está activo.'; end if;

  if master.auth_user_id is null and duplicate.auth_user_id is not null then update customers set auth_user_id=null where id=duplicate.id; end if;
  update customers set
    full_name=coalesce(nullif(master.full_name,''),duplicate.full_name),email=coalesce(master.email,duplicate.email),phone=coalesce(master.phone,duplicate.phone),
    company=coalesce(master.company,duplicate.company),address=coalesce(master.address,duplicate.address),city=coalesce(master.city,duplicate.city),
    rut=coalesce(master.rut,duplicate.rut),metadata=coalesce(duplicate.metadata,'{}')||coalesce(master.metadata,'{}'),
    auth_user_id=coalesce(master.auth_user_id,duplicate.auth_user_id),approval_reason=p_reason,updated_by=actor
  where id=master.id;
  update projects set customer_id=master.id,updated_by=actor where customer_id=duplicate.id; get diagnostics moved_events=row_count;
  update crm_events set customer_id=master.id,updated_by=actor where customer_id=duplicate.id;
  update crm_reservations set customer_id=master.id,updated_by=actor where customer_id=duplicate.id;
  insert into crm_customer_merges(duplicate_customer_id,master_customer_id,reason,merged_by) values(duplicate.id,master.id,p_reason,actor);
  update quotations set customer_id=master.id,updated_by=actor where customer_id=duplicate.id;
  update invoices set customer_id=master.id,updated_by=actor where customer_id=duplicate.id;
  update customer_portal_tokens set customer_id=master.id,updated_by=actor where customer_id=duplicate.id;
  update internal_notifications set customer_id=master.id where customer_id=duplicate.id;
  update communications set customer_id=master.id where customer_id=duplicate.id;
  update documents set customer_id=master.id where customer_id=duplicate.id;
  update tasks set customer_id=master.id where customer_id=duplicate.id;
  update portal_access_attempts set customer_id=master.id where customer_id=duplicate.id;
  update experience_reviews set customer_id=master.id where customer_id=duplicate.id;
  update event_checklists set customer_id=master.id where customer_id=duplicate.id;
  update financial_event_records set customer_id=master.id where customer_id=duplicate.id;
  update reservation_lifecycle_events set customer_id=master.id where customer_id=duplicate.id;

  if exists(select 1 from customer_memory where customer_id=duplicate.id) then
    if exists(select 1 from customer_memory where customer_id=master.id) then
      update customer_memory m set context=coalesce((select context from customer_memory where customer_id=duplicate.id),'{}')||m.context,updated_by=actor where customer_id=master.id;
      delete from customer_memory where customer_id=duplicate.id;
    else update customer_memory set customer_id=master.id,updated_by=actor where customer_id=duplicate.id; end if;
  end if;
  if exists(select 1 from conversation_states where customer_id=duplicate.id) then
    if exists(select 1 from conversation_states where customer_id=master.id) then delete from conversation_states where customer_id=duplicate.id;
    else update conversation_states set customer_id=master.id where customer_id=duplicate.id; end if;
  end if;
  if exists(select 1 from customer_financial_profiles where customer_id=duplicate.id) then
    if exists(select 1 from customer_financial_profiles where customer_id=master.id) then delete from customer_financial_profiles where customer_id=duplicate.id;
    else update customer_financial_profiles set customer_id=master.id,updated_by=actor where customer_id=duplicate.id; end if;
  end if;

  update customers set deleted_at=now(),deleted_by=actor,approval_reason=p_reason,
    metadata=coalesce(metadata,'{}')||jsonb_build_object('mergedInto',master.id,'mergedAt',now(),'mergeReason',p_reason),updated_by=actor
  where id=duplicate.id;
  insert into audit_events(entity_type,entity_id,action,actor_id,reason,previous_state,new_state)
  values('customers',master.id::text,'CUSTOMER_MERGED',actor,p_reason,to_jsonb(duplicate),jsonb_build_object('masterCustomerId',master.id,'movedEvents',moved_events));
  update crm_data_integrity_issues set status='REPAIRED',repaired_at=now() where issue_type='DUPLICATE_CUSTOMER' and duplicate.id=any(related_ids);
  return jsonb_build_object('masterCustomerId',master.id,'archivedCustomerId',duplicate.id,'movedEvents',moved_events);
end $$;

create or replace function public.create_manual_reservation_atomic(p_draft jsonb)
returns table(customer_id uuid,project_id uuid,orbit_event_id text,customer_created boolean,project_created boolean)
language plpgsql security invoker set search_path=public as $$
declare actor uuid:=auth.uid(); d_customer jsonb:=p_draft->'client'; d_event jsonb:=p_draft->'event'; c_id uuid; p_id uuid:=gen_random_uuid(); crm_id uuid; event_id text; new_customer boolean:=false; service text; normalized_rut text:=regexp_replace(upper(coalesce(d_customer->>'rut','')),'[^0-9K]','','g');
begin
  if actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select c.id into c_id from customers c where c.deleted_at is null and (
    (normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut) or
    (nullif(lower(trim(d_customer->>'email')),'') is not null and lower(trim(c.email))=lower(trim(d_customer->>'email'))) or
    (nullif(regexp_replace(d_customer->>'phone','[^0-9]','','g'),'') is not null and regexp_replace(c.phone,'[^0-9]','','g')=regexp_replace(d_customer->>'phone','[^0-9]','','g'))
  ) order by case when normalized_rut<>'' and regexp_replace(upper(coalesce(c.rut,'')),'[^0-9K]','','g')=normalized_rut then 0 else 1 end,c.created_at limit 1 for update;
  if c_id is null then
    c_id:=gen_random_uuid();new_customer:=true;
    insert into customers(id,full_name,email,phone,company,rut,address,city,metadata,created_by,updated_by)
    values(c_id,d_customer->>'name',d_customer->>'email',d_customer->>'phone',nullif(d_customer->>'company',''),nullif(d_customer->>'rut',''),nullif(d_customer->>'address',''),d_event->>'city',jsonb_build_object('leadSource',p_draft->>'origin'),actor,actor);
  else
    update customers set full_name=coalesce(nullif(d_customer->>'name',''),full_name),email=coalesce(nullif(d_customer->>'email',''),email),phone=coalesce(nullif(d_customer->>'phone',''),phone),company=coalesce(nullif(d_customer->>'company',''),company),address=coalesce(nullif(d_customer->>'address',''),address),updated_by=actor where id=c_id;
  end if;
  event_id:='ORB-'||left(d_event->>'date',4)||'-'||lpad(((abs(hashtext(p_id::text))%999999)+1)::text,6,'0');
  insert into projects(id,customer_id,orbit_event_id,name,project_type,status,health,event_date,event_time,location,city,operations,created_by,updated_by)
  values(p_id,c_id,event_id,coalesce(nullif(d_customer->>'company',''),d_customer->>'name'),p_draft->>'type','Upcoming','Healthy',(d_event->>'date')::date,(d_event->>'time')::time,d_event->>'location',d_event->>'city',jsonb_build_object('stage','Primer contacto','commercialStage','New','origin',p_draft->>'origin','notes',coalesce(p_draft->>'notes',''),'score',60,'durationHours',coalesce((d_event->>'durationHours')::numeric,2),'extras',coalesce(d_event->'extras','[]'::jsonb),'reservationMethod','MANUAL'),actor,actor);
  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by) values(c_id,p_id,event_id,p_draft->>'type',(d_event->>'date')::date,'UPCOMING',actor,actor) returning id into crm_id;
  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by) values(c_id,p_id,crm_id,'MANUAL','DRAFT',actor,actor);
  for service in select jsonb_array_elements_text(coalesce(p_draft->'services','[]'::jsonb)) loop insert into project_services(project_id,service_code,duration_hours,extras) values(p_id,service,coalesce((d_event->>'durationHours')::numeric,2),coalesce(d_event->'extras','[]'::jsonb)); end loop;
  insert into timeline_events(customer_id,project_id,crm_event_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,new_state,created_by)
  values(c_id,p_id,crm_id,event_id,'RESERVATION_CREATED','Nueva reserva manual','Cliente reutilizado o creado antes del nuevo evento.',actor,'Administrador','Administrator','RESERVATION_CREATED','Reservation',p_id,case when new_customer then 'Cliente y evento creados.' else 'Cliente existente reutilizado; nuevo evento creado.' end,'reservation:'||p_id,'DRAFT',actor);
  if new_customer then insert into customer_memory(customer_id,context,created_by,updated_by) values(c_id,jsonb_build_object('customerName',d_customer->>'name','currentTimelineStage','Nuevo','nextRecommendedAction','Realizar primer contacto'),actor,actor); end if;
  return query select c_id,p_id,event_id,new_customer,true;
end $$;

revoke all on function public.audit_crm_integrity() from public,anon;
grant execute on function public.audit_crm_integrity() to authenticated;
revoke all on function public.merge_crm_customers(uuid,uuid,text) from public,anon;
grant execute on function public.merge_crm_customers(uuid,uuid,text) to authenticated;
grant execute on function public.create_manual_reservation_atomic(jsonb) to authenticated;

select public.audit_crm_integrity();
commit;
