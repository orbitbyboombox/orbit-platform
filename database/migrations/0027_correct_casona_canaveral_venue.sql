begin;

update public.master_data_entries
set configuration = jsonb_set(
  configuration,
  '{venues}',
  (
    select jsonb_agg(
      case
        when venue->>'name' = 'Casona Cañaveral'
          then venue || jsonb_build_object('municipality', 'Lo Barnechea', 'province', 'Santiago', 'surcharge', 35000)
        else venue
      end
    )
    from jsonb_array_elements(configuration->'venues') as venue
  ),
  true
)
where domain = 'SYSTEM_PARAMETERS'
  and code = 'EVENT_VENUES';

commit;
