begin;

alter table public.quotations
  add column if not exists conversion_transaction_id uuid,
  add column if not exists conversion_claimed_at timestamptz,
  add column if not exists accepted_snapshot jsonb;

create unique index if not exists quotations_conversion_transaction_uq
  on public.quotations(conversion_transaction_id)
  where conversion_transaction_id is not null;

create table if not exists public.project_commercial_origins (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null unique references public.quotations(id),
  project_id uuid not null unique references public.projects(id),
  customer_id uuid not null references public.customers(id),
  quotation_number text not null,
  quotation_version integer not null,
  accepted_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_snapshot jsonb not null,
  conversion_review jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.project_commercial_origins enable row level security;
drop policy if exists project_commercial_origins_internal_read on public.project_commercial_origins;
create policy project_commercial_origins_internal_read
  on public.project_commercial_origins for select
  using (public.is_internal_user());
drop policy if exists project_commercial_origins_admin_write on public.project_commercial_origins;
create policy project_commercial_origins_admin_write
  on public.project_commercial_origins for all
  using (public.can_administer())
  with check (public.can_administer());

alter table public.documents
  add column if not exists purchase_order_number text,
  add column if not exists replaced_document_id uuid references public.documents(id);

create unique index if not exists documents_current_customer_purchase_order_uq
  on public.documents(project_id)
  where document_type='CUSTOMER_PURCHASE_ORDER' and deleted_at is null;

create or replace function public.build_accepted_commercial_quote_snapshot(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'quotation', jsonb_build_object(
      'id', q.id,
      'number', q.quotation_number,
      'version', q.version,
      'issueDate', q.issue_date,
      'expirationDate', q.expiration_date,
      'acceptedAt', q.approved_at,
      'pdfStoragePath', q.pdf_storage_path,
      'driveFileId', q.drive_file_id,
      'subtotal', q.subtotal,
      'transportTotal', q.transport_total,
      'discountTotal', q.discount_total,
      'taxTotal', q.tax_total,
      'grandTotal', q.grand_total,
      'depositPercent', q.deposit_percent
    ),
    'customer', coalesce(q.customer_snapshot, '{}'::jsonb),
    'commercial', coalesce(q.commercial_snapshot, q.pricing_snapshot, '{}'::jsonb),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', qi.id,
          'itemType', qi.item_type,
          'code', qi.code,
          'label', coalesce(nullif(qi.description,''), qi.label),
          'quantity', qi.quantity,
          'catalogPrice', qi.catalog_price,
          'quotedPrice', coalesce(qi.quoted_price, qi.unit_price),
          'total', qi.total,
          'isManual', qi.is_manual,
          'metadata', coalesce(qi.metadata, '{}'::jsonb),
          'displayOrder', qi.display_order
        ) order by qi.display_order, qi.id
      )
      from public.quotation_items qi
      where qi.quotation_id=q.id
    ), '[]'::jsonb)
  )
  from public.quotations q
  where q.id=p_quote_id and q.deleted_at is null and public.is_internal_user()
$$;

create or replace function public.accept_commercial_quote_for_reservation(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  q public.quotations%rowtype;
  snapshot jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede aceptar una cotización.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text,0));
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status='CONVERTED' then
    return jsonb_build_object('quotationId',q.id,'status',q.status,'projectId',q.project_id);
  end if;
  if q.status not in ('SENT','VIEWED','ACCEPTED') then
    raise exception 'Solo una cotización enviada puede marcarse como aceptada.';
  end if;
  if q.status<>'ACCEPTED' then
    update public.quotations set
      status='ACCEPTED', approved_by=actor, approved_at=now(),
      approval_reason='Aceptación comercial confirmada por Founder',
      updated_by=actor, updated_at=now()
    where id=q.id;
  end if;
  snapshot:=coalesce(q.accepted_snapshot,public.build_accepted_commercial_quote_snapshot(q.id));
  update public.quotations set accepted_snapshot=snapshot where id=q.id and accepted_snapshot is null;
  return jsonb_build_object('quotationId',q.id,'status','ACCEPTED','snapshot',snapshot);
end;
$$;

