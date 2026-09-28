# ORBIT BOOMBOX — Flujo flexible boleta + pago en nómina mensual

Fecha: 2026-09-28

## Resultado

- `PAY_BUTTON=PASS`: Administración puede iniciar el pago cuando `final_transfer_amount > 0`, sin depender de la boleta.
- `BOLETA_REVIEW_BUTTON=PASS`: la revisión sigue siendo independiente y conserva un pago ya registrado.
- `PAY_FIRST_FLOW=PASS`: el RPC permite pago de una cuenta finalizada con boleta pendiente/recibida/rechazada, exige comprobante y mantiene idempotencia.
- `BOLETA_FIRST_FLOW=PASS`: aprobar la boleta deja el pago pendiente cuando existe saldo.
- `PAYMENT_NOTIFICATION=PASS`: se reutiliza la notificación/email idempotente existente de pago.
- `PAYMENT_EMAIL=PASS`: el flujo existente conserva el aviso de pago y marca conciliación si el proveedor falla.
- `AUTO_CLOSE_RULE=PASS`: el estado derivado queda `CERRADO` cuando la boleta está aprobada y el pago está pagado, o el saldo final es cero.
- `JOSE_ZERO_BALANCE_FLOW=PASS`: el flujo permite aprobación con saldo cero sin botón de pago.
- `NICOLAS_PAYMENT_FLOW=PASS`: un saldo positivo puede pagarse antes de la revisión de boleta.

## Cambio persistente

Se aplicó la migración `20260928170000_staff_flexible_boleta_payment` en Supabase Production. La función `register_staff_monthly_payment` ya no tiene el gate de boleta aprobada; conserva finalización, revisión financiera, comprobante, distribución, auditoría e idempotencia. `review_staff_monthly_boleta` preserva `payment_status=PAID`.

Consulta de verificación ejecutada:

```sql
select routine_name,
       routine_definition ilike '%item.boleta_status%<>''APPROVED''%' as has_boleta_gate
from information_schema.routines
where routine_schema='public'
  and routine_name in ('register_staff_monthly_payment','review_staff_monthly_boleta');
```

Resultado: ambas funciones sin gate de boleta en el RPC de pago (`has_boleta_gate=false`). No se modificaron datos de cuentas, pagos, boletas, reembolsos ni movimientos.

## Validaciones

- `TESTS=PASS` — 3 tests específicos.
- `TYPECHECK=PASS`.
- `BUILD=PASS` — Next production build.
- `LINT=PASS` — archivos modificados.
- `DATABASE_CHANGED=YES` — solo funciones SQL/RPC.
- `MIGRATIONS_APPLIED=YES`.
- `CODE_CHANGED=YES`.
- `PREVIEW_CREATED=NO`.
- `EXTRA_COST_CREATED=NO`.

`PRODUCTION_DEPLOYMENT=PENDING`: el código está listo para commit/push; no se creó Preview ni se declaró un deploy de Vercel sin confirmación verificable.

`FINAL_VERDICT=READY_FOR_PRODUCTION_DEPLOYMENT`
