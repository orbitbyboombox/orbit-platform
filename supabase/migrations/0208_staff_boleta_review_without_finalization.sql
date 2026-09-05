begin;

-- Founder review is allowed once the canonical monthly account is eligible;
-- month finalization is an accounting close step and must not gate boleta review.
create or replace function public.review_staff_monthly_boleta(p_account_id uuid,p_action text,p_reason text default null)
returns public.staff_monthly_accounts language plpgsql security definer set search_path=public as $$
declare item public.staff_monthly_accounts%rowtype; actor uuid:=auth.uid();
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede revisar boletas.';end if;
  if p_action not in('APPROVE','REJECT') then raise exception 'Acción inválida.';end if;
  if p_action='REJECT' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'Motivo de rechazo obligatorio.';end if;
  select * into item from public.staff_monthly_accounts where id=p_account_id for update;
  if not found or item.boleta_status<>'RECEIVED' then raise exception 'Boleta no disponible para revisión.';end if;
  if item.review_required then raise exception 'La liquidación requiere revisión Founder: %',item.review_reason;end if;
  update public.staff_monthly_accounts set
    boleta_status=case when p_action='APPROVE' then 'APPROVED' else 'REJECTED' end,
    boleta_rejection_reason=case when p_action='REJECT' then trim(p_reason) else null end,
    boleta_reviewed_at=now(),boleta_reviewed_by=actor,
    payment_status=case when p_action='APPROVE' and final_transfer_amount=0 then 'PAID' when p_action='APPROVE' then 'READY_TO_PAY' else 'PENDING' end,
    paid_amount=case when p_action='APPROVE' and final_transfer_amount=0 then 0 else paid_amount end,
    paid_at=case when p_action='APPROVE' and final_transfer_amount=0 then current_date else paid_at end,
    updated_at=now()
  where id=item.id returning * into item;
  insert into public.staff_monthly_settlement_audit(account_id,action,actor_id,reason,state)
  values(item.id,case when p_action='APPROVE' then 'BOLETA_APPROVED' else 'BOLETA_REJECTED' end,actor,nullif(trim(p_reason),''),to_jsonb(item));
  return item;
end $$;

revoke all on function public.review_staff_monthly_boleta(uuid,text,text) from public,anon;
grant execute on function public.review_staff_monthly_boleta(uuid,text,text) to authenticated,service_role;
select public.sync_staff_boleta_review_alerts();
commit;
