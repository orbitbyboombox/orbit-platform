# Database Recovery

1. Declarar incidente y detener escrituras/deploys si existe riesgo de corrupción.
2. Confirmar proyecto, región, alcance y último punto sano en Supabase.
3. Revisar backups/PITR disponibles en el plan actual desde el Dashboard; no asumir retención.
4. Exportar evidencia y verificar el backup antes de restaurar.
5. Restaurar primero en un proyecto/entorno aislado cuando sea posible.
6. Comparar migraciones remotas con `supabase/migrations/`.
7. Validar clientes protegidos, FKs, ledgers, assignments, settlements, RLS y Storage references.
8. Autorizar el cutover con Founder; nunca ejecutar restore destructivo sin confirmación.
9. Revalidar OAuth, portales, reservas, pagos y Finance por lectura.

Los comandos exactos dependen de las capacidades vigentes de Supabase y deben obtenerse de su consola/documentación oficial durante el incidente. Nunca incluir claves en comandos guardados.

## Estado verificado al 13-08-2026

La consulta read-only `supabase backups list` informó `pitr_enabled: false`, `walg_enabled: true` y ninguna copia física enumerada. Esto confirma que la base online funciona con WAL-G, pero **no demuestra una copia restaurable/PITR disponible para el Founder**. Antes de certificar Disaster Recovery debe habilitarse o verificar un backup gestionado y ejecutar una prueba de restauración aislada.
