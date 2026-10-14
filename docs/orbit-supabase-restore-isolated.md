# ORBIT Supabase — restauración aislada

Este procedimiento es separado del workflow de backup y requiere otra aprobación del environment `orbit-restore-isolated`. Nunca se ejecuta contra Production.

## Permisos necesarios

- GitHub Actions: lectura de contenido; environment protegido con reviewers Founder/Admin.
- `SUPABASE_ACCESS_TOKEN`: secret protegido con permisos para crear/usar una branch o proyecto aislado, según la política vigente.
- `SUPABASE_DB_URL`: secret de conexión al destino aislado, nunca el de Production.
- `SUPABASE_SERVICE_ROLE_KEY`: secret del destino aislado, solo para restaurar Storage server-side.
- `BACKUP_ENCRYPTION_PASSPHRASE`: secret usado para descifrar; debe ser distinto del token de Supabase.
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`: secret de una cuenta con rol Editor únicamente sobre `04_RESPALDOS_ORBIT`.

El workflow fija Supabase CLI en `2.121.0` y `googleapis` en `144.0.0`; las dependencias de la aplicación se instalan con el lockfile existente.

El dump solicitado incluye `public`, `storage` y `auth` y debe fallar si el rol no puede leer `auth`. Los roles de servidor gestionados, usuarios/credenciales externas de Auth, extensiones administradas, cron, secretos y configuración de proveedores no quedan garantizados por un dump SQL estándar; deben preservarse mediante el mecanismo administrativo correspondiente y validarse por separado.

## Pasos

1. Descargar desde Drive los artefactos cifrados y `sha256sums.txt`.
2. Verificar SHA-256 antes de descifrar.
3. Descifrar solo dentro del runner temporal.
4. Crear/seleccionar un destino aislado y registrar coste/permiso antes de usarlo.
5. Restaurar esquema y datos con la herramienta PostgreSQL/Supabase compatible con PostgreSQL 17.
6. Subir objetos a Storage conservando bucket, path, MIME, tamaño y checksum.
7. Validar RLS, conteos, funciones y una muestra de objetos privados/públicos.
8. Guardar evidencia de restauración en Drive y destruir temporales.

No ejecutar este procedimiento en Production ni incluir claves de Production en el environment de restauración.
