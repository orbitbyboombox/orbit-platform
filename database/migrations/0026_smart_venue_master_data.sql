begin;

insert into public.master_data_entries(domain,code,label,display_order,configuration)
values (
  'SYSTEM_PARAMETERS',
  'EVENT_VENUES',
  'Event Venues',
  70,
  '{"venues":[{"name":"Santa Martina","municipality":"Lo Barnechea","province":"Santiago","surcharge":35000},{"name":"Club Valle Escondido","municipality":"Lo Barnechea","province":"Santiago","surcharge":35000},{"name":"Alto Noviciado","municipality":"Pudahuel","province":"Santiago","surcharge":35000},{"name":"Casona Cañaveral","municipality":"Colina","province":"Chacabuco","surcharge":35000}]}'::jsonb
)
on conflict(domain,code) do nothing;

commit;
