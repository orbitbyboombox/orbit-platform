begin;

create table if not exists public.event_checklists(
 id uuid primary key default gen_random_uuid(),project_id uuid not null unique references public.projects(id),customer_id uuid not null references public.customers(id),orbit_event_id text not null,
 status text not null default 'IN_PROGRESS' check(status in('IN_PROGRESS','READY','COMPLETED')),started_at timestamptz not null default now(),completed_at timestamptz,
 version integer not null default 1,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table if not exists public.event_checklist_items(
 id uuid primary key default gen_random_uuid(),checklist_id uuid not null references public.event_checklists(id),item_key text not null,category text not null check(category in('EQUIPMENT','VEHICLE','EVENT','CUSTOMER','RETURN')),label text not null,position integer not null,mandatory boolean not null default true,
 completed boolean not null default false,completed_by uuid references auth.users(id),completed_at timestamptz,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(checklist_id,item_key)
);
create table if not exists public.event_operational_milestones(
 id uuid primary key default gen_random_uuid(),checklist_id uuid not null references public.event_checklists(id),project_id uuid not null references public.projects(id),milestone text not null check(milestone in('DEPARTURE','ARRIVAL','EVENT_STARTED','EVENT_FINISHED','EQUIPMENT_INCIDENT')),notes text,occurred_at timestamptz not null default now(),recorded_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(checklist_id,milestone)
);
create index if not exists event_checklist_items_progress_idx on public.event_checklist_items(checklist_id,category,position);
create index if not exists event_operational_milestones_project_idx on public.event_operational_milestones(project_id,occurred_at);

alter table public.event_checklists enable row level security;alter table public.event_checklist_items enable row level security;alter table public.event_operational_milestones enable row level security;
create policy event_checklists_internal_read on public.event_checklists for select using(public.is_internal_user());
create policy event_checklists_operations_write on public.event_checklists for all using(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS')) with check(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'));
create policy event_checklist_items_internal_read on public.event_checklist_items for select using(public.is_internal_user());
create policy event_checklist_items_operations_write on public.event_checklist_items for all using(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS')) with check(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'));
create policy event_operational_milestones_internal_read on public.event_operational_milestones for select using(public.is_internal_user());
create policy event_operational_milestones_operations_insert on public.event_operational_milestones for insert with check(public.current_orbit_role() in('CEO','ADMINISTRATOR','OPERATIONS'));

drop trigger if exists event_checklists_touch on public.event_checklists;create trigger event_checklists_touch before update on public.event_checklists for each row execute function public.touch_versioned_row();
drop trigger if exists event_checklist_items_touch on public.event_checklist_items;create trigger event_checklist_items_touch before update on public.event_checklist_items for each row execute function public.touch_versioned_row();
drop trigger if exists event_checklists_audit on public.event_checklists;create trigger event_checklists_audit after insert or update or delete on public.event_checklists for each row execute function public.audit_row_change();
drop trigger if exists event_checklist_items_audit on public.event_checklist_items;create trigger event_checklist_items_audit after insert or update or delete on public.event_checklist_items for each row execute function public.audit_row_change();
drop trigger if exists event_operational_milestones_audit on public.event_operational_milestones;create trigger event_operational_milestones_audit after insert on public.event_operational_milestones for each row execute function public.audit_row_change();
revoke update,delete on public.event_operational_milestones from authenticated;