create or replace function public.prepare_commercial_quote_conversion(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  q public.quotations%rowtype;
  tx_id uuid;
  snapshot jsonb;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede generar la reserva.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text,0));
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status='CONVERTED' and q.project_id is not null then
    return jsonb_build_object('quotationId',q.id,'status',q.status,'projectId',q.project_id,'transactionId',q.conversion_transaction_id,'snapshot',q.accepted_snapshot);
  end if;
  if q.status<>'ACCEPTED' then
    raise exception 'La cotización debe estar ACEPTADA antes de generar la reserva.';
  end if;
  tx_id:=coalesce(q.conversion_transaction_id,gen_random_uuid());
  snapshot:=coalesce(q.accepted_snapshot,public.build_accepted_commercial_quote_snapshot(q.id));
  update public.quotations set
    conversion_transaction_id=tx_id,
    conversion_claimed_at=coalesce(conversion_claimed_at,now()),
    accepted_snapshot=snapshot,
    updated_by=actor,
    updated_at=now()
  where id=q.id;
  return jsonb_build_object('quotationId',q.id,'status','ACCEPTED','transactionId',tx_id,'snapshot',snapshot);
end;
$$;

create or replace function public.finalize_commercial_quote_conversion(
  p_quote_id uuid,
  p_transaction_id uuid,
  p_project_id uuid,
  p_review jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  q public.quotations%rowtype;
  tx public.reservation_transactions%rowtype;
  p public.projects%rowtype;
  origin_id uuid;
  accepted_at_value timestamptz;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede finalizar la conversión.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_quote_id::text,0));
  select * into q from public.quotations where id=p_quote_id and deleted_at is null for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if q.status='CONVERTED' and q.project_id is not null then
    return jsonb_build_object('quotationId',q.id,'projectId',q.project_id,'status','CONVERTED','duplicate',true);
  end if;
  if q.status<>'ACCEPTED' or q.conversion_transaction_id is distinct from p_transaction_id or q.accepted_snapshot is null then
    raise exception 'La conversión no coincide con la cotización aceptada.';
  end if;
  select * into tx from public.reservation_transactions where id=p_transaction_id for update;
  if not found or tx.project_id is distinct from p_project_id then
    raise exception 'La transacción de reserva no corresponde al Evento.';
  end if;
  select * into p from public.projects where id=p_project_id and deleted_at is null for update;
  if not found or p.customer_id is distinct from tx.customer_id then
    raise exception 'El Evento convertido no corresponde al Cliente canónico.';
  end if;
  accepted_at_value:=coalesce(q.approved_at,q.created_at,now());
  insert into public.project_commercial_origins(
    quotation_id,project_id,customer_id,quotation_number,quotation_version,
    accepted_at,accepted_by,accepted_snapshot,conversion_review,created_by
  ) values(
    q.id,p.id,p.customer_id,q.quotation_number,q.version,
    accepted_at_value,q.approved_by,q.accepted_snapshot,coalesce(p_review,'{}'::jsonb),actor
  )
  on conflict(quotation_id) do nothing
  returning id into origin_id;
  if origin_id is null then
    select id into origin_id from public.project_commercial_origins where quotation_id=q.id and project_id=p.id;
    if origin_id is null then raise exception 'La cotización ya pertenece a otro Evento.'; end if;
  end if;
  update public.quotations set
    status='CONVERTED', customer_id=p.customer_id, project_id=p.id,
    orbit_event_id=p.orbit_event_id, converted_at=coalesce(converted_at,now()),
    updated_by=actor, updated_at=now()
  where id=q.id;
  if not exists(select 1 from public.timeline_events where correlation_id='quote-conversion:'||q.id::text) then
    insert into public.timeline_events(
      customer_id,project_id,orbit_event_id,event_type,title,description,
      actor_id,actor_label,source,action,entity_type,entity_id,human_message,
      correlation_id,created_by
    ) values(
      p.customer_id,p.id,p.orbit_event_id,'QUOTATION_CONVERTED',
      'Reserva generada desde cotización',q.quotation_number||' es el origen comercial inmutable del Evento.',
      actor,'Founder','Commercial Hub','QUOTATION_CONVERTED','Quotation',q.id,
      'Reserva generada desde '||q.quotation_number||' mediante el pipeline único.',
      'quote-conversion:'||q.id::text,actor
    );
  end if;
  return jsonb_build_object('quotationId',q.id,'projectId',p.id,'originId',origin_id,'status','CONVERTED','duplicate',false);
end;
$$;

