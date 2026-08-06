begin;

alter table public.quotations
  add column if not exists official_price numeric(14,2),
  add column if not exists final_customer_price numeric(14,2),
  add column if not exists price_difference numeric(14,2) not null default 0,
  add column if not exists negotiation_method text,
  add column if not exists negotiation_value numeric(14,4),
  add column if not exists negotiation_reason text,
  add column if not exists negotiated_by uuid references auth.users(id),
  add column if not exists negotiated_at timestamptz;

update public.quotations
set official_price=coalesce(official_price,grand_total),
    final_customer_price=coalesce(final_customer_price,grand_total),
    price_difference=coalesce(final_customer_price,grand_total)-coalesce(official_price,grand_total)
where official_price is null or final_customer_price is null;

alter table public.quotations alter column official_price set not null;
alter table public.quotations alter column final_customer_price set not null;
alter table public.quotations add constraint quotations_final_price_nonnegative check(final_customer_price>=0);
alter table public.quotations add constraint quotations_negotiation_reason_check check(final_customer_price=official_price or nullif(trim(negotiation_reason),'') is not null);
alter table public.quotations add constraint quotations_negotiation_method_check check(negotiation_method is null or negotiation_method in ('MANUAL','PERCENT_DISCOUNT','PERCENT_INCREASE','FIXED_DISCOUNT','FIXED_INCREASE','RESTORE'));

alter table public.quotation_items
  add column if not exists official_unit_price numeric(14,2),
  add column if not exists official_total numeric(14,2),
  add column if not exists final_unit_price numeric(14,2),
  add column if not exists final_total numeric(14,2);

update public.quotation_items
set official_unit_price=coalesce(official_unit_price,unit_price),
    official_total=coalesce(official_total,total),
    final_unit_price=coalesce(final_unit_price,unit_price),
    final_total=coalesce(final_total,total)
where official_unit_price is null or official_total is null or final_unit_price is null or final_total is null;

alter table public.quotation_items alter column official_unit_price set not null;
alter table public.quotation_items alter column official_total set not null;
alter table public.quotation_items alter column final_unit_price set not null;
alter table public.quotation_items alter column final_total set not null;

create table if not exists public.quotation_price_history(
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id),
  official_price numeric(14,2) not null,
  previous_final_price numeric(14,2) not null,
  final_price numeric(14,2) not null,
  difference numeric(14,2) not null,
  discount_percentage numeric(9,4) not null default 0,
  increase_percentage numeric(9,4) not null default 0,
  method text not null,
  adjustment_value numeric(14,4) not null,
  reason text,
  salesperson_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.can_manage_commercial()
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and public.current_orbit_role() in ('CEO','ADMINISTRATOR','SALES')
$$;

create index if not exists quotation_price_history_quotation_idx on public.quotation_price_history(quotation_id,created_at desc,id desc);
alter table public.quotation_price_history enable row level security;
create policy quotation_price_history_internal_read on public.quotation_price_history for select using(public.is_internal_user());
create policy quotation_price_history_admin_write on public.quotation_price_history for all using(public.can_manage_commercial()) with check(public.can_manage_commercial());
drop trigger if exists quotation_price_history_audit on public.quotation_price_history;
create trigger quotation_price_history_audit after insert on public.quotation_price_history for each row execute function public.audit_row_change();
revoke update,delete on public.quotation_price_history from authenticated;

create or replace function public.protect_official_quotation_price()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.official_price is distinct from new.official_price then raise exception 'El precio oficial de la cotización es inmutable.'; end if;
  return new;
end $$;
drop trigger if exists quotations_protect_official_price on public.quotations;
create trigger quotations_protect_official_price before update on public.quotations for each row execute function public.protect_official_quotation_price();

create or replace function public.protect_official_quotation_item_price()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.official_unit_price is distinct from new.official_unit_price or old.official_total is distinct from new.official_total then raise exception 'El precio oficial del ítem es inmutable.'; end if;
  return new;
end $$;
drop trigger if exists quotation_items_protect_official_price on public.quotation_items;
create trigger quotation_items_protect_official_price before update on public.quotation_items for each row execute function public.protect_official_quotation_item_price();

