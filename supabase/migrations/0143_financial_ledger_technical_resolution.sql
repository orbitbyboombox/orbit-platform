begin;

-- 0143 Financial Ledger Technical Resolution Integrity (non-intrusive)
-- Goal:
-- * keep economic invariants untouched.
-- * let technical audit metadata classify known historical inconsistencies as technical-only.
-- * only adjust read-model behavior and provide a targeted, explicit repair helper.

create or replace function public.is_return_pending_technically_resolved(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_reference text
) returns boolean
language sql
stable
set search_path=public as $$
  select exists(
    select 1
    from public.receivable_movements rm
    where rm.invoice_id = p_invoice_id
      and rm.movement_type = 'RETURN_PENDING'
      and upper(rm.metadata -> 'technicalResolution' ->> 'status') = 'RESOLVED_TECHNICAL'
      and coalesce((rm.metadata -> 'technicalResolution' ->> 'appliesCashImpact')::boolean, false) = false
      and (
        (p_reference is not null and p_reference ~* '^[0-9a-fA-F-]{36}$' and rm.id = p_reference::uuid)
        or (p_payment_id is not null and (rm.metadata -> 'technicalResolution' ->> 'sourcePaymentId') = p_payment_id::text)
        or (rm.metadata -> 'technicalResolution' ->> 'sourceMovementId') = p_reference
      )
  );
$$;

create or replace function public.is_invoice_payment_technical_audit_exempt(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_reference text
) returns boolean
language sql
stable
set search_path=public as $$
  select
    (p_reference ~* '^[0-9a-fA-F-]{36}$' and exists (
      select 1
      from public.receivable_movements rm
      where rm.id = p_reference::uuid
        and rm.invoice_id = p_invoice_id
        and upper(rm.metadata ->> 'managedAction') = 'DELETE'
    ))
    or exists (
      select 1
      from public.receivable_movements rm
      where rm.invoice_id = p_invoice_id
        and upper(rm.metadata -> 'technicalResolution' ->> 'status') in ('RESOLVED_TECHNICAL','SOFT_DELETE_ACK')
        and (
          (rm.metadata -> 'technicalResolution' ->> 'sourcePaymentId') = p_payment_id::text
          or (p_reference ~* '^[0-9a-fA-F-]{36}$' and rm.id = p_reference::uuid)
        )
    )
    or (
      exists (
        select 1
        from public.receivable_movements rm
        where rm.invoice_id = p_invoice_id
          and rm.movement_type = 'RETURN_PENDING'
          and upper(rm.metadata -> 'technicalResolution' ->> 'status') = 'RESOLVED_TECHNICAL'
          and coalesce((rm.metadata -> 'technicalResolution' ->> 'appliesCashImpact')::boolean, false) = false
      )
    );
$$;

create or replace function public.preview_financial_ledger_integrity(p_invoice_id uuid default null)
returns table(
  invoice_id uuid,
  project_id uuid,
  status text,
  payment_ledger numeric,
  movement_ledger numeric,
  paid_amount numeric,
  payment_minus_paid numeric,
  movement_minus_payment numeric,
  has_return_pending_active boolean,
  active_return_pending_total numeric,
  deleted_payments_without_audit_link integer,
  requires_repair boolean,
  repair_hint text
) language sql stable
set search_path=public as $$
  with base as (
    select
      i.id,
      i.project_id,
      i.status,
      i.paid_amount as current_paid,
      public.recalculate_invoice_paid_amount(i.id) as canonical_payment_ledger,
      public.recalculate_receivable_movement_amount(i.id) as canonical_movement_ledger
    from public.invoices i
    where i.record_origin = 'PRODUCTION'
      and i.deleted_at is null
      and i.financial_record_state = 'ACTIVE'
      and (p_invoice_id is null or i.id = p_invoice_id)
  ),
  deleted_without_link as (
    select
      b.id as invoice_id,
      count(*) as deleted_without_audit_link
    from base b
    join public.invoice_payments ip
      on ip.invoice_id = b.id
     and ip.deleted_at is not null
    where not public.is_invoice_payment_technical_audit_exempt(b.id, ip.id, coalesce(ip.reference, ''))
    group by b.id
  ),
  return_pending_active as (
    select
      i.id as invoice_id,
      coalesce(sum(
        case
          when public.is_return_pending_technically_resolved(i.id, ip.id, ip.reference) then 0
          else ip.amount
        end
      ), 0) as return_pending_total
    from public.invoices i
    left join public.invoice_payments ip
      on ip.invoice_id = i.id
     and ip.deleted_at is null
     and ip.movement_type = 'RETURN_PENDING'
    group by i.id
  )
  select
    b.id,
    b.project_id,
    b.status,
    b.canonical_payment_ledger,
    b.canonical_movement_ledger,
    b.current_paid,
    (b.canonical_payment_ledger - b.current_paid) as payment_minus_paid,
    (b.canonical_movement_ledger - b.canonical_payment_ledger) as movement_minus_payment,
    coalesce(r.return_pending_total, 0) <> 0,
    coalesce(r.return_pending_total, 0),
    coalesce(d.deleted_without_audit_link, 0)::integer,
    (coalesce(r.return_pending_total, 0) <> 0)
      or (b.canonical_payment_ledger <> b.current_paid)
      or (b.canonical_movement_ledger <> b.canonical_payment_ledger),
    case
      when b.canonical_payment_ledger = b.current_paid and coalesce(r.return_pending_total, 0) = 0 then 'NO_ACTION'
      when b.canonical_payment_ledger = b.current_paid and coalesce(r.return_pending_total, 0) <> 0 then 'MARK_RETURN_PENDING_AS_TECHNICAL_ONLY'
      when b.canonical_movement_ledger <> b.canonical_payment_ledger then 'ALIGN_MOVEMENT_LAYER'
      when b.canonical_payment_ledger <> b.current_paid then 'SET_INVOICE_PAID_AMOUNT_FROM_CANONICAL_LEDGER'
      else 'REVIEW_MOVEMENT_LAYER'
    end
  from base b
  left join deleted_without_link d on d.invoice_id = b.id
  left join return_pending_active r on r.invoice_id = b.id;
