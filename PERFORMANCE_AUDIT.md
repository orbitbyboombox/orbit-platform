# Auditoría de performance no destructiva — ORBIT BOOMBOX

Fecha: 2026-09-19  
Entorno observado: Production (`https://app.bbox.cl`)  
Deployment observado: `dpl_8XvwyqHZzHHSHRMRWW5CwgGQypVH` (READY, alias `app.bbox.cl`)  
Proyecto Vercel: `orbit-platform-v1`

## Alcance y límites

Esta auditoría es diagnóstica. No se modificaron lógica, consultas, índices, autenticación, WhatsApp/BIANCA, Calendar, pagos, booking ni variables de entorno. No se ejecutaron migraciones ni escrituras en Supabase.

Se midió Production sin credenciales de usuario con `curl` (tres muestras por ruta), se inspeccionó el bundle local generado y se revisó el código de App Router, middleware, providers y repositorios. Las rutas protegidas responden con redirección `307` a `/login`; por eso sus cifras no representan el render autenticado.

No fue posible obtener una sesión Founder ni completar una sesión de navegador WebKit/Chrome en este entorno. Por tanto **FCP, LCP, INP, CLS, TBT, hidratación y waterfall autenticado no están medidos**. Deben medirse en una sesión autenticada con Playwright/WebKit y datos de prueba antes de ejecutar optimizaciones.

## Baseline Production medido

Los tiempos son `TTFB / total` en segundos; `curl -L` siguió la redirección y terminó en `/login` para rutas protegidas.

| Ruta | HTTP final | TTFB mediana | Total mediana | Observación |
|---|---:|---:|---:|---|
| `/` | 200 | 0.417 | 0.754 | Página pública/entrada |
| `/clients` | 200 | 0.603 | 0.809 | Redirige a `/login?next=/clients` |
| `/events` | 200 | 0.584 | 0.856 | Redirige a login |
| `/calendar` | 200 | 0.565 | 0.669 | Redirige a login |
| `/staff` | 200 | 0.522 | 0.616 | Redirige a login |
| `/resources` | 200 | 0.611 | 0.770 | Redirige a login |
| `/finance` | 200 | 0.552 | 0.678 | Redirige a login |
| `/accounts-receivable` | 200 | 0.596 | 0.655 | Redirige a login |
| `/reports` | 200 | 0.587 | 0.686 | Redirige a login |
| `/settings` | 200 | 0.551 | 0.751 | Redirige a login |
| `/bianca` | 200 | 0.771 | 0.793 | Redirige a login |

El `200` final no significa que el contenido protegido se haya renderizado: es la respuesta de `/login` después del `307`. Para una medición autenticada se necesita cookie de sesión y navegador real.

## Runtime / deployment

- Deployment y aliases: READY, `app.bbox.cl` apunta al deployment observado.
- Funciones Vercel observadas: runtime Node.js 24, región `iad1`, memoria 2048 MB, timeout 300 s.
- La salida de `vercel inspect` reporta lambdas de aproximadamente 3.48 MB cada una (tamaño de función desplegada, no payload transferido).
- Logs de las últimas 24 h: no se observaron respuestas 5xx en la consulta `--status-code 5xx`.
- Sí existen errores operacionales en logs de Production que afectan latencia/experiencia: `whatsapp.ai.safe_handoff` por bloqueo del AI Gateway y un `22P02` de webhook en un deployment anterior. No se modificaron en esta auditoría.

## Hallazgos server-side y Supabase (inspección estática)

### P0 — Dashboard/Command Center concentra demasiadas lecturas

`app/(platform)/operations/page.tsx` ejecuta primero `loadFinancialTruth(client)` y después `loadFinanceDashboardReadModel(client)`, antes del `Promise.all` de aproximadamente 28 lecturas adicionales. Esto pone dos capas de trabajo financiero en la ruta crítica del Dashboard, aunque parte de sus datos se vuelve a consultar.

### P0 — Detalle de evento carga el universo antes del registro solicitado

`app/(platform)/projects/[projectId]/page.tsx` llama `SupabaseCustomerRepository.findAll()` y luego busca `projectId` en memoria. Para un detalle de evento, esto escala con todos los proyectos y precede a más de 30 consultas específicas.

### P0 — GET de detalle realiza una escritura

La misma página ejecuta `calculateAndPersistRealEventCost(client, projectId)` durante el render. Esto puede añadir latencia, locking y revalidación innecesaria a cada navegación/refresco, además de mezclar lectura con persistencia.

### P1 — N+1 financiero

