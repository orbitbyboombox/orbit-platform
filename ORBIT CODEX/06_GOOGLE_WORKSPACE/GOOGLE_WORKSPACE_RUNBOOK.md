# Google Workspace Runbook

La conexión usa el dominio `boom-box.cl`, el proyecto Google Cloud **ORBIT Production** y el cliente **ORBIT Web Client**. Gmail entrega comunicaciones permitidas; Calendar sincroniza eventos; Drive conserva carpetas/documentos. El refresh token vive cifrado en Supabase y las credenciales del cliente viven en Vercel.

Scopes configurados: identidad (`openid`, email, profile), Calendar, Drive, Gmail send y compose. System Health debe mostrar OAuth conectado y servicios concedidos.

## Reconexión

1. Confirmar primero env vars presentes en Vercel sin revelar valores.
2. Confirmar redirect URI Production.
3. Usar Settings → Google Workspace → Reconectar solo con autorización Founder.
4. Completar consentimiento con la cuenta Workspace autorizada.
5. Ejecutar llamadas read-only Gmail/Calendar/Drive antes de cualquier escritura.

## Nunca hacer

No crear otro OAuth Client, rotar secretos, borrar refresh token, deshabilitar APIs, publicar tokens ni desconectar una integración sana durante diagnóstico.