create or replace function public.negotiate_quotation(p_quotation_id uuid,p_expected_version integer,p_method text,p_value numeric,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; final_price numeric; difference numeric; discount_pct numeric:=0; increase_pct numeric:=0; action_name text; message text; ratio numeric; actor uuid:=auth.uid();
begin
  if actor is null or not public.can_manage_commercial() then raise exception 'No autorizado para negociar cotizaciones.'; end if;
  select * into q from public.quotations where id=p_quotation_id and deleted_at is null for update;
  if q.id is null then raise exception 'Cotización no encontrada.'; end if;
  if q.version<>p_expected_version then raise exception 'La cotización fue modificada por otra sesión.'; end if;
  if q.status not in ('DRAFT','SENT') then raise exception 'Solo puedes negociar una cotización antes de su aceptación.'; end if;
  if p_value<0 then raise exception 'El ajuste debe ser positivo.'; end if;
  final_price:=case p_method
    when 'RESTORE' then q.official_price
    when 'MANUAL' then p_value
    when 'PERCENT_DISCOUNT' then q.official_price*(1-p_value/100)
    when 'PERCENT_INCREASE' then q.official_price*(1+p_value/100)
    when 'FIXED_DISCOUNT' then q.official_price-p_value
    when 'FIXED_INCREASE' then q.official_price+p_value
    else null end;
  if final_price is null then raise exception 'Método de negociación inválido.'; end if;
  if p_method='PERCENT_DISCOUNT' and p_value>100 then raise exception 'El descuento no puede superar el 100%%.'; end if;
  final_price:=round(final_price); if final_price<0 then raise exception 'El precio final no puede ser negativo.'; end if;
  difference:=final_price-q.official_price;
  if difference<>0 and nullif(trim(p_reason),'') is null then raise exception 'La razón de negociación es obligatoria.'; end if;
  if difference<0 and q.official_price>0 then discount_pct:=abs(difference)/q.official_price*100; end if;
  if difference>0 and q.official_price>0 then increase_pct:=difference/q.official_price*100; end if;
  ratio:=case when q.official_price=0 then 0 else final_price/q.official_price end;
  update public.quotation_items set final_unit_price=round(official_unit_price*ratio),final_total=round(official_total*ratio),unit_price=round(official_unit_price*ratio),total=round(official_total*ratio) where quotation_id=q.id;
  update public.quotations set final_customer_price=final_price,grand_total=final_price,price_difference=difference,negotiation_method=p_method,negotiation_value=p_value,negotiation_reason=case when difference=0 then null else trim(p_reason) end,negotiated_by=actor,negotiated_at=now(),updated_by=actor,approval_reason=coalesce(nullif(trim(p_reason),''),'Precio oficial restaurado') where id=q.id;
  insert into public.quotation_price_history(quotation_id,official_price,previous_final_price,final_price,difference,discount_percentage,increase_percentage,method,adjustment_value,reason,salesperson_id)
  values(q.id,q.official_price,q.final_customer_price,final_price,difference,discount_pct,increase_pct,p_method,p_value,case when difference=0 then null else trim(p_reason) end,actor);
  action_name:=case when difference=0 then 'OFFICIAL_PRICE_RESTORED' when difference<0 then 'PRICE_DISCOUNTED' else 'PRICE_INCREASED' end;
  message:=case when difference=0 then 'Precio oficial restaurado.' when difference<0 then 'Precio final de la cotización ajustado con descuento.' else 'Precio final de la cotización ajustado con aumento.' end;
  insert into public.timeline_events(customer_id,project_id,event_type,title,description,orbit_event_id,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by)
  select q.customer_id,q.project_id,event.action,event.message,event.message,q.orbit_event_id,actor,'Ventas','Administrator',event.action,'Quotation',q.id,event.message,gen_random_uuid()::text,actor
  from (values(action_name,message),('QUOTATION_UPDATED','Cotización actualizada con el precio final acordado.')) as event(action,message);
  return jsonb_build_object('projectId',q.project_id,'restored',difference=0,'finalCustomerPrice',final_price);
end $$;

revoke all on function public.negotiate_quotation(uuid,integer,text,numeric,text) from public;
grant execute on function public.negotiate_quotation(uuid,integer,text,numeric,text) to authenticated;

commit;
