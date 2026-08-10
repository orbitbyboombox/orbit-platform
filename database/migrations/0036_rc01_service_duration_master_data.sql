-- RC-01: correct official service durations in Master Data.
update public.master_data_entries
set configuration = configuration || case code
  when 'CLASSIC' then '{"minimumHours":2,"maximumHours":4}'::jsonb
  when 'POLAROID' then '{"minimumHours":2,"maximumHours":4}'::jsonb
  when 'BLACK_STUDIO' then '{"minimumHours":2,"maximumHours":4}'::jsonb
  when 'BBOX360' then '{"minimumHours":2,"maximumHours":4}'::jsonb
  when 'HASHTAG' then '{"minimumHours":2,"maximumHours":4}'::jsonb
  when 'BOOMBALL' then '{"minimumHours":2,"maximumHours":2}'::jsonb
  when 'LIGHTBOX' then '{"minimumHours":5,"maximumHours":5}'::jsonb
  else '{}'::jsonb
end,
approval_reason = 'RC-01: sincronización de duraciones oficiales',
updated_at = now()
where domain = 'SERVICES'
  and code in ('CLASSIC','POLAROID','BLACK_STUDIO','BBOX360','HASHTAG','BOOMBALL','LIGHTBOX');
