# Operational blocks — Founder Review

## Alcance

Los bloques son una proyección operacional interna del mismo Evento. No crean
otra cotización, contrato, reserva, carpeta Drive ni evento de Google Calendar.
El evento comercial legado sin filas en `event_operational_blocks` conserva su
comportamiento actual.

## Modelo propuesto

`event_operational_blocks` pertenece a `projects` y guarda nombre, orden,
inicio/fin (`timestamptz` en `America/Santiago`), estado y notas. Las tablas de
requisitos físicos, requisitos de Staff, asignaciones de Staff y asignaciones de
activos reciben un `block_id` nullable: `NULL` significa evento completo/legacy.
La migration es aditiva, tiene RLS Founder/Admin, índices por proyecto/ventana y
auditoría `timeline_events`.

## Reglas certificadas en dominio

- Los bloques se validan con precisión de minuto y `end_at > start_at`.
- Entre bloques se muestran pausas; no se crea una pausa ficticia como bloque.
- El peak de recursos usa sweep-line ponderado: AM 7 + PM 7 sin solapamiento =
  7; con solapamiento = 14.
- La misma persona puede trabajar en bloques no solapados; un solapamiento es
  conflicto.
- Si falta una tarifa de Staff para la duración del bloque, el costo queda
  `REVIEW_REQUIRED`; nunca se inventa una tarifa.
- Reordenar, editar o eliminar un bloque deja evidencia en el timeline.

## Caso de referencia (no ejecutado)

Para 2026-820 / `ORB-2026-268105`, el plan Founder puede expresarse como AM
09:00–13:30 y PM 15:00–19:30, con pausa 13:30–15:00 y 7 unidades
`BLACK_STUDIO` por bloque. Este caso permanece sin cambios en Production hasta
la aprobación explícita de Founder.

## Estado de entrega

La migration y UI quedan preparadas para Founder Review. No se aplicó DDL a
Supabase Production, no se escribieron datos y no se desplegó Vercel. Antes de
habilitar el módulo se debe revisar RLS, aceptar la migration y certificar el
flujo con un evento QA aislado.
