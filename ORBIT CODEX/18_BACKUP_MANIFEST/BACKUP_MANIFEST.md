# Backup Manifest

| Activo | Fuente online autorizada | Recuperación |
|---|---|---|
| Source code | GitHub `orbitbyboombox/orbit-platform` | Clone + branch/tag |
| Certified baseline | Git tag `orbit-v1.0-certified` | Verificar SHA exacto |
| ORBIT CODEX | GitHub, dentro del repositorio | Clone/checkout documental |
| Production | Vercel `orbit-platform-v1` | Deployment/alias certificado |
| Database/Auth/Storage | Supabase `uiwlcmbrowtmqwhnsnxz` | Online; backup restaurable aún no verificado, PITR desactivado |
| Database schema | GitHub `supabase/migrations/` | Secuencia 0001–0117 |
| Google documents | Google Drive Workspace | Cuenta/dominio autorizado |
| OAuth configuration | Google Cloud + Vercel | Runbook sin valores |
| Environment secrets | Vercel/Supabase | Recuperación autenticada; nunca docs |
| Operational manuals | GitHub `output/manual/` y Academy/Storage | Clone o portal autorizado |
| Evidence RC-07 | `10_CERTIFICATIONS/RC-07/evidence/` | Git object/tag/branch documental |

## Integridad de evidencia RC-07

| Archivo | SHA-256 |
|---|---|
| `production-desktop.png` | `1d9e10f4edcffd20becc2c4f81a0a8fe109149ef7a623b720378898b8b1cc2da` |
| `production-mobile.png` | `375b14cd817b9ffe08bdda6a94d9196ba89dc09c7795a55a406a9fcd67700665` |
| `production-tablet.png` | `375b14cd817b9ffe08bdda6a94d9196ba89dc09c7795a55a406a9fcd67700665` |

Git conserva además los hashes de objetos y del commit documental. Verificación local: `shasum -a 256 ORBIT\ CODEX/10_CERTIFICATIONS/RC-07/evidence/*.png`.

## Regla de completitud

Un computador local no es fuente primaria. `.env.local`, `.vercel/`, `.next/`, caches y temporales son reconstruibles. Si aparece un archivo operativo no versionado, debe clasificarse, subirse a un proveedor autorizado o declararse como riesgo antes de cerrar la auditoría.
