begin;

-- Staff payroll supports either order: payment first or boleta review first.
-- The account must still be finalized and financially valid; only the boleta
-- status is intentionally decoupled from payment registration.
create or replace function public.register_staff_monthly_payment(
 p_account_id uuid,p_payment_date date,p_amount numeric,p_method text,p_reference text,p_idempotency_key text,
 p_bucket text,p_path text,p_file_name text,p_mime_type text)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; detail jsonb; receipt_id uuid; allocated numeric:=0; remaining numeric; obligation numeric; advance numeric; source_details jsonb; actor uuid:=auth.uid();
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede registrar pagos.';end if;
 select * into item from public.staff_monthly_accounts where id=p_account_id for update;
 if not found then raise exception 'Cuenta mensual no encontrada.';end if;
 if item.payment_status='PAID' then if item.payment_idempotency_key=p_idempotency_key then return item;end if; raise exception 'La cuenta mensual ya está pagada.';end if;
 if item.settlement_status<>'FINALIZED' then raise exception 'La liquidación debe estar finalizada antes de registrar el pago.';end if;
 if item.review_required or item.excess_advance>0 then raise exception 'La liquidación requiere revisión Founder.';end if;
 if coalesce(p_amount,0)<>item.final_transfer_amount or item.final_transfer_amount<=0 then raise exception 'El pago debe coincidir con el saldo final mensual.';end if;
 if p_bucket is null or p_path is null or p_file_name is null or p_mime_type is null then raise exception 'El comprobante de pago es obligatorio.';end if;
 insert into public.staff_onboarding_documents(invitation_id,staff_id,document_type,category,applicable_month,friendly_label,status,storage_bucket,storage_path,file_name,mime_type,created_by)
 values(null,item.staff_id,'STAFF_PAYMENT_RECEIPT','PAGOS',to_char(item.accounting_month,'YYYY-MM'),'Comprobante de pago Staff','ACTIVE',p_bucket,p_path,p_file_name,p_mime_type,actor) returning id into receipt_id;
 source_details:=coalesce(item.finalized_snapshot->'details',item.calculation->'details','[]'::jsonb);
 for detail in select value from jsonb_array_elements(source_details) loop
   obligation:=coalesce((detail->>'workNet')::numeric,0)+coalesce((detail->>'reimbursements')::numeric,0); advance:=greatest(coalesce((detail->>'advances')::numeric,0),0);
   remaining:=least(greatest(obligation-advance,0),p_amount-allocated);
   if remaining>0 then insert into public.event_staff_settlement_movements(settlement_id,movement_type,amount,movement_date,method,receipt_path,notes,legacy_source,created_by,updated_by)
    values((detail->>'settlementId')::uuid,'PAYMENT',remaining,coalesce(p_payment_date,current_date),nullif(trim(p_method),''),p_path,nullif(trim(p_reference),''),'staff-monthly:'||item.id||':'||(detail->>'settlementId'),actor,actor) on conflict(legacy_source) do nothing; allocated:=allocated+remaining; end if;
   exit when allocated>=p_amount;
 end loop;
 if allocated<>p_amount then raise exception 'La distribución del pago no coincide con el saldo mensual.';end if;
 update public.staff_monthly_accounts set payment_status='PAID',paid_amount=p_amount,paid_at=coalesce(p_payment_date,current_date),payment_method=nullif(trim(p_method),''),payment_reference=nullif(trim(p_reference),''),payment_receipt_document_id=receipt_id,payment_idempotency_key=p_idempotency_key,drive_sync_status='PENDING',updated_at=now() where id=item.id returning * into item;
 insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,state) values(item.id,'PAYMENT_RECORDED',actor,to_jsonb(item)); return item;
end $$;

revoke all on function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_staff_monthly_payment(uuid,date,numeric,text,text,text,text,text,text,text) to authenticated,service_role;

create or replace function public.review_staff_monthly_boleta(p_account_id uuid,p_action text,p_reason text default null)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; actor uuid:=auth.uid(); blockers jsonb;
begin
 if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede revisar boletas.';end if;
 if p_action not in('APPROVE','REJECT') then raise exception 'Acción inválida.';end if;
 if p_action='REJECT' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo de rechazo obligatorio.';end if;
 select * into item from public.staff_monthly_accounts where id=p_account_id for update;
 if not found or item.boleta_status<>'RECEIVED' then raise exception 'Boleta no disponible para revisión.';end if;
 blockers:=public.staff_monthly_blocking_events(item.staff_id,item.accounting_month);
 if jsonb_array_length(coalesce(blockers,'[]'::jsonb))>0 then raise exception 'La liquidación tiene Eventos operativamente pendientes.';end if;
 update public.staff_monthly_accounts set boleta_status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
   boleta_rejection_reason=case when p_action='REJECT' then trim(p_reason) else null end,boleta_reviewed_at=now(),boleta_reviewed_by=actor,
   review_required=false,review_reason=null,
   payment_status=case when p_action='APPROVE' and final_transfer_amount=0 then 'PAID' when p_action='APPROVE' and payment_status='PAID' then 'PAID' when p_action='APPROVE' then 'READY_TO_PAY' else 'PENDING' end,
   paid_amount=case when p_action='APPROVE' and final_transfer_amount=0 then 0 else paid_amount end,
   paid_at=case when p_action='APPROVE' and final_transfer_amount=0 then coalesce(paid_at,current_date) else paid_at end,updated_at=now()
 where id=item.id returning * into item;
 insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
 values(item.id,case when p_action='APPROVE' then 'BOLETA_APPROVED' else 'BOLETA_REJECTED' end,actor,nullif(trim(p_reason),''),to_jsonb(item));
 return item;
end $$;

revoke all on function public.review_staff_monthly_boleta(uuid,text,text) from public,anon;
grant execute on function public.review_staff_monthly_boleta(uuid,text,text) to authenticated,service_role;
commit;
