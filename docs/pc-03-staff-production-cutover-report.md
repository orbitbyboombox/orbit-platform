# PC-03 — Staff Production Cutover

Fecha de certificación: 5 de agosto de 2026
Estado: **CERTIFICADO**

## Alcance completado

- La ruta `/resources/staff` carga `Staff`, `Assignments` y disponibilidad desde Supabase mediante `SupabaseStaffRepository`.
- Los fixtures de Staff permanecen en el repositorio como material de referencia, pero ningún proveedor, ruta o barrel de producción los consume.
- La experiencia Premium existente fue preservada: componentes, jerarquía, tarjetas, búsqueda, espaciado y comportamiento responsive no fueron rediseñados.
- Las mutaciones se exponen mediante Server Actions y conservan la separación entre presentación, repositorio e infraestructura.
- Las asignaciones y los hitos operacionales escriben en el Timeline productivo mediante `SupabaseTimelineRepository`.

## Arquitectura de producción

```text
/resources/staff
  → StaffManagement (Premium UX congelada)
  → Staff Server Actions
  → StaffRepository
  → SupabaseStaffRepository
      → public.staff
      → public.assignments
      → SupabaseTimelineRepository
          → public.timeline_events
          → trigger de auditoría → public.audit_events
```

## Migración desplegada

`0003_staff_production_cutover.sql` fue aplicada al proyecto Supabase de producción.

La migración añade:

- Staff: `start_date`, `updated_by`, `deleted_by`, `approval_reason`.
- Assignments: `rejected_at`, `response_at`.
- Índices parciales para búsqueda activa de Staff, estado y asignaciones por colaborador.

## Validación real de persistencia

Se ejecutó un ciclo productivo contra Supabase con un registro QA temporal:

| Operación | Resultado |
| --- | --- |
| Crear Staff | Correcto |
| Actualizar Staff | Correcto |
| Rechazar una versión obsoleta | Correcto |
| Cambiar disponibilidad | Correcto |
| Asignar a evento | Correcto |
| Aceptar asignación | Correcto |
| Rechazar asignación | Correcto |
| Soft delete | Correcto; el registro dejó de aparecer en consultas activas |
| Restore | Correcto |
| Reload / persistencia | Correcto |
| Timeline | 12 eventos productivos persistidos |
| Mensaje humano y origen | Presentes en el 100% de los eventos QA |
| Auditoría | 21 registros inmutables generados durante el ciclo |

El registro QA fue archivado al finalizar las capturas mediante soft delete. Sus eventos de Timeline y auditoría se conservaron.

## Hitos operacionales preparados

- Llegada registrada.
- Montaje iniciado y finalizado.
- Evento iniciado y finalizado.
- Desmontaje iniciado y finalizado.
- Retorno a bodega.

Todos usan el Timeline productivo, con `orbit_event_id`, actor, origen, entidad, mensaje humano y `correlation_id`.

## QA visual

- Desktop: 1440 × 1000.
- Tablet: viewport configurado en 834 × 1112; área renderizada capturada en 834 × 1064.
- Mobile: 390 × 844.
- Búsqueda productiva validada por nombre.
- Disponibilidad, asignación y operación del día visibles desde el registro persistido.
- Sin errores de consola durante el QA autenticado.

## Validación técnica

- TypeScript (`tsc --noEmit`): aprobado.
- ESLint: aprobado sin advertencias.
- Next.js Production Build: aprobado; `/resources/staff` se genera como ruta dinámica.
- `git diff --check`: aprobado.
- Auditoría de consumidores mock: ningún import o proveedor mock permanece conectado a la ruta productiva de Staff.

Capturas:

- `docs/screenshots/pc-03-staff-cutover-desktop.png`
- `docs/screenshots/pc-03-staff-cutover-tablet.png`
- `docs/screenshots/pc-03-staff-cutover-mobile.png`

## Certificación

**GO para PC-04 — Profit Production Cutover.**

PC-03 queda limitado al alcance Staff. No se modificaron Profit, reglas de negocio ni la arquitectura congelada.
