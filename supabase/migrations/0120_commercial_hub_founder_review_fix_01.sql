begin;

update public.commercial_email_templates
set
  subject = 'Cotización BOOMBOX [NumeroCotizacion] — [Empresa]',
  body = $body$Hola [Nombre],

Gracias por considerar a BOOMBOX para su evento.

Te enviamos adjunta la Cotización BOOMBOX [NumeroCotizacion], preparada según lo conversado.

Llevamos 16 años creando experiencias fotográficas para empresas, marcas y eventos en Chile, combinando fotografía, diseño y tecnología para que cada activación tenga algo que la gente realmente quiera recordar y compartir.

Si necesitan ajustar cantidades, formatos o cualquier detalle de la propuesta, podemos adaptarla directamente a las necesidades del evento.

Quedamos atentos.

Equipo BOOMBOX$body$,
  default_subject = 'Cotización BOOMBOX [NumeroCotizacion] — [Empresa]',
  default_body = $body$Hola [Nombre],

Gracias por considerar a BOOMBOX para su evento.

Te enviamos adjunta la Cotización BOOMBOX [NumeroCotizacion], preparada según lo conversado.

Llevamos 16 años creando experiencias fotográficas para empresas, marcas y eventos en Chile, combinando fotografía, diseño y tecnología para que cada activación tenga algo que la gente realmente quiera recordar y compartir.

Si necesitan ajustar cantidades, formatos o cualquier detalle de la propuesta, podemos adaptarla directamente a las necesidades del evento.

Quedamos atentos.

Equipo BOOMBOX$body$,
  updated_at = now()
where category = 'COMPANIES_QUOTE' and active;

update public.commercial_email_templates
set body = replace(replace(body, E'\\r\\n', E'\n'), E'\\n', E'\n'),
    default_body = replace(replace(default_body, E'\\r\\n', E'\n'), E'\\n', E'\n'),
    updated_at = now()
where body like '%\n%' or default_body like '%\n%';

commit;
