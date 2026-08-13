# Database Overview

Supabase Project Production: `uiwlcmbrowtmqwhnsnxz`. PostgreSQL conserva las fuentes canónicas, RLS, RPCs, triggers, auditoría y proyecciones. Auth administra usuarios internos; Storage conserva branding, documentos, gastos, firmas y Academy según buckets/policies.

Las migraciones `0001`–`0117` en `supabase/migrations/` son la historia autoritativa. Nunca se reconstruye Production ejecutando SQL suelto: se compara el historial remoto, se restaura una copia y se aplica únicamente la secuencia faltante después de validación.

Dominios críticos: Customers/CRM, Projects/Events, Reservations, Quotation/Contract, Invoice/Payment Ledger, Financial Truth, Staff/Assignments/Settlements, Portals, Workspace, Google, Notifications, Audit y Academy.