create or replace function public.ensure_event_checklist(p_project_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;c_id uuid;actor uuid:=auth.uid();
begin if not public.is_internal_user() then raise exception 'Acceso interno requerido.';end if;select * into p from public.projects where id=p_project_id and deleted_at is null;if not found then raise exception 'Evento no encontrado.';end if;
 insert into public.event_checklists(project_id,customer_id,orbit_event_id,created_by,updated_by) values(p.id,p.customer_id,p.orbit_event_id,actor,actor) on conflict(project_id) do update set project_id=excluded.project_id returning id into c_id;
 insert into public.event_checklist_items(checklist_id,item_key,category,label,position) select c_id,v.key,v.category,v.label,v.position from(values
 ('TOTEM_LOADED','EQUIPMENT','Tótem cargado',10),('CASE_LOADED','EQUIPMENT','Case cargado',20),('CAMERA_INSTALLED','EQUIPMENT','Cámara instalada',30),('PRINTER_INSTALLED','EQUIPMENT','Impresora instalada',40),('PAPER_CHECKED','EQUIPMENT','Papel revisado',50),('RIBBON_CHECKED','EQUIPMENT','Ribbon revisado',60),('CABLES','EQUIPMENT','Cables',70),('EXTENSION','EQUIPMENT','Alargador',80),('POWER_STRIP','EQUIPMENT','Regleta eléctrica',90),('TOOL_KIT','EQUIPMENT','Kit de herramientas',100),('TABLET','EQUIPMENT','Tablet',110),('INTERNET','EQUIPMENT','Internet',120),
 ('FUEL_CHECKED','VEHICLE','Combustible revisado',10),('VEHICLE_CLEAN','VEHICLE','Vehículo limpio',20),('DOCUMENTATION_AVAILABLE','VEHICLE','Documentación disponible',30),
 ('ADDRESS_CONFIRMED','EVENT','Dirección confirmada',10),('MAPS_VERIFIED','EVENT','Google Maps verificado',20),('CONTACT_CONFIRMED','EVENT','Contacto confirmado',30),('SCHEDULE_CONFIRMED','EVENT','Horario del evento confirmado',40),('ASSEMBLY_TIME_CONFIRMED','EVENT','Horario de montaje confirmado',50),
 ('DESIGN_APPROVED','CUSTOMER','Diseño aprobado',10),('BRANDING_RECEIVED','CUSTOMER','Branding recibido',20),('QR_CONFIGURED','CUSTOMER','QR configurado',30),('SPECIAL_REQUESTS_REVIEWED','CUSTOMER','Solicitudes especiales revisadas',40),
 ('EQUIPMENT_UNLOADED','RETURN','Equipamiento descargado',10),('DAMAGE_INSPECTION','RETURN','Inspección de daños',20),('CONSUMABLES_COUNTED','RETURN','Consumibles contabilizados',30))v(key,category,label,position) on conflict(checklist_id,item_key) do nothing;
 return c_id;end $$;
revoke all on function public.ensure_event_checklist(uuid) from public,anon;grant execute on function public.ensure_event_checklist(uuid) to authenticated;

create or replace function public.set_event_checklist_item(p_item_id uuid,p_completed boolean) returns void language plpgsql security definer set search_path=public as $$
declare item public.event_checklist_items%rowtype;checklist public.event_checklists%rowtype;p public.projects%rowtype;done_count integer;total_count integer;actor uuid:=auth.uid();
begin if public.current_orbit_role() not in('CEO','ADMINISTRATOR','OPERATIONS') then raise exception 'Permiso operacional requerido.';end if;select * into item from public.event_checklist_items where id=p_item_id for update;if not found then raise exception 'Ítem no encontrado.';end if;select * into checklist from public.event_checklists where id=item.checklist_id;select * into p from public.projects where id=checklist.project_id;
 update public.event_checklist_items set completed=p_completed,completed_by=case when p_completed then actor else null end,completed_at=case when p_completed then now() else null end where id=item.id;
 select count(*) filter(where completed),count(*) into done_count,total_count from public.event_checklist_items where checklist_id=checklist.id and mandatory;
 update public.event_checklists set status=case when done_count=total_count then 'READY' else 'IN_PROGRESS' end,updated_by=actor where id=checklist.id;
 insert into public.timeline_events(customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,event_type,title,description,human_message,correlation_id,created_by) values(checklist.customer_id,p.id,p.orbit_event_id,actor,'Operaciones','Operations',case when p_completed then 'CHECKLIST_ITEM_COMPLETED' else 'CHECKLIST_ITEM_REOPENED' end,'EventChecklistItem',item.id,case when p_completed then 'CHECKLIST_ITEM_COMPLETED' else 'CHECKLIST_ITEM_REOPENED' end,'Checklist actualizado',item.label,case when p_completed then item.label||' confirmado.' else item.label||' marcado como pendiente.' end,'checklist-item:'||item.id||':'||(item.version+1),actor);
end $$;
revoke all on function public.set_event_checklist_item(uuid,boolean) from public,anon;grant execute on function public.set_event_checklist_item(uuid,boolean) to authenticated;

create or replace function public.record_event_milestone(p_project_id uuid,p_milestone text,p_notes text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare checklist public.event_checklists%rowtype;p public.projects%rowtype;m_id uuid;actor uuid:=auth.uid();missing integer;action_name text;human text;title_copy text;
begin if public.current_orbit_role() not in('CEO','ADMINISTRATOR','OPERATIONS') then raise exception 'Permiso operacional requerido.';end if;perform public.ensure_event_checklist(p_project_id);select * into checklist from public.event_checklists where project_id=p_project_id;select * into p from public.projects where id=p_project_id;
 if p_milestone='DEPARTURE' then select count(*) into missing from public.event_checklist_items where checklist_id=checklist.id and category<>'RETURN' and mandatory and not completed;if missing>0 then insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata) values(p.id,p.customer_id,'CHECKLIST_INCOMPLETE','Checklist incompleto',missing||' controles obligatorios continúan pendientes.','UNREAD','checklist-incomplete:'||checklist.id||':'||checklist.version,'OPERATIONS','HIGH',true,'EventChecklist',checklist.id,'/projects/'||p.id||'#operations-checklist',jsonb_build_object('missing',missing)) on conflict(correlation_id) do nothing;end if;end if;
 action_name=case p_milestone when 'DEPARTURE' then 'DEPARTURE_REGISTERED' when 'ARRIVAL' then 'ARRIVAL_REGISTERED' when 'EVENT_STARTED' then 'EVENT_STARTED' when 'EVENT_FINISHED' then 'EVENT_FINISHED' when 'EQUIPMENT_INCIDENT' then 'EQUIPMENT_INCIDENT' else null end;if action_name is null then raise exception 'Hito inválido.';end if;
 human=case p_milestone when 'DEPARTURE' then 'Salida al evento registrada.' when 'ARRIVAL' then 'Llegada al evento registrada.' when 'EVENT_STARTED' then 'Evento iniciado.' when 'EVENT_FINISHED' then 'Evento finalizado.' else 'Incidente de equipamiento registrado.' end;title_copy=replace(initcap(lower(replace(action_name,'_',' '))),'Registered','registrada');
 insert into public.event_operational_milestones(checklist_id,project_id,milestone,notes,recorded_by) values(checklist.id,p.id,p_milestone,nullif(trim(p_notes),''),actor) returning id into m_id;
 insert into public.timeline_events(customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,event_type,title,description,human_message,correlation_id,created_by) values(p.customer_id,p.id,p.orbit_event_id,actor,'Operaciones','Operations',action_name,'EventChecklist',checklist.id,action_name,title_copy,coalesce(nullif(trim(p_notes),''),human),human,'event-milestone:'||m_id,actor);
 insert into public.internal_notifications(project_id,customer_id,notification_type,title,message,status,correlation_id,category,priority,action_required,entity_type,entity_id,related_href,metadata) values(p.id,p.customer_id,action_name,title_copy,human,'UNREAD','milestone-notification:'||m_id,case when p_milestone='EQUIPMENT_INCIDENT' then 'EQUIPMENT' else 'OPERATIONS' end,case when p_milestone='EQUIPMENT_INCIDENT' then 'HIGH' else 'INFORMATION' end,p_milestone='EQUIPMENT_INCIDENT','EventChecklist',checklist.id,'/projects/'||p.id||'#operations-checklist',jsonb_build_object('milestone_id',m_id,'notes',p_notes));
 if p_milestone='EVENT_FINISHED' then update public.event_checklists set status='COMPLETED',completed_at=now(),updated_by=actor where id=checklist.id;end if;return m_id;end $$;
revoke all on function public.record_event_milestone(uuid,text,text) from public,anon;grant execute on function public.record_event_milestone(uuid,text,text) to authenticated;

do $$ begin alter publication supabase_realtime add table public.event_checklists,public.event_checklist_items,public.event_operational_milestones;exception when duplicate_object then null;end $$;
commit;
