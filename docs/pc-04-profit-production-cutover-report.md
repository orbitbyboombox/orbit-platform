# PC-04 — Profit Production Cutover Report

Fecha: 6 de agosto de 2026
Estado: **CERTIFICADO**

## Resultado

El módulo Finance consume exclusivamente `SupabaseProfitRepository`. La experiencia Premium permanece visualmente idéntica y no existe ningún import productivo de `mock-profitability.ts`.

```text
/finance
  → SupabaseProfitRepository
  → public.profit_snapshots
  → ProfitEngine + SupplyEngine (reglas congeladas)
  → ProfitabilityExperience (UX congelada)
```

## Persistencia productiva

La migración `0004_profit_production_cutover.sql` figura aplicada tanto local como remotamente en el proyecto Supabase enlazado.

`profit_snapshots` dispone de:

- costo adicional de gastos;
- versionado optimista;
- metadatos de actualización y aprobación;
- soft delete y restore;
- índice parcial para registros activos;
- auditoría inmutable por trigger.

## Prueba controlada

Snapshot de certificación: `309b903d-e868-4439-8220-e6d2557a8f1f`.

| Operación | Resultado |
| --- | --- |
| Create | versión 1 |
| Revenue update | versión 2 |
| Soft delete | versión 3 |
| Restore | versión 4 |
| Reload | versión 4, visible y persistente |
| Cleanup por soft delete | versión 5 |
| Audit events | 5 eventos inmutables |

El registro de certificación quedó finalmente archivado por soft delete; no contamina los indicadores activos.

## Validación financiera

Caso certificado:

- Revenue: `$1.100.000`
- Staff cost: `$100.000`
- Transportation cost: `$50.000`
- Fuel cost: `$10.000`
- Supply cost: `$20.000`
- Additional/expense cost: `$30.000`
- Operational cost: `$210.000`
- Gross margin: `$890.000`
- Margin: `80,909%`

La identidad validada fue:

```text
1.100.000 - (100.000 + 50.000 + 10.000 + 20.000 + 30.000)
= 890.000
```

El modelo aprobado no define deducciones contables o tributarias adicionales. Por ello no se introdujo una regla nueva de margen neto durante este cutover.

## Fuentes productivas verificadas

| Fuente | Registros activos |
| --- | ---: |
| Projects | 1 |
| Assignments | 1 |
| Timeline Events | 15 |
| Profit Snapshots | 3 |
| Expenses | 0 |
| Supplies | 0 |
| Staff | 0 |

Los costos históricos se leen desde cada snapshot inmutable. La ausencia de Supplies y Staff productivos no genera fallback a fixtures; corresponde al alcance del siguiente cutover.

## Auditoría

- Insert, update, soft delete, restore y cleanup produjeron eventos separados.
- `previous_state` y `new_state` permanecen en `audit_events`.
- `audit_events` no admite update ni delete para el rol autenticado.
- La razón de cada mutación quedó persistida.
- El snapshot mantuvo el vínculo permanente con su proyecto.

## QA visual

- Desktop: 1440 × 1000.
- Tablet: 834 × 1112.
- Mobile: 390 × 844.
- Consola: sin errores.
- Premium Finance UX: sin cambios.
- Los tres snapshots productivos existentes se cargaron después de reload.

## Validación técnica

- TypeScript: aprobado.
- ESLint: aprobado.
- Next.js Production Build: aprobado.
- `git diff --check`: aprobado.
- Migración local/remota: `0001` a `0004` sincronizadas.
- Consumo de fixtures Profit en producción: ninguno.

## Recomendación

**GO para PC-05 — Supply Production Cutover.**

PC-05 debe poblar y conectar Supplies productivos sin modificar los snapshots históricos ya certificados.
