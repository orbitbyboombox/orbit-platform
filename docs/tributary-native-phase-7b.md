# ORBIT · Fase 7B · Guía de despacho y estado de integración

La rama parte del commit 8344e9e. Conserva el set 5205459, los libros 5205460 y 5205461 y el comportamiento de los DTE anteriores. El cambio agrega un borrador de guía de despacho **52 · Otros traslados sin venta** en la aplicación ORBIT y una variante del motor XML. No se modifica el sitio productivo.

## Guía 52

- El enlace de un viaje previsto en Logística de Event 360° abre su formulario tributario con ese viaje seleccionado. El administrador identifica receptor, transportista y comuna y confirma qué equipos asignados al evento viajan. Los registros incorporan la patente y el chofer registrado, además de origen y destino del viaje. El flujo se limita a vehículos y choferes registrados.
- El esquema privado mantiene una intención por viaje. La repetición exacta devuelve la misma intención. Los equipos ajenos, duplicados y los cambios sobre una intención existente requieren corrección explícita y quedan bloqueados en este flujo. No se asignan folios ni se graban ingresos.
- El motor admite XML 52 con traslado sin venta, equipamiento sin precio, transporte y total cero. La prueba usa CAF y certificados sintéticos. El PDF reutiliza el renderizador corporativo, los tres logotipos aprobados y la leyenda «Sin validez tributaria». Se agrega un bloque de transporte a la representación de la guía.
- La opción `--include-dispatch` del precontrol de credenciales verifica un CAF 52 adicional cuando existe. El set básico anterior no lo requiere. Este control no asigna ni consume rangos.

## Validación y despliegue

Se probó el motor con los XSD oficiales y las firmas sintéticas, y el registro con PostgreSQL desechable. La copia Supabase consultada aún no expone `vehicle_trips`; se debe verificar su estado y aplicar la migración nativa de logística correspondiente en una copia sancionada antes de aplicar `supabase/phase7/02_dispatch_preview.sql`. Ambos cambios deben probarse primero con datos sintéticos.

La conexión de Vercel solo muestra `orbit-platform-v1`, el proyecto productivo. El intento anterior de crear el proyecto privado devolvió 403. El checkout Git completo no estuvo disponible desde el ejecutor y no hubo compilación integral ni acceso a una instancia privada de navegador.

Siguen pendientes la conexión nativa para firma y emisión, el almacenamiento definitivo de DTE, los correos con PDF y XML, la importación histórica y la validación de respaldo, restauración y conciliación. El motor 52 es comprobable fuera de la red fiscal. La activación futura implica revisar destinatario, giro, tratamiento, documento original cuando corresponda y pruebas oficiales aplicables, con CAF propio del tipo y ambiente.

El 1104 sigue siendo el último folio informado, pendiente de conciliación. El 2000 sigue condicionado al rango autorizado por el SII. No se reservan, consumen ni anulan folios desde estas rutas.

- [Formato DTE SII, especificaciones 2026](https://www.sii.cl/factura_electronica/factura_mercado/formato_dte_202602.pdf)
- [Resolución SII 154](https://www.sii.cl/normativa_legislacion/resoluciones/2025/reso154.pdf)
