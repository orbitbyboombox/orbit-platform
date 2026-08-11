begin;

create table if not exists public.financial_event_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  quotation_id uuid references public.quotations(id),
  invoice_id uuid references public.invoices(id),
  orbit_event_id text not null,
  event_date date,
  status text not null check (status in ('PENDING','CONFIRMED','CANCELLED')),
  revenue numeric(14,2) not null default 0,
  estimated_cost numeric(14,2) not null default 0,
  real_cost numeric(14,2) not null default 0,
  gross_profit numeric(14,2) not null default 0,
  gross_margin numeric(9,4) not null default 0,
  net_profit numeric(14,2) not null default 0,
  net_margin numeric(9,4) not null default 0,
  invoiced_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  payment_schedule jsonb not null default '[]',
  cost_breakdown jsonb not null default '{}',
  traceability jsonb not null default '{}',
  calculated_at timestamptz not null default now(),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_cost_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category text not null check(category in ('OPERATOR','FUEL','ASSEMBLY','MISCELLANEOUS')),
  original_value numeric(14,2) not null,
  edited_value numeric(14,2) not null check(edited_value >= 0),
  reason text not null check(length(trim(reason)) >= 3),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists financial_event_records_date_idx on public.financial_event_records(event_date,status);
create index if not exists financial_event_records_customer_idx on public.financial_event_records(customer_id,status);
create index if not exists financial_cost_overrides_project_idx on public.financial_cost_overrides(project_id,category,created_at desc);

