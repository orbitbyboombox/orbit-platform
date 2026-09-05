create or replace function public.resolve_whatsapp_customer(
  p_sender_wa_id text,
  p_profile_name text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text := regexp_replace(coalesce(p_sender_wa_id, ''), '[^0-9]', '', 'g');
  resolved_id uuid;
  display_name text := coalesce(nullif(trim(p_profile_name), ''), 'Cliente WhatsApp');
begin
  if normalized_phone = '' then
    raise exception 'WHATSAPP_PHONE_REQUIRED';
  end if;

  select c.id into resolved_id
  from public.customers c
  where c.deleted_at is null
    and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = normalized_phone
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

  insert into public.customers(full_name, phone, metadata)
  values(
    display_name,
    '+' || normalized_phone,
    jsonb_build_object(
      'leadSource', 'WHATSAPP',
      'whatsappWaId', normalized_phone,
      'whatsappFirstSeenAt', now(),
      'whatsappLastSeenAt', now()
    )
  )
  returning id into resolved_id;

  return resolved_id;
end;
$$;

revoke all on function public.resolve_whatsapp_customer(text,text) from public, anon, authenticated;
