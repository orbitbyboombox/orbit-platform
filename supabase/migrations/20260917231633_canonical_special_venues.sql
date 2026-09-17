begin;

update public.master_data_entries
set configuration = jsonb_build_object(
  'venues', jsonb_build_array(
    jsonb_build_object(
      'code', 'CASONA_CANAVERAL',
      'name', 'Casona Cañaveral',
      'municipality', 'Lo Barnechea',
      'province', 'Santiago',
      'aliases', jsonb_build_array('Casona Cañaveral', 'casona canaveral', 'Cañaveral'),
      'surcharge', 50000,
      'enabled', true,
      'explanation', 'Este recinto tiene un cargo adicional de traslado de $50.000.',
      'notes', 'Override de traslado por recinto reconocido.'
    ),
    jsonb_build_object(
      'code', 'CLUB_HOUSE_VALLE_ESCONDIDO',
      'name', 'Club House Valle Escondido',
      'municipality', 'Lo Barnechea',
      'province', 'Santiago',
      'aliases', jsonb_build_array('Club House Valle Escondido', 'Club Valle Escondido', 'Valle Escondido'),
      'surcharge', 50000,
      'enabled', true,
      'explanation', 'Este recinto tiene un cargo adicional de traslado de $50.000.',
      'notes', 'Override de traslado por recinto reconocido.'
    ),
    jsonb_build_object(
      'code', 'HACIENDA_SANTA_MARTINA',
      'name', 'Hacienda Santa Martina',
      'municipality', 'Lo Barnechea',
      'province', 'Santiago',
      'aliases', jsonb_build_array('Hacienda Santa Martina', 'Santa Martina'),
      'surcharge', 50000,
      'enabled', true,
      'explanation', 'Este recinto tiene un cargo adicional de traslado de $50.000.',
      'notes', 'Override de traslado por recinto reconocido.'
    ),
    jsonb_build_object(
      'code', 'ALTO_NOVICIADO',
      'name', 'Alto Noviciado',
      'municipality', 'Pudahuel',
      'province', 'Santiago',
      'aliases', jsonb_build_array('Alto Noviciado', 'Alto noviciado'),
      'surcharge', 50000,
      'enabled', true,
      'explanation', 'Este recinto tiene un cargo adicional de traslado de $50.000.',
      'notes', 'Override de traslado por recinto reconocido.'
    )
  )
), version = version + 1, updated_at = now()
where domain = 'SYSTEM_PARAMETERS' and code = 'EVENT_VENUES';

commit;
