# Auditoría comercial canónica de BIANCA vs. BOOMBOX

**Fecha de auditoría:** 2026-09-19  
**Alcance:** revisión documental y de código. No se modificó runtime, pricing, booking, base de datos, web, WhatsApp, provider ni flags de automatización.

## 1. Resumen ejecutivo

La fuente operativa que debe gobernar a BIANCA es `public.commercial_prices` (catálogo comercial persistido), consultada mediante las operaciones canónicas de pricing. El archivo TypeScript de precios y las migraciones sirven como evidencia de configuración y fallback, pero no deben reemplazar una consulta comercial actual.

ORBIT distingue correctamente entre:

- servicios comerciales cobrables (`CLASSIC`, `POLAROID`, `BLACK_STUDIO`, `BBOX360`, `LIGHTBOX`, `BOOMBALL`, `HASHTAG`, `INSTABOX`, `VIDEO_LOUNGE`);
- extras (`QR`, `UNLIMITED_MAGNETS`, `SCRAPBOOK`, `BRANDING`, `ADDITIONAL_PRINTING`, etc.);
- transporte y recargos de recinto;
- configuraciones físicas operacionales (por ejemplo, `WHITE_TOTEM`, `BLACK_TOTEM`, `BBOX360_PLATFORM`, `IA43_INTEGRATED`).

La web pública funciona como material comercial/marketing, pero no expone en las páginas auditadas una matriz vigente de precios y duraciones. Por eso BIANCA no debe convertir textos de la web en tarifas.

Hay una inconsistencia que requiere corrección de conocimiento antes de declarar cobertura completa: el prompt de BIANCA incluye **Photo IA**, pero no existe `PHOTO_IA` en el `ServiceId` ni en `SERVICE_CATALOG`. Debe tratarse como **no cotizable / revisión manual** hasta que Founder lo active como servicio canónico.

## 2. Evidencia y fuentes

### Web pública BOOMBOX

