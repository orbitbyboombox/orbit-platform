# ORBIT PC-02 — Timeline Production Cutover Report

## Resultado ejecutivo

El Timeline de ORBIT fue migrado a Supabase como historial operacional oficial. La experiencia visual Premium no fue rediseñada: Workspace y Communication Hub conservan los mismos componentes, espaciado y jerarquía, recibiendo ahora proyecciones productivas.

## Persistencia

- Migración aplicada: `0002_timeline_production_cutover.sql`.
- Proyecto: `uiwlcmbrowtmqwhnsnxz`.
- `timeline_events` conserva su PK UUID y orden determinista por `occurred_at DESC, id DESC`.
- Se incorporaron `orbit_event_id`, actor, source, action, entity, human message, correlation ID y claves de proyección.
- Se mantiene Realtime sobre `timeline_events`.
- Los fixtures se conservaron, pero ninguna ruta productiva de Timeline los consume.

## Contrato append-only

- Updates y deletes revocados para `anon` y `authenticated`.
- Trigger `timeline_events_immutable` bloquea update/delete incluso desde operaciones privilegiadas.
- La prueba productiva de update fue rechazada con `timeline_events is append-only`.

## Proyecciones

El repositorio productivo ofrece proyecciones tipadas para:

- Customer.
- Project.
- Staff.
- Communication.
- Agreement.
- Calendar Sync.

Customer CRM consume `human_message` como presentación oficial. El Workspace carga los cinco movimientos productivos más recientes. Communication Hub dejó de importar el proveedor mock y carga conversaciones y comunicaciones desde Supabase.

## Auditoría

Cada insert en Timeline dispara el trigger productivo de auditoría existente.

Validación controlada:

- 2 eventos insertados.
- 2 eventos recargados después de persistir.
- Orden cronológico verificado.
- Proyección Customer: 2 eventos.
- Proyección Project: 2 eventos.
- Consultas Staff, Communication, Agreement y Calendar: operativas.
- 2 audit events inmutables creados.
- Metadata previa/nueva, source, correlation ID y human message presentes en auditoría.

## Mensajes humanos

La UI consume exclusivamente `human_message`. Los nombres técnicos permanecen en `action/event_type` y no se presentan al usuario.

## Validación de calidad

- TypeScript: aprobado.
- ESLint completo: aprobado.
- Next.js production build: aprobado.
- `git diff --check`: aprobado.
- Migración dry-run: únicamente `0002`.
- Migración remota: aplicada correctamente.

## Riesgo pendiente

La sesión del navegador integrado expiró antes de la recaptura visual. La aplicación redirige correctamente a Login. Las capturas responsive finales requieren reautenticación del usuario y no justifican ningún bypass de Auth.

## Decisión

El cutover técnico es **GO**. La decisión final para Staff Production Cutover queda condicionada únicamente a completar la evidencia visual autenticada Desktop, Tablet y Mobile.