create or replace function public.sync_financial_event(p_project_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  p public.projects%rowtype;
  q public.quotations%rowtype;
  inv public.invoices%rowtype;
  hours numeric:=0;
  operator_cost numeric:=0; assembly_cost numeric:=0; fuel_cost numeric:=0;
  paper_cost numeric:=0; scrapbook_cost numeric:=0; magnets_cost numeric:=0;
  pencils_cost numeric:=0; tape_cost numeric:=0; other_configured numeric:=0;
  payroll_cost numeric:=0; route_fuel numeric:=0; expense_cost numeric:=0; inventory_cost numeric:=0;
  estimated numeric:=0; actual numeric:=0; effective_cost numeric:=0; revenue_value numeric:=0;
  override_operator numeric; override_fuel numeric; override_assembly numeric; override_misc numeric;
  cancelled boolean:=false;
begin
  select * into p from public.projects where id=p_project_id;
  if not found then return; end if;
  cancelled:=p.deleted_at is not null or upper(p.status) in ('CANCELLED','CANCELED','ARCHIVED');
  select * into q from public.quotations where project_id=p_project_id and deleted_at is null and status='ACCEPTED' order by approved_at desc nulls last,created_at desc limit 1;
  select * into inv from public.invoices where project_id=p_project_id and deleted_at is null and status<>'CANCELLED' order by created_at desc limit 1;
  if cancelled then
    update public.invoices set status='CANCELLED',approval_reason='Reserva cancelada · sincronización financiera',updated_by=coalesce(auth.uid(),updated_by) where project_id=p_project_id and deleted_at is null and status not in ('CANCELLED','PAID');
  elsif q.id is not null and inv.id is null then
    insert into public.invoices(invoice_number,customer_id,project_id,quotation_id,orbit_event_id,customer_type,status,payment_term,amount,notes,created_by,updated_by)
    values('ORBIT-'||replace(p.orbit_event_id,'-',''),p.customer_id,p.id,q.id,p.orbit_event_id,case when q.customer_type='COMPANY' then 'CORPORATE' else 'PRIVATE' end,'PENDING','CASH',coalesce(q.final_customer_price,q.grand_total,0),'Generada automáticamente desde la reserva confirmada.',q.created_by,q.created_by)
    on conflict(invoice_number) do update set amount=excluded.amount,quotation_id=excluded.quotation_id,updated_at=now()
    returning * into inv;
  end if;
  select coalesce(max(duration_hours),0) into hours from public.project_services where project_id=p_project_id;

  select coalesce(amount,0) into operator_cost from public.cost_master_entries where code='OPERATOR_'||greatest(2,least(10,ceil(hours)::int))||'_HOURS' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0) into assembly_cost from public.cost_master_entries where code='ASSEMBLY_DISASSEMBLY' and enabled and deleted_at is null limit 1;
  select coalesce(amount,0) into fuel_cost from public.cost_master_entries where code='DEFAULT_FUEL_COST' and enabled and deleted_at is null limit 1;
  select coalesce(sum(coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)*coalesce(ps.duration_hours,0)),0)*coalesce((select amount from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1),0)
    into paper_cost from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p_project_id;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%SCRAPBOOK%') then select coalesce(amount,0) into scrapbook_cost from public.cost_master_entries where code='SCRAPBOOK_COST' and enabled and deleted_at is null limit 1; end if;
  if q.id is not null and exists(select 1 from public.quotation_items where quotation_id=q.id and code ilike '%MAGNET%') then select coalesce(amount,0) into magnets_cost from public.cost_master_entries where code='MAGNETS_EVENT_COST' and enabled and deleted_at is null limit 1; end if;
  select coalesce(amount/nullif(quantity,0),0) into pencils_cost from public.cost_master_entries where code='PENCILS_COST' and enabled and deleted_at is null limit 1;
  select coalesce(amount/nullif(quantity,0),0) into tape_cost from public.cost_master_entries where code='DOUBLE_SIDED_TAPE_COST' and enabled and deleted_at is null limit 1;
  select coalesce(sum(amount),0) into other_configured from public.cost_master_entries where category='OTHER' and enabled and deleted_at is null and code not in ('SCRAPBOOK_COST','MAGNETS_PURCHASE','MAGNETS_EVENT_COST','PENCILS_COST','DOUBLE_SIDED_TAPE_COST');
  estimated:=operator_cost+assembly_cost+fuel_cost+paper_cost+scrapbook_cost+magnets_cost+pencils_cost+tape_cost+other_configured;

  select coalesce(sum(total_internal_payment),0) into payroll_cost from public.event_staff_payments where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  select coalesce(sum(allocated_fuel_cost),0) into route_fuel from public.vehicle_route_events where project_id=p_project_id;
  select coalesce(sum(total),0) into expense_cost from public.expenses where project_id=p_project_id and deleted_at is null and status<>'CANCELLED';
  select coalesce(sum(total_cost),0) into inventory_cost from public.inventory_movements where project_id=p_project_id and deleted_at is null and movement_type in ('CONSUMPTION','LOSS','REPLACEMENT');
  actual:=payroll_cost+route_fuel+expense_cost+inventory_cost;

  select edited_value into override_operator from public.financial_cost_overrides where project_id=p_project_id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into override_fuel from public.financial_cost_overrides where project_id=p_project_id and category='FUEL' order by created_at desc limit 1;
  select edited_value into override_assembly from public.financial_cost_overrides where project_id=p_project_id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into override_misc from public.financial_cost_overrides where project_id=p_project_id and category='MISCELLANEOUS' order by created_at desc limit 1;
  effective_cost:=coalesce(override_operator,nullif(payroll_cost,0),operator_cost)+coalesce(override_fuel,nullif(route_fuel,0),fuel_cost)+coalesce(override_assembly,assembly_cost)+coalesce(override_misc,nullif(expense_cost+inventory_cost,0),paper_cost+scrapbook_cost+magnets_cost+pencils_cost+tape_cost+other_configured);
  revenue_value:=case when cancelled or q.id is null then 0 else coalesce(q.final_customer_price,q.grand_total,0) end;

  insert into public.financial_event_records(project_id,customer_id,quotation_id,invoice_id,orbit_event_id,event_date,status,revenue,estimated_cost,real_cost,gross_profit,gross_margin,net_profit,net_margin,invoiced_amount,paid_amount,outstanding_balance,payment_schedule,cost_breakdown,traceability,calculated_at)
  values(p.id,p.customer_id,q.id,inv.id,p.orbit_event_id,p.event_date,case when cancelled then 'CANCELLED' when q.id is null then 'PENDING' else 'CONFIRMED' end,revenue_value,estimated,effective_cost,revenue_value-effective_cost,case when revenue_value=0 then 0 else (revenue_value-effective_cost)/revenue_value*100 end,revenue_value-effective_cost,case when revenue_value=0 then 0 else (revenue_value-effective_cost)/revenue_value*100 end,case when cancelled then 0 else coalesce(inv.amount,revenue_value) end,case when cancelled then 0 else coalesce(inv.paid_amount,0) end,case when cancelled then 0 else greatest(coalesce(inv.amount,revenue_value)-coalesce(inv.paid_amount,0),0) end,case when inv.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('invoiceId',inv.id,'dueDate',inv.due_date,'amount',inv.amount,'paid',inv.paid_amount,'status',inv.status)) end,jsonb_build_object('operator',coalesce(override_operator,nullif(payroll_cost,0),operator_cost),'assembly',coalesce(override_assembly,assembly_cost),'fuel',coalesce(override_fuel,nullif(route_fuel,0),fuel_cost),'paper',paper_cost,'scrapbook',scrapbook_cost,'magnets',magnets_cost,'configuredOther',pencils_cost+tape_cost+other_configured,'registeredExpenses',expense_cost,'inventory',inventory_cost,'estimated',estimated,'actualRegistered',actual),jsonb_build_object('customerId',p.customer_id,'projectId',p.id,'quotationId',q.id,'invoiceId',inv.id,'source','ORBIT_FINANCIAL_TRUTH'),now())
  on conflict(project_id) do update set customer_id=excluded.customer_id,quotation_id=excluded.quotation_id,invoice_id=excluded.invoice_id,orbit_event_id=excluded.orbit_event_id,event_date=excluded.event_date,status=excluded.status,revenue=excluded.revenue,estimated_cost=excluded.estimated_cost,real_cost=excluded.real_cost,gross_profit=excluded.gross_profit,gross_margin=excluded.gross_margin,net_profit=excluded.net_profit,net_margin=excluded.net_margin,invoiced_amount=excluded.invoiced_amount,paid_amount=excluded.paid_amount,outstanding_balance=excluded.outstanding_balance,payment_schedule=excluded.payment_schedule,cost_breakdown=excluded.cost_breakdown,traceability=excluded.traceability,calculated_at=now(),updated_at=now(),version=financial_event_records.version+1;
