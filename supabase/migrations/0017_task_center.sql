begin;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text,
  customer_id uuid references public.customers(id),
  project_id uuid references public.projects(id),
  orbit_event_id text,
  assigned_to uuid references public.profiles(id),
  priority text not null default 'NORMAL' check (priority in ('CRITICAL','HIGH','NORMAL','LOW')),
  status text not null default 'PENDING' check (status in ('PENDING','IN_PROGRESS','WAITING','COMPLETED','CANCELLED')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  source_module text not null,
  timeline_reference uuid references public.timeline_events(id),
  audit_reference bigint references public.audit_events(id),
  idempotency_key text unique,
  metadata jsonb not null default '{}',
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  constraint tasks_scope_check check (customer_id is not null or project_id is not null or source_module = 'MANUAL')
);

create table if not exists public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id),
  action text not null check (action in ('TASK_CREATED','TASK_ASSIGNED','TASK_UPDATED','TASK_COMPLETED','TASK_CANCELLED','TASK_REOPENED')),
  actor_id uuid references auth.users(id),
  previous_state jsonb,
  new_state jsonb not null,
  timeline_event_id uuid references public.timeline_events(id),
  audit_event_id bigint references public.audit_events(id),
  occurred_at timestamptz not null default now()
);

create index if not exists tasks_assignee_status_due_idx on public.tasks(assigned_to,status,due_at) where deleted_at is null;
create index if not exists tasks_project_idx on public.tasks(project_id,created_at desc) where deleted_at is null;
create index if not exists tasks_customer_idx on public.tasks(customer_id,created_at desc) where deleted_at is null;
create index if not exists tasks_open_due_idx on public.tasks(due_at,priority) where status in ('PENDING','IN_PROGRESS','WAITING') and deleted_at is null;
create index if not exists task_history_task_time_idx on public.task_history(task_id,occurred_at desc,id desc);

create or replace function public.can_manage_tasks()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.current_orbit_role() in ('CEO','ADMINISTRATOR','SALES','OPERATIONS')
$$;

alter table public.tasks enable row level security;
alter table public.task_history enable row level security;

create policy tasks_internal_read on public.tasks for select using (
  public.is_internal_user() and (public.current_orbit_role() <> 'STAFF' or assigned_to = auth.uid())
);
create policy tasks_manager_write on public.tasks for all using (public.can_manage_tasks()) with check (public.can_manage_tasks());
create policy tasks_staff_update on public.tasks for update using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());
create policy task_history_internal_read on public.task_history for select using (
  public.is_internal_user() and exists(select 1 from public.tasks t where t.id=task_id and (public.current_orbit_role() <> 'STAFF' or t.assigned_to=auth.uid()))
);

create or replace function public.touch_task_row()
returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status = 'COMPLETED' and old.status <> 'COMPLETED' then new.completed_at := now(); end if;
  if new.status <> 'COMPLETED' and old.status = 'COMPLETED' then new.completed_at := null; end if;
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_task_row();

create or replace function public.record_task_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  action_name text;
  human_copy text;
  timeline_id uuid;
  audit_id bigint;
  old_row jsonb;
  new_row jsonb;
begin
  old_row := case when tg_op='INSERT' then null else to_jsonb(old) end;
  new_row := to_jsonb(new);
  if tg_op='INSERT' then action_name := 'TASK_CREATED'; human_copy := 'Tarea creada: ' || new.title || '.';
  elsif old.assigned_to is distinct from new.assigned_to then action_name := 'TASK_ASSIGNED'; human_copy := 'Tarea asignada: ' || new.title || '.';
  elsif old.status='COMPLETED' and new.status<>'COMPLETED' then action_name := 'TASK_REOPENED'; human_copy := 'Tarea reabierta: ' || new.title || '.';
  elsif new.status='COMPLETED' and old.status<>'COMPLETED' then action_name := 'TASK_COMPLETED'; human_copy := 'Tarea completada: ' || new.title || '.';
  elsif new.status='CANCELLED' and old.status<>'CANCELLED' then action_name := 'TASK_CANCELLED'; human_copy := 'Tarea cancelada: ' || new.title || '.';
  else action_name := 'TASK_UPDATED'; human_copy := 'Tarea actualizada: ' || new.title || '.'; end if;

  if new.project_id is not null or new.customer_id is not null then
    insert into public.timeline_events(customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,event_type,title,description,human_message,correlation_id,created_by)
    values(new.customer_id,new.project_id,coalesce(new.orbit_event_id,'TASK-'||new.id::text),auth.uid(),coalesce((select display_name from public.profiles where id=auth.uid()),'Sistema'),'Operations',action_name,'Task',new.id::text,action_name,new.title,new.description,human_copy,'task-'||new.id::text||'-'||new.version::text||'-'||lower(action_name),auth.uid())
    returning id into timeline_id;
  end if;

  insert into public.audit_events(entity_type,entity_id,action,actor_id,previous_state,new_state,orbit_event_id)
  values('tasks',new.id::text,action_name,auth.uid(),old_row,new_row,new.orbit_event_id)
  returning id into audit_id;

  insert into public.task_history(task_id,action,actor_id,previous_state,new_state,timeline_event_id,audit_event_id)
  values(new.id,action_name,auth.uid(),old_row,new_row,timeline_id,audit_id);
  return new;
