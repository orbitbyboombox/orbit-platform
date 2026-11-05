# ORBIT Finanzas v2.1.5 — mapa verificado de fuentes existentes (solo lectura, 05-11-2026)

## Evidencia
Inspección de metadatos de tablas y columnas en Supabase proyecto **orbit-platform** (public), sin ejecutar DML ni DDL. Las cifras son estimaciones reportadas por el catálogo de tablas, no conciliaciones de saldos. No se verificaron aún RPC, políticas de lectura por usuario, vistas, triggers ni implementación de UI; **no inferir comportamiento funcional a partir de nombres**.

| Área | Tabla existente | Filas aprox. | Columnas clave observadas | Riesgo de doble conteo |
|---|---|---:|---|---|
| Gastos generales | expenses | 25 | project_id, supply_id, category, subcategory, expense_scope, subtotal, vat, total, status, receipt_path, event_staff_settlement_id, vehicle_trip_id, idempotency_key | Puede reflejar gasto Staff, transporte o compra |
| Catálogo de insumos | supplies | 6 | revisar detalle pendiente | Catálogo no implica compra ni caja |
| Movimientos de inventario | inventory_movements | 0 | supply_id, movement_type, quantity, unit_cost, total_cost, project_id, media_lot_id, idempotency_key | No sumar consumo como nuevo pago |
| Recepción papel | paper_warehouse_receipts | 2 | supply_id, quantity, stock_before, stock_after, reference, unit_cost, idempotency_key | Recepción no implica desembolso |
| Compra equipo papel | paper_inventory_equipment_purchases | 1 | item_name, quantity, unit_cost_net, supplier, invoice_number, invoice_date | No asumir pagada |
| Gastos declarados Staff | staff_expense_submissions | 16 | staff_id, project_id, category, amount, payment_method, occurred_on | Solicitud no implica aprobación/pago |
| Reembolsos Staff | staff_reimbursement_payments | 16 | revisar detalle pendiente | Pago podría corresponder a expenses o submission |
| Pagos operativos Staff | event_staff_payments | 122 | project_id, staff_id, assignment_id, total_internal_payment, paid_amount, settlement_status, accounting_month | Costo devengado vs pago efectivo |
| Conceptos de pago Staff | event_staff_payment_items | 2 | settlement_id, assignment_id, concept_code, amount, paid_amount, status, idempotency_key | Conceptos componentes, no añadir al total si ya incluidos |
| Gastos recurrentes | finance_recurring_expense_rules | 8 | category, amount, frequency, next_due_date, bank_account_id, active | Regla/obligación no es salida de caja |
| Costos y utilidad por evento | financial_event_records | 132 | revenue, estimated_cost, real_cost, personnel_cost, operational_resources_cost, total_operational_cost, cost_breakdown | Proyección; no sumar encima de costos base |
| Snapshots de rentabilidad | event_profitability_statements | 3903 | revenue, estimated_costs, real_costs, profitability, source_signature, created_at | Versiones/snapshots, no sumar todas las filas |
| Vehículos | vehicle_fuel_logs | 2 | revisar detalle pendiente | Evitar duplicar con expenses |
| Caja de clientes | invoice_payments | 79 | ledger canónico de cobros (comentario de tabla) | No mezclar ingresos con reembolsos o gastos |

Otras fuentes existentes a inspeccionar: staff_payment_advances, staff_monthly_accounts, staff_monthly_closes, event_staff_settlement_movements, event_staff_settlement_adjustments, paper_warehouse_transfers, event_paper_snapshots, box_media_formats, box_media_lots, vehicle_trips, finance_bank_accounts, finance_recurring_expense_runs, office_lease_payments, cost_master_entries, financial_integrity_issues.

## Decisiones de diseño respaldadas por el esquema
1. **Reutilizar expenses** como candidato para registro de gastos: ya incluye categoría, subcategoría, comprobante, IVA, alcance y claves de origen. No crear una tabla expense paralela.
2. **No equiparar inventory_movements a pagos**; tiene 0 filas estimadas, mientras existen recepciones y compras de papel en otras tablas. Hace falta reconciliar inventario real.
3. **Staff:** usar referencias entre expenses, submissions, reembolsos, liquidaciones y conceptos. No sumar sus importes sin determinar si representan el mismo hecho económico.
4. **Rentabilidad:** financial_event_records es un resumen por evento; event_profitability_statements conserva múltiples snapshots. No sumar snapshots como gastos.
5. **Reglas recurrentes:** no contabilizar como pago hasta verificar ejecución real y fuente de movimiento.
6. **Compras:** hay al menos una tabla especializada en compras de equipamiento de papel; antes de crear un módulo general, revisar flujos de compras, su estado de pago y vínculo con expenses.

## Pendientes bloqueantes antes de código de integración
- Consultar metadatos de funciones/RPC, vistas, claves foráneas, índices únicos y triggers de estas fuentes.
- Leer implementaciones actuales de módulos Finanzas, Inventario, Staff y Compras en el repositorio.
- Obtener ejemplos **anonimizados y agregados** de registros para distinguir aprobado/pagado/pendiente sin divulgar datos personales.
- Diseñar matriz de mapeo origen → hecho económico → impacto caja → costo evento → inventario con prioridad de fuente y reglas de reversa.
- Añadir tests para gasto de papel comprado vs consumido, gastos de Staff repetidos, liquidaciones y adelantos, snapshots históricos, eventos gratuitos.
- Mantener Etapa 2 **NO-GO**: ninguna escritura SQL, migración, merge o despliegue autorizados por este documento.
