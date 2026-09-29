begin;

create or replace function public.add_event_post_reservation_extra(
  p_project_id uuid,
  p_commercial_price_id uuid default null,
  p_name text default null,
  p_description text default '',
  p_amount numeric default null,
  p_source text default 'CUSTOM',
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  catalog public.commercial_prices%rowtype;
  extra_id uuid;
  base_total numeric := 0;
  extras_total numeric := 0;
  total_amount numeric := 0;
  v_paid_amount numeric := 0;
  invoice_row public.invoices%rowtype;
  accepted_quote public.quotations%rowtype;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede agregar extras.'; end if;
  if not exists (select 1 from public.projects as project where project.id = p_project_id and project.deleted_at is null) then raise exception 'Evento no encontrado.'; end if;
  if upper(coalesce(p_source,'CUSTOM')) = 'CATALOG' then
    select price.* into catalog from public.commercial_prices as price
      where price.id = p_commercial_price_id and price.category = 'EXTRA' and price.enabled and price.deleted_at is null and price.pricing_status = 'DEFINED';
    if not found then raise exception 'Extra de catálogo no disponible.'; end if;
    if exists (select 1 from public.event_post_reservation_extras as existing_extra where existing_extra.project_id = p_project_id and existing_extra.commercial_price_id = catalog.id and existing_extra.status = 'ACTIVE') then raise exception 'Este extra ya está agregado al evento.'; end if;
    p_name := catalog.label; p_description := coalesce(nullif(trim(p_description),''), coalesce(catalog.metadata->>'description','')); p_amount := catalog.unit_price; p_commercial_price_id := catalog.id; p_source := 'CATALOG'; p_name := trim(p_name);
  else
    if coalesce(length(trim(p_name)),0) < 2 or p_amount is null or p_amount < 0 then raise exception 'El extra personalizado requiere nombre y monto válido.'; end if;
    p_source := 'CUSTOM'; p_name := trim(p_name);
  end if;
  insert into public.event_post_reservation_extras(project_id,commercial_price_id,code,name,description,amount,source,reason,added_by)
    values(p_project_id,p_commercial_price_id,case when p_commercial_price_id is null then null else catalog.code end,trim(p_name),coalesce(p_description,''),p_amount,p_source,nullif(trim(p_reason),''),actor)
    returning id into extra_id;
  select quote.* into accepted_quote from public.quotations as quote where quote.project_id = p_project_id and quote.status = 'ACCEPTED' and quote.deleted_at is null order by quote.approved_at desc nulls last, quote.created_at desc limit 1;
  base_total := coalesce(accepted_quote.final_customer_price, accepted_quote.grand_total, 0);
  select coalesce(sum(existing_extra.amount) filter (where existing_extra.status = 'ACTIVE'),0) into extras_total from public.event_post_reservation_extras as existing_extra where existing_extra.project_id = p_project_id;
  total_amount := base_total + extras_total;
  select invoice.* into invoice_row from public.invoices as invoice where invoice.project_id = p_project_id and invoice.deleted_at is null and invoice.status not in ('CANCELLED','VOID') order by invoice.created_at desc limit 1 for update;
  if found then
    v_paid_amount := invoice_row.paid_amount;
    update public.invoices as invoice set amount = total_amount, paid_amount = v_paid_amount, updated_by = actor, updated_at = now(), version = invoice.version + 1 where invoice.id = invoice_row.id;
    update public.financial_event_records as financial set revenue = total_amount, invoiced_amount = total_amount, paid_amount = v_paid_amount, outstanding_balance = greatest(total_amount - v_paid_amount,0), calculated_at = now(), updated_at = now(), version = financial.version + 1 where financial.project_id = p_project_id;
  end if;
  insert into public.timeline_events(project_id,orbit_event_id,event_type,title,description,actor_id,actor_label,source,action,entity_type,entity_id,human_message,correlation_id,reason,created_by)
    select p_project_id,project.orbit_event_id,'EVENT_EXTRA_ADDED','Extra agregado',format('%s · %s',trim(p_name),to_char(p_amount,'FM$999G999G999')),actor,'Administrador','Commercial','EVENT_EXTRA_ADDED','EventPostReservationExtra',extra_id,format('Se agregó el extra %s al evento.',trim(p_name)), 'event-extra:'||extra_id, nullif(trim(p_reason),''), actor from public.projects as project where project.id = p_project_id;
  return jsonb_build_object('id',extra_id,'total',total_amount,'paid',v_paid_amount,'balance',greatest(total_amount-v_paid_amount,0),'extras_total',extras_total);
end $$;

revoke all on function public.add_event_post_reservation_extra(uuid,uuid,text,text,numeric,text,text) from public, anon;
grant execute on function public.add_event_post_reservation_extra(uuid,uuid,text,text,numeric,text,text) to authenticated, service_role;

commit;
