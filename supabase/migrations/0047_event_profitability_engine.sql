begin;

create table if not exists public.profitability_settings(
  settings_key text primary key default 'PRIMARY',high_margin_threshold numeric(7,2) not null default 40,normal_margin_threshold numeric(7,2) not null default 20,
  updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),reason text,
  check(high_margin_threshold>normal_margin_threshold and normal_margin_threshold>=0 and high_margin_threshold<=100)
);
insert into public.profitability_settings(settings_key)values('PRIMARY')on conflict do nothing;

create table if not exists public.event_profitability_statements(
  id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,orbit_event_id text not null,
  revenue jsonb not null,estimated_costs jsonb not null,real_costs jsonb not null,profitability jsonb not null,variance jsonb not null,performance jsonb not null,
  classification text not null check(classification in('HIGHLY_PROFITABLE','NORMAL','LOW_MARGIN')),source_signature text not null,
  created_by uuid references auth.users(id),created_at timestamptz not null default now(),unique(project_id,source_signature)
);
create index if not exists event_profitability_latest_idx on public.event_profitability_statements(project_id,created_at desc);

create or replace function public.sync_event_profitability(p_project_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare p public.projects%rowtype;q public.quotations%rowtype;e public.estimated_cost_sheets%rowtype;s public.profitability_settings%rowtype;
  service numeric:=0;extras numeric:=0;charges numeric:=0;discounts numeric:=0;final_price numeric:=0;hours numeric:=0;photos numeric:=0;cost_photo numeric:=0;
  real_operator numeric;real_assembly numeric;real_disassembly numeric;real_fuel numeric;real_transport numeric;real_scrapbook numeric;real_magnets numeric;real_other numeric;
  real_total numeric:=0;gross_profit numeric:=0;margin numeric:=0;variance_value numeric:=0;signature text;statement_id uuid;classification_value text;latest_reason text;
begin
  select * into p from public.projects where id=p_project_id and deleted_at is null;if not found or upper(p.status) in('CANCELLED','CANCELED','ARCHIVED')then return null;end if;
  select * into q from public.quotations where project_id=p.id and status='ACCEPTED' and deleted_at is null order by created_at desc limit 1;if not found then return null;end if;
  select * into e from public.estimated_cost_sheets where project_id=p.id;if not found then return null;end if;select * into s from public.profitability_settings where settings_key='PRIMARY';
  select coalesce(sum(final_total) filter(where item_type='SERVICE'),0),coalesce(sum(final_total) filter(where item_type='EXTRA'),0) into service,extras from public.quotation_items where quotation_id=q.id;
  final_price:=coalesce(q.final_customer_price,q.grand_total,0);charges:=greatest(final_price-coalesce(q.official_price,final_price),0);discounts:=greatest(coalesce(q.official_price,final_price)-final_price,0)+coalesce(q.discount_total,0);
  select coalesce(sum(duration_hours),0),coalesce(sum(duration_hours*coalesce((m.configuration->>'estimatedPhotosPerHour')::numeric,0)),0) into hours,photos from public.project_services ps left join public.master_data_entries m on m.domain='SERVICES' and m.code=ps.service_code and m.enabled where ps.project_id=p.id;
  select coalesce(amount,0) into cost_photo from public.cost_master_entries where code='COST_PER_PHOTO' and enabled and deleted_at is null limit 1;
  select edited_value,reason into real_operator,latest_reason from public.financial_cost_overrides where project_id=p.id and category='OPERATOR' order by created_at desc limit 1;
  select edited_value into real_assembly from public.financial_cost_overrides where project_id=p.id and category='ASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_disassembly from public.financial_cost_overrides where project_id=p.id and category='DISASSEMBLY' order by created_at desc limit 1;
  select edited_value into real_fuel from public.financial_cost_overrides where project_id=p.id and category='FUEL' order by created_at desc limit 1;
  select edited_value into real_transport from public.financial_cost_overrides where project_id=p.id and category='TRANSPORT' order by created_at desc limit 1;
  select edited_value into real_scrapbook from public.financial_cost_overrides where project_id=p.id and category='SCRAPBOOK' order by created_at desc limit 1;
  select edited_value into real_magnets from public.financial_cost_overrides where project_id=p.id and category='MAGNETS' order by created_at desc limit 1;
  select coalesce(sum(edited_value),0),string_agg(reason,' · ' order by created_at desc) into real_other,latest_reason from(select distinct on(category)category,edited_value,reason,created_at from public.financial_cost_overrides where project_id=p.id and category in('PARKING','TOLLS','MEALS','HOTEL','OTHER_OPERATIONAL')order by category,created_at desc)x;
  real_total:=e.paper+coalesce(real_operator,e.operator)+coalesce(real_assembly,e.assembly)+coalesce(real_disassembly,e.disassembly)+coalesce(real_fuel,e.fuel)+coalesce(real_transport,e.transport)+coalesce(real_scrapbook,e.scrapbook)+coalesce(real_magnets,e.magnets)+coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured);
  gross_profit:=final_price-real_total;margin:=case when final_price=0 then 0 else gross_profit/final_price*100 end;variance_value:=real_total-e.total;classification_value:=case when margin>=s.high_margin_threshold then'HIGHLY_PROFITABLE'when margin>=s.normal_margin_threshold then'NORMAL'else'LOW_MARGIN'end;
  signature:=md5(concat_ws('|',q.updated_at,e.updated_at,(select max(created_at)from public.financial_cost_overrides where project_id=p.id),s.updated_at,final_price,real_total,photos));
  insert into public.event_profitability_statements(project_id,orbit_event_id,revenue,estimated_costs,real_costs,profitability,variance,performance,classification,source_signature,created_by)
  values(p.id,p.orbit_event_id,jsonb_build_object('service',service,'extras',extras,'transport',q.transport_total,'commercialCharges',charges,'commercialDiscounts',discounts,'finalSalePrice',final_price,'paymentStatus',coalesce(p.finance->>'status','PENDING'),'invoiceStatus',coalesce((select status from public.invoices where project_id=p.id and deleted_at is null order by created_at desc limit 1),'NOT_ISSUED')),to_jsonb(e)-'id'-'project_id'-'orbit_event_id'-'source_snapshot',jsonb_build_object('paper',e.paper,'operator',coalesce(real_operator,e.operator),'assembly',coalesce(real_assembly,e.assembly),'disassembly',coalesce(real_disassembly,e.disassembly),'fuel',coalesce(real_fuel,e.fuel),'transport',coalesce(real_transport,e.transport),'scrapbook',coalesce(real_scrapbook,e.scrapbook),'magnets',coalesce(real_magnets,e.magnets),'miscellaneous',coalesce(real_other,e.pens+e.double_sided_tape+e.other_configured),'total',real_total),jsonb_build_object('grossRevenue',final_price,'estimatedCost',e.total,'realCost',real_total,'grossProfit',gross_profit,'netProfit',gross_profit,'margin',margin),jsonb_build_object('amount',variance_value,'percentage',case when e.total=0 then 0 else variance_value/e.total*100 end,'reason',coalesce(latest_reason,'Sin ajustes reales')),jsonb_build_object('photosProduced',photos,'paperConsumed',photos,'costPerPhoto',case when photos=0 then 0 else e.paper/photos end,'costPerHour',case when hours=0 then 0 else real_total/hours end,'revenuePerHour',case when hours=0 then 0 else final_price/hours end,'profitPerHour',case when hours=0 then 0 else gross_profit/hours end,'hours',hours,'configuredPhotoCost',cost_photo),classification_value,signature,auth.uid())on conflict(project_id,source_signature)do update set source_signature=excluded.source_signature returning id into statement_id;
  if not exists(select 1 from public.timeline_events where correlation_id='profitability:'||statement_id)then insert into public.timeline_events(customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)values(p.customer_id,p.id,p.orbit_event_id,'EVENT_PROFITABILITY_UPDATED','Rentabilidad del evento actualizada','Margen final '||round(margin,1)||'%.',auth.uid(),'ORBIT','System','EVENT_PROFITABILITY_UPDATED','EventProfitability',statement_id,'Estado financiero del evento recalculado automáticamente.','profitability:'||statement_id,auth.uid());end if;
  return statement_id;
