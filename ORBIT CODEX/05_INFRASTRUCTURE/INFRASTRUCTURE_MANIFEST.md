# Infrastructure Manifest

## GitHub

- Repository: `orbitbyboombox/orbit-platform`
- Branch: `main`
- Certified tag: `orbit-v1.0-certified`
- Función: código, migraciones, documentación y baseline.
- Recuperación: clonar y verificar firma/SHA/tag antes de trabajar.

## Vercel

- Project: `orbit-platform-v1`
- Domain: `orbit.boom-box.cl`
- Certified deployment: `dpl_3Zsj2gwiys8FWwhiJynNB1mPMMVw`
- Certified commit: `c7b5f7064cc8186f5db21d5f433aa4827c081128`
- Entornos: Production, Preview y Development según variables configuradas.

## Supabase

- Project ref: `uiwlcmbrowtmqwhnsnxz`
- Servicios: PostgreSQL, Auth y Storage.
- Schema recovery: migraciones `0001`–`0117` en GitHub.

## Google Cloud / Workspace

- Project: **ORBIT Production**
- OAuth Client: **ORBIT Web Client**
- APIs: Gmail, Calendar y Drive.
- Dominio Workspace: `boom-box.cl`.

Los valores secretos residen solo en gestores oficiales.
