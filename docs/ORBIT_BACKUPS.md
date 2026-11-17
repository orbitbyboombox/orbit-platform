# Respaldos ORBIT

El panel de Configuración incluye `RESPALDOS ORBIT`. Solo `CEO` y `ADMINISTRATOR` pueden iniciar o consultar ejecuciones.

## Configuración única

El servidor de ORBIT necesita `GITHUB_BACKUP_DISPATCH_TOKEN`, con permiso mínimo para disparar el workflow `orbit-supabase-backup.yml`. La referencia de código puede fijarse con `ORBIT_BACKUP_REF`; por defecto se usa `main`.

Los workflows conservan las credenciales sensibles en el entorno protegido `orbit-backup-production`:

- `SUPABASE_DB_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BACKUP_ENCRYPTION_PASSPHRASE`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
- `SUPABASE_URL` y `GOOGLE_DRIVE_PARENT_FOLDER_ID` como variables protegidas

Ninguna de estas credenciales llega al navegador, a la tabla de auditoría ni a los logs de la aplicación.

## Operación

`RESPALDAR AHORA` crea una fila idempotente en `orbit_backup_runs` y dispara el workflow integral. El workflow exporta PostgreSQL (`public`, `storage`, `auth`), Storage, manifiestos y hashes; cifra los archivos; verifica lectura posterior desde Drive; registra el resultado y rota únicamente carpetas de respaldo de más de 30 días después de validar que la copia más nueva contiene archivos.

La ejecución diaria se realiza a las 04:00 UTC. La restauración aislada se comprueba semanalmente a las 05:00 UTC mediante PostgreSQL 16 efímero de GitHub Actions; nunca utiliza la base productiva como destino.

Si falla una ejecución, queda `ERROR` en el historial y se crea una notificación administrativa `ORBIT_BACKUP_FAILED`. Las copias anteriores no se sobrescriben.
