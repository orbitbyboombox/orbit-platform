create or replace function public.normalize_whatsapp_phone(p_value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
begin
  if digits like '00%' then digits := substr(digits, 3); end if;
  if digits like '056%' then digits := substr(digits, 2); end if;
  if length(digits) = 9 and digits like '9%' then digits := '56' || digits; end if;
  if length(digits) < 8 or length(digits) > 15 or digits like '0%' then return null; end if;
  return digits;
end;
$$;

revoke all on function public.normalize_whatsapp_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_whatsapp_phone(text) to service_role;

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
begin
  if normalized_phone is null then raise exception 'WHATSAPP_PHONE_REQUIRED'; end if;

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
grant execute on function public.resolve_whatsapp_customer(text,text) to service_role;
