# Table Manifest

| Dominio | Tablas canónicas o críticas |
|---|---|
| CRM | `customers`, `crm_events`, `crm_reservations`, `projects`, `crm_profile_diagnostics` |
| Reserva | `reservation_transactions`, `reservation_lifecycle_events`, `reservation_execution_diagnostics` |
| Comercial | `quotations`, `quotation_items`, `agreements`, `documents` |
| Cliente financiero | `invoices`, `invoice_payments`, `customer_financial_profiles` |
| Proyección histórica | `receivable_movements`, `receivable_movement_revisions` (read-only operacional) |
| Financial Truth | `financial_event_records`, `estimated_cost_sheets`, `event_profitability_statements`, `financial_cost_overrides` |
| Cost Master | `cost_master_entries`, `cost_master_history` |
| Staff | `staff`, `assignments`, `staff_assignment_requests`, `staff_assignment_cancellations` |
| Settlement | `event_staff_payments`, `event_staff_settlement_adjustments`, `event_staff_settlement_movements` |
| Legacy Staff | `staff_payment_months`, `staff_payment_advances`, `staff_payment_documents` (compatibilidad, no cálculo) |
| Portales | `customer_portal_tokens`, `portal_access_sessions`, `portal_access_attempts`, `staff_event_publications`, `staff_event_checkins` |
| Finance | `finance_bank_accounts`, `finance_recurring_expense_rules`, `bank_reconciliation_imports`, `mercado_pago_transactions` |
| Operaciones | `expenses`, `event_checklists`, `event_operational_milestones`, vehículos y recursos |
| Workspace/System | `founder_workspace_preferences`, `orbit_modules`, `internal_notifications`, `system_health_checks`, `system_health_alerts` |
| Google | `google_workspace_connections`, carpetas/sincronizaciones relacionadas |
| Academy | `academy_articles`, versiones, checklist y progreso |

Las definiciones completas, claves y relaciones viven en las migraciones; este manifiesto no reemplaza el esquema.
