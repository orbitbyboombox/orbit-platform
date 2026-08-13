# Financial Ledger

`invoice_payments` es el ledger canónico de cobros: cada pago es un movimiento independiente con monto, fecha, método, comprobante, usuario y timestamp. Los acumulados se calculan; nunca se sobrescriben.

`receivable_movements` es una proyección/auditoría histórica de solo lectura operacional. Accounts Receivable, Cash Flow, Dashboard y Finance deben consumir la fuente canónica o su read model aprobado.

Los pagos de colaboradores nacen en `event_staff_payments`. Ajustes y reembolsos se registran aparte; el neto original permanece inmutable. Payroll agrupa settlements confirmados por `accounting_month`/pago, no por fecha del evento.