end $$;

drop trigger if exists tasks_history on public.tasks;
create trigger tasks_history after insert or update on public.tasks for each row execute function public.record_task_history();

create or replace function public.create_task_from_timeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare task_title text; task_description text; task_due timestamptz; task_priority text := 'NORMAL'; assigned_user uuid;
begin
  case new.action
    when 'QUOTATION_SENT' then task_title := 'Hacer seguimiento al cliente'; task_description := 'Contactar al cliente 48 horas después de enviar la cotización.'; task_due := new.occurred_at + interval '48 hours';
    when 'QUOTATION_ACCEPTED' then task_title := 'Generar acuerdo'; task_description := 'Preparar el acuerdo asociado a la cotización aceptada.'; task_due := new.occurred_at + interval '1 day'; task_priority := 'HIGH';
    when 'AGREEMENT_SIGNED' then task_title := 'Confirmar logística del evento'; task_description := 'Revisar logística y próximos hitos del evento firmado.'; task_due := new.occurred_at + interval '1 day'; task_priority := 'HIGH';
    when 'EVENT_FINISHED' then task_title := 'Cargar material del evento'; task_description := 'Cargar fotografías, videos y entregables del evento.'; task_due := new.occurred_at + interval '1 day';
    when 'MEDIA_UPLOADED' then task_title := 'Enviar galería al cliente'; task_description := 'Compartir la galería publicada con el cliente.'; task_due := new.occurred_at + interval '1 day';
    when 'EVENT_CLOSED' then task_title := 'Solicitar reseña al cliente'; task_description := 'Enviar la solicitud de evaluación posterior al evento.'; task_due := new.occurred_at + interval '2 days';
    else return new;
  end case;
  if task_title is null then return new; end if;
  select id into assigned_user from public.profiles where role in ('OPERATIONS','ADMINISTRATOR','CEO') order by case role when 'OPERATIONS' then 1 when 'ADMINISTRATOR' then 2 else 3 end limit 1;
  insert into public.tasks(title,description,customer_id,project_id,orbit_event_id,assigned_to,priority,status,due_at,source_module,timeline_reference,idempotency_key,created_by)
  values(task_title,task_description,new.customer_id,new.project_id,new.orbit_event_id,assigned_user,task_priority,'PENDING',task_due,'TIMELINE',new.id,'timeline:'||new.id::text,coalesce(new.actor_id,new.created_by))
  on conflict(idempotency_key) do nothing;
  return new;
end $$;

drop trigger if exists timeline_create_operational_task on public.timeline_events;
create trigger timeline_create_operational_task after insert on public.timeline_events for each row execute function public.create_task_from_timeline();

create or replace function public.materialize_scheduled_event_tasks(p_today date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare created_count integer := 0; inserted_count integer; rule record; assigned_user uuid;
begin
  if not public.is_internal_user() then raise exception 'Not authorized'; end if;
  select id into assigned_user from public.profiles where role in ('OPERATIONS','ADMINISTRATOR','CEO') order by case role when 'OPERATIONS' then 1 when 'ADMINISTRATOR' then 2 else 3 end limit 1;
  for rule in
    select p.id project_id,p.customer_id,p.orbit_event_id,p.event_date,
      v.days_before,v.title,v.description,v.priority
    from public.projects p
    cross join (values
      (10,'Confirmar detalles finales con el cliente','Validar información final del evento con el cliente.','HIGH'),
      (7,'Verificar estado de pago','Confirmar el estado de pago antes del evento.','HIGH'),
      (3,'Preparar equipamiento','Revisar y preparar Totem, Case y accesorios.','HIGH'),
      (2,'Confirmar operador','Confirmar operador y disponibilidad operacional.','CRITICAL'),
      (1,'Checklist final del evento','Completar la revisión final de Event Readiness.','CRITICAL')
    ) as v(days_before,title,description,priority)
    where p.deleted_at is null and p.event_date = p_today + v.days_before
  loop
    insert into public.tasks(title,description,customer_id,project_id,orbit_event_id,assigned_to,priority,status,due_at,source_module,idempotency_key,created_by)
    values(rule.title,rule.description,rule.customer_id,rule.project_id,rule.orbit_event_id,assigned_user,rule.priority,'PENDING',(rule.event_date - rule.days_before)::timestamptz,'TIME_INTELLIGENCE','schedule:'||rule.project_id::text||':'||rule.days_before::text,auth.uid())
    on conflict(idempotency_key) do nothing;
    get diagnostics inserted_count = row_count;
    created_count := created_count + inserted_count;
  end loop;
  return created_count;
end $$;

revoke update, delete on public.task_history from anon, authenticated;
do $$ begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end $$;

commit;
