# Authentication Hotfix Report

Fecha: 6 de agosto de 2026
Estado: **corrección implementada y validación servidor–middleware aprobada**

## Root cause corregido

El cliente Supabase SSR compartía una única política de escritura de cookies para contextos con capacidades diferentes:

- El Server Action de login necesita escribir y debe propagar cualquier error.
- Los Server Components solo deben leer; Next.js prohíbe modificar cookies durante el render.

El `catch` original ocultaba fallos de persistencia. Al retirarlo globalmente quedó visible la restricción real de Next.js: `Cookies can only be modified in a Server Action or Route Handler` cuando `getCurrentUser()` se ejecutaba desde un Server Component.

## Corrección

- `createSupabaseServerClient()` quedó como cliente de lectura para Server Components.
- `createSupabaseServerActionClient()` quedó como cliente escribible para login/logout.
- El cliente escribible no suprime errores de `cookieStore.set()`.
- `signInAction()` valida `data.session`.
- `signInAction()` valida que exista el auth cookie Supabase antes del redirect.
- Middleware no fue rediseñado ni alterado funcionalmente.

## Atributos de cookie

- `httpOnly: true`
- `sameSite: lax`
- `path: /`
- `secure: false` en desarrollo
- `secure: true` en producción

## Evidencia end-to-end

La instrumentación temporal —retirada después de validar— confirmó:

1. `signInWithPassword()` devolvió una sesión.
2. El Server Action escribió `sb-uiwlcmbrowtmqwhnsnxz-auth-token`.
3. El redirect posterior ejecutó `GET /`.
4. Middleware recibió el mismo nombre de cookie.
5. `supabase.auth.getUser()` en middleware devolvió un usuario válido.
6. El Workspace respondió correctamente.

No se registraron valores de cookies, tokens, contraseñas ni credenciales.

## Validación técnica

- TypeScript: aprobado.
- ESLint: aprobado.
- Next.js Production Build: aprobado.
- `git diff --check`: aprobado.
- Errores de escritura de cookies: propagados.
- Sesión ausente: login rechazado antes del redirect.
- Cookie ausente: login rechazado antes del redirect.

## Validación pendiente

La sesión de usuario autenticada produjo la cadena correcta en el servidor. Sin embargo, las pestañas controladas del navegador integrado operan en contextos de sesión separados y no permitieron certificar de forma concluyente refresh, pestaña nueva y logout sobre la misma cookie.

## Recomendación

**NO GO temporal para retomar PC-04 hasta completar el smoke test manual de refresh, nueva pestaña y logout en un único perfil de navegador.**

El root cause de código está corregido; el bloqueo restante es de certificación end-to-end, no de compilación ni de respuesta Supabase.
