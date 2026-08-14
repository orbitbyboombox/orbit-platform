begin;

-- Central commercial identity and payment data used by every quote renderer.
update public.company_settings
set legal_name = 'PRODUCCIONES BOOMBOX COMPANY SpA',
    tax_id = '76.565.272-3',
    address = 'Puerta Oriente 361 · Puertas de Chicureo',
    city = 'Colina',
    phone = '+56 9 6304 0989',
    website = 'www.bbox.cl',
    pdf_configuration = jsonb_set(
      jsonb_set(
        coalesce(pdf_configuration, '{}'::jsonb),
        '{commercialBank}',
        '{"bankName":"BCI","accountType":"Cuenta Corriente","accountNumber":"52093409","email":"contabilidad@bbox.cl"}'::jsonb,
        true
      ),
      '{commercialReservationConditions}',
      '[
        "Para confirmar la reserva se requiere el abono indicado en esta cotización.",
        "El saldo pendiente deberá pagarse según las condiciones comerciales acordadas para el evento.",
        "La propuesta mantiene su vigencia hasta la fecha indicada en el encabezado.",
        "Los valores, cantidades y servicios detallados corresponden exclusivamente a esta cotización.",
        "Cualquier precio especial o descuento aplicado corresponde únicamente a esta propuesta y no modifica las tarifas generales de BOOMBOX."
      ]'::jsonb,
      true
    ),
    version = version + 1,
    updated_at = now()
where settings_key = 'PRIMARY';

-- Signature presentation is owned by the mail renderer, never duplicated in editable body text.
update public.commercial_email_templates
set body = regexp_replace(body, E'(\\n[[:space:]]*){1,2}Equipo BOOMBOX[[:space:]]*$', '', 'i'),
    default_body = regexp_replace(coalesce(default_body, body), E'(\\n[[:space:]]*){1,2}Equipo BOOMBOX[[:space:]]*$', '', 'i'),
    updated_at = now()
where active;

commit;
