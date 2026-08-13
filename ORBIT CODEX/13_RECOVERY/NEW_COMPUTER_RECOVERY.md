# New Computer Recovery

Escenario: el computador del Founder fue robado, destruido o reemplazado.

1. Desde un dispositivo confiable, asegurar cuentas GitHub, Vercel, Supabase y Google; revocar sesiones del equipo perdido.
2. Instalar Git y Node.js 22.13+.
3. Clonar `https://github.com/orbitbyboombox/orbit-platform.git`.
4. Verificar `git tag -v orbit-v1.0-certified` cuando exista firma, o al menos `git rev-list -n 1 orbit-v1.0-certified` = SHA certificado.
5. Instalar dependencias con `pnpm install --frozen-lockfile`.
6. Autenticarse en Vercel y enlazar `orbit-platform-v1`.
7. Autenticarse en Supabase y enlazar `uiwlcmbrowtmqwhnsnxz`.
8. Recuperar variables desde gestores oficiales hacia `.env.local`; nunca copiar secretos desde ORBIT CODEX.
9. Ejecutar typecheck, lint y build.
10. Ejecutar ORBIT local.
11. Verificar Production y System Health por lectura; no modificar Production para probar el entorno.
12. Continuar en una rama `codex/<tarea>` siguiendo Constitución y certificación sprint por sprint.

Production, Database y Google siguen funcionando aunque el computador desaparezca; el paso crítico es recuperar identidades corporativas con MFA.