create or replace function public.register_customer_purchase_order(
  p_document_id uuid,
  p_project_id uuid,
  p_purchase_order_number text,
  p_storage_path text,
  p_checksum text,
  p_original_filename text,
  p_mime_type text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  actor uuid:=auth.uid();
  p public.projects%rowtype;
  existing_id uuid;
  previous_id uuid;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede adjuntar una OC.';
  end if;
  if p_mime_type not in ('application/pdf','image/jpeg','image/png') then
    raise exception 'Usa PDF, JPG o PNG.';
  end if;
  select id into existing_id from public.documents where idempotency_key=p_idempotency_key and deleted_at is null;
  if existing_id is not null then return existing_id; end if;
  select * into p from public.projects where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento no encontrado.'; end if;
  select id into previous_id from public.documents
    where project_id=p.id and document_type='CUSTOMER_PURCHASE_ORDER' and deleted_at is null
    for update;
  if previous_id is not null then
    update public.documents set
      deleted_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('replacedBy',p_document_id,'replacedAt',now(),'replacedByUser',actor)
    where id=previous_id;
  end if;
  insert into public.documents(
    id,project_id,customer_id,orbit_event_id,document_type,storage_bucket,
    storage_path,checksum,created_by,idempotency_key,purchase_order_number,
    original_filename,mime_type,replaced_document_id,metadata
  ) values(
    p_document_id,p.id,p.customer_id,p.orbit_event_id,'CUSTOMER_PURCHASE_ORDER','orbit-documents',
    p_storage_path,p_checksum,actor,p_idempotency_key,nullif(trim(p_purchase_order_number),''),
    p_original_filename,p_mime_type,previous_id,
    jsonb_build_object('source','FOUNDER_UPLOAD','protected',true,'driveArchiveStatus','PENDING')
  );
  insert into public.timeline_events(
    customer_id,project_id,orbit_event_id,event_type,title,description,actor_id,
    actor_label,source,action,entity_type,entity_id,human_message,correlation_id,created_by
  ) values(
    p.customer_id,p.id,p.orbit_event_id,'CUSTOMER_PURCHASE_ORDER_ATTACHED','OC Cliente adjuntada',
    coalesce('OC '||nullif(trim(p_purchase_order_number),''),'Documento sin número'),actor,
    'Founder','Event Documents','CUSTOMER_PURCHASE_ORDER_ATTACHED','Document',p_document_id,
    case when previous_id is null then 'OC Cliente adjuntada.' else 'OC Cliente reemplazada conservando el historial.' end,
    'customer-purchase-order:'||p_document_id::text,actor
  );
  return p_document_id;
end;
$$;

create or replace function public.protect_accepted_commercial_snapshot()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.accepted_snapshot is not null and old.accepted_snapshot is distinct from new.accepted_snapshot then
    raise exception 'El snapshot aceptado de la cotización es inmutable.';
  end if;
  return new;
end;
$$;

create or replace function public.protect_project_commercial_origin()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  raise exception 'El origen comercial aceptado del Evento es inmutable.';
end;
$$;

drop trigger if exists quotations_accepted_snapshot_immutable on public.quotations;
create trigger quotations_accepted_snapshot_immutable
before update on public.quotations
for each row execute function public.protect_accepted_commercial_snapshot();

drop trigger if exists project_commercial_origins_immutable on public.project_commercial_origins;
create trigger project_commercial_origins_immutable
before update or delete on public.project_commercial_origins
for each row execute function public.protect_project_commercial_origin();

revoke all on function public.build_accepted_commercial_quote_snapshot(uuid) from public,anon;
grant execute on function public.build_accepted_commercial_quote_snapshot(uuid) to authenticated;
revoke all on function public.accept_commercial_quote_for_reservation(uuid) from public,anon;
grant execute on function public.accept_commercial_quote_for_reservation(uuid) to authenticated;
revoke all on function public.prepare_commercial_quote_conversion(uuid) from public,anon;
grant execute on function public.prepare_commercial_quote_conversion(uuid) to authenticated;
revoke all on function public.finalize_commercial_quote_conversion(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.finalize_commercial_quote_conversion(uuid,uuid,uuid,jsonb) to authenticated;
revoke all on function public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_customer_purchase_order(uuid,uuid,text,text,text,text,text,text) to authenticated;

comment on table public.project_commercial_origins is
'Immutable commercial origin for one accepted quotation converted through the canonical Reservation Pipeline.';
comment on column public.documents.purchase_order_number is
'Optional customer purchase-order number; the protected document remains canonical in Supabase Storage.';

commit;
