# ORBIT v1.0 — Architecture Improvement Report

Este documento registra hallazgos. Ninguna recomendación de este informe fue implementada durante RC-1.

## Prioridad crítica

### 1. Activo oficial ausente

El sistema de branding depende de PNG anteriores y de reglas de recorte CSS para generar variantes horizontales e isotype. Incorporar el archivo oficial original y validar sus dimensiones antes del Final Audit.

### 2. Contrato firmado sin infraestructura documental

La firma vive solamente en estado React y el modelo PDF contiene placeholders. Falta un contrato de `SignedDocumentRepository`, una representación inmutable de firma, auditoría de aceptación y orquestación PDF → Drive → Gmail → Timeline.

### 3. Conectores productivos sin persistencia

Calendar, Drive, Gmail y Communication Hub utilizan contratos o repositorios en memoria. Antes de producción deben existir adaptadores persistentes, idempotencia durable, retry controlado y observabilidad.

## Prioridad alta

### 4. Modelos de proyecto duplicados

Existen modelos de Project orientados a dominio y modelos específicos de presentación/mock. Esto aumenta el riesgo de traducciones inconsistentes de estado, salud y etapa comercial.

### 5. Mapeos visuales repetidos

Estados, etiquetas, variantes de badges y formatos monetarios se declaran en múltiples componentes. Conviene centralizar solamente presentación compartida, sin mover reglas de negocio fuera de sus motores.

### 6. Settings concentra demasiadas experiencias

Connection Center, Calendar, Drive, Gmail y Communication Hub están apilados en una sola página. La navegación secundaria dentro de Settings mejoraría descubribilidad sin crear módulos de negocio nuevos.

### 7. Estado mock embebido en componentes

Varias experiencias mezclan datos de demostración con composición visual. Una capa uniforme de fixtures facilitaría auditorías y pruebas sin convertir mocks en persistencia.

## Prioridad media

### 8. Time Intelligence aún no cubre toda presentación temporal

Los countdowns principales fueron centralizados, pero permanecen etiquetas de fecha preformateadas en fixtures operacionales. Conviene distinguir explícitamente datos ISO de etiquetas de presentación.

### 9. Contrato de actualización de Customer Memory

NOVA consume actualizaciones normalizadas, pero el output público deliberadamente no devuelve memoria mutada. La futura capa de aplicación debe definir transacción atómica entre memoria, conversación y timeline.

### 10. Communication Hub necesita correlación durable

La correlación existe en memoria. Para canales reales se requiere deduplicación por message ID externo, ordering, delivery receipts y resolución de concurrencia durante human handoff.

### 11. Accesibilidad de timelines extensos

Las vistas cronológicas son legibles visualmente, pero deberían incorporar navegación por regiones, filtros no destructivos y anuncios de cambios para tecnologías asistivas.

## Simplificación futura

- Unificar fixtures bajo una convención `data/mock-*`.
- Compartir presentadores de estados sin mezclar lógica de dominio.
- Crear un contrato común de `ExternalSyncRecord` para estados operacionales similares, manteniendo adaptadores separados.
- Normalizar fechas ISO en inputs y reservar textos localizados para la capa de presentación.
- Definir una navegación secundaria escalable para Settings.
