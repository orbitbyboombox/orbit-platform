# ORBIT V1 Certified Baseline

> Este commit representa ORBIT v1.0 certificado y debe considerarse el último estado estable conocido.

| Campo | Valor |
|---|---|
| Versión | ORBIT v1.0 |
| Fecha de certificación | 13-08-2026 |
| Commit | `c7b5f7064cc8186f5db21d5f433aa4827c081128` |
| Tag inmutable | `orbit-v1.0-certified` |
| Deployment | `dpl_3Zsj2gwiys8FWwhiJynNB1mPMMVw` |
| Dominio | `https://orbit.boom-box.cl` |
| P0 / P1 | 0 / 0 |

## Componentes certificados

Customer y Event engines; Pipeline Único de Reserva; cotizaciones, contratos y documentos; Payment Ledger; Finance Read Model; Staff, Operations, Assignment, Event Settlement y Payroll; Portal Cliente; Portal Staff; Dashboard; Cost Master; BOOMBOX Academy; Google Workspace; seguridad y responsive.

## Deuda diferida

- P2: normalización histórica de Financial Truth cancelado, casts UUID y probe activo Realtime.
- P3: imports/variables no utilizados y resumen genérico de servicio duplicado.

## Volver al baseline

No mover el tag. Inspeccionar o crear una rama de recuperación con `git switch --detach orbit-v1.0-certified` o `git switch -c recovery/orbit-v1 orbit-v1.0-certified`. No hacer `reset --hard` sobre trabajo no respaldado. El rollback de código no revierte datos ni migraciones; revisar primero `13_RECOVERY/ROLLBACK_TO_CERTIFIED_V1.md`.
