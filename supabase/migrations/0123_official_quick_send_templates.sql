begin;

with official(category, subject, body) as (
  values
    ('WEDDINGS'::text, 'Conoce las experiencias BOOMBOX para tu evento'::text, $template$Hola [Nombre],

¡Gracias por contactarnos y considerar a **BOOMBOX** para ser parte de tu evento! 🙌

Te compartimos nuestros **servicios, experiencias y valores**, para que puedas conocer las distintas alternativas y elegir la que mejor se adapte a tu celebración.

👉 **[VER PLANES Y VALORES BOOMBOX]**

Desde hace **16 años somos pioneros en cabinas de fotos en Chile**, creando experiencias para matrimonios, cumpleaños, graduaciones y eventos que buscan algo más que una simple fotografía.

Contamos con distintas alternativas que puedes elegir según el estilo de tu celebración, la cantidad de invitados y la experiencia que quieras crear.

Si ya tienes alguna opción en mente, simplemente responde este correo indicándonos **servicio, fecha y lugar del evento** y te ayudaremos a revisar disponibilidad y preparar tu cotización.

**Las fechas se confirman mediante reserva y están sujetas a disponibilidad.**

Un abrazo,$template$::text),
    ('BIRTHDAYS'::text, 'Conoce las experiencias BOOMBOX para tu evento'::text, $template$Hola [Nombre],

¡Gracias por contactarnos y considerar a **BOOMBOX** para ser parte de tu evento! 🙌

Te compartimos nuestros **servicios, experiencias y valores**, para que puedas conocer las distintas alternativas y elegir la que mejor se adapte a tu celebración.

👉 **[VER PLANES Y VALORES BOOMBOX]**

Desde hace **16 años somos pioneros en cabinas de fotos en Chile**, creando experiencias para matrimonios, cumpleaños, graduaciones y eventos que buscan algo más que una simple fotografía.

Contamos con distintas alternativas que puedes elegir según el estilo de tu celebración, la cantidad de invitados y la experiencia que quieras crear.

Si ya tienes alguna opción en mente, simplemente responde este correo indicándonos **servicio, fecha y lugar del evento** y te ayudaremos a revisar disponibilidad y preparar tu cotización.

**Las fechas se confirman mediante reserva y están sujetas a disponibilidad.**

Un abrazo,$template$::text),
    ('GRADUATIONS'::text, 'Conoce las experiencias BOOMBOX para tu evento'::text, $template$Hola [Nombre],

¡Gracias por contactarnos y considerar a **BOOMBOX** para ser parte de tu evento! 🙌

Te compartimos nuestros **servicios, experiencias y valores**, para que puedas conocer las distintas alternativas y elegir la que mejor se adapte a tu celebración.

👉 **[VER PLANES Y VALORES BOOMBOX]**

Desde hace **16 años somos pioneros en cabinas de fotos en Chile**, creando experiencias para matrimonios, cumpleaños, graduaciones y eventos que buscan algo más que una simple fotografía.

Contamos con distintas alternativas que puedes elegir según el estilo de tu celebración, la cantidad de invitados y la experiencia que quieras crear.

Si ya tienes alguna opción en mente, simplemente responde este correo indicándonos **servicio, fecha y lugar del evento** y te ayudaremos a revisar disponibilidad y preparar tu cotización.

**Las fechas se confirman mediante reserva y están sujetas a disponibilidad.**

Un abrazo,$template$::text)
)
update public.commercial_email_templates as template
set subject = case
      when template.subject is not distinct from template.default_subject
       and template.body is not distinct from template.default_body
      then official.subject else template.subject end,
    body = case
      when template.subject is not distinct from template.default_subject
       and template.body is not distinct from template.default_body
      then official.body else template.body end,
    default_subject = official.subject,
    default_body = official.body,
    updated_at = now()
from official
where template.category = official.category
  and template.active;

commit;
