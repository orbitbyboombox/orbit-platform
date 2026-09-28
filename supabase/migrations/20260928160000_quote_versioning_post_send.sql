begin;

alter table public.quotations
  add column if not exists current_version_id uuid,
  add column if not exists accepted_version_id uuid,
  add column if not exists last_change_reason text;

alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations add constraint quotations_status_check
  check (status in ('DRAFT','SENT','VIEWED','NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED'));

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null check (status in ('DRAFT','SENT','VIEWED','NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED')),
  customer_snapshot jsonb not null default '{}'::jsonb,
  commercial_snapshot jsonb not null default '{}'::jsonb,
  items_snapshot jsonb not null default '[]'::jsonb,
  financial_snapshot jsonb not null default '{}'::jsonb,
  pdf_storage_path text,
  drive_file_id text,
  change_reason text,
  supersedes_version_id uuid references public.quote_versions(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  unique (quote_id, version_number)
);

create index if not exists quote_versions_quote_idx
  on public.quote_versions(quote_id, version_number desc);

do $$
declare q record; v uuid;
begin
  for q in select * from public.quotations where deleted_at is null and current_version_id is null loop
    insert into public.quote_versions(
      quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,
      pdf_storage_path,drive_file_id,created_by,created_at,accepted_at,accepted_by
    )
    select q.id,greatest(coalesce(q.version,1),1),
      case when q.status in ('DRAFT','SENT','VIEWED','NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CONVERTED','CANCELLED') then q.status else 'DRAFT' end,
      coalesce(q.customer_snapshot,'{}'::jsonb),coalesce(q.commercial_snapshot,'{}'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.quotation_items i where i.quotation_id=q.id),'[]'::jsonb),
      jsonb_build_object('subtotal',q.subtotal,'discount',q.discount_total,'net',q.subtotal-q.discount_total,'tax',q.tax_total,'total',q.grand_total),
      q.pdf_storage_path,q.drive_file_id,q.created_by,q.created_at,q.approved_at,q.approved_by
    on conflict (quote_id, version_number) do update set
      status=excluded.status,
      customer_snapshot=excluded.customer_snapshot,
      commercial_snapshot=excluded.commercial_snapshot,
      items_snapshot=excluded.items_snapshot,
      financial_snapshot=excluded.financial_snapshot
    returning id into v;
    update public.quotations set current_version_id=v where id=q.id;
  end loop;
end $$;

alter table public.quote_versions enable row level security;
drop policy if exists quote_versions_internal_read on public.quote_versions;
create policy quote_versions_internal_read on public.quote_versions
  for select using (public.is_internal_user());
drop policy if exists quote_versions_admin_write on public.quote_versions;
create policy quote_versions_admin_write on public.quote_versions
  for all using (public.can_manage_commercial()) with check (public.can_manage_commercial());

