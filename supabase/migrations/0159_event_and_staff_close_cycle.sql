begin;

-- Phase F extends the existing operational graph. Commercial project status remains independent.
create table if not exists public.event_operational_closures(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id),
  status text not null default 'OPEN' check(status in('OPEN','IN_PROGRESS','CLOSE_PENDING','CLOSED','REOPENED')),
  close_version integer not null default 0,
  close_snapshot jsonb not null default '{}'::jsonb,
  closed_at timestamptz,closed_by uuid references auth.users(id),
  reopened_at timestamptz,reopened_by uuid references auth.users(id),reopen_reason text,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists event_operational_closures_status_idx on public.event_operational_closures(status,project_id);

alter table public.asset_assignments
  add column if not exists return_condition text check(return_condition in('OK','DAMAGED','MISSING','REQUIRES_REVIEW')),
  add column if not exists return_notes text,
  add column if not exists return_confirmed_by uuid references auth.users(id),
  add column if not exists return_confirmed_at timestamptz;

create table if not exists public.event_incidents(
  id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
  asset_id uuid references public.operational_assets(id),asset_assignment_id uuid references public.asset_assignments(id),
  incident_type text not null check(incident_type in('EQUIPMENT','STAFF','CLIENT','DELAY','LOSS','OTHER')),
  severity text not null check(severity in('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check(status in('OPEN','RESOLVED','ACKNOWLEDGED')),
  description text not null check(length(trim(description))>=3),responsible text,
  resolution text,resolved_at timestamptz,resolved_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(asset_assignment_id,incident_type)
);
create index if not exists event_incidents_gate_idx on public.event_incidents(project_id,status,severity);

create table if not exists public.staff_monthly_closes(
  id uuid primary key default gen_random_uuid(),accounting_month date not null unique,
  status text not null default 'OPEN' check(status in('OPEN','CLOSED','PAID','REOPENED')),
  due_date date not null,close_version integer not null default 0,
  summary_snapshot jsonb not null default '{}'::jsonb,
  closed_at timestamptz,closed_by uuid references auth.users(id),
  reopened_at timestamptz,reopened_by uuid references auth.users(id),reopen_reason text,
  paid_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(date_trunc('month',accounting_month)::date=accounting_month),
  check(due_date=(accounting_month+interval '24 days')::date)
);
create table if not exists public.staff_monthly_close_items(
  id uuid primary key default gen_random_uuid(),monthly_close_id uuid not null references public.staff_monthly_closes(id),
  close_version integer not null,settlement_id uuid not null references public.event_staff_payments(id),
  staff_id uuid not null references public.staff(id),project_id uuid not null references public.projects(id),
  settlement_snapshot jsonb not null,eligibility_override_reason text,
  created_at timestamptz not null default now(),unique(monthly_close_id,close_version,settlement_id)
);
create index if not exists staff_monthly_close_items_settlement_idx on public.staff_monthly_close_items(settlement_id);
create table if not exists public.staff_monthly_close_eligibility_overrides(
  settlement_id uuid primary key references public.event_staff_payments(id),reason text not null check(length(trim(reason))>=3),
  created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);

alter table public.event_operational_closures enable row level security;
alter table public.event_incidents enable row level security;
alter table public.staff_monthly_closes enable row level security;
alter table public.staff_monthly_close_items enable row level security;
alter table public.staff_monthly_close_eligibility_overrides enable row level security;
create policy event_closures_internal_read on public.event_operational_closures for select using(public.is_internal_user());
create policy event_incidents_internal_read on public.event_incidents for select using(public.is_internal_user());
create policy staff_monthly_closes_admin_read on public.staff_monthly_closes for select using(public.can_administer());
create policy staff_monthly_close_items_admin_read on public.staff_monthly_close_items for select using(public.can_administer());
create policy staff_monthly_overrides_admin_read on public.staff_monthly_close_eligibility_overrides for select using(public.can_administer());

create or replace function public.preview_event_operational_close(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare blockers jsonb:='[]'::jsonb; closure_status text:='OPEN'; assigned_assets integer:=0; returned_assets integer:=0;
  open_incidents integer:=0; pending_staff integer:=0; missing_settlements integer:=0; pending_submissions integer:=0;
  pending_expenses integer:=0; financial_ok boolean:=false; service_finished boolean:=false;
begin
  if not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  select coalesce(status,'OPEN') into closure_status from public.event_operational_closures where project_id=p_project_id;
  closure_status:=coalesce(closure_status,'OPEN');
  select exists(select 1 from public.event_operational_milestones where project_id=p_project_id and milestone='EVENT_FINISHED') into service_finished;
  if not service_finished then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','SERVICE_NOT_FINISHED','label','Servicio sin hito de término')); end if;
  select count(*) into assigned_assets from public.asset_assignments where project_id=p_project_id and deleted_at is null and assignment_status in('ASSIGNED','RETURNED');
  select count(*) into returned_assets from public.asset_assignments where project_id=p_project_id and deleted_at is null and assignment_status='RETURNED' and return_condition in('OK','DAMAGED','MISSING');
  if returned_assets<assigned_assets then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','ASSET_RETURN_PENDING','label',(assigned_assets-returned_assets)||' equipos pendientes de retorno')); end if;
  if exists(select 1 from public.asset_assignments where project_id=p_project_id and deleted_at is null and return_condition in('MISSING','REQUIRES_REVIEW')) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','ASSET_REVIEW_REQUIRED','label','Hay activos faltantes o en revisión')); end if;
  select count(*) into open_incidents from public.event_incidents where project_id=p_project_id and status='OPEN';
  if open_incidents>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','INCIDENTS_OPEN','label',open_incidents||' incidencias abiertas')); end if;
  select count(*) into pending_staff from public.assignments where project_id=p_project_id and deleted_at is null and status not in('COMPLETED','CANCELLED','REJECTED');
  if pending_staff>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','STAFF_NOT_FINALIZED','label',pending_staff||' asignaciones Staff sin finalizar')); end if;
  select count(*) into missing_settlements from (select distinct staff_id from public.assignments where project_id=p_project_id and deleted_at is null and status='COMPLETED') a where not exists(select 1 from public.event_staff_payments s where s.project_id=p_project_id and s.staff_id=a.staff_id and s.deleted_at is null and s.status='CONFIRMED');
  if missing_settlements>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','SETTLEMENT_MISSING','label',missing_settlements||' liquidaciones Staff pendientes')); end if;
  select count(*) into pending_submissions from public.staff_expense_submissions where project_id=p_project_id and status='PENDING_REVIEW';
  if pending_submissions>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','STAFF_EXPENSE_PENDING','label',pending_submissions||' gastos Staff pendientes')); end if;
  select count(*) into pending_expenses from public.expenses where project_id=p_project_id and deleted_at is null and status='PENDING';
  if pending_expenses>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','EXPENSE_PENDING','label',pending_expenses||' gastos directos pendientes')); end if;
  select real_cost=total_operational_cost and net_profit=revenue-real_cost and abs(net_margin-(case when revenue>0 then net_profit/revenue*100 else 0 end))<0.0001 and public.event_cost_breakdown_total(cost_breakdown)=real_cost into financial_ok from public.financial_event_records where project_id=p_project_id;
  if not coalesce(financial_ok,false) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FINANCIAL_INVARIANT','label','Costo real requiere sincronización o revisión')); end if;
  return jsonb_build_object('projectId',p_project_id,'status',closure_status,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,
    'serviceFinished',service_finished,'assets',jsonb_build_object('assigned',assigned_assets,'returned',returned_assets),
    'incidentsOpen',open_incidents,'staffFinalized',pending_staff=0 and missing_settlements=0,'expensesFinalized',pending_submissions=0 and pending_expenses=0,'financialInvariant',financial_ok);
end $$;

create or replace function public.record_event_asset_return(p_assignment_id uuid,p_condition text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.asset_assignments%rowtype; actor uuid:=auth.uid(); incident_id uuid;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede confirmar retornos.'; end if;
  if p_condition not in('OK','DAMAGED','MISSING','REQUIRES_REVIEW') then raise exception 'Condición de retorno inválida.'; end if;
  select * into item from public.asset_assignments where id=p_assignment_id and deleted_at is null for update;
  if not found then raise exception 'Asignación de activo no encontrada.'; end if;
  if exists(select 1 from public.event_operational_closures where project_id=item.project_id and status='CLOSED') then raise exception 'Reabre el Evento antes de modificar retornos.'; end if;
  update public.asset_assignments set assignment_status=case when p_condition='REQUIRES_REVIEW' then assignment_status else 'RETURNED' end,
    returned_at=case when p_condition='REQUIRES_REVIEW' then returned_at else coalesce(returned_at,now()) end,return_condition=p_condition,
    return_notes=nullif(trim(p_notes),''),return_confirmed_by=actor,return_confirmed_at=now(),released_by=case when p_condition='REQUIRES_REVIEW' then released_by else actor end,updated_by=actor where id=item.id;
  if p_condition in('DAMAGED','MISSING') then
    insert into public.event_incidents(project_id,asset_id,asset_assignment_id,incident_type,severity,status,description,created_by)
    values(item.project_id,item.asset_id,item.id,case when p_condition='MISSING' then 'LOSS' else 'EQUIPMENT' end,'HIGH','OPEN',coalesce(nullif(trim(p_notes),''),'Retorno de activo marcado '||p_condition),actor)
    on conflict(asset_assignment_id,incident_type) do update set severity='HIGH',status='OPEN',description=excluded.description,resolution=null,resolved_at=null,resolved_by=null,updated_at=now() returning id into incident_id;
  end if;
  return jsonb_build_object('assignmentId',item.id,'condition',p_condition,'incidentId',incident_id);
end $$;

create or replace function public.create_event_incident(p_project_id uuid,p_type text,p_severity text,p_description text,p_responsible text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); result uuid;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar incidencias.'; end if;
 if p_type not in('EQUIPMENT','STAFF','CLIENT','DELAY','LOSS','OTHER') or p_severity not in('LOW','MEDIUM','HIGH','CRITICAL') then raise exception 'Clasificación de incidencia inválida.'; end if;
 if exists(select 1 from public.event_operational_closures where project_id=p_project_id and status='CLOSED') then raise exception 'Reabre el Evento antes de registrar incidencias.'; end if;
 insert into public.event_incidents(project_id,incident_type,severity,description,responsible,created_by) values(p_project_id,p_type,p_severity,trim(p_description),nullif(trim(p_responsible),''),actor) returning id into result; return result;
end $$;

create or replace function public.resolve_event_incident(p_incident_id uuid,p_status text,p_resolution text)
returns void language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item public.event_incidents%rowtype;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede resolver incidencias.'; end if;
 if p_status not in('RESOLVED','ACKNOWLEDGED') or length(trim(coalesce(p_resolution,'')))<3 then raise exception 'Resolución obligatoria.'; end if;
 select * into item from public.event_incidents where id=p_incident_id for update;if not found then raise exception 'Incidencia no encontrada.';end if;
 if p_status='ACKNOWLEDGED' and item.severity in('HIGH','CRITICAL') then raise exception 'Incidencias HIGH/CRITICAL deben resolverse.'; end if;
 update public.event_incidents set status=p_status,resolution=trim(p_resolution),resolved_at=now(),resolved_by=actor,updated_at=now() where id=item.id;
end $$;

create or replace function public.close_event_operation(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); gate jsonb; p public.projects%rowtype; closure_id uuid;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede cerrar Eventos.'; end if;
 select * into p from public.projects where id=p_project_id and deleted_at is null for update;if not found then raise exception 'Evento no encontrado.';end if;
 insert into public.event_operational_closures(project_id,status) values(p_project_id,'CLOSE_PENDING') on conflict(project_id) do update set status='CLOSE_PENDING',updated_at=now() where event_operational_closures.status<>'CLOSED' returning id into closure_id;
 gate:=public.preview_event_operational_close(p_project_id);
 if not coalesce((gate->>'ready')::boolean,false) then update public.event_operational_closures set status='OPEN',updated_at=now() where id=closure_id; raise exception 'Cierre bloqueado: %',gate->'blockers'; end if;
 perform public.sync_event_operation_cost(p_project_id); gate:=public.preview_event_operational_close(p_project_id);
 if not coalesce((gate->>'ready')::boolean,false) then raise exception 'Invariantes de cierre no reconciliadas.'; end if;
 update public.event_operational_closures set status='CLOSED',close_version=close_version+1,close_snapshot=gate,closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,reopen_reason=null,updated_at=now() where id=closure_id;
 insert into public.timeline_events(customer_id,project_id,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,event_type,title,description,human_message,correlation_id,created_by)
 values(p.customer_id,p.id,p.orbit_event_id,actor,'Founder','Operations','EVENT_OPERATION_CLOSED','EventOperationalClosure',closure_id,'EVENT_OPERATION_CLOSED','Evento cerrado operacionalmente','Gate Phase F aprobado.','Evento cerrado con costo real reconciliado.','event-close:'||closure_id||':'||(select close_version from public.event_operational_closures where id=closure_id),actor);
 return public.preview_event_operational_close(p_project_id);
end $$;

create or replace function public.reopen_event_operation(p_project_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); item public.event_operational_closures%rowtype;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede reabrir Eventos.'; end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo de reapertura obligatorio.'; end if;
 select * into item from public.event_operational_closures where project_id=p_project_id for update;if not found or item.status<>'CLOSED' then raise exception 'El Evento no está cerrado.';end if;
 update public.event_operational_closures set status='REOPENED',reopened_at=now(),reopened_by=actor,reopen_reason=trim(p_reason),updated_at=now() where id=item.id;
 return public.preview_event_operational_close(p_project_id);
end $$;

create or replace function public.override_staff_monthly_close_eligibility(p_settlement_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
begin if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede autorizar excepciones.';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo obligatorio.';end if;
 insert into public.staff_monthly_close_eligibility_overrides(settlement_id,reason,created_by) values(p_settlement_id,trim(p_reason),auth.uid()) on conflict(settlement_id) do update set reason=excluded.reason,created_by=excluded.created_by,created_at=now();
end $$;

create or replace function public.preview_staff_monthly_close(p_month date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; close_row public.staff_monthly_closes%rowtype; eligible_count integer; ineligible_count integer; totals jsonb;
begin
 if auth.uid() is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede revisar el cierre mensual.';end if;
 select * into close_row from public.staff_monthly_closes where accounting_month=month_start;
 select count(*)filter(where c.status='CLOSED' or o.settlement_id is not null),count(*)filter(where coalesce(c.status,'OPEN')<>'CLOSED' and o.settlement_id is null) into eligible_count,ineligible_count
 from public.staff_settlement_financials f left join public.event_operational_closures c on c.project_id=f.project_id left join public.staff_monthly_close_eligibility_overrides o on o.settlement_id=f.settlement_id where f.accounting_month=month_start;
 select jsonb_build_object('people',count(distinct staff_id),'settlements',count(*),'original',coalesce(sum(original_net),0),'adjustments',coalesce(sum(adjustment_total),0),'reimbursements',coalesce(sum(reimbursement_total),0),'total',coalesce(sum(final_amount),0),'paid',coalesce(sum(paid_amount),0),'pending',coalesce(sum(remaining_balance),0),'receiptsPending',count(*)filter(where sii_receipt_status<>'RECEIVED')) into totals from public.staff_settlement_financials where accounting_month=month_start;
 return jsonb_build_object('month',month_start,'status',coalesce(close_row.status,'OPEN'),'dueDate',month_start+24,'version',coalesce(close_row.close_version,0),'eligible',eligible_count,'ineligible',ineligible_count,'totals',totals);
end $$;

create or replace function public.close_staff_month(p_month date)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); month_start date:=date_trunc('month',p_month)::date; close_row public.staff_monthly_closes%rowtype; next_version integer; summary jsonb;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede cerrar el mes.';end if;
 insert into public.staff_monthly_closes(accounting_month,due_date) values(month_start,month_start+24) on conflict(accounting_month) do nothing;
 select * into close_row from public.staff_monthly_closes where accounting_month=month_start for update;
 if close_row.status not in('OPEN','REOPENED') then raise exception 'El mes no está abierto para cierre.';end if;
 next_version:=close_row.close_version+1;summary:=public.preview_staff_monthly_close(month_start);
 insert into public.staff_monthly_close_items(monthly_close_id,close_version,settlement_id,staff_id,project_id,settlement_snapshot,eligibility_override_reason)
 select close_row.id,next_version,f.settlement_id,f.staff_id,f.project_id,to_jsonb(f),o.reason from public.staff_settlement_financials f
 left join public.event_operational_closures c on c.project_id=f.project_id left join public.staff_monthly_close_eligibility_overrides o on o.settlement_id=f.settlement_id
 where f.accounting_month=month_start and (c.status='CLOSED' or o.settlement_id is not null);
 update public.staff_monthly_closes set status='CLOSED',close_version=next_version,summary_snapshot=summary,closed_at=now(),closed_by=actor,reopened_at=null,reopened_by=null,reopen_reason=null,updated_at=now() where id=close_row.id;
 return public.preview_staff_monthly_close(month_start);
end $$;

create or replace function public.reopen_staff_month(p_month date,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); month_start date:=date_trunc('month',p_month)::date; item public.staff_monthly_closes%rowtype;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede reabrir el mes.';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo obligatorio.';end if;
 select * into item from public.staff_monthly_closes where accounting_month=month_start for update;if not found then raise exception 'Cierre mensual no encontrado.';end if;
 if item.status='PAID' then raise exception 'Un mes pagado requiere conciliación extraordinaria; no puede reabrirse silenciosamente.';end if;
 if item.status<>'CLOSED' then raise exception 'El mes no está cerrado.';end if;
 update public.staff_monthly_closes set status='REOPENED',reopened_at=now(),reopened_by=actor,reopen_reason=trim(p_reason),updated_at=now() where id=item.id;
 return public.preview_staff_monthly_close(month_start);
end $$;

create or replace function public.refresh_staff_month_payment_state(p_month date)
returns text language plpgsql security definer set search_path=public as $$
declare month_start date:=date_trunc('month',p_month)::date; close_row public.staff_monthly_closes%rowtype; pending numeric;
begin
 select * into close_row from public.staff_monthly_closes where accounting_month=month_start for update;if not found then return 'OPEN';end if;
 select coalesce(sum(greatest(f.remaining_balance,0)),0) into pending from public.staff_monthly_close_items i join public.staff_settlement_financials f on f.settlement_id=i.settlement_id where i.monthly_close_id=close_row.id and i.close_version=close_row.close_version;
 if close_row.status='CLOSED' and pending=0 then update public.staff_monthly_closes set status='PAID',paid_at=now(),updated_at=now() where id=close_row.id;return 'PAID';end if;return close_row.status;
end $$;

create or replace function public.guard_closed_event_financial_change() returns trigger language plpgsql set search_path=public as $$
begin if exists(select 1 from public.event_operational_closures where project_id=new.project_id and status='CLOSED') and (old.real_cost,old.total_operational_cost,old.net_profit,old.net_margin,old.cost_breakdown) is distinct from (new.real_cost,new.total_operational_cost,new.net_profit,new.net_margin,new.cost_breakdown) then raise exception 'Evento cerrado: reabre antes de modificar el costo real.';end if;return new;end $$;
drop trigger if exists financial_event_closed_cost_guard on public.financial_event_records;
create trigger financial_event_closed_cost_guard before update on public.financial_event_records for each row execute function public.guard_closed_event_financial_change();

revoke all on table public.event_operational_closures,public.event_incidents,public.staff_monthly_closes,public.staff_monthly_close_items,public.staff_monthly_close_eligibility_overrides from anon;
revoke all on function public.preview_event_operational_close(uuid),public.record_event_asset_return(uuid,text,text),public.create_event_incident(uuid,text,text,text,text),public.resolve_event_incident(uuid,text,text),public.close_event_operation(uuid),public.reopen_event_operation(uuid,text),public.override_staff_monthly_close_eligibility(uuid,text),public.preview_staff_monthly_close(date),public.close_staff_month(date),public.reopen_staff_month(date,text),public.refresh_staff_month_payment_state(date) from public,anon;
grant execute on function public.preview_event_operational_close(uuid),public.record_event_asset_return(uuid,text,text),public.create_event_incident(uuid,text,text,text,text),public.resolve_event_incident(uuid,text,text),public.close_event_operation(uuid),public.reopen_event_operation(uuid,text),public.override_staff_monthly_close_eligibility(uuid,text),public.preview_staff_monthly_close(date),public.close_staff_month(date),public.reopen_staff_month(date,text),public.refresh_staff_month_payment_state(date) to authenticated;

-- DDL only: no close, payment, repair or historical backfill is executed here.
commit;