end $$;

create or replace function public.refresh_financial_truth() returns integer language plpgsql security definer set search_path=public as $$
declare row record; affected integer:=0;
begin
  if not public.is_internal_user() then raise exception 'Acceso interno requerido.'; end if;
  for row in select id from public.projects loop perform public.sync_financial_event(row.id);affected:=affected+1;end loop;
  return affected;
end $$;
revoke all on function public.refresh_financial_truth() from public,anon;
grant execute on function public.refresh_financial_truth() to authenticated;

create or replace function public.apply_financial_cost_override(p_project_id uuid,p_category text,p_value numeric,p_reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare current_value numeric; result_id uuid;
begin
  if not public.can_administer() then raise exception 'Permiso de Founder requerido.'; end if;
  if p_category not in ('OPERATOR','FUEL','ASSEMBLY','MISCELLANEOUS') or p_value<0 or length(trim(p_reason))<3 then raise exception 'Override inválido.'; end if;
  perform public.sync_financial_event(p_project_id);
  select case p_category when 'OPERATOR' then (cost_breakdown->>'operator')::numeric when 'FUEL' then (cost_breakdown->>'fuel')::numeric when 'ASSEMBLY' then (cost_breakdown->>'assembly')::numeric else (cost_breakdown->>'registeredExpenses')::numeric end into current_value from public.financial_event_records where project_id=p_project_id;
  insert into public.financial_cost_overrides(project_id,category,original_value,edited_value,reason,created_by) values(p_project_id,p_category,coalesce(current_value,0),p_value,trim(p_reason),auth.uid()) returning id into result_id;
  perform public.sync_financial_event(p_project_id);return result_id;
end $$;
revoke all on function public.apply_financial_cost_override(uuid,text,numeric,text) from public,anon;
grant execute on function public.apply_financial_cost_override(uuid,text,numeric,text) to authenticated;

create or replace function public.financial_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if tg_table_name='projects' then target:=case when tg_op='DELETE' then old.id else new.id end;
  else target:=case when tg_op='DELETE' then old.project_id else new.project_id end;end if;
  if target is not null then perform public.sync_financial_event(target);end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.quotation_item_financial_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  select project_id into target from public.quotations where id=case when tg_op='DELETE' then old.quotation_id else new.quotation_id end;
  if target is not null then perform public.sync_financial_event(target);end if;return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists financial_truth_sync on public.quotation_items;
create trigger financial_truth_sync after insert or update or delete on public.quotation_items for each row execute function public.quotation_item_financial_source_changed();

create or replace function public.cost_master_financial_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare row record;
begin
  for row in select id from public.projects loop perform public.sync_financial_event(row.id);end loop;return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists financial_truth_sync on public.cost_master_entries;
create trigger financial_truth_sync after insert or update or delete on public.cost_master_entries for each row execute function public.cost_master_financial_source_changed();

do $$ declare table_name text;
begin
  foreach table_name in array array['projects','project_services','quotations','expenses','profit_snapshots','event_staff_payments','vehicle_route_events','inventory_movements'] loop
    execute format('drop trigger if exists financial_truth_sync on public.%I',table_name);
    execute format('create trigger financial_truth_sync after insert or update or delete on public.%I for each row execute function public.financial_source_changed()',table_name);
  end loop;
end $$;

create or replace function public.invoice_financial_source_changed() returns trigger language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if tg_table_name='invoice_payments' then select project_id into target from public.invoices where id=coalesce(new.invoice_id,old.invoice_id);else target:=coalesce(new.project_id,old.project_id);end if;
  if target is not null then perform public.sync_financial_event(target);end if;return case when tg_op='DELETE' then old else new end;
end $$;
drop trigger if exists financial_truth_sync on public.invoices;
create trigger financial_truth_sync after insert or update or delete on public.invoices for each row execute function public.invoice_financial_source_changed();
drop trigger if exists financial_truth_sync on public.invoice_payments;
create trigger financial_truth_sync after insert or update or delete on public.invoice_payments for each row execute function public.invoice_financial_source_changed();

alter table public.financial_event_records enable row level security;
alter table public.financial_cost_overrides enable row level security;
create policy financial_event_records_internal_read on public.financial_event_records for select using(public.is_internal_user());
create policy financial_cost_overrides_internal_read on public.financial_cost_overrides for select using(public.is_internal_user());
revoke insert,update,delete on public.financial_event_records from authenticated;
revoke insert,update,delete on public.financial_cost_overrides from authenticated;
drop trigger if exists financial_event_records_audit on public.financial_event_records;
create trigger financial_event_records_audit after insert or update or delete on public.financial_event_records for each row execute function public.audit_row_change();
drop trigger if exists financial_cost_overrides_audit on public.financial_cost_overrides;
create trigger financial_cost_overrides_audit after insert or update or delete on public.financial_cost_overrides for each row execute function public.audit_row_change();

-- The legacy invoice trigger targeted a non-existent unique constraint on Timeline.
-- Preserve idempotency without changing or deleting historical records.
create or replace function public.invoice_timeline_dispatch() returns trigger language plpgsql security definer set search_path=public as $$
declare action_name text; message text; correlation text;
begin
  if tg_op='INSERT' then action_name=case when new.status='DRAFT' then 'INVOICE_DRAFTED' else 'INVOICE_ISSUED' end;
  elsif old.status is distinct from new.status and new.status='OVERDUE' then action_name='INVOICE_OVERDUE';
  elsif old.status is distinct from new.status and new.status='CANCELLED' then action_name='INVOICE_CANCELLED';else return new;end if;
  message=case action_name when 'INVOICE_DRAFTED' then 'Factura '||new.invoice_number||' creada como borrador.' when 'INVOICE_ISSUED' then 'Factura '||new.invoice_number||' emitida.' when 'INVOICE_OVERDUE' then 'Factura '||new.invoice_number||' vencida.' else 'Factura '||new.invoice_number||' anulada.' end;
  correlation='invoice:'||new.id||':'||action_name;
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  select new.customer_id,new.project_id,action_name,message,message,new.orbit_event_id,auth.uid(),'Finanzas','Administrator',action_name,'Invoice',new.id,message,correlation,auth.uid()
  where not exists(select 1 from public.timeline_events where correlation_id=correlation);
  return new;
end $$;

select public.sync_financial_event(id) from public.projects;
commit;