-- The same persistence boundary handles ordinary drafts and post-send revisions.
-- Existing DRAFT edits remain in-place; SENT/VIEWED/NEGOTIATION edits first
-- snapshot the old state and then create a new current version atomically.
create or replace function public._save_commercial_quote_draft_core(
  p_actor uuid,
  p_actor_type text,
  p_actor_id text,
  p_quotation_id uuid,
  p_quote jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  q public.quotations%rowtype;
  quotation_number_value text;
  operation_value text;
  issue_date_value date;
  subtotal_value numeric;
  discount_value numeric;
  tax_value numeric;
  grand_total_value numeric;
  deposit_percent_value numeric;
  validity_days_value integer;
  next_version integer;
  previous_version_id uuid;
  new_version_id uuid := null;
  customer_snapshot_value jsonb := coalesce(p_quote->'customerSnapshot','{}'::jsonb);
  commercial_snapshot_value jsonb := coalesce(p_quote->'commercialSnapshot','{}'::jsonb);
  financial_snapshot_value jsonb;
begin
  if p_actor_type = 'HUMAN' then
    if p_actor is null or not public.can_manage_commercial() then
      raise exception 'Acceso comercial requerido.' using errcode = '42501';
    end if;
  elsif p_actor_type = 'SYSTEM_AGENT' then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
      or p_actor_id <> 'BIANCA' or p_actor is not null then
      raise exception 'Actor BIANCA no autorizado.' using errcode = '42501';
    end if;
  else
    raise exception 'Tipo de actor no autorizado.' using errcode = '42501';
  end if;
  if p_quotation_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización requiere al menos un ítem.' using errcode = '22023';
  end if;

  subtotal_value := (p_quote->>'subtotal')::numeric;
  discount_value := (p_quote->>'discountTotal')::numeric;
  tax_value := (p_quote->>'taxTotal')::numeric;
  grand_total_value := (p_quote->>'grandTotal')::numeric;
  deposit_percent_value := (p_quote->>'depositPercent')::numeric;
  validity_days_value := (p_quote->>'validityDays')::integer;
  issue_date_value := coalesce(nullif(p_quote->>'issueDate','')::date, (current_timestamp at time zone 'America/Santiago')::date);
  if subtotal_value < 0 or discount_value < 0 or discount_value > subtotal_value
    or tax_value < 0 or grand_total_value <> subtotal_value - discount_value + tax_value
    or deposit_percent_value < 0 or deposit_percent_value > 100
    or validity_days_value < 1 or validity_days_value > 365 then
    raise exception 'Los totales o parámetros de la cotización no son consistentes.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_quotation_id::text, 0));
  select * into q from public.quotations where id=p_quotation_id and deleted_at is null for update;
  financial_snapshot_value := jsonb_build_object(
    'subtotal', subtotal_value, 'discount', discount_value,
    'net', subtotal_value-discount_value, 'tax', tax_value,
    'total', grand_total_value, 'depositPercent', deposit_percent_value,
    'deposit', round(grand_total_value*deposit_percent_value/100),
    'balance', grand_total_value-round(grand_total_value*deposit_percent_value/100)
  );

  if not found then
    quotation_number_value := public.allocate_quotation_number(p_quotation_id, issue_date_value);
    insert into public.quotations(
      id,quotation_number,customer_id,project_id,orbit_event_id,status,customer_type,event_type,
      issue_date,expiration_date,currency,subtotal,transport_total,discount_total,tax_total,grand_total,
      official_price,final_customer_price,price_difference,customer_snapshot,commercial_snapshot,pricing_snapshot,
      validity_days,deposit_percent,global_discount_type,global_discount_value,blockers,created_by,updated_by
    ) values(
      p_quotation_id,quotation_number_value,nullif(p_quote->>'customerId','')::uuid,null,null,'DRAFT','COMPANY','CORPORATE',
      issue_date_value,(p_quote->>'expirationDate')::date,'CLP',subtotal_value,0,discount_value,tax_value,grand_total_value,
      grand_total_value,grand_total_value,0,customer_snapshot_value,commercial_snapshot_value,commercial_snapshot_value,
      validity_days_value,deposit_percent_value,nullif(p_quote->>'globalDiscountType',''),(p_quote->>'globalDiscountValue')::numeric,'[]'::jsonb,p_actor,p_actor
    );
    operation_value := 'CREATED';
    q.id := p_quotation_id;
    q.version := 0;
    q.status := 'DRAFT';
  elsif q.status = 'ACCEPTED' or q.status = 'CONVERTED' then
    raise exception 'La cotización ya fue aceptada; crea una revisión post-aceptación explícita.' using errcode='55000';
  else
    operation_value := 'UPDATED';
  end if;

  next_version := greatest(coalesce(q.version,0)+1,1);
  if q.id is not null and q.version > 0 and q.status <> 'DRAFT' then
    insert into public.quote_versions(
      quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,
      pdf_storage_path,drive_file_id,created_by,created_at,sent_at,sent_by,accepted_at,accepted_by,change_reason
    )
    select q.id,q.version,q.status,coalesce(q.customer_snapshot,'{}'::jsonb),coalesce(q.commercial_snapshot,'{}'::jsonb),
      coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.quotation_items i where i.quotation_id=q.id),'[]'::jsonb),
      jsonb_build_object('subtotal',q.subtotal,'discount',q.discount_total,'net',q.subtotal-q.discount_total,'tax',q.tax_total,'total',q.grand_total),
      q.pdf_storage_path,q.drive_file_id,q.updated_by,q.updated_at,q.approved_at,q.approved_by,q.approved_at,q.approved_by,
      coalesce(q.last_change_reason,'Versión anterior preservada')
    returning id into previous_version_id;
  end if;

  update public.quotations set
    customer_id=nullif(p_quote->>'customerId','')::uuid,
    customer_snapshot=customer_snapshot_value,commercial_snapshot=commercial_snapshot_value,pricing_snapshot=commercial_snapshot_value,
    expiration_date=(p_quote->>'expirationDate')::date,subtotal=subtotal_value,transport_total=0,discount_total=discount_value,
    tax_total=tax_value,grand_total=grand_total_value,official_price=case when q.status='DRAFT' then grand_total_value else official_price end,
    final_customer_price=grand_total_value,price_difference=0,validity_days=validity_days_value,deposit_percent=deposit_percent_value,
    global_discount_type=nullif(p_quote->>'globalDiscountType',''),global_discount_value=(p_quote->>'globalDiscountValue')::numeric,
    status=case when q.status='DRAFT' then 'DRAFT' else 'NEGOTIATION' end,
    version=next_version,updated_by=p_actor,updated_at=now(),current_version_id=null
  where id=p_quotation_id;

  delete from public.quotation_items where quotation_id=p_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.quotation_items(quotation_id,item_type,code,label,description,quantity,unit_price,total,official_unit_price,official_total,final_unit_price,final_total,catalog_price,quoted_price,discount_type,discount_value,display_order,is_manual,metadata)
    values(p_quotation_id,item->>'itemType',item->>'code',item->>'description',item->>'description',(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric),coalesce((item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric)*(item->>'quantity')::numeric,(item->>'quotedPrice')::numeric,(item->>'total')::numeric,(item->>'catalogPrice')::numeric,(item->>'quotedPrice')::numeric,nullif(item->>'discountType',''),(item->>'discountValue')::numeric,(item->>'displayOrder')::integer,(item->>'manual')::boolean,coalesce(item->'metadata','{}'::jsonb));
  end loop;

  if q.status = 'DRAFT' and q.current_version_id is not null then
    update public.quote_versions set
      customer_snapshot=customer_snapshot_value,
      commercial_snapshot=commercial_snapshot_value,
      items_snapshot=p_items,
      financial_snapshot=financial_snapshot_value,
      change_reason=nullif(p_quote->>'changeReason',''),
      created_by=coalesce(created_by,p_actor)
    where id=q.current_version_id
    returning id into new_version_id;
  end if;
  if new_version_id is null then
    insert into public.quote_versions(quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,supersedes_version_id,change_reason,created_by)
    values(p_quotation_id,next_version,case when q.status='DRAFT' then 'DRAFT' else 'NEGOTIATION' end,customer_snapshot_value,commercial_snapshot_value,p_items,financial_snapshot_value,previous_version_id,nullif(p_quote->>'changeReason',''),p_actor)
    returning id into new_version_id;
  end if;
  update public.quotations set current_version_id=new_version_id where id=p_quotation_id;
  return jsonb_build_object('quotationId',p_quotation_id,'quotationNumber',coalesce(quotation_number_value,q.quotation_number),'operation',operation_value,'version',next_version);
end;
$$;

revoke all on function public._save_commercial_quote_draft_core(uuid,text,text,uuid,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.ensure_current_quote_version(p_quote_id uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; v uuid;
begin
  if p_actor is null or not public.can_manage_commercial() then raise exception 'Acceso comercial requerido.' using errcode='42501'; end if;
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.current_version_id is not null then return q.current_version_id; end if;
  insert into public.quote_versions(quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,pdf_storage_path,drive_file_id,created_by,created_at)
  select q.id,greatest(q.version,1),q.status,coalesce(q.customer_snapshot,'{}'::jsonb),coalesce(q.commercial_snapshot,'{}'::jsonb),coalesce((select jsonb_agg(to_jsonb(i) order by i.display_order,i.id) from public.quotation_items i where i.quotation_id=q.id),'[]'::jsonb),jsonb_build_object('subtotal',q.subtotal,'discount',q.discount_total,'net',q.subtotal-q.discount_total,'tax',q.tax_total,'total',q.grand_total),q.pdf_storage_path,q.drive_file_id,p_actor,q.created_at
  returning id into v;
  update public.quotations set current_version_id=v where id=q.id;
  return v;
end; $$;

grant execute on function public.ensure_current_quote_version(uuid,uuid) to authenticated;

create or replace function public.accept_commercial_quote_for_reservation(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; v uuid; actor uuid := auth.uid(); snapshot jsonb;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede aceptar una cotización.' using errcode='42501'; end if;
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status='CONVERTED' then return jsonb_build_object('status','CONVERTED','quoteId',q.id); end if;
  if q.status='ACCEPTED' then return jsonb_build_object('status','ACCEPTED','quoteId',q.id,'acceptedVersionId',q.accepted_version_id); end if;
  if q.status not in ('SENT','VIEWED') then raise exception 'La cotización debe estar enviada antes de aceptarse.' using errcode='55000'; end if;
  v := public.ensure_current_quote_version(q.id, actor);
  snapshot := public.build_accepted_commercial_quote_snapshot(q.id);
  update public.quotations set status='ACCEPTED', approved_at=now(), approved_by=actor, approval_reason='Aceptación comercial confirmada.', accepted_snapshot=snapshot, accepted_version_id=v, updated_by=actor, updated_at=now() where id=q.id;
  update public.quote_versions set status='ACCEPTED', accepted_at=now(), accepted_by=actor where id=v;
  return jsonb_build_object('status','ACCEPTED','quoteId',q.id,'acceptedVersionId',v);
end $$;

create or replace function public.prepare_commercial_quote_conversion(p_quote_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); q public.quotations%rowtype; tx_id uuid; snapshot jsonb;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede generar la reserva.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text,0));
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status='CONVERTED' and q.project_id is not null then
    return jsonb_build_object('quotationId',q.id,'status',q.status,'projectId',q.project_id,'transactionId',q.conversion_transaction_id,'snapshot',q.accepted_snapshot);
  end if;
  if q.status<>'ACCEPTED' or q.accepted_version_id is null then raise exception 'La cotización debe tener una versión aceptada antes de generar la reserva.'; end if;
  tx_id:=coalesce(q.conversion_transaction_id,gen_random_uuid());
  snapshot:=q.accepted_snapshot;
  update public.quotations set conversion_transaction_id=tx_id, conversion_claimed_at=coalesce(conversion_claimed_at,now()), updated_by=actor, updated_at=now() where id=q.id;
  return jsonb_build_object('quotationId',q.id,'status','ACCEPTED','transactionId',tx_id,'snapshot',snapshot,'acceptedVersionId',q.accepted_version_id);
end $$;

create or replace function public.create_post_acceptance_quote_revision(p_quote_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare q public.quotations%rowtype; current_version record; new_id uuid; next_version integer; actor uuid := auth.uid();
begin
  if actor is null or not public.can_manage_commercial() then raise exception 'Acceso comercial requerido.' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'La revisión post-aceptación requiere un motivo.' using errcode='22023'; end if;
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status <> 'ACCEPTED' then raise exception 'Solo una cotización aceptada puede abrir una revisión post-aceptación.' using errcode='55000'; end if;
  if q.current_version_id is null then perform public.ensure_current_quote_version(q.id, actor); select * into q from public.quotations where id=q.id for update; end if;
  select * into current_version from public.quote_versions where id=q.current_version_id for update;
  next_version := greatest(coalesce(q.version,0)+1,1);
  insert into public.quote_versions(quote_id,version_number,status,customer_snapshot,commercial_snapshot,items_snapshot,financial_snapshot,supersedes_version_id,change_reason,created_by)
  values(q.id,next_version,'NEGOTIATION',current_version.customer_snapshot,current_version.commercial_snapshot,current_version.items_snapshot,current_version.financial_snapshot,current_version.id,trim(p_reason),actor)
  returning id into new_id;
  update public.quotations set status='NEGOTIATION', version=next_version, current_version_id=new_id, last_change_reason=trim(p_reason), updated_by=actor, updated_at=now() where id=q.id;
  return jsonb_build_object('status','NEGOTIATION','quoteId',q.id,'version',next_version,'versionId',new_id,'acceptedVersionId',q.accepted_version_id);
end $$;

grant execute on function public.create_post_acceptance_quote_revision(uuid,text) to authenticated;

commit;