$$;

create or replace function public.preview_invoice_repair_plan(
  p_invoice_ids uuid[] default null
) returns table(
  invoice_id uuid,
  project_id uuid,
  invoice_status text,
  current_paid_amount numeric,
  canonical_paid_amount numeric,
  current_outstanding numeric,
  canonical_outstanding numeric,
  paid_amount_delta numeric,
  por_cobrar_delta numeric,
  cobrado_delta numeric,
  action text,
  notes text
) language sql stable
set search_path=public as $$
  select
    i.id,
    i.project_id,
    i.status,
    i.paid_amount::numeric as current_paid_amount,
    public.recalculate_invoice_paid_amount(i.id) as canonical_paid_amount,
    (i.amount - i.paid_amount)::numeric as current_outstanding,
    (i.amount - public.recalculate_invoice_paid_amount(i.id))::numeric as canonical_outstanding,
    (public.recalculate_invoice_paid_amount(i.id) - i.paid_amount) as paid_amount_delta,
    ((i.amount - public.recalculate_invoice_paid_amount(i.id)) - (i.amount - i.paid_amount)) as por_cobrar_delta,
    ((public.recalculate_invoice_paid_amount(i.id) - i.paid_amount) * -1) as cobrado_delta,
    case
      when public.recalculate_invoice_paid_amount(i.id) <> i.paid_amount then 'SET_INVOICE.paid_amount'
      else 'NO_OPERATION'
    end as action,
    case
      when public.recalculate_invoice_paid_amount(i.id) = i.paid_amount then
        'No hay impacto económico; mantener evidencia técnica existente.'
      else
        'Recalcular paid_amount desde invoice_payments activo/canónico y re-ejecutar sincronización de proyección.'
    end as notes
  from public.invoices i
  where i.record_origin = 'PRODUCTION'
    and i.deleted_at is null
    and i.financial_record_state = 'ACTIVE'
    and (p_invoice_ids is null or i.id = ANY(p_invoice_ids))
    and (
      public.recalculate_invoice_paid_amount(i.id) <> i.paid_amount
      or public.recalculate_receivable_movement_amount(i.id) <> public.recalculate_invoice_paid_amount(i.id)
      or coalesce( (
        select sum(ip.amount)
        from public.invoice_payments ip
        where ip.invoice_id = i.id
          and ip.deleted_at is null
          and ip.movement_type = 'RETURN_PENDING'
          and not public.is_return_pending_technically_resolved(i.id, ip.id, ip.reference)
      ), 0) <> 0
    );
$$;

