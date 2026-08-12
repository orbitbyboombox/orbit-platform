begin;

alter table public.event_staff_payments
  add column if not exists settlement_status text not null default 'PENDING',
  add column if not exists paid_amount numeric(14,2) not null default 0,
  add column if not exists paid_at date,
  add column if not exists sii_receipt_status text not null default 'PENDING',
  add column if not exists sii_receipt_received_at timestamptz;

alter table public.event_staff_payments drop constraint if exists event_staff_payments_settlement_status_check;
alter table public.event_staff_payments add constraint event_staff_payments_settlement_status_check
  check (settlement_status in ('PENDING','ADVANCE','PAID'));
alter table public.event_staff_payments drop constraint if exists event_staff_payments_paid_amount_check;
alter table public.event_staff_payments add constraint event_staff_payments_paid_amount_check
  check (paid_amount >= 0 and paid_amount <= total_internal_payment);
alter table public.event_staff_payments drop constraint if exists event_staff_payments_sii_receipt_status_check;
alter table public.event_staff_payments add constraint event_staff_payments_sii_receipt_status_check
  check (sii_receipt_status in ('PENDING','RECEIVED'));

create or replace function public.update_staff_event_settlement(
  p_payment_id uuid,
  p_status text,
  p_paid_amount numeric,
  p_paid_at date,
  p_receipt_status text
) returns void language plpgsql security invoker set search_path=public as $$
declare payment public.event_staff_payments%rowtype;
begin
  if not public.can_administer() then raise exception 'Solo Administración puede gestionar pagos de Staff.'; end if;
  select * into payment from public.event_staff_payments where id=p_payment_id and deleted_at is null;
  if payment.id is null then raise exception 'Pago operacional no encontrado.'; end if;
  if p_status not in ('PENDING','ADVANCE','PAID') then raise exception 'Estado de pago inválido.'; end if;
  if p_receipt_status not in ('PENDING','RECEIVED') then raise exception 'Estado de boleta inválido.'; end if;
  if p_paid_amount < 0 or p_paid_amount > payment.total_internal_payment then raise exception 'El monto pagado es inválido.'; end if;
  update public.event_staff_payments set
    settlement_status=p_status,
    paid_amount=case when p_status='PENDING' then 0 when p_status='PAID' then total_internal_payment else p_paid_amount end,
    paid_at=case when p_status='PENDING' then null else coalesce(p_paid_at,current_date) end,
    sii_receipt_status=p_receipt_status,
    sii_receipt_received_at=case when p_receipt_status='RECEIVED' then coalesce(sii_receipt_received_at,now()) else null end,
    updated_by=auth.uid()
  where id=p_payment_id;
end $$;

grant execute on function public.update_staff_event_settlement(uuid,text,numeric,date,text) to authenticated;
create or replace function public.assign_staff_responsibilities(p_staff_id uuid,p_project_id uuid,p_responsibilities text[],p_vehicle text,p_reason text) returns uuid[] language plpgsql security invoker set search_path=public as $$
declare responsibility text;ids uuid[]:='{}';created_ids uuid[];
begin
  if not public.can_administer() then raise exception 'Solo Administración puede asignar Staff.';end if;
  if p_staff_id is null or p_project_id is null or coalesce(array_length(p_responsibilities,1),0)=0 then raise exception 'Selecciona Staff, Evento y responsabilidades.';end if;
  if exists(select 1 from unnest(p_responsibilities)value where value not in('OPERATOR','ASSEMBLY','DISASSEMBLY'))then raise exception 'Responsabilidad operacional inválida.';end if;
  foreach responsibility in array p_responsibilities loop
    created_ids:=public.assign_staff_group(array[p_staff_id],p_project_id,responsibility,p_vehicle,p_reason);ids:=ids||created_ids;
  end loop;return ids;
end $$;
grant execute on function public.assign_staff_responsibilities(uuid,uuid,text[],text,text) to authenticated;
comment on column public.event_staff_payments.total_internal_payment is 'RC-30: pago neto pactado con el colaborador; el costo empresa se calcula gross-up con retención SII vigente.';

commit;
