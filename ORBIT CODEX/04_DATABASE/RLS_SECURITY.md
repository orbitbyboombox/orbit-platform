# RLS Security

RLS separa usuarios internos, Customer Portal y Staff Portal. Las políticas usan helpers como `is_internal_user()` y `can_administer()`. RPCs privilegiados declaran `SECURITY DEFINER` y `search_path` explícito cuando necesitan ejecutar una transacción canónica; otras funciones usan `SECURITY INVOKER` para preservar `auth.uid()`.

Reglas de auditoría:

- Revisar grants de tabla y función junto con cada migración.
- Revocar `anon` en datos internos como `company_settings`.
- Nunca conceder service role al navegador.
- Toda función con `ON CONFLICT` debe tener constraint único compatible.
- Probar RLS con roles anon, authenticated y service role en un entorno seguro antes de Production.
