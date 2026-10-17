# ORBIT — Reparación urgente de navegación de Eventos

## Problema reportado (10-10-2026)
Al abrir un evento, los menús y pantallas son confusos, algunas acciones conducen a secciones equivocadas y el usuario no encuentra el correo premium **«Próximo a tu evento»**.

## Implementación requerida
1. Localizar el componente real de listado/detalle de eventos y los menús relacionados. Auditar rutas, estados de modales, scroll y overlays en escritorio y móvil. No adivinar rutas.
2. Mostrar al abrir cada evento cuatro acciones primarias: **Enviar correos**, **Pagos**, **Operación**, **Documentos**. Conservar el resto en «Más opciones» sin borrar funciones.
3. En **Enviar correos**, destacar **«Próximo a tu evento»** con previsualización, destinatario visible y confirmación explícita antes del envío manual. Reutilizar la plantilla premium existente; no recrearla ni modificar el diseño negro/blanco validado.
4. Mantener la automatización de 10 días antes del evento; evitar dobles envíos mediante idempotencia y trazabilidad, sin disparar correos retroactivos masivos. Permitir envíos manuales solo bajo confirmación.
5. Corregir menús pegados, overlays que no se cierran, scroll del fondo bajo menú y enlaces que conducen a módulos incorrectos.
6. Ningún cambio destructivo en contratos, cotizaciones, pagos, costos, staff, inventario ni eventos. Mantener permisos y validaciones de envío existentes.
7. Agregar pruebas de navegación, cierre de menús, acceso a correo, previsualización y confirmación de envío; ejecutar lint, typecheck, tests y build.
8. Crear PR con evidencias y resultados. **No desplegar Preview ni Production automáticamente**; no enviar emails reales durante pruebas. Respaldar conforme a procedimiento existente.

## Criterios de aceptación
- Abrir evento -> «Próximo a tu evento» en máximo dos clics.
- Menú se cierra al elegir acción, fuera del menú o con Escape, según accesibilidad.
- En móvil no hay scroll horizontal ni superposición permanente.
- No se envía correo sin confirmación ni se duplica por automatización.
- Se conservan todos los datos y operaciones previas.

## Estado
Esta orden no equivale a implementación ni despliegue. Debe ejecutarse sobre los componentes reales y verificarse antes de fusionar.
