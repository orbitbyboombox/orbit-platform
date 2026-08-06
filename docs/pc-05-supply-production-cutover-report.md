# PC-05 — Supply Production Cutover Report

## Resultado

GO. El módulo de Insumos dejó de consumir `INITIAL_SUPPLY_CATALOG` en la ruta productiva de Finanzas. La experiencia visual aprobada se conserva y ahora recibe el catálogo desde `SupabaseSupplyRepository`.

## Persistencia productiva

- Migración aplicada: `0005_supply_production_cutover.sql`.
- Tabla maestra: `public.supplies`.
- Trazabilidad: `public.inventory_movements`.
- Tipos soportados: compra, consumo, ajuste, pérdida y reemplazo.
- Asociación disponible: ORBIT Event ID, cliente, proyecto, staff y vehículo.
- Stock derivado automáticamente desde movimientos vigentes.
- Versionado optimista activo mediante `version` y `touch_versioned_row()`.
- Borrado lógico y restauración certificados.
- Campos v1.1 preparados sin exposición en UI: stock mínimo, compra recomendada y estado de stock.

## Integración

- `SupabaseSupplyRepository.findAll()` reemplaza el catálogo en memoria en `/finance`.
- `registerMovement()` centraliza compras, consumos, ajustes, pérdidas y reemplazos.
- Cada movimiento conserva costo unitario y costo total, disponibles para el Motor de Rentabilidad sin duplicar fórmulas.
- Cada movimiento asociado a un proyecto genera una proyección append-only en Timeline.
- Cada mutación de `supplies` e `inventory_movements` genera un evento inmutable en `audit_events`.
- Las fixtures se mantienen para pruebas aisladas, pero ninguna ruta productiva las consume.

## Certificación remota

Registro técnico: `pc05-1786015507162` (archivado tras la prueba).

| Validación | Resultado |
| --- | --- |
| Alta de insumo | OK |
| Actualización | OK — versión 1 → 2 |
| Compra | OK |
| Consumo | OK |
| Ajuste | OK |
| Stock resultante | OK — 8 unidades |
| Estado de stock | OK — NORMAL |
| Borrado lógico | OK |
| Restauración | OK |
| Recarga/persistencia | OK |
| Auditoría | OK — 10 eventos durante el ciclo certificado |
| Proyección Timeline | OK |

## Seguridad

- RLS habilitado en `inventory_movements`.
- Lectura restringida a usuarios internos.
- Mutaciones restringidas a roles administradores según los contratos de seguridad existentes.
- No se modificó autenticación, autorización ni ninguna política previamente certificada.

## Validación técnica

- TypeScript: PASS.
- ESLint: PASS.
- Next.js production build: PASS.
- `git diff --check`: PASS.
- Consola del navegador: sin errores.

## Validación visual

- Desktop: 1440 × 1000.
- Tablet: 834 × 1112.
- Mobile: 390 × 844.
- La misma pantalla Premium, tarjetas, tipografía, jerarquía y comportamiento responsive permanecen sin rediseño.

## Recomendación

GO para Google Live Production Cutover (PC-06). El alcance certificado se limita a PC-05; no se inició PC-06.