`features/finance/finance-read-model.ts` obtiene los pagos en lote y luego ejecuta `invoice_payment_cash_impact` una vez por movimiento (`Promise.all(payments.map(...))`). El costo de la ruta crece linealmente con el histórico de pagos y la presión sobre la conexión Supabase.

### P1 — Auth duplicada en cada navegación protegida

`middleware.ts`/`lib/supabase/middleware.ts` ejecuta `auth.getUser()` y consulta `profiles`; `app/(platform)/layout.tsx` vuelve a ejecutar `auth.getUser()` y consulta `profiles` antes de cargar el shell. Es trabajo duplicado para todas las páginas bajo `(platform)`.

### P1 — Catálogos grandes sin evidencia de paginación en páginas clave

Dashboard, resources, reports y projects solicitan datasets operacionales completos o muy amplios (`projects`, `customers`, `staff`, `assets`, documentos, assignments, etc.) y filtran/agrupan parte de ellos en Node. La auditoría no confirma índices ni cardinalidad porque no ejecutó SQL.

### P1 — Reports es un read model de múltiples tablas completas

`app/(platform)/reports/page.tsx` dispara aproximadamente 15 lecturas concurrentes de clientes, proyectos, quotations, assignments, staff, assets, history, reviews, perfiles y receivables. El paralelismo evita una cascada, pero el volumen transferido y la agregación en servidor son riesgos de escalamiento.

### P1 — Resources/Staff combina 18 lecturas

`app/(platform)/resources/staff/page.tsx` contiene aproximadamente 18 fuentes Supabase y trabajo posterior de composición. El tiempo real autenticado debe medirse con una organización grande; hoy solo se puede afirmar el riesgo estático.

### P2 — Falta de confirmación de índices

No se inspeccionó `pg_stat_user_indexes`, planes `EXPLAIN` ni el catálogo de índices por la regla de no tocar DB. Consultas repetidas por `project_id`, `deleted_at`, `status`, `event_date`, `created_at` y claves de relación requieren verificación SQL antes de priorizar cambios de esquema.

### P2 — `select(*)` en adaptadores de sincronización

`lib/resilient-sync/adapters.ts` usa `select("*")` en inserts/updates y lecturas de recursos. Es menos riesgoso fuera del shell, pero aumenta payload y acoplamiento en operaciones de sync.

## Frontend, React y shell

### P1 — Shell global monta providers y trabajo transversal

`AppShell` monta `ResilientSyncProvider`, `ModuleManagerProvider`, `PersonalWorkspaceProvider`, `GlobalLayoutEngine`, guardas y header/sidebar para todo el árbol autenticado. Si `RESILIENT_SYNC_ENABLED` está activo, el provider inicia refresco periódico cada 5 segundos (`components/resilient-sync/resilient-sync-provider.tsx`). Esto debe verificarse con React Profiler y no desactivarse sin entender su contrato.

### P1 — Shell/layout desincronizado puede afectar el costo de reflow

`app-shell.tsx` usa transición de padding del contenedor principal y el sidebar usa transición de width. El fix actual evita el solapamiento, pero cualquier cambio adicional de dimensiones debe medirse con layout shift y no solo visualmente.

### P2 — Timer de System Health global

`features/system-health/system-health-center.tsx` refresca con `router.refresh()` cada 60 segundos mientras está montado. En una vista de salud es esperable; debe comprobarse que no quede montado fuera de esa ruta.

### P2 — Efectos de cliente con polling/observadores

Se detectaron `useEffect` en booking, documentos, staff, resiliente sync y centros comerciales. El polling de sync es el principal costo periódico identificado; no se aplicaron cambios.

## Bundle y assets

El `.next/static` local contiene estos archivos grandes:

| Asset/chunk | Tamaño |
|---|---:|
| `chunks/7f1df392...js` | 376 KB |
| `app/(platform)/projects/[projectId]/page-...js` | 243 KB |
| `framework-...js` | 189 KB |
| `1797-...js` | 174 KB |
| `0411f0ad-...js` | 173 KB |
| `main-...js` | 129 KB |
| `app/(platform)/settings/page-...js` | 103 KB |
| `app/(platform)/projects/page-...js` | 92 KB |
| `app/(platform)/resources/staff/page-...js` | 89 KB |
| `app/(platform)/resources/page-...js` | 80 KB |

Assets públicos relevantes:

- `public/images/orbit-home/elegant-wedding.png`: 2.09 MB.
- `public/images/orbit-home/event-operator.png`: 1.50 MB.
- `public/images/orbit-home/orbit-dashboard.png`: 92 KB.
- `public/pdf.worker.min.mjs`: 1.38 MB.
- `public/branding/boombox-official-logo.png`: 410 KB.

