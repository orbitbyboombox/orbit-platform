begin;

create or replace function public.register_staff_grouped_advance_with_documents(
  p_staff_id uuid,
  p_project_id uuid,
  p_amount numeric,
  p_date date,
  p_method text,
  p_notes text,
  p_idempotency_key text,
  p_allocations jsonb,
  p_receipt_bucket text,
  p_receipt_path text,
  p_receipt_file_name text,
  p_receipt_mime_type text,
  p_boleta_bucket text default null,
  p_boleta_path text default null,
  p_boleta_file_name text default null,
  p_boleta_mime_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  project_row public.projects%rowtype;
  item jsonb;
  settlement public.event_staff_payments%rowtype;
  allocation_amount numeric(14,2);
  available numeric(14,2);
  allocation_total numeric(14,2) := 0;
  allocation_count integer := 0;
  existing_count integer := 0;
  receipt_id uuid;
  boleta_id uuid;
  movement_id uuid;
  account public.staff_monthly_accounts%rowtype;
  month_label text;
begin
  if actor is null or not public.can_administer() then
    raise exception 'Solo Founder o Administración puede registrar adelantos.';
  end if;
  if p_staff_id is null or p_project_id is null or coalesce(p_amount,0) <= 0
     or p_date is null or nullif(trim(p_method),'') is null
     or nullif(trim(p_idempotency_key),'') is null
     or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0
     or nullif(trim(p_receipt_path),'') is null then
    raise exception 'El adelanto agrupado está incompleto.';
  end if;

  select * into project_row from public.projects
  where id=p_project_id and deleted_at is null for update;
  if not found then raise exception 'Evento Staff no encontrado.'; end if;

  if exists (
    select 1 from public.event_staff_settlement_movements
    where legacy_source like 'staff-grouped-advance:'||p_idempotency_key||':%'
      and deleted_at is null
  ) then
    if not exists (
      select 1
      from jsonb_array_elements(p_allocations) requested
      where not exists (
        select 1
        from public.event_staff_settlement_movements movement
        where movement.legacy_source = 'staff-grouped-advance:'||p_idempotency_key||':'||(requested->>'settlementId')
          and movement.amount = (requested->>'amount')::numeric
          and movement.deleted_at is null
      )
    ) then
      select * into account from public.ensure_staff_monthly_account(p_staff_id,project_row.event_date);
      return jsonb_build_object('idempotent',true,'accountId',account.id);
    end if;
    raise exception 'El adelanto agrupado tiene una operación parcial previa.';
  end if;

  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_amount := coalesce((item->>'amount')::numeric,0);
    if nullif(item->>'settlementId','') is null or allocation_amount <= 0 then
      raise exception 'Cada concepto seleccionado debe tener liquidación y monto válido.';
    end if;
    select * into settlement from public.event_staff_payments
    where id=(item->>'settlementId')::uuid and staff_id=p_staff_id and project_id=p_project_id
      and status='CONFIRMED' and deleted_at is null for update;
    if not found then raise exception 'Concepto de honorario no disponible.'; end if;
    if exists(select 1 from public.staff_monthly_accounts where staff_id=p_staff_id
      and accounting_month=date_trunc('month',project_row.event_date)::date and settlement_status='FINALIZED') then
      raise exception 'La liquidación mensual está finalizada y no admite nuevos movimientos.';
    end if;
    select greatest(
      coalesce(public.staff_settlement_payroll_amount(settlement.id),0)
      - coalesce((select sum(case when movement_type='REVERSAL' then -amount else amount end)
                  from public.event_staff_settlement_movements
                  where settlement_id=settlement.id and deleted_at is null),0),0
    ) into available;
    if allocation_amount > available then
      raise exception 'El monto seleccionado excede el saldo disponible de honorarios.';
    end if;
    allocation_total := allocation_total + allocation_amount;
    allocation_count := allocation_count + 1;
  end loop;
  if allocation_total <> p_amount then
    raise exception 'El monto no coincide con la suma de los conceptos seleccionados.';
  end if;

  month_label := to_char(project_row.event_date,'YYYY-MM');
  insert into public.staff_onboarding_documents(
    invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,
    storage_bucket,storage_path,file_name,mime_type,created_by
  ) values (
    null,p_staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',month_label,'Comprobante de adelanto Staff','ACTIVE',
    p_receipt_bucket,p_receipt_path,p_receipt_file_name,p_receipt_mime_type,actor
  ) returning id into receipt_id;
  if nullif(trim(p_boleta_path),'') is not null then
    insert into public.staff_onboarding_documents(
      invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,
      storage_bucket,storage_path,file_name,mime_type,created_by
    ) values (
      null,p_staff_id,'BOLETA_HONORARIOS','BOLETAS',month_label,'Boleta de honorarios · adelanto','ACTIVE',
      p_boleta_bucket,p_boleta_path,p_boleta_file_name,p_boleta_mime_type,actor
    ) returning id into boleta_id;
  end if;

  for item in select value from jsonb_array_elements(p_allocations) loop
    insert into public.event_staff_settlement_movements(
      settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,
      created_by,updated_by,receipt_document_id,boleta_document_id
    ) values (
      (item->>'settlementId')::uuid,'ADVANCE',(item->>'amount')::numeric,p_date,nullif(trim(p_method),''),
      p_receipt_path,nullif(trim(p_notes),''),
      'staff-grouped-advance:'||p_idempotency_key||':'||(item->>'settlementId'),
      actor,actor,receipt_id,boleta_id
    ) returning id into movement_id;
  end loop;
  select * into account from public.ensure_staff_monthly_account(p_staff_id,project_row.event_date);
  insert into public.timeline_events(
    project_id,customer_id,event_type,title,description,new_state,reason,orbit_event_id,actor_label,source,
    action,entity_type,entity_id,human_message,correlation_id,created_by
  ) values (
    project_row.id,project_row.customer_id,'STAFF_ADVANCE_REGISTERED','Adelanto Staff agrupado',
    'Adelanto aplicado a conceptos separados del Evento.','ADVANCE',nullif(trim(p_notes),''),project_row.orbit_event_id,
    'Founder','Administrator','STAFF_ADVANCE_REGISTERED','StaffAdvance',movement_id,
    'Adelanto agrupado por Evento con distribución por concepto.',
    'STAFF-GROUPED-ADVANCE-'||p_idempotency_key,actor
  ) on conflict(correlation_id) do nothing;
  return jsonb_build_object('idempotent',false,'accountId',account.id,'allocationCount',allocation_count,'amount',p_amount);
end;
$$;

revoke all on function public.register_staff_grouped_advance_with_documents(uuid,uuid,numeric,date,text,text,text,jsonb,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_grouped_advance_with_documents(uuid,uuid,numeric,date,text,text,text,jsonb,text,text,text,text,text,text,text,text) to authenticated,service_role;

commit;
