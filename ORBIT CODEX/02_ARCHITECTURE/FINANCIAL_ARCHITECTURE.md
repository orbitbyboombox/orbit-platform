# Financial Architecture

El Payment Ledger canónico es `invoice_payments`; Accounts Receivable y Cash Flow lo proyectan sin reescribir movimientos. `receivable_movements` se conserva como auditoría histórica read-only. El Event Settlement canónico es `event_staff_payments`; Staff y Payroll son proyecciones por mes contable. `financial_event_records` y hojas de costos consolidan ingreso neto, costos operacionales, costo de personal, utilidad y margen.

IVA no es utilidad. La retención/tributación Staff es costo de empresa. Branding, transportes, personal y extras se originan en Cost Master o snapshots históricos del Event. Finance nunca edita Customers, Events o Staff.
