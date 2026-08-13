# Rollback to Certified v1

## Inspección segura

```bash
git fetch --tags origin
git rev-list -n 1 orbit-v1.0-certified
git switch --detach orbit-v1.0-certified
pnpm install --frozen-lockfile
pnpm run typecheck && pnpm run build
```

El SHA debe ser `c7b5f7064cc8186f5db21d5f433aa4827c081128`.

## Recuperación controlada

Crear una rama desde el tag (`git switch -c recovery/orbit-v1 orbit-v1.0-certified`), validar con variables del ambiente correcto y generar un deployment de recuperación solo con autorización. Preferir promover el deployment certificado existente si sigue disponible, porque conserva el artefacto probado.

## Advertencias

No usar `git reset --hard` sobre trabajo sin respaldo. No revertir migraciones automáticamente: el código v1 debe ser compatible con el esquema actual o probarse en un clon. No restaurar Database, secrets ni OAuth como consecuencia implícita del rollback de código.
