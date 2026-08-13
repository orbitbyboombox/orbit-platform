# ORBIT CODEX

Sistema maestro de documentación, respaldo y recuperación de ORBIT by BOOMBOX.

- Current certified version: **ORBIT v1.0**
- Status: **CERTIFIED**
- Certified commit: `c7b5f7064cc8186f5db21d5f433aa4827c081128`
- Certified Git tag: `orbit-v1.0-certified`
- Certified deployment: `dpl_3Zsj2gwiys8FWwhiJynNB1mPMMVw`
- Production: <https://orbit.boom-box.cl>

Su objetivo es garantizar continuidad operacional y reconstruir ORBIT sin depender de un computador específico. El código y esta documentación viven en GitHub; Production vive en Vercel; los datos, Auth y Storage viven en Supabase; Google Workspace conserva sus activos e integración autorizada. Ningún secreto se almacena aquí.

## Inicio rápido

1. Leer `17_AI_CODEX_CONTEXT/CODEX_START_HERE.md`.
2. Verificar el baseline en `00_CERTIFIED_BASELINE/ORBIT_V1_CERTIFIED_BASELINE.md`.
3. Para recuperar un computador, seguir `13_RECOVERY/NEW_COMPUTER_RECOVERY.md`.
4. Para incidentes, seguir `14_DISASTER_RECOVERY/DISASTER_RECOVERY_PLAN.md`.
5. Para conocer dónde vive cada activo, consultar `18_BACKUP_MANIFEST/BACKUP_MANIFEST.md`.

## Regla de seguridad

Está prohibido guardar passwords, tokens, API keys, secretos OAuth, claves Supabase, `CRON_SECRET`, valores `.env` o credenciales personales. Solo se documentan nombres, propósito, proveedor y recuperación segura.
