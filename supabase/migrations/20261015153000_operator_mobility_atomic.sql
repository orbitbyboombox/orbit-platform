begin;

-- Operator mobility is a distinct staff settlement adjustment.  It deliberately
-- does not reuse event_staff_payments.transport_bonus: that legacy column may
-- contain an older transport value and must never be overwritten by this rule.
create unique index if not exists event_staff_operator_mobility_one_per_settlement_idx
  on public.event_staff_settlement_adjustments(settlement_id)
  where reason = 'BONUS' and comment = 'Movilización operador';

drop policy if exists event_staff_settlement_adjustments_admin_update on public.event_staff_settlement_adjustments;
create policy event_staff_settlement_adjustments_admin_update
  on public.event_staff_settlement_adjustments for update
  using (public.can_administer())
  with check (public.can_administer());

drop policy if exists event_staff_settlement_adjustments_admin_delete on public.event_staff_settlement_adjustments;
create policy event_staff_settlement_adjustments_admin_delete
  on public.event_staff_settlement_adjustments for delete
  using (public.can_administer());

grant update, delete on public.event_staff_settlement_adjustments to authenticated;

create or replace function public.save_event_staff_assignment_with_mobility(
  p_payload jsonb,
  p_request_id uuid,
  p_assignment_id uuid default null,
  p_replace_id uuid default null,
  p_mobility_action text default 'CLEAR',
  p_mobility_amount numeric default 0
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved jsonb;
  payment public.event_staff_payments%rowtype;
  adjustment public.event_staff_settlement_adjustments%rowtype;
  payment_count integer;
  event_date date;
  event_commune text;
  normalized_commune text;
  assignment_role text := p_payload->>'assignment_type';
  v_staff_id uuid := nullif(p_payload->>'staff_id','')::uuid;
  v_project_id uuid := nullif(p_payload->>'project_id','')::uuid;
  requested numeric(14,2) := round(coalesce(p_mobility_amount,0),2);
begin
  if not public.can_administer() then
    raise exception 'Solo Administración puede asignar Staff.';
  end if;
  if p_mobility_action not in ('APPLY','CLEAR') then
    raise exception 'Decisión de movilización inválida.';
  end if;
  if requested < 0 or requested not in (0,12000,17000) then
    raise exception 'Monto de movilización inválido.';
  end if;
  if p_mobility_action = 'APPLY' and requested = 0 then
    raise exception 'La movilización aprobada requiere un monto válido.';
  end if;
  if p_mobility_action = 'CLEAR' and requested <> 0 then
    raise exception 'La movilización desactivada debe tener monto cero.';
  end if;
  if assignment_role <> 'OPERATOR' then
    raise exception 'La movilización solo corresponde al rol Operador.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_project_id::text||':'||v_staff_id::text||':operator-mobility',0));
  select projects.event_date, projects.city
    into event_date, event_commune
    from public.projects
   where projects.id = v_project_id and projects.deleted_at is null;
  if event_date is null then
    raise exception 'Evento no encontrado.';
  end if;
  if p_mobility_action = 'APPLY' then
    if event_date < date '2026-10-17' then
      raise exception 'La movilización solo aplica a eventos desde el 17-10-2026.';
    end if;
    if v_staff_id in (
      '07683338-3ff1-4235-9253-1efeeed4a7c1'::uuid,
      '353b9538-7d1c-4048-b71f-17854bde78ce'::uuid,
      'bd31d438-42fc-474a-87b6-a5f68f626fea'::uuid
    ) then
      raise exception 'La movilización está excluida para este colaborador.';
    end if;
    normalized_commune := lower(translate(trim(coalesce(event_commune,'')), 'áéíóúÁÉÍÓÚüÜ', 'aeiouAEIOUuU'));
    if (requested = 12000 and normalized_commune not in ('lampa','colina','batuco','pirque','san jose de maipo','san bernardo','buin','calera de tango','paine'))
       or (requested = 17000 and normalized_commune not in ('melipilla','curacavi','talagante','el monte','isla de maipo','penaflor','padre hurtado')) then
      raise exception 'La comuna no corresponde al monto de movilización solicitado.';
    end if;
  end if;

  -- The assignment RPC and the adjustment below share this transaction. Any
  -- later validation error rolls both changes back.
  saved := public.save_event_staff_assignment(p_payload,p_request_id,p_assignment_id,p_replace_id);

  select count(*) into payment_count
    from public.event_staff_payments
   where public.event_staff_payments.project_id = v_project_id
     and public.event_staff_payments.staff_id = v_staff_id
     and public.event_staff_payments.deleted_at is null
     and public.event_staff_payments.status <> 'CANCELLED';
  if payment_count <> 1 then
    raise exception 'La liquidación del operador no es única; movilización permanece bloqueada.';
  end if;
  select * into payment
    from public.event_staff_payments
   where public.event_staff_payments.project_id = v_project_id
     and public.event_staff_payments.staff_id = v_staff_id
     and public.event_staff_payments.deleted_at is null
     and public.event_staff_payments.status <> 'CANCELLED'
   for update;
  select * into adjustment
    from public.event_staff_settlement_adjustments
   where settlement_id = payment.id
     and reason = 'BONUS'
     and comment = 'Movilización operador'
   for update;

  if (payment.settlement_status in ('PAID','FINALIZED') or coalesce(payment.paid_amount,0) > 0)
     and coalesce(adjustment.amount,0) <> requested then
    raise exception 'La liquidación ya está pagada o cerrada; movilización permanece bloqueada.';
  end if;

  if p_mobility_action = 'APPLY' then
    if adjustment.id is null then
      insert into public.event_staff_settlement_adjustments
        (settlement_id,reason,amount,comment,created_by)
      values
        (payment.id,'BONUS',requested,'Movilización operador',auth.uid());
    elsif adjustment.amount is distinct from requested then
      update public.event_staff_settlement_adjustments
         set amount = requested, created_by = auth.uid()
       where id = adjustment.id;
    end if;
  elsif adjustment.id is not null then
    delete from public.event_staff_settlement_adjustments where id = adjustment.id;
  end if;
  return saved;
end;
$$;

revoke all on function public.save_event_staff_assignment_with_mobility(jsonb,uuid,uuid,uuid,text,numeric) from public, anon;
grant execute on function public.save_event_staff_assignment_with_mobility(jsonb,uuid,uuid,uuid,text,numeric) to authenticated;

commit;
