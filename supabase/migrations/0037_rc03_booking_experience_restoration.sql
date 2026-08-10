begin;

update public.master_data_entries
set enabled = false,
    approval_reason = 'RC-03: servicio obsoleto retirado de reservas',
    updated_at = now()
where domain = 'SERVICES'
  and code = 'VIDEO_LOUNGE';

update public.commercial_prices
set enabled = false,
    approval_reason = 'RC-03: servicio obsoleto retirado de reservas',
    updated_at = now()
where code = 'VIDEO_LOUNGE'
  and deleted_at is null;

update public.master_data_entries
set configuration = configuration || case code
  when 'CLASSIC' then '{"compatibleExtras":["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'POLAROID' then '{"compatibleExtras":["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'BLACK_STUDIO' then '{"compatibleExtras":["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'HASHTAG' then '{"compatibleExtras":["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'INSTABOX' then '{"compatibleExtras":["QR","UNLIMITED_MAGNETS","SCRAPBOOK","BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'BBOX360' then '{"compatibleExtras":["BRANDING","TRANSPORT","ADDITIONAL_HOURS"]}'::jsonb
  when 'BOOMBALL' then '{"compatibleExtras":["TRANSPORT"]}'::jsonb
  when 'LIGHTBOX' then '{"compatibleExtras":["TRANSPORT"]}'::jsonb
  else '{}'::jsonb
end,
    approval_reason = 'RC-03: compatibilidad comercial restaurada',
    updated_at = now()
where domain = 'SERVICES'
  and code in ('CLASSIC','POLAROID','BLACK_STUDIO','HASHTAG','INSTABOX','BBOX360','BOOMBALL','LIGHTBOX');

commit;
