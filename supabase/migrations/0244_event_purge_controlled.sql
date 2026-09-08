begin;

-- Controlled Founder-only purge. Immutable audit/timeline and commercial
-- negotiation history remain as tombstones; operational rows are removed.
create or replace function public.purge_event_controlled(p_project_id uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); p public.projects%rowtype; has_paid boolean; has_legal boolean; already_deleted boolean;
begin
  if actor is null or not public.can_administer() then raise exception 'Solo Founder o Administración puede eliminar un Evento.'; end if;
  if upper(trim(coalesce(p_confirmation,'')))<>'ELIMINAR' then raise exception 'Escribe ELIMINAR para confirmar.'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Registra un motivo.'; end if;
  select * into p from public.projects where id=p_project_id for update;
  if not found then return jsonb_build_object('status','ALREADY_DELETED','projectId',p_project_id); end if;
  already_deleted:=p.deleted_at is not null or upper(coalesce(p.status,''))='DELETED';
  if already_deleted then return jsonb_build_object('status','ALREADY_DELETED','projectId',p.id); end if;
  select exists(select 1 from public.invoices i where i.project_id=p.id and i.deleted_at is null and coalesce(i.paid_amount,0)>0) into has_paid;
  if has_paid then raise exception 'El Evento tiene pagos reales y requiere reversa antes de eliminar.'; end if;
  select exists(
    select 1 from public.agreements a where a.project_id=p.id and (upper(coalesce(a.status,''))='SIGNED' or a.signed_at is not null)
    union all select 1 from public.documents d where d.project_id=p.id and d.deleted_at is null and d.external_tax_document_type is not null
  ) into has_legal;
  if has_legal then raise exception 'El Evento tiene un contrato firmado o DTE SII protegido.'; end if;

  -- Mutable operational and financial projections only. No customer deletion.
  delete from public.asset_assignments where project_id=p.id;
  delete from public.event_vehicle_assignments where project_id=p.id;
  delete from public.assignments where project_id=p.id;
  delete from public.project_operational_contracts where project_id=p.id;
  delete from public.event_operational_requirements where project_id=p.id;
  delete from public.project_services where project_id=p.id;
  delete from public.customer_portal_tokens where project_id=p.id;
  delete from public.documents where project_id=p.id and deleted_at is null;
  delete from public.financial_event_records where project_id=p.id;
  delete from public.invoices where project_id=p.id and coalesce(paid_amount,0)=0;
  delete from public.crm_reservations where project_id=p.id;

  -- Append-only tables prevent physical deletion. Keep minimal tombstones and
  -- mark the operational identity as deleted so all active projections exclude it.
  update public.crm_events set status='DELETED',updated_by=actor,updated_at=now() where project_id=p.id;
  update public.projects set status='DELETED',health='BLOCKED',deleted_at=now(),deleted_by=actor,approval_reason=trim(p_reason),updated_by=actor where id=p.id;
  update public.reservation_transactions set project_id=null,orbit_event_id=null,updated_at=now(),last_error=coalesce(last_error,'PURGED_EVENT_TOMBSTONE') where project_id=p.id;
  return jsonb_build_object('status','DELETED','projectId',p.id,'orbitEventId',p.orbit_event_id);
end;
$$;

revoke all on function public.purge_event_controlled(uuid,text,text) from public,anon;
grant execute on function public.purge_event_controlled(uuid,text,text) to authenticated;
commit;