No se atribuye impacto de estos assets a rutas protegidas sin un waterfall autenticado; sí son candidatos claros para revisar carga diferida, formatos y prioridad.

## Integraciones externas y red

- El deployment está en `iad1`; la región de Supabase y RTT efectivo no se pudieron confirmar sin una consulta administrativa adicional. La distancia Vercel–Supabase puede dominar TTFB en rutas con muchas lecturas.
- Project detail, finance, documents y páginas de settings referencian Calendar/Drive/Gmail/WhatsApp. Debe medirse si alguna integración externa queda en la ruta crítica; esta auditoría no disparó operaciones externas.
- El middleware excluye correctamente varios endpoints públicos/webhooks, pero todas las demás rutas pasan por `updateSession`; esto es funcionalmente necesario para auth, aunque suma una llamada/lectura de sesión por request.

## Top 20 de cuellos de botella priorizados

1. **P0** Dashboard: `loadFinancialTruth` serial antes del read model financiero.
2. **P0** Dashboard: ~28 lecturas adicionales en una sola ruta.
3. **P0** Detalle: `findAll()` de todos los proyectos para resolver uno.
4. **P0** Detalle: `calculateAndPersistRealEventCost` escribe durante GET.
5. **P1** Finance: RPC `invoice_payment_cash_impact` por pago (N+1).
6. **P1** Auth: `getUser` duplicado middleware + layout.
7. **P1** Profile: lookup de `profiles` duplicado middleware + layout.
8. **P1** Reports: ~15 datasets completos y agregación en Node.
9. **P1** Resources/Staff: ~18 lecturas y composición en servidor.
10. **P1** Proyectos: catálogos/clientes/eventos sin paginación visible.
11. **P1** Lambda serverless grande (~3.48 MB reportados por función).
12. **P1** Chunk de detalle de proyecto de 243 KB.
13. **P2** Chunk compartido máximo de 376 KB.
14. **P2** Imágenes públicas de 1.5–2.1 MB.
15. **P2** `pdf.worker.min.mjs` de 1.38 MB.
16. **P2** Polling de Resilient Sync cada 5 s si la feature está habilitada.
17. **P2** `router.refresh()` del centro de salud cada 60 s.
18. **P2** Posible RTT Vercel `iad1` ↔ Supabase no confirmado.
19. **P2** Integraciones Google/WhatsApp/Drive potencialmente mezcladas con rutas de lectura.
20. **P3** Falta de RUM autenticado para detectar hidratación, INP, CLS y re-render hotspots.

## Quick wins candidatos (NO implementados)

1. Medir y eliminar la consulta global `findAll()` del detalle por una lectura por ID.
2. Separar lectura y persistencia de costos reales; nunca escribir en render GET.
3. Consolidar `auth.getUser/profile` entre middleware y layout, manteniendo validación server-side.
4. Reemplazar el RPC financiero por lote o una proyección canónica.
5. Paginar/limitar tablas operacionales y reports según vista/periodo.
6. Auditar imports client-side y aplicar dynamic import a centros pesados (project detail, finance, PDF).
7. Optimizar PNG grandes a WebP/AVIF responsive y lazy-load fuera del primer viewport.
8. Ejecutar medición autenticada con Playwright/WebKit, React Profiler y Supabase `EXPLAIN (ANALYZE, BUFFERS)` en staging/ventana aprobada.

## Plan de medición siguiente

1. Obtener una sesión Founder de prueba y repetir las 11 rutas con navegador real.
2. Capturar Navigation Timing, FCP/LCP/INP/CLS/TBT, hydration y número de requests.
3. Medir Dashboard, Event Detail, Finance y Bianca con traces de servidor y `Server-Timing`.
4. Ejecutar EXPLAIN read-only sobre las consultas top, sin crear índices.
5. Perfilar React (commits, renders y efectos) con shell expandido/colapsado.
6. Solo después aprobar cambios P0/P1 individualmente y volver a verificar Production.

## Estado final de esta auditoría

- **AUDITORÍA NO DESTRUCTIVA:** COMPLETADA.
- **OPTIMIZACIONES APLICADAS:** NINGUNA.
- **CAMBIOS DE LÓGICA/DB/AUTH/INTEGRACIONES:** NINGUNO.
- **CWV AUTENTICADOS:** PENDIENTES de navegador/sesión real.
- **Evidencia principal:** tiempos curl, `vercel inspect`, logs Production y revisión estática del repositorio.

