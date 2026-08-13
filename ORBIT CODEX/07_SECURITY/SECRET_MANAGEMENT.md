# Secret Management

Los valores están **PROHIBIDOS DOCUMENTAR**.

| Variable | Proveedor/ubicación | Propósito |
|---|---|---|
| `GOOGLE_WORKSPACE_CLIENT_ID` | Vercel env / Google Cloud | Identidad OAuth pública |
| `GOOGLE_WORKSPACE_CLIENT_SECRET` | Vercel env, Sensitive | Intercambio/refresh OAuth |
| `GOOGLE_WORKSPACE_REDIRECT_URI` | Vercel env | Callback autorizado |
| `CRON_SECRET` | Vercel Production, Sensitive | Autorizar Cron |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Vercel/Supabase | Endpoint del proyecto |
| `SUPABASE_PUBLISHABLE_KEY` | Vercel/Supabase | Cliente público con RLS |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Vercel, Sensitive / Supabase | Backend privilegiado |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Vercel | URL canónica |
| `VERCEL_OIDC_TOKEN` | Vercel runtime/local link | Identidad efímera de tooling |

Recuperar valores desde el Dashboard del proveedor o mediante CLI autenticada y escribirlos solo en `.env.local` ignorado. Google ya no permite volver a mostrar secretos OAuth completos: usar el valor existente en Vercel; no rotarlo como procedimiento de lectura.
