-- WhatsApp inbound can arrive before a customer provides an email address.
-- Keep the existing NOT NULL CRM invariant with a deterministic, non-deliverable
-- placeholder that is explicitly marked as WhatsApp-originated in metadata.
create or replace function public.resolve_whatsapp_customer(
  p_sender_wa_id text,
  p_profile_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := public.normalize_whatsapp_phone(p_sender_wa_id);
  resolved_id uuid;
  display_name text := coalesce(nullif(trim(p_profile_name), ''), 'Cliente WhatsApp');
  fallback_email text;
begin
  if normalized_phone is null then raise exception 'WHATSAPP_PHONE_REQUIRED'; end if;
  fallback_email := 'whatsapp-' || normalized_phone || '@inbound.invalid';

  select c.id into resolved_id
  from public.customers c
  where c.deleted_at is null
    and public.normalize_whatsapp_phone(c.phone) = normalized_phone
  order by c.created_at asc
  limit 1;

  if resolved_id is not null then
    update public.customers
    set
      full_name = case
        when full_name is null or trim(full_name) = '' or full_name = 'Cliente WhatsApp'
          then display_name
        else full_name
      end,
      phone = case
        when phone is null or trim(phone) = '' then '+' || normalized_phone
        else phone
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'whatsappWaId', normalized_phone,
        'whatsappLastSeenAt', now()
      ),
      updated_at = now()
    where id = resolved_id;
    return resolved_id;
  end if;

  insert into public.customers(full_name, email, phone, metadata)
  values(
    display_name,
    fallback_email,
    '+' || normalized_phone,
    jsonb_build_object(
      'leadSource', 'WHATSAPP',
      'whatsappWaId', normalized_phone,
      'whatsappFirstSeenAt', now(),
      'whatsappLastSeenAt', now(),
      'emailPlaceholder', true
    )
  )
  returning id into resolved_id;

  return resolved_id;
end;
$$;

revoke all on function public.resolve_whatsapp_customer(text,text) from public, anon, authenticated;
grant execute on function public.resolve_whatsapp_customer(text,text) to service_role;
