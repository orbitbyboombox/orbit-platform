# BIANCA Commercial Brain V2

## Arquitectura

BIANCA se organiza en seis capas: identidad/política, conocimiento comercial contextual, playbook de ventas, memoria de oportunidad, herramientas ORBIT y orquestación de respuesta.

El responder recibe solo el contexto relevante del turno. `GLOBAL AUTOMATION` permanece apagado; Founder QA es el único modo de prueba habilitable.

## Fuentes de verdad

- Servicios y formatos: `features/business-core/catalog/service.catalog.ts` y catálogo comercial activo.
- Precios: `commercial_prices` mediante el resolver server-side; BoomBall usa precio fijo cuando `rules.fixed=true`.
- Disponibilidad y recargos: Capacity Engine y resolver canónico de comuna/venue.
- Catálogos: `features/commercial-hub/catalogs.ts` y documentos ACTIVE.
- Memoria: identidad confirmada, oportunidad activa e historial separado.

## Memoria y leads

`DIRECT_WHATSAPP`, `WEB_FORM_LEAD` y `EXISTING_ORBIT_LEAD` son fuentes distintas. Un lead web reutiliza nombre, email, evento, fecha, comuna, lugar y mensaje; no vuelve a preguntarlos. Una fecha parcial como `21.11` solo habilita confirmar el año. Las oportunidades nuevas hacen soft reset y conservan identidad confirmada e historial.

## Playbook y handoff

El playbook está en `bianca-sales-playbook.ts` y el banco de estilos en `bianca-response-style-bank.ts`. HUMAN_REQUIRED exige intención explícita, reclamo, excepción, negociación o duda técnica compleja; preguntas sobre la identidad de BIANCA no son handoff.

## Herramientas

Las acciones deben ser explícitas: `CATALOG_LOOKUP`, `COMMERCIAL_LOOKUP`, disponibilidad, comuna/recargo, cotización, reserva, lookup de cliente y handoff. BIANCA no inventa precios, disponibilidad, descuentos ni envíos de email.

## Control de costo y QA

El conocimiento se inyecta por intención. Los tests deben cubrir 100+ escenarios red-team y conversaciones golden antes de abrir automatización global. Esta versión agrega cobertura estática de arquitectura y mantiene el gate de Founder QA.