create or replace function public.financial_ledger_integrity_summary()
returns table(
  total_active_invoices bigint,
  payment_paid_mismatches bigint,
  movement_payment_mismatches bigint,
  active_return_pending_invoices bigint,
  deleted_payment_audit_mismatches bigint,
  all_clean boolean
) language sql stable
set search_path=public as $$
  with facts as (
    select
      count(*) as total_active_invoices,
      count(*) filter (where payment_ledger <> paid_amount) as payment_paid_mismatches,
      count(*) filter (where movement_ledger <> payment_ledger) as movement_payment_mismatches,
      count(*) filter (where has_return_pending_active) as active_return_pending_invoices,
      count(*) filter (where deleted_payments_without_audit_link > 0) as deleted_payment_audit_mismatches
    from public.preview_financial_ledger_integrity()
  )
  select
    total_active_invoices,
    payment_paid_mismatches,
    movement_payment_mismatches,
    active_return_pending_invoices,
    deleted_payment_audit_mismatches,
    payment_paid_mismatches = 0
      and movement_payment_mismatches = 0
      and active_return_pending_invoices = 0
      and deleted_payment_audit_mismatches = 0
  from facts;
$$;

create or replace function public.mark_return_pending_technical_resolution(
  p_movement_id uuid,
  p_actor_id uuid,
  p_resolution_reason text,
  p_source_payment_id uuid,
  p_applies_cash_impact boolean default false
) returns void
language plpgsql
security definer
set search_path=public as $$
begin
  update public.receivable_movements
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'technicalResolution', jsonb_build_object(
      'status', 'RESOLVED_TECHNICAL',
      'appliesCashImpact', p_applies_cash_impact,
      'resolutionReason', coalesce(nullif(trim(p_resolution_reason), ''), 'Error de tipeo'),
      'resolvedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'resolvedBy', p_actor_id::text,
      'sourcePaymentId', p_source_payment_id::text,
      'sourceMovementId', p_movement_id::text
    )
  )
  where id = p_movement_id
    and movement_type = 'RETURN_PENDING'
    and coalesce(upper(metadata -> 'technicalResolution' ->> 'status'), '') <> 'RESOLVED_TECHNICAL';

  if found then
    if p_source_payment_id is not null then
      update public.invoice_payments
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'technicalResolution', jsonb_build_object(
          'status', 'RESOLVED_TECHNICAL',
          'appliesCashImpact', p_applies_cash_impact,
          'resolutionReason', coalesce(nullif(trim(p_resolution_reason), ''), 'Error de tipeo'),
          'resolvedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'resolvedBy', p_actor_id::text,
          'sourceMovementId', p_movement_id::text
        )
      )
      where id = p_source_payment_id
        and coalesce(upper(metadata -> 'technicalResolution' ->> 'status'), '') <> 'RESOLVED_TECHNICAL';
    end if;
  end if;
end $$;

create or replace function public.mark_payment_soft_delete_technical_ack(
  p_movement_id uuid,
  p_actor_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path=public as $$
begin
  update public.receivable_movements
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'technicalResolution', jsonb_build_object(
      'status', 'SOFT_DELETE_ACK',
      'impact', 'NON_MONETARY_AUDIT_MARKER',
      'resolutionReason', coalesce(nullif(trim(p_reason), ''), 'Error de tipeo'),
      'resolvedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'resolvedBy', p_actor_id::text
    )
  )
  where id = p_movement_id
    and coalesce(upper(metadata -> 'technicalResolution' ->> 'status'), '') <> 'SOFT_DELETE_ACK';

  if found then
    return;
  end if;
end $$;

revoke all on function public.preview_financial_ledger_integrity(uuid) from public,anon;
grant execute on function public.preview_financial_ledger_integrity(uuid) to authenticated;

revoke all on function public.preview_invoice_repair_plan(uuid[]) from public,anon;
grant execute on function public.preview_invoice_repair_plan(uuid[]) to authenticated;

revoke all on function public.financial_ledger_integrity_summary() from public,anon;
grant execute on function public.financial_ledger_integrity_summary() to authenticated;

revoke all on function public.is_return_pending_technically_resolved(uuid,uuid,text) from public,anon;
grant execute on function public.is_return_pending_technically_resolved(uuid,uuid,text) to authenticated;

revoke all on function public.is_invoice_payment_technical_audit_exempt(uuid,uuid,text) from public,anon;
grant execute on function public.is_invoice_payment_technical_audit_exempt(uuid,uuid,text) to authenticated;

revoke all on function public.mark_return_pending_technical_resolution(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.mark_return_pending_technical_resolution(uuid,uuid,text,uuid,boolean) to authenticated,service_role;

revoke all on function public.mark_payment_soft_delete_technical_ack(uuid,uuid,text) from public,anon;
grant execute on function public.mark_payment_soft_delete_technical_ack(uuid,uuid,text) to authenticated,service_role;

commit;
