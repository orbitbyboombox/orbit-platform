begin;

alter table public.founder_workspace_preferences
  add column if not exists navigation_order text[] not null default array['HOME','CUSTOMERS','EVENTS','STAFF','RESOURCES','FINANCE','RECEIVABLES','REPORTS','SETTINGS'],
  add column if not exists hidden_navigation text[] not null default '{}';

drop function if exists public.save_founder_workspace(text[],text[],text[],text[],text[],text[]);
create or replace function public.save_founder_workspace(
  p_quick_action_order text[],
  p_hidden_quick_actions text[],
  p_favorite_quick_actions text[],
  p_widget_order text[],
  p_hidden_widgets text[],
  p_hidden_event_modules text[],
  p_navigation_order text[],
  p_hidden_navigation text[]
) returns void language plpgsql security invoker set search_path=public as $$
declare
  actions constant text[]:=array['NEW_RESERVATION','CUSTOMERS','STAFF','CALENDAR','NEW_EXPENSE','NEW_EVENT','SUPPLIER'];
  widgets constant text[]:=array['TODAY_EVENTS','UPCOMING_EVENTS','ACCOUNTS_RECEIVABLE','ACCOUNTS_PAYABLE','MONTHLY_REVENUE','OPERATIONAL_COST','PROFITABILITY','BUSINESS_INTELLIGENCE','FUEL','PAPER_CONSUMPTION','STAFF','FLEET','NOTIFICATIONS'];
  event_modules constant text[]:=array['GENERAL_INFORMATION','FINANCIAL_SUMMARY','STAFF','DOCUMENTS','CUSTOMER_PORTAL','GOOGLE_CALENDAR','TIMELINE','EVENT_HEALTH','CHECKLIST','MILESTONES','GOOGLE_WORKSPACE','PAYROLL','OPERATIONAL_CONTROL','TASK_CENTER','COMMERCIAL_NEGOTIATION'];
  navigation constant text[]:=array['HOME','CUSTOMERS','EVENTS','STAFF','RESOURCES','FINANCE','RECEIVABLES','REPORTS','SETTINGS'];
begin
  if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede configurar Mi Escritorio.'; end if;
  if p_quick_action_order is null or p_widget_order is null or p_navigation_order is null
    or not(actions@>p_quick_action_order and p_quick_action_order@>actions)
    or not(widgets@>p_widget_order and p_widget_order@>widgets)
    or not(navigation@>p_navigation_order and p_navigation_order@>navigation)
  then raise exception 'Configuración de escritorio inválida.'; end if;
  if not(
    p_hidden_quick_actions<@actions and p_favorite_quick_actions<@actions
    and p_hidden_widgets<@widgets and p_hidden_event_modules<@event_modules
    and p_hidden_navigation<@navigation
  ) then raise exception 'Elementos de escritorio inválidos.'; end if;

  insert into public.founder_workspace_preferences(
    user_id,quick_action_order,hidden_quick_actions,favorite_quick_actions,
    widget_order,hidden_widgets,hidden_event_modules,navigation_order,hidden_navigation
  ) values(
    auth.uid(),p_quick_action_order,p_hidden_quick_actions,p_favorite_quick_actions,
    p_widget_order,p_hidden_widgets,p_hidden_event_modules,p_navigation_order,p_hidden_navigation
  )
  on conflict(user_id) do update set
    quick_action_order=excluded.quick_action_order,
    hidden_quick_actions=excluded.hidden_quick_actions,
    favorite_quick_actions=excluded.favorite_quick_actions,
    widget_order=excluded.widget_order,
    hidden_widgets=excluded.hidden_widgets,
    hidden_event_modules=excluded.hidden_event_modules,
    navigation_order=excluded.navigation_order,
    hidden_navigation=excluded.hidden_navigation,
    version=founder_workspace_preferences.version+1,
    updated_at=now();
end $$;

grant execute on function public.save_founder_workspace(text[],text[],text[],text[],text[],text[],text[],text[]) to authenticated;

