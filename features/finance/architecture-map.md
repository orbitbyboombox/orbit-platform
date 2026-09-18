# Finanzas BOOMBOX · mapa canónico

La navegación visual se organiza en ocho pestañas, pero todas son proyecciones de lectura sobre las fuentes existentes; ninguna pestaña crea una fuente paralela.

| Pestaña | Vista | Fuente canónica |
| --- | --- | --- |
| Resumen | `/finance` | `loadFinanceDashboardReadModel` → `loadFinancialTruth`, `accounts_receivable_projection`, `invoice_payments`, `expenses`, liquidaciones y caja |
| Ingresos | `/finance/incomes` | `loadAccountsReceivable` → `accounts_receivable_projection` y `invoice_payments` |
| Gastos | `/finance/expenses` | `expenses` + `finance_recurring_expense_rules` |
| Por cobrar | `/finance/receivables` | `AccountsReceivableCenter` / proyección de cuentas por cobrar |
| Por pagar | `/finance/payables` | `loadAccountsPayable` y fuentes operacionales existentes |
| Caja | `/finance/cash-flow` | `invoice_payments`, gastos pagados, Staff, combustible y arriendo |
| Impuestos | `/finance/taxes` | indicadores de documentación tributaria de gastos y boletas existentes; no se inventan IVA ni DTE |
| Reportes | `/finance/reports` | enlaces a exportación contable y vistas canónicas existentes |

No se modifican pagos de clientes, cálculos comerciales, asientos ni tablas. Las acciones continúan viviendo en sus módulos de origen.
