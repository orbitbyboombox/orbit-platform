# Local Setup

1. Instalar Git y Node.js 22.13 o superior.
2. Autenticarse en GitHub con el método corporativo aprobado.
3. Ejecutar `git clone https://github.com/orbitbyboombox/orbit-platform.git`.
4. Entrar al repositorio y ejecutar `corepack enable` y `pnpm install --frozen-lockfile`.
5. Copiar `.env.example` a `.env.local` y recuperar valores exclusivamente desde Vercel/Supabase; nunca desde documentación o chats.
6. Instalar Supabase CLI e iniciar sesión; ejecutar `supabase link` seleccionando el proyecto Production solo para comprobaciones autorizadas.
7. Instalar Vercel CLI, iniciar sesión y ejecutar `vercel link` al proyecto `orbit-platform-v1`.
8. Ejecutar `pnpm run typecheck`, `pnpm run lint` y `pnpm run build`.
9. Ejecutar `pnpm run dev` y abrir la URL local.
10. Validar Production por lectura en `https://orbit.boom-box.cl`; no ejecutar migraciones, env pulls ni deploys sin confirmar alcance.

Los secretos deben permanecer en `.env.local`, que está ignorado por Git. Ver `07_SECURITY/SECRET_MANAGEMENT.md`.
