# ORBIT v1.9 — Production Certification

**Release:** `1.9.0`  
**Scope:** cierre de certificación de ORBIT Production
**Semver:** `1.9.0`

Este documento constituye las release notes oficiales de `ORBIT v1.9 — Production Certification`.

## Estado de certificación

Los smoke Founder autorizados y las validaciones técnicas de los módulos internos
quedan documentados como certificados en el estado productivo de este release:

- Founder Dashboard y personalización
- BIANCA Engine, BIANCA Lab, workspace operativo y Human Takeover
- Communication Hub e Inbox WhatsApp (delivery permanece desactivado)
- Capacity Engine, draft capacity preflight y cierre atómico de reservas
- Flujo cotización → reserva → GANADO
- Staff onboarding, invitaciones, liquidaciones y documentos
- Customer Portal Empresa/Particular
- Finanzas, Payment Ledger, cuentas por cobrar y operaciones
- Resources/Inventory y Agenda Operacional
- Connection Center y migraciones de Production

El alcance certificado incluye también Founder Dashboard, BIANCA, Communication Hub,
Capacity Engine, cierre comercial atómico, política `DRAFT_REUSABLE`, Staff onboarding,
Staff operations/completion/advance/monthly payroll/payment, Staff Portal, Customer Portal,
Payment Ledger, Accounts Receivable, documentos, RBAC/RLS/security y sincronización de migraciones.

## Automatic Booking

- **Certificación técnica:** `PASS` (validación de token, preflight, gate atómico,
  idempotencia, timeline, errores y control de doble envío cubiertos por tests).
- **Smoke Founder real:** `DEFERRED_UNTIL_NEXT_REAL_CASE`.

La excepción es controlada y no representa un fallo: no existía un caso comercial
real, elegible y no destructivo para ejecutar el flujo automático. Las invitaciones
existentes estaban expiradas/revocadas o sin proyecto/evento vinculable. No se creó
data artificial ni se reactivó una invitación sin autorización comercial.

## Límites externos preservados

- Meta App Review y verificación de WhatsApp siguen pendientes externamente.
- El número oficial BOOMBOX no ha sido migrado.
- `WHATSAPP_DELIVERY_ENABLED=false`; no se enviaron mensajes ni correos como parte
  de esta certificación.
- No se activaron campañas ni gasto de Google Ads.

## Evidencia de release

- Production READY y alias `https://orbit.boom-box.cl`.
- Ledger de migraciones sincronizado hasta `0252` (`capacity_shell_operational_only`).
- P0/P1/P2 abiertos: `0`.
- El smoke manual comercial previo de Alexandra Voss fue ejecutado una sola vez con
  la configuración WHITE autorizada; no se repitió ni se modificaron otros casos.

Esta nota es documental: no introduce datos de prueba, invitaciones, reservas,
pagos ni comunicaciones.

## Excepción de validación post-release

`AUTOMATIC BOOKING TECHNICAL CERTIFICATION = PASS`

`AUTOMATIC BOOKING REAL OPERATIONAL SMOKE = DEFERRED_UNTIL_NEXT_REAL_CASE`

No existía un caso legítimo pendiente que pudiera ejecutarse sin fabricar datos
comerciales. Esto no es un bug conocido. El siguiente caso comercial legítimo que
use `/booking/[token]` debe usarse como Founder operational smoke, cubriendo preflight,
gate final, proyecto, cotización, reserva, documentos, timeline y duplicados. Si falla,
se abrirá un patch `v1.9.x`.

## Dependencias externas preservadas

- `Meta/WABA = PENDING_EXTERNAL`.
- `WhatsApp delivery = OFF`.
- `Direct SII issuance = OUT_OF_SCOPE_V1_9`.

Estas condiciones no son bugs de v1.9 y no habilitan acciones automáticas.

## Freeze

v1.9 es el baseline estable. Los bugs críticos de Production se corrigen como
parches `1.9.x`; las nuevas funcionalidades pertenecen a ORBIT 2.0.
