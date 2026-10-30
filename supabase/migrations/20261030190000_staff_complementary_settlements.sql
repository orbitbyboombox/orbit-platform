-- Complementary staff settlements: independent of immutable monthly closures.
begin;
create table if not exists public.staff_complementary_settlements (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.staff(id),
 settlement_id uuid not null references public.event_staff_payments(id),
 original_month date not null,
 event_date date not null,
 net_amount numeric(12,2) not null check(net_amount>0),
 status text not null default 'PENDING' check(status in ('PENDING','PAID','CANCELLED')),
 reason text not null check(length(trim(reason))>0),
 boleta_document_id uuid,
 payment_receipt_document_id uuid,
 paid_amount numeric(12,2) not null default 0 check(paid_amount>=0),
 paid_at date,
 payment_method text,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint complementary_payment_integrity check (
 (status='PAID' and paid_amount=net_amount and paid_at is not null and payment_method is not null and payment_receipt_document_id is not null and boleta_document_id is not null)
 or (status<>'PAID' and paid_amount=0 and paid_at is null)
 )
);
create unique index if not exists staff_complementary_one_active_per_event
 on public.staff_complementary_settlements(settlement_id) where status<>'CANCELLED';
create index if not exists staff_complementary_by_staff
 on public.staff_complementary_settlements(staff_id,event_date desc);
alter table public.staff_complementary_settlements enable row level security;
revoke all on public.staff_complementary_settlements from anon,authenticated;
grant select on public.staff_complementary_settlements to authenticated;
create policy staff_complementary_admin_read on public.staff_complementary_settlements
 for select to authenticated using (public.can_administer());
create or replace function public.create_staff_complementary_settlement(
 p_settlement_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_event public.event_staff_payments%rowtype;
 v_account public.staff_monthly_accounts%rowtype;
 v_date date; v_net numeric; v_id uuid;
begin
 if auth.uid() is null or not public.can_administer() then raise exception 'Acceso denegado'; end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'Motivo obligatorio'; end if;
 select * into v_event from public.event_staff_payments
 where id=p_settlement_id and status='CONFIRMED' and deleted_at is null for update;
 if not found then raise exception 'Liquidación de evento no confirmada'; end if;
 select p.event_date into v_date from public.projects p
 where p.id=v_event.project_id and p.deleted_at is null;
 if v_date is null then raise exception 'Evento sin fecha'; end if;
 select * into v_account from public.staff_monthly_accounts
 where staff_id=v_event.staff_id and accounting_month=date_trunc('month',v_event.accounting_month)::date for update;
 if not found or v_account.settlement_status<>'FINALIZED' then raise exception 'El mes original no está cerrado'; end if;
 if jsonb_typeof(v_account.finalized_snapshot->'details')<>'array' then raise exception 'Falta snapshot verificable'; end if;
 if exists(select 1 from jsonb_array_elements(v_account.finalized_snapshot->'details') d
 where d->>'settlementId'=v_event.id::text) then
 raise exception 'Evento ya incluido en cierre original'; end if;
 if exists(select 1 from public.event_staff_settlement_movements m
 where m.settlement_id=v_event.id and m.deleted_at is null
 and m.movement_type in ('ADVANCE','PAYMENT')) then
 raise exception 'Evento con pagos previos requiere conciliación'; end if;
 select v_event.total_internal_payment+coalesce(sum(a.amount),0) into v_net
 from public.event_staff_settlement_adjustments a
 where a.settlement_id=v_event.id;
 if v_net is null or v_net<=0 then raise exception 'Monto inválido'; end if;
 insert into public.staff_complementary_settlements
 (staff_id,settlement_id,original_month,event_date,net_amount,reason,created_by)
 values(v_event.staff_id,v_event.id,date_trunc('month',v_event.accounting_month)::date,
 v_date,v_net,trim(p_reason),auth.uid()) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.create_staff_complementary_settlement(uuid,text) from public,anon;
grant execute on function public.create_staff_complementary_settlement(uuid,text) to authenticated;
commit;
