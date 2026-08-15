begin;

-- Canonical, Founder-editable operational conditions for commercial quotations.
-- Existing/future customizations are preserved because the seed runs only once.
update public.company_settings
set pdf_configuration = jsonb_set(
      coalesce(pdf_configuration, '{}'::jsonb),
      '{commercialOperationalConditions}',
      '[
        {"label":"Montaje y desmontaje","text":"BOOMBOX requiere acceso al recinto con anticipación suficiente para realizar el montaje, instalación y pruebas necesarias antes del inicio del servicio."},
        {"label":"Acceso","text":"El cliente, productor u organización responsable deberá facilitar el ingreso y retiro del equipamiento, incluyendo accesos habilitados, coordinación con seguridad y ascensores de carga cuando corresponda."},
        {"label":"Energía","text":"Se requiere acceso a un enchufe 220V directo, operativo y próximo al área donde será instalada la experiencia."},
        {"label":"Carga, descarga y estacionamiento","text":"El recinto deberá permitir condiciones razonables para la carga y descarga del equipamiento y acceso de los vehículos operacionales."},
        {"label":"Edificios / estacionamientos subterráneos","text":"El cliente deberá informar previamente restricciones de altura. Algunos vehículos operacionales BOOMBOX pueden requerir accesos de hasta 2,30 m de altura."},
        {"label":"Espacio de instalación","text":"El espacio definido para BOOMBOX deberá encontrarse disponible, despejado y accesible al momento del montaje."},
        {"label":"Cambios operacionales","text":"Los cambios de ubicación, horarios, accesos u otras condiciones relevantes deberán informarse previamente para permitir una correcta coordinación operacional."}
      ]'::jsonb,
      true
    ),
    approval_reason = 'Condiciones operacionales canónicas para cotizaciones',
    version = version + 1,
    updated_at = now()
where settings_key = 'PRIMARY'
  and not (coalesce(pdf_configuration, '{}'::jsonb) ? 'commercialOperationalConditions');

commit;