create or replace function public.verify_crm_customer_integrity(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  repaired_events integer:=0;
  repaired_reservations integer:=0;
  synchronized_events integer:=0;
  timeline_gaps integer:=0;
  repaired_invoices integer:=0;
  repaired_portals integer:=0;
  financial_gaps integer:=0;
begin
  if auth.uid() is null or not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;

  insert into crm_events(customer_id,project_id,orbit_event_id,event_type,event_date,status,created_by,updated_by)
  select p.customer_id,p.id,p.orbit_event_id,p.project_type,p.event_date,
    case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    p.created_by,p.updated_by
  from projects p
  where p.customer_id=p_customer_id
    and not exists(select 1 from crm_events e where e.project_id=p.id)
  on conflict(project_id) do nothing;
  get diagnostics repaired_events=row_count;

  update crm_events e set
    customer_id=p.customer_id,
    orbit_event_id=p.orbit_event_id,
    event_type=p.project_type,
    event_date=p.event_date,
    status=case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end,
    updated_by=auth.uid(),updated_at=now()
  from projects p
  where e.project_id=p.id and p.customer_id=p_customer_id and
    (e.customer_id,e.orbit_event_id,e.event_type,e.event_date,e.status) is distinct from
    (p.customer_id,p.orbit_event_id,p.project_type,p.event_date,case when p.deleted_at is not null or upper(p.status) in('CANCELLED','CANCELED') then 'CANCELLED' when upper(p.status)='ARCHIVED' then 'ARCHIVED' else 'ACTIVE' end);
  get diagnostics synchronized_events=row_count;

  insert into crm_reservations(customer_id,project_id,event_id,reservation_method,status,created_by,updated_by)
  select p.customer_id,p.id,e.id,coalesce(nullif(upper(p.operations->>'reservationMethod'),''),'MANUAL'),
    case when e.status='CANCELLED' then 'CANCELLED' when e.status='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,p.created_by,p.updated_by
  from projects p join crm_events e on e.project_id=p.id
  where p.customer_id=p_customer_id and not exists(select 1 from crm_reservations r where r.project_id=p.id)
  on conflict(project_id) do nothing;
  get diagnostics repaired_reservations=row_count;

  update crm_reservations r set customer_id=e.customer_id,event_id=e.id,
    status=case when e.status='CANCELLED' then 'CANCELLED' when e.status='ARCHIVED' then 'ARCHIVED' else 'CONFIRMED' end,
    updated_by=auth.uid(),updated_at=now()
  from crm_events e where r.project_id=e.project_id and e.customer_id=p_customer_id;

  -- Timeline is intentionally append-only. Detect legacy gaps without
  -- mutating immutable commercial history.
  select count(*) into timeline_gaps
  from timeline_events t join projects p on p.id=t.project_id
  where p.customer_id=p_customer_id
    and (t.customer_id,t.orbit_event_id) is distinct from (p.customer_id,p.orbit_event_id);

  update invoices i set customer_id=p.customer_id,orbit_event_id=p.orbit_event_id,updated_by=auth.uid()
  from projects p where i.project_id=p.id and p.customer_id=p_customer_id
    and (i.customer_id,i.orbit_event_id) is distinct from (p.customer_id,p.orbit_event_id);
  get diagnostics repaired_invoices=row_count;

  update customer_portal_tokens token set customer_id=p.customer_id,updated_by=auth.uid()
  from projects p where token.project_id=p.id and p.customer_id=p_customer_id and token.customer_id<>p.customer_id;
  get diagnostics repaired_portals=row_count;

  select count(*) into financial_gaps
  from projects p where p.customer_id=p_customer_id and p.deleted_at is null
    and upper(p.status) not in('CANCELLED','CANCELED','ARCHIVED')
    and not exists(select 1 from financial_event_records f where f.project_id=p.id);

  return jsonb_build_object(
    'eventsRepaired',repaired_events,
    'reservationsRepaired',repaired_reservations,
    'eventsSynchronized',synchronized_events,
    'timelineGaps',timeline_gaps,
    'invoicesRepaired',repaired_invoices,
    'portalsRepaired',repaired_portals,
    'businessEngineGaps',financial_gaps
  );
end $$;

commit;
