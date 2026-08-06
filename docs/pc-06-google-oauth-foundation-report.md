# PC-06 — Google OAuth Foundation Report

## Resultado

La base OAuth de Google Workspace quedó implementada para Calendar, Drive y Gmail, sin exponer tokens al navegador.

## Flujo

1. Un usuario CEO o Administrator inicia la conexión desde Settings.
2. ORBIT crea `state` y PKCE, almacenados en cookies HTTP-only de diez minutos.
3. Google devuelve el código a `/api/auth/callback/google`.
4. ORBIT valida estado, actor y sesión antes de intercambiar el código.
5. El access token y refresh token se almacenan en una tabla server-only mediante Supabase Service Role.
6. El Centro de Conexiones carga únicamente una proyección sanitizada.
7. Cuando el access token vence, ORBIT usa el refresh token en servidor.
8. La desconexión revoca el token y elimina ambos tokens persistidos.

## Seguridad

- PKCE S256.
- Estado OAuth aleatorio validado con comparación de tiempo constante.
- Cookies `httpOnly`, `sameSite=lax`, `secure` en producción y limitadas al callback.
- El actor que inicia el flujo debe ser el mismo que completa el callback.
- Solo roles `CEO` y `ADMINISTRATOR` pueden autorizar o desconectar Google.
- Credenciales y tokens se importan únicamente desde módulos `server-only`.
- La tabla OAuth tiene RLS, no posee políticas de acceso cliente y revoca acceso a `anon` y `authenticated`.
- El navegador recibe solo cuenta, dominio, salud, servicios y fechas; nunca tokens.

## Timeline

Se generan eventos append-only para:

- `GOOGLE_CONNECTED`
- `GOOGLE_DISCONNECTED`
- `CALENDAR_AUTHORIZED`
- `DRIVE_AUTHORIZED`
- `GMAIL_AUTHORIZED`

## Google Cloud

Tipo de cliente: Web application.

Authorized JavaScript Origins: ninguno requerido; el flujo es completamente server-side.

Authorized Redirect URI para el staging actual:

`https://orbit-platform-v1-37lo3mfq0-orbit-by-boombox.vercel.app/api/auth/callback/google`

Para validación local en el servidor actualmente utilizado:

`http://localhost:3002/api/auth/callback/google`

`GOOGLE_WORKSPACE_REDIRECT_URI` debe coincidir exactamente con el URI del entorno activo. Google no permite comodines para URLs Preview variables; se debe usar un alias estable o registrar cada URL de preview explícitamente.

## Infraestructura pendiente

1. Ejecutar `database/migrations/0006_google_workspace_oauth.sql` en Supabase producción.
2. Configurar las tres variables Google en Vercel y en el entorno local requerido.
3. Registrar el redirect exacto en Google Cloud.
4. Desplegar el build y realizar una autorización real.
5. Validar que Google entregue un refresh token y que los tres scopes sean concedidos.

## Validación local

- TypeScript: PASS.
- ESLint: PASS.
- Next.js production build: PASS.
- `git diff --check`: PASS.

## Decisión

**NO GO para Google Live todavía.** La implementación está preparada, pero las variables Google no están configuradas en `.env.local`, la migración nueva no se ha certificado en Supabase producción y no se ha completado un consentimiento real.
