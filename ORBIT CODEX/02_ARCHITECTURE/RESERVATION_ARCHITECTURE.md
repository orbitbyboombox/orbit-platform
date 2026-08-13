# Reservation Architecture

Existe un solo pipeline para reservas manuales, automáticas, corporativas y matrimonios.

```mermaid
flowchart TD
  I[Entrada manual o automática] --> T[Idempotency Transaction ID]
  T --> A[Transaction A]
  A --> C[Customer]
  C --> P[Project / Event]
  P --> R[Reservation]
  R --> AR[Receivable]
  AR --> COMMIT[Commit canónico]
  COMMIT --> B[Boundary B]
  B --> TL[Timeline]
  B --> PO[Portal]
  B --> EM[Emails permitidos]
  B --> CAL[Calendar]
  B --> DR[Drive]
```

Los reintentos reutilizan registros existentes. Una falla Boundary B se registra y alerta, pero no convierte una reserva confirmada en error. La confirmación manual no comunica al cliente automáticamente; la comunicación es una acción distinta.
