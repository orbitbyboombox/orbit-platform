# Disaster Recovery Plan

Responsable primario: Founder. Ejecución técnica: Codex/ingeniería autorizada. Product Director: ChatGPT.

| Escenario | Impacto/diagnóstico | Recuperación ordenada |
|---|---|---|
| Computador perdido | Estación local no disponible | Revocar sesiones; equipo nuevo; GitHub → Vercel/Supabase → env segura → build |
| GitHub inaccesible | Sin clon/fetch | Mantener Production; revisar incidente proveedor; usar clones autorizados o export de deployment solo como último recurso; restaurar remoto con historia validada |
| Deployment roto | Error runtime/alias | Identificar SHA; promover deployment certificado o redeploy del tag después de smoke |
| Supabase con incidencia | Auth/DB/Storage degradado | Detener escrituras; revisar status/backups/PITR; restaurar aislado; validar integridad; cutover autorizado |
| OAuth roto | 401/refresh falla | Árbol `GOOGLE_OAUTH_RECOVERY.md`; no rotar primero; reconectar solo autorizado |
| Workspace desconectado | Calendar/Drive/Gmail detenidos | Mantener operación canónica; alertar Boundary B; reconectar; reintentar pendientes idempotentes |
| Variable Vercel eliminada | Build/runtime falla | Recuperar desde proveedor/registro corporativo; añadir al ambiente correcto; no copiar de logs; redeploy controlado |
| Migración defectuosa | SQL/runtime/integridad | Detener; preservar evidencia; backup; forward-fix probado. Restore solo con autorización |
| Código nuevo rompe ORBIT | P0/P1 post-deploy | Rollback al deployment certificado; mantener datos; RCA antes de nuevo cambio |
| Admin bloqueado | Founder sin acceso | Recuperación Supabase/Auth con identidad y MFA; auditar; no crear cuentas paralelas sin aprobación |

Orden universal: contener → preservar evidencia → verificar fuente canónica → recuperar servicio crítico → validar datos → reactivar efectos secundarios → documentar.
