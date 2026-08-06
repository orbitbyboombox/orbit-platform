# RC-03 — Firma digital y acuerdo legal

## Resultado

La arquitectura productiva de firma digital quedó implementada y la migración `0012_digital_signature_workflow.sql` fue aplicada y registrada en Supabase Production. La certificación integral permanece bloqueada hasta disponer de un acuerdo productivo pendiente y volver a autorizar Google Workspace con el permiso `gmail.compose`.

## Seguridad y trazabilidad

- Token aleatorio almacenado únicamente como hash SHA-256.
- Enlace vinculado a un solo acuerdo, con expiración, consumo único y revocación.
- Bloqueo transaccional de procesamiento para impedir confirmaciones concurrentes.
- Validación exclusivamente en servidor; la ruta pública no entrega credenciales internas.
- Firma, PDF y acuerdo bloqueados después de la confirmación.
- Evidencia de fecha, IP anonimizada mediante hash, navegador, dispositivo y versión del acuerdo.
- Eventos de historial y auditoría generados durante apertura, firma, bloqueo, generación y carga del PDF.

## Experiencia

- Ruta pública `/sign/[token]`, sin cuenta ni inicio de sesión.
- Lienzo compatible con mouse, tacto y stylus.
- Acciones Dibujar, Limpiar, Firmar nuevamente y Confirmar.
- Estado final de solo lectura.

## Documento e integraciones

- PDF firmado generado en servidor con los datos comerciales y legales solicitados.
- Copia guardada en Storage y preparada para Google Drive en `01 Contrato`.
- Borrador de Gmail preparado; no se envía automáticamente.

## Validación técnica

- Migración aplicada: PASS.
- Registro en historial de migraciones: PASS.
- TypeScript: PASS.
- ESLint: PASS.
- Next.js Production Build: PASS.
- `git diff --check`: PASS.
- Certificación real Desktop/Tablet/Mobile: BLOQUEADA (no existe un acuerdo productivo pendiente).
- Gmail Draft: BLOQUEADO (la conexión vigente no contiene `gmail.compose`).

## Decisión

**RC-03: FAIL para certificación integral.**

**RC-04: NO GO** hasta que:

1. Google Workspace sea reconectado aceptando `gmail.compose`.
2. Exista un acuerdo productivo legítimo pendiente, originado desde una cotización aceptada.
3. Se ejecute el recorrido completo y se validen PDF, Drive, Timeline, Audit y los tres tamaños de pantalla.
