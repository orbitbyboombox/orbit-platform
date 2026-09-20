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

**Photo IA** es una oferta comercial vigente confirmada por Founder. No está normalizada todavía como `ServiceId`, por lo que queda como oferta activa con registro canónico pendiente; no se crea migración ni código en esta fase.

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

### Oferta vigente pendiente de normalización

| Oferta | Configuración comercial vigente | Precio autorizado | Estado de registro |
|---|---|---:|---|
| **Photo IA** | 2 horas o hasta 100 fotos IA | $500.000 CLP | `CURRENT` · oferta activa · `ServiceId` pendiente |
| **Photo IA adicional** | 1 hora o 50 fotos IA adicionales | $190.000 CLP | `CURRENT` · adicional autorizado · `ServiceId`/extra pendiente |

Estos importes provienen de la instrucción comercial Founder de esta auditoría. Hasta que exista una fila canónica normalizada, BIANCA puede explicar que Photo IA está disponible, pero debe obtener precio/condición mediante una fuente comercial autorizada o escalar a revisión; no debe inventar códigos internos ni escribir una tarifa desde memoria.

### Regla de pricing

`resolveServicePrice()` primero busca una fila con `rules.fixed === true`. Para ella usa `unit_price`, devuelve `pricingMode = FIXED` y no exige `duration_hours`. Si no es fija, exige una fila con `duration_hours` igual a la duración solicitada y devuelve `pricingMode = DURATION`. La ausencia de precio debe producir `SERVICE_PRICE_UNAVAILABLE`, nunca una tarifa inventada.

Por lo tanto, BIANCA debe explicar BoomBall como servicio de precio fijo solo después de `COMMERCIAL_LOOKUP`; no debe inventar horas ni convertirlo en un extra.

## 4. Tótem, formatos y planes

La terminología canónica queda fijada así:

- **Tótem:** equipo/experiencia física BOOMBOX.
- **Formato de foto:** resultado de fotografía/impresión y su configuración.
- **Plan:** combinación comercial de duración, formato y prestaciones.

No decir “tenemos varios tipos de tótem” como si fueran productos independientes. BIANCA debe hablar de un tótem fotográfico y luego descubrir qué formato, duración, impresión y complementos necesita el cliente.

### Formatos identificados en fuentes disponibles

| Formato | Medida | N° fotos | N° impresiones | Servicio/plan asociado | Estado | Fuente |
|---|---|---|---|---|---|---|
| Classic | 5 × 15 cm | 3 fotografías por sesión | 2 impresiones por sesión | Classic | `CURRENT` — evidencia de landing pública | [`boombox-totem-fotografico.html`](boombox-totem-fotografico.html), sección `#formatos` |
| Polaroid | 7,5 × 10 cm | No especificado en la fuente | 2 impresiones por sesión | Polaroid | `CURRENT` — evidencia de landing pública | [`boombox-totem-fotografico.html`](boombox-totem-fotografico.html), sección `#formatos` |

No se identificaron de forma verificable otros formatos de medida/número de impresiones en las fuentes auditadas. QR, diseño personalizado, branding, scrapbook e imanes son prestaciones/extras, no nuevas medidas de fotografía. La tabla no reemplaza una cotización: las reglas de precio y duración siguen viniendo de `commercial_prices`.

### Eventos y planes

| Contexto | Catálogo que debe solicitar BIANCA | URL Production |
|---|---|---|
| Matrimonio / novios | `WEDDINGS` | `https://orbit.boom-box.cl/catalogo/novios` |
| Empresa / activación estándar | `COMPANIES` | `https://orbit.boom-box.cl/catalogo/empresas` |
| Cumpleaños, graduación y evento social/general | `EVENTS` | `https://orbit.boom-box.cl/catalogo/eventos` |

La web pública describe experiencias y tipos de evento, pero si contradice un valor o condición de ORBIT, prevalecen el catálogo activo y el pricing server-side. BIANCA debe pedir `CATALOG_LOOKUP` y usar el documento/link que retorne ORBIT.

## 5. Equipos físicos vs. servicios

Los siguientes nombres aparecen como configuración operacional/equipo, no como líneas comerciales independientes:

- `WHITE_TOTEM` → “Tótem blanco”;
- `BLACK_TOTEM` → “Tótem negro”;
- `BBOX360_PLATFORM` → “Plataforma 360”;
- `IA43_INTEGRATED` → “Tótem IA 43”;
- tipos de asset como `TOTEM`, `CLASSIC_TOTEM`, `BLACK_STUDIO`, `BBOX360`, `LIGHTBOX`, `BOOMBALL`, `PRINTER`, `CAMERA` y accesorios.

**Regla para BIANCA:** “tótem”, “plataforma”, impresora o cámara describen montaje/equipamiento cuando provienen de operaciones. No deben transformarse automáticamente en un servicio, precio o plan. La pregunta comercial debe resolverse por el `ServiceId` activo.

## 6. Extras, impresión, QR y personalización

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

## 7. Traslado, recargos y disponibilidad

- ORBIT separa tarifa de transporte, recargo de recinto especial y texto libre del lugar.
- Las comunas/reglas de traslado y el recinto reconocido son datos estructurados; `venue` libre no debe generar un recargo por sí solo.
- La configuración histórica de recintos contiene recargos y ha tenido ajustes de datos; por eso BIANCA debe usar el valor devuelto por el lookup actual, no memorizar $35.000 o $50.000.
- La disponibilidad la decide Capacity Engine. BIANCA puede decir que revisará disponibilidad, pero nunca confirmar una fecha antes de una respuesta explícita del sistema.

## 8. Catálogos y links canónicos

ORBIT mantiene estos documentos comerciales activos por categoría:

| Categoría | Ruta canónica |
|---|---|
| Matrimonios / Novios | `https://orbit.boom-box.cl/catalogo/novios` |
| Empresas | `https://orbit.boom-box.cl/catalogo/empresas` |
| Eventos (incluye cumpleaños/graduaciones según quick-send) | `https://orbit.boom-box.cl/catalogo/eventos` |

BIANCA debe solicitar `CATALOG_LOOKUP` y usar el enlace que entregue ORBIT. No debe inventar URLs de BOOMBOX ni sustituir estas rutas por una URL web deducida.

## 9. Inconsistencias, legacy y puntos inciertos

| Hallazgo | Estado | Riesgo | Regla temporal |
|---|---|---|---|
| `Photo IA` aún no existe como `ServiceId` | **CURRENT OFFER / NOT NORMALIZED** | Puede perderse el control si se trata como servicio normal | Puede describirse como oferta vigente; precio/condición requieren fuente Founder autorizada hasta normalización |
| Web habla de “tótems”, KIDS e InstaBox como marketing | **WEB CURRENT MARKETING / NO PRICING AUTHORITY** | Mezclar equipo, formato y servicio | Usar lenguaje de experiencia; consultar `ServiceId` |
| Web no expone matriz pública verificable de precios | **UNCERTAIN** | Respuestas desactualizadas | El precio de ORBIT gana siempre |
| `INSTABOX` y `VIDEO_LOUNGE` existen en ORBIT pero requieren precio oficial | **ORBIT REQUIRES QUOTE** | Inventar un monto | Derivar a cotización oficial |
| Matriz TypeScript y migraciones contienen importes | **CONFIGURATION EVIDENCE/FALLBACK** | Confundir seed con estado vigente | Consultar `commercial_prices` en runtime |
| Precio de hora adicional aparece en lógica de cotización | **LEGACY/FALLBACK A VALIDAR** | Cotizar fuera de tarifa actual | No usar sin lookup comercial explícito |
| Recargos históricos de recintos han cambiado | **LEGACY DATA HISTORY** | Mostrar recargo viejo | Resolver por comuna/recinto actual |

## 10. Reglas canónicas para BIANCA

1. Hablar de **servicios** por nombre comercial, no de equipos como si fueran planes.
2. Preguntar progresivamente tipo de evento, fecha, comuna, lugar, servicio y duración; máximo 1–2 preguntas por turno.
3. Para cualquier precio, duración, extra, transporte o disponibilidad, ejecutar la consulta comercial canónica.
4. No entregar cifras desde memoria conversacional, web o prompt.
5. Para un servicio fijo, no pedir ni inventar duración.
6. Para `REQUIRES_QUOTE`, decir que requiere una cotización oficial y escalar cuando corresponda.
7. Si el cliente menciona “tótem”, aclarar suavemente si busca una experiencia fotográfica y luego mapear al servicio canónico; no asumir `Photo IA` salvo que la solicite explícitamente.
8. Si solicita combinación especial, varios días, BTL, branding técnico, descuento o condición fuera de catálogo: `MANUAL_REVIEW` / `HUMAN_REQUIRED`.
9. Nunca confirmar disponibilidad, reserva, pago, descuento o precio sin respuesta confirmada del sistema.
10. Para catálogos, pedir `CATALOG_LOOKUP` por categoría y usar solo el enlace retornado por ORBIT.