- [BOOMBOX — Experiencias / descubre](https://www.boom-box.cl/descubre) (la ruta `/planes` redirige aquí).
- [BOOMBOX — InstaBox](https://www.boom-box.cl/instabox).

La página de experiencias comunica, entre otros puntos, planes a medida, experiencias para novios, activaciones corporativas, cumpleaños, KIDS e InstaBox. La página de InstaBox está indexada como una experiencia de cabina fotográfica. En la HTML pública auditada no se encontró una tabla de precios/duración ni enlaces PDF públicos verificables para cada servicio; el contenido visible debe considerarse marketing y no autoridad de pricing.

### ORBIT — catálogo y pricing

- `features/business-core/catalog/service.catalog.ts`: catálogo de servicios, duración y si se solicita duración.
- `features/business-core/pricing/service-pricing.ts`: matriz TypeScript de referencia/fallback.
- `database/migrations/0007_production_quotation_engine.sql`: filas canónicas de `commercial_prices` y extras.
- `features/automatic-booking/service-pricing.ts`: resolver server-side que distingue precio fijo y precio por duración.
- `features/commercial-hub/catalogs.ts`: rutas canónicas de catálogos comerciales (`/catalogo/novios`, `/catalogo/empresas`, `/catalogo/eventos`).
- `supabase/migrations/0037_rc03_booking_experience_restoration.sql`: compatibilidad de extras por servicio.
- `features/asset-management/equipment-assignment-panel.tsx` y `features/asset-management/types.ts`: configuración/equipos físicos, no servicios cobrables.

## 3. Catálogo comercial canónico de ORBIT

| Código | Nombre comercial | Tipo | Duración | Precio de referencia en configuración | Estado de conocimiento |
|---|---|---|---|---:|---|
| `CLASSIC` | Classic | Servicio | 2/3/4 h | $250.000 / $290.000 / $330.000 CLP | Definido en matriz y seed; validar fila activa antes de cotizar |
| `POLAROID` | Polaroid | Servicio | 2/3/4 h | $330.000 / $390.000 / $450.000 CLP | Definido en matriz y seed; validar fila activa |
| `BLACK_STUDIO` | Black Studio | Servicio | 2/3/4 h | $390.000 / $470.000 / $520.000 CLP | Definido en matriz y seed; validar fila activa |
| `BBOX360` | BBOX360 | Servicio | 2/3/4 h | $250.000 / $300.000 / $360.000 CLP | Definido en matriz y seed; validar fila activa |
| `HASHTAG` | Hashtag | Servicio | 2/3/4 h | $250.000 / $300.000 / $350.000 CLP | Definido en matriz y seed; validar fila activa |
| `LIGHTBOX` | LightBox | Servicio de duración fija | 5 h operacionales; no pide duración | $220.000 CLP | Precio fijo por `rules.fixed = true` |
| `BOOMBALL` | BoomBall | Servicio de precio fijo | No requiere duración | $280.000 CLP | Precio fijo por `rules.fixed = true` |
| `INSTABOX` | Instabox | Servicio | Catálogo permite 2/3/4 h, pero precio oficial requiere cotización | No publicar monto | `REQUIRES_QUOTE` |
| `VIDEO_LOUNGE` | Video Lounge | Servicio | Catálogo permite 2/3/4 h, pero precio oficial requiere cotización | No publicar monto | `REQUIRES_QUOTE` |

### Regla de pricing

`resolveServicePrice()` primero busca una fila con `rules.fixed === true`. Para ella usa `unit_price`, devuelve `pricingMode = FIXED` y no exige `duration_hours`. Si no es fija, exige una fila con `duration_hours` igual a la duración solicitada y devuelve `pricingMode = DURATION`. La ausencia de precio debe producir `SERVICE_PRICE_UNAVAILABLE`, nunca una tarifa inventada.

Por lo tanto, BIANCA debe explicar BoomBall como servicio de precio fijo solo después de `COMMERCIAL_LOOKUP`; no debe inventar horas ni convertirlo en un extra.

## 4. Equipos físicos vs. servicios

Los siguientes nombres aparecen como configuración operacional/equipo, no como líneas comerciales independientes:

- `WHITE_TOTEM` → “Tótem blanco”;
- `BLACK_TOTEM` → “Tótem negro”;
- `BBOX360_PLATFORM` → “Plataforma 360”;
- `IA43_INTEGRATED` → “Tótem IA 43”;
- tipos de asset como `TOTEM`, `CLASSIC_TOTEM`, `BLACK_STUDIO`, `BBOX360`, `LIGHTBOX`, `BOOMBALL`, `PRINTER`, `CAMERA` y accesorios.

**Regla para BIANCA:** “tótem”, “plataforma”, impresora o cámara describen montaje/equipamiento cuando provienen de operaciones. No deben transformarse automáticamente en un servicio, precio o plan. La pregunta comercial debe resolverse por el `ServiceId` activo.

## 5. Extras, impresión, QR y personalización

Filas de `commercial_prices` auditadas en la migración canónica:

| Código | Descripción | Precio de referencia | Condición |
|---|---|---:|---|
| `UNLIMITED_MAGNETS` | Imanes ilimitados | $65.000 CLP | Extra, si es compatible y seleccionado |
| `QR` | QR corporativo | $75.000 CLP | Marcado `vatExclusive` |
| `BRANDING` | Branding por cara | $75.000 CLP | `vatExclusive`, mínimo 2 caras |
| `SCRAPBOOK` | Scrapbook | $55.000 CLP | Extra, según compatibilidad/evento |
| `ADDITIONAL_OPERATOR` | Operador adicional | Requiere cotización | No publicar monto |
| `ADDITIONAL_PRINTING` | Impresión adicional | Requiere cotización | No publicar monto |

Compatibilidad registrada en `0037_rc03_booking_experience_restoration.sql`:

- `CLASSIC`, `POLAROID`, `BLACK_STUDIO`, `HASHTAG`, `INSTABOX`: QR, imanes, scrapbook, branding, transporte y horas adicionales.
- `BBOX360`: branding, transporte y horas adicionales.
- `BOOMBALL` y `LIGHTBOX`: transporte.

La inclusión automática de QR/Scrapbook para ciertos tipos de evento existe en reglas de reserva, pero debe presentarse como “incluido según la propuesta/evento” solo cuando el lookup canónico lo confirme. No asumir que aplica a todo servicio.

## 6. Traslado, recargos y disponibilidad

- ORBIT separa tarifa de transporte, recargo de recinto especial y texto libre del lugar.
- Las comunas/reglas de traslado y el recinto reconocido son datos estructurados; `venue` libre no debe generar un recargo por sí solo.
- La configuración histórica de recintos contiene recargos y ha tenido ajustes de datos; por eso BIANCA debe usar el valor devuelto por el lookup actual, no memorizar $35.000 o $50.000.
- La disponibilidad la decide Capacity Engine. BIANCA puede decir que revisará disponibilidad, pero nunca confirmar una fecha antes de una respuesta explícita del sistema.

## 7. Catálogos y links canónicos

ORBIT mantiene estos documentos comerciales activos por categoría:

| Categoría | Ruta canónica |
|---|---|
| Matrimonios / Novios | `https://orbit.boom-box.cl/catalogo/novios` |
| Empresas | `https://orbit.boom-box.cl/catalogo/empresas` |
| Eventos (incluye cumpleaños/graduaciones según quick-send) | `https://orbit.boom-box.cl/catalogo/eventos` |

BIANCA debe solicitar `CATALOG_LOOKUP` y usar el enlace que entregue ORBIT. No debe inventar URLs de BOOMBOX ni sustituir estas rutas por una URL web deducida.

## 8. Inconsistencias, legacy y puntos inciertos

| Hallazgo | Estado | Riesgo | Regla temporal |
|---|---|---|---|
| `Photo IA` aparece en el prompt de BIANCA | **LEGACY/UNCERTAIN** | Puede prometerse un servicio no cotizable | No cotizar ni describir como activo; escalar/revisar catálogo |
| Web habla de “tótems”, KIDS e InstaBox como marketing | **WEB CURRENT MARKETING / NO PRICING AUTHORITY** | Mezclar equipo, formato y servicio | Usar lenguaje de experiencia; consultar `ServiceId` |
| Web no expone matriz pública verificable de precios | **UNCERTAIN** | Respuestas desactualizadas | El precio de ORBIT gana siempre |
| `INSTABOX` y `VIDEO_LOUNGE` existen en ORBIT pero requieren precio oficial | **ORBIT REQUIRES QUOTE** | Inventar un monto | Derivar a cotización oficial |
| Matriz TypeScript y migraciones contienen importes | **CONFIGURATION EVIDENCE/FALLBACK** | Confundir seed con estado vigente | Consultar `commercial_prices` en runtime |
| Precio de hora adicional aparece en lógica de cotización | **LEGACY/FALLBACK A VALIDAR** | Cotizar fuera de tarifa actual | No usar sin lookup comercial explícito |
| Recargos históricos de recintos han cambiado | **LEGACY DATA HISTORY** | Mostrar recargo viejo | Resolver por comuna/recinto actual |

## 9. Reglas canónicas para BIANCA

1. Hablar de **servicios** por nombre comercial, no de equipos como si fueran planes.
2. Preguntar progresivamente tipo de evento, fecha, comuna, lugar, servicio y duración; máximo 1–2 preguntas por turno.
3. Para cualquier precio, duración, extra, transporte o disponibilidad, ejecutar la consulta comercial canónica.
4. No entregar cifras desde memoria conversacional, web o prompt.
5. Para un servicio fijo, no pedir ni inventar duración.
6. Para `REQUIRES_QUOTE`, decir que requiere una cotización oficial y escalar cuando corresponda.
7. Si el cliente menciona “tótem”, aclarar suavemente si busca una experiencia fotográfica y luego mapear al servicio canónico; no mapear automáticamente a `PHOTO_IA`.
8. Si solicita combinación especial, varios días, BTL, branding técnico, descuento o condición fuera de catálogo: `MANUAL_REVIEW` / `HUMAN_REQUIRED`.
9. Nunca confirmar disponibilidad, reserva, pago, descuento o precio sin respuesta confirmada del sistema.
10. Para catálogos, pedir `CATALOG_LOOKUP` por categoría y usar solo el enlace retornado por ORBIT.

## 10. Ejemplos de respuesta natural segura

**Cliente:** “¿Qué tienen para un matrimonio?”  
**BIANCA:** “¡Excelente! Para matrimonio puedo revisar las experiencias vigentes y recomendarte una opción según tu fecha. ¿En qué comuna será el evento?”

**Cliente:** “Quiero un tótem.”  
**BIANCA:** “Claro. Tenemos distintas experiencias fotográficas; para orientarte bien, ¿buscas fotos impresas, una experiencia 360 o algo para compartir digitalmente?”

**Cliente:** “¿Cuánto sale BoomBall?”  
**BIANCA:** “Puedo revisarte el valor vigente de BoomBall. Es una alternativa de precio fijo, así que no necesito inventar una duración. ¿Para qué fecha lo estás pensando?”

**Cliente:** “¿Cuánto cuesta Instabox?”  
**BIANCA:** “Instabox requiere una cotización oficial según el evento. Cuéntame la fecha y la comuna, y lo reviso correctamente.”

**Cliente:** “¿Tienen Photo IA?”  
**BIANCA:** “Déjame revisar eso para darte la información correcta. Si quieres, también puedo mostrarte las experiencias BOOMBOX que están activas para tu evento.”

**Cliente:** “Mándame los planes.”  
**BIANCA:** “Claro. ¿Es para matrimonio, empresa o un evento social? Así te envío el catálogo correcto.” Luego debe ejecutar `CATALOG_LOOKUP` y usar la URL canónica retornada.

## 11. Estado final solicitado

- **WEB AUDIT:** `PASS WITH LIMITATIONS` — páginas públicas consultadas; marketing identificado; no se encontró matriz de precios/duración verificable en HTML público.
- **ORBIT CATALOG AUDIT:** `PASS` — nueve servicios en catálogo canónico; equipos separados de servicios.
- **PRICING SOURCE OF TRUTH:** `commercial_prices` + resolver server-side; `PASS`.
- **TOTEM TERMINOLOGY:** `PASS WITH RULE` — equipo/configuración física, no precio/servicio automático.
- **PHOTO FORMAT KNOWLEDGE:** `PARTIAL / UNCERTAIN` — formatos y equipos físicos aparecen en operaciones/web marketing; no existe servicio canónico `PHOTO_IA`.
- **PLANS LINKS:** `PASS` — `CATALOG_LOOKUP` y rutas `/catalogo/novios`, `/catalogo/empresas`, `/catalogo/eventos`.
- **LEGACY CONTENT IDENTIFIED:** `PASS` — `Photo IA`, precios web no verificables, valores TypeScript/migraciones como evidencia/fallback, y recargos históricos marcados.
- **BIANCA COMMERCIAL KNOWLEDGE:** `READY FOR FOUNDER REVIEW`, no activación ni cambio de automatización incluido.

## 12. Cambios realizados

Solo se añadió este documento de auditoría. No se modificaron archivos de aplicación, migraciones, datos, variables de entorno, deployment ni automatización.
