# ORBIT Finanzas v2.1.5 — relaciones verificadas y matriz anti-duplicación (05-11-2026)

Inspección **solo lectura** de `information_schema` en Supabase proyecto orbit-platform. No se consultaron importes ni datos personales. Una consulta agregada adicional fue bloqueada por controles de seguridad y **no se ejecutó**. No se hicieron escrituras.

## Relaciones reales por clave foránea

- `expenses.event_staff_settlement_id → event_staff_payments.id`: gasto y liquidación pueden describir el mismo costo.
- `expenses.supply_id → supplies.id`: gasto de insumo y ficha de stock se relacionan, pero no significa que haya consumo.
- `expenses.vehicle_trip_id → vehicle_trips.id`: gasto de traslado puede estar asociado a viaje.
- `expenses.bank_account_id → finance_bank_accounts.id`: asociación bancaria no demuestra pago conciliado.
- `staff_expense_submissions.materialized_expense_id → expenses.id`: la solicitud aprobada puede materializarse en gasto; no sumar ambos.
- `staff_reimbursement_payments.expense_id → expenses.id` y `staff_reimbursement_payments.staff_expense_submission_id → staff_expense_submissions.id`: un reembolso puede tener ambas referencias; no contabilizarlo dos veces.
- `staff_reimbursement_payments.settlement_id → event_staff_payments.id`: reembolso vinculado a liquidación Staff.
- `event_staff_payment_items.settlement_id → event_staff_payments.id`: conceptos son detalle del total de liquidación, no costo adicional por defecto.
- `inventory_movements.supply_id → supplies.id`, `inventory_movements.media_lot_id → box_media_lots.id`: movimientos de stock, no evidencia de salida de caja.
- `paper_warehouse_receipts.supply_id → supplies.id`: recepción física, no evidencia de pago.
- `financial_event_records.project_id → projects.id`, `financial_event_records.invoice_id → invoices.id`: resumen financiero asociado al evento/factura, no transacción nueva.
- `finance_recurring_expense_rules.bank_account_id → finance_bank_accounts.id`: regla programada, no débito bancario.

## Matriz de hechos económicos

| Hecho | Fuente candidata | Impacto en caja | Impacto en costo | Regla de precedencia |
|---|---|---|---|---|
| Compra de insumo | `expenses` / compra especializada | Solo cuando pago real confirmado | Según criterio de costo reconocido | No sumar recepción de papel ni stock como segundo gasto |
| Recepción de papel | `paper_warehouse_receipts` | 0 | Aumento stock | No asumir pago |
| Consumo de papel | `inventory_movements` o snapshots de papel, **pendiente de verificar fuente canónica** | 0 | Costo directo evento | No duplicar compra como costo del mismo período si se capitaliza stock |
| Solicitud Staff | `staff_expense_submissions` | 0 hasta reembolso/pago | Según estado aprobado | Si `materialized_expense_id` existe, usar referencia al gasto, no sumar solicitud |
| Reembolso Staff | `staff_reimbursement_payments` | Según pago efectivo | No sumar costo otra vez si `expense_id` está reconocido | Claves `expense_id`, `staff_expense_submission_id`, `settlement_id` |
| Liquidación Staff | `event_staff_payments` | Según pagos realizados, no por total contratado | Costo de personal | `event_staff_payment_items` es desglose; evitar doble suma |
| Combustible | `vehicle_fuel_logs` / `expenses` | Solo pago confirmado | Transporte | No sumar ambas fuentes sin conciliación |
| Gasto recurrente | `finance_recurring_expense_rules` | 0 hasta pago | Obligación estimada | No tratar regla como pago |
| Rentabilidad histórica | `event_profitability_statements` | 0 | Proyección/snapshot | No sumar 3903 snapshots como gastos reales |

## Especificación de adaptador read-only

Cada entrada proyectada debe incluir: `source_table`, `source_id`, `economic_event_key` (estable), `project_id?`, `category`, `subcategory?`, `recognition_date?`, `payment_date?`, `recognized_amount?`, `cash_delta?`, `inventory_delta?`, `status`, `review_reasons[]`. No deduplicar por monto/fecha solamente. Los vínculos por FK tienen precedencia sobre heurísticas. Si dos fuentes reclaman el mismo pago sin una relación inequívoca, marcar `REVIEW_REQUIRED` y excluir de consolidación automática hasta conciliación **sin borrar movimientos originales**.

## Verificaciones restantes (NO-GO)
1. Inspeccionar funciones/RPC, vistas, triggers y políticas RLS antes de elegir consultas de la app.
2. Revisar el código fuente de Finanzas/Compras/Inventario/Staff y validar las consultas reales.
3. Aclarar semántica de estados y fechas de pago en `expenses`, `event_staff_payments`, `staff_reimbursement_payments` y combustible.
4. Verificar si las recepciones de papel se materializan en `expenses` o son solo inventario.
5. Construir pruebas con fixtures anonimizados; evitar cambios de SQL y de producción.

**Estado:** relaciones verificadas, diseño en progreso. Ninguna migración, deploy, merge ni escritura a datos de negocio.