## 11. Ejemplos de respuesta natural segura

**Cliente:** “¿Qué tienen para un matrimonio?”  
**BIANCA:** “¡Excelente! Para matrimonio puedo revisar las experiencias vigentes y recomendarte una opción según tu fecha. ¿En qué comuna será el evento?”

**Cliente:** “Quiero un tótem.”  
**BIANCA:** “Claro. Tenemos distintas experiencias fotográficas; para orientarte bien, ¿buscas fotos impresas, una experiencia 360 o algo para compartir digitalmente?”

**Cliente:** “¿Cuánto sale BoomBall?”  
**BIANCA:** “Puedo revisarte el valor vigente de BoomBall. Es una alternativa de precio fijo, así que no necesito inventar una duración. ¿Para qué fecha lo estás pensando?”

**Cliente:** “¿Cuánto cuesta Instabox?”  
**BIANCA:** “Instabox requiere una cotización oficial según el evento. Cuéntame la fecha y la comuna, y lo reviso correctamente.”

**Cliente:** “¿Tienen Photo IA?”  
**BIANCA:** “Sí, Photo IA está disponible. Puedo revisar la configuración que mejor calza con tu evento y confirmar el valor vigente. ¿Para qué fecha y tipo de evento la estás pensando?”

**Cliente:** “Mándame los planes.”  
**BIANCA:** “Claro. ¿Es para matrimonio, empresa o un evento social? Así te envío el catálogo correcto.” Luego debe ejecutar `CATALOG_LOOKUP` y usar la URL canónica retornada.

## 12. Estado final solicitado

- **WEB AUDIT:** `PASS` — páginas públicas y landing de formatos auditadas; marketing, formato y límites de evidencia quedaron separados de pricing.
- **ORBIT CATALOG AUDIT:** `PASS` — nueve servicios en catálogo canónico; equipos separados de servicios.
- **PRICING SOURCE OF TRUTH:** `commercial_prices` + resolver server-side; `PASS`.
- **TOTEM TERMINOLOGY:** `PASS` — un tótem como equipo/experiencia; formato y plan como conceptos comerciales separados.
- **PHOTO FORMAT KNOWLEDGE:** `PASS` — Classic 5×15 cm y Polaroid 7,5×10 cm identificados con impresiones/fotos solo donde la fuente lo especifica; no se inventaron otros formatos.
- **PLANS LINKS:** `PASS` — `CATALOG_LOOKUP` y rutas `/catalogo/novios`, `/catalogo/empresas`, `/catalogo/eventos`.
- **PHOTO IA CLASSIFICATION:** `PASS` — oferta vigente Founder, 2 h/100 fotos IA $500.000; adicional 1 h/50 fotos $190.000; registro canónico pendiente.
- **LEGACY CONTENT IDENTIFIED:** `PASS` — valores web no verificables, valores TypeScript/migraciones como evidencia/fallback y recargos históricos marcados; ningún contenido legacy se usa como autoridad.
- **GAPS REMAINING:** solo normalización futura de Photo IA como servicio/extra canónico y eventual confirmación documental de formatos adicionales no presentes en las fuentes auditadas. No bloquea el conocimiento comercial actual, pero sí requiere decisión de modelado Founder antes de persistirlo.
- **BIANCA COMMERCIAL KNOWLEDGE:** `READY FOR FOUNDER REVIEW`, no activación ni cambio de automatización incluido.

### Resultado canónico

```text
WEB AUDIT = PASS
ORBIT CATALOG AUDIT = PASS
PRICING SOURCE OF TRUTH = PASS
TOTEM TERMINOLOGY = PASS
PHOTO FORMAT KNOWLEDGE = PASS
PLANS LINKS = PASS
PHOTO IA CLASSIFICATION = PASS
LEGACY CONTENT IDENTIFIED = PASS
```

## 13. Cambios realizados

Solo se añadió este documento de auditoría. No se modificaron archivos de aplicación, migraciones, datos, variables de entorno, deployment ni automatización.
