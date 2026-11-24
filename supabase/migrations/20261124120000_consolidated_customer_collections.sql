begin;

create unique index if not exists communications_consolidated_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'COLLECTION_EMAIL_CONSOLIDATED' and request_key is not null;

create or replace function public.prepare_consolidated_collection(
  p_customer_id uuid,
  p_project_ids uuid[],
  p_request_key text,
  p_subject text,
  p_body text,
  p_recipient text,
  p_context_snapshot jsonb default '{}'::jsonb
) returns table(project_id uuid, communication_id uuid, status text)
language plpgsql security definer set search_path = public
as $$
declare v_project_id uuid; v_id uuid; v_status text;
begin
  if not public.can_administer() then raise exception 'Solo Founder o Administración puede preparar cobranzas.'; end if;
  if p_customer_id is null or coalesce(array_length(p_project_ids, 1), 0) = 0 or nullif(trim(p_request_key), '') is null then
    raise exception 'La cobranza consolidada requiere cliente, eventos y clave de idempotencia.';
  end if;
  if exists (select 1 from public.projects p where p.id = any(p_project_ids) and (p.customer_id <> p_customer_id or p.deleted_at is not null)) then
    raise exception 'La selección contiene un evento que no pertenece al cliente o está archivado.';
  end if;
  foreach v_project_id in array p_project_ids loop
    select c.id, c.status into v_id, v_status
      from public.communications c
      where c.project_id = v_project_id and c.communication_type = 'COLLECTION_EMAIL_CONSOLIDATED' and c.request_key = p_request_key
      order by c.created_at desc limit 1;
    if v_id is not null then
      if v_status = 'FAILED' then
        update public.communications
        set status = 'PENDING', subject = p_subject, body = p_body, to_recipient = p_recipient,
            context_snapshot = p_context_snapshot, failure_reason = null, occurred_at = now(),
            sent_at = null, external_message_id = null
        where id = v_id;
        v_status := 'CLAIMED';
      end if;
      project_id := v_project_id; communication_id := v_id; status := v_status; return next;
      continue;
    end if;
    insert into public.communications(customer_id, project_id, channel, direction, communication_type, thread_key, request_key, subject, body, status, occurred_at, created_by, context_snapshot, to_recipient)
    values (p_customer_id, v_project_id, 'GMAIL', 'OUTBOUND', 'COLLECTION_EMAIL_CONSOLIDATED', p_request_key, p_request_key, p_subject, p_body, 'PENDING', now(), auth.uid(), p_context_snapshot, p_recipient)
    returning id into v_id;
    project_id := v_project_id; communication_id := v_id; status := 'CLAIMED'; return next;
  end loop;
end;
$$;

revoke all on function public.prepare_consolidated_collection(uuid, uuid[], text, text, text, text, jsonb) from public, anon;
grant execute on function public.prepare_consolidated_collection(uuid, uuid[], text, text, text, text, jsonb) to authenticated;

commit;