end$$;
revoke all on function public.sync_event_profitability(uuid)from public,anon;grant execute on function public.sync_event_profitability(uuid)to authenticated;

create or replace function public.update_profitability_thresholds(p_high numeric,p_normal numeric,p_reason text)returns void language plpgsql security definer set search_path=public as $$declare item record;begin if not public.can_administer()then raise exception'Permiso de Founder requerido.';end if;if p_high<=p_normal or p_normal<0 or p_high>100 or length(trim(p_reason))<3 then raise exception'Umbrales inválidos.';end if;update public.profitability_settings set high_margin_threshold=p_high,normal_margin_threshold=p_normal,updated_by=auth.uid(),updated_at=now(),reason=trim(p_reason)where settings_key='PRIMARY';for item in select id from public.projects where deleted_at is null loop perform public.sync_event_profitability(item.id);end loop;end$$;
revoke all on function public.update_profitability_thresholds(numeric,numeric,text)from public,anon;grant execute on function public.update_profitability_thresholds(numeric,numeric,text)to authenticated;

alter table public.profitability_settings enable row level security;alter table public.event_profitability_statements enable row level security;
create policy profitability_settings_admin on public.profitability_settings for select using(public.can_administer());create policy event_profitability_admin on public.event_profitability_statements for select using(public.can_administer());
revoke insert,update,delete on public.event_profitability_statements from authenticated;revoke insert,update,delete on public.profitability_settings from authenticated;
drop trigger if exists profitability_statements_audit on public.event_profitability_statements;create trigger profitability_statements_audit after insert on public.event_profitability_statements for each row execute function public.audit_row_change();
drop trigger if exists profitability_settings_audit on public.profitability_settings;create trigger profitability_settings_audit after update on public.profitability_settings for each row execute function public.audit_row_change();

create or replace function public.profitability_source_changed()returns trigger language plpgsql security definer set search_path=public as $$declare target uuid;begin target:=new.project_id;perform public.sync_event_profitability(target);return new;end$$;
drop trigger if exists profitability_from_estimates on public.estimated_cost_sheets;create trigger profitability_from_estimates after insert or update on public.estimated_cost_sheets for each row execute function public.profitability_source_changed();
drop trigger if exists profitability_from_real_cost on public.financial_cost_overrides;create trigger profitability_from_real_cost after insert on public.financial_cost_overrides for each row execute function public.profitability_source_changed();
drop trigger if exists profitability_from_quotation on public.quotations;create trigger profitability_from_quotation after insert or update on public.quotations for each row execute function public.profitability_source_changed();

select public.sync_event_profitability(id)from public.projects where deleted_at is null;
commit;
