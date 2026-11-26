# ORBIT · Finanzas Tributarias · Fase 6

## Abrir la vista previa

La vista previa aislada usa dos eventos, clientes y correos sintéticos, su propia base local y el motor y plantilla aprobados. No lee la base de ORBIT, no usa Maullín y no envía correos.

1. Descomprimir el paquete. Requiere Python 3.11 o superior, Node.js 22 o superior y acceso al registro de dependencias en la primera ejecución.
2. En la carpeta extraída, ejecutar `bash iniciar.sh`. El comando prepara las dependencias y abre un servidor en `http://127.0.0.1:8765`. Abrir esa dirección en el navegador.
3. Ingresar como `laboratorio` con la contraseña que muestra esa terminal. Es una contraseña local de prueba. Mantener la terminal abierta.
4. Abrir Event 360°, crear un borrador y revisar el PDF. Aprobar y emitir la simulación. Tras la aceptación simulada se pueden descargar XML y PDF, preparar el correo, crear una nota vinculada o generar un código de consulta para una boleta. El portal acepta el código como texto.
5. Si se ejecuta desde el repositorio, instalar las dependencias y configurar las rutas de `ORBIT_XSD_DTE` y `ORBIT_XSD_BOLETA` con los XSD oficiales y sus archivos auxiliares. Ejecutar `python direct-sii/run_finance_lab.py`.

## Validación de laboratorio

| Área | Resultado |
|---|---|
| Documento | 33, 39, 61 y 56 recorrieron borrador, PDF, aprobación, emisión simulada, XML validado por XSD y aceptación simulada. |
| Event 360°, clientes y cobranzas | El borrador toma una copia de los campos comerciales ficticios. Los documentos aceptados alteran el saldo simulado según tipo y signo. |
| Permisos | Acceso de laboratorio obligatorio, rechazo de POST sin CSRF y bloqueo de descarga privada sin autenticación. La consulta pública entrega solo PDF de boleta aceptada con código aleatorio válido. |
| Duplicidad | Una venta tributaria por evento en este laboratorio, una nota por referencia y tipo, un registro de correo de prueba por documento y folios únicos por tipo. Reintentar emisión no consume otro folio. |
| Archivos | XML y PDF cifrados con AES-GCM. El código de boleta se guarda como hash y se rota sin conservar el código anterior. |
| Históricos | Inventario de prueba por tipo, folio y SHA-256. La reimportación exacta es idempotente. La importación de archivos históricos auténticos y su retención quedan pendientes. |
| Respaldo | Copia consistente SQLite, comprobación de integridad y lectura del inventario de documentos al abrir la copia en laboratorio. La clave se conserva fuera del respaldo. |
| Rendimiento de una corrida local | Panel frío 13 ms. PDF previo 248–370 ms. Emisión simulada 631–762 ms. No representa rendimiento ni carga del despliegue futuro. |

El lanzador concilia simulaciones en un trabajo local cada cinco segundos. Las acciones de auditoría quedan en la base privada del laboratorio. Los registros de envíos reales, estados SII y autenticación por rol deben usar el servicio aislado de certificación, no el servidor de laboratorio.

## Antes de certificar en Maullín

- Habilitar un servicio independiente con TLS y una base exclusiva. Reutilizar la cuenta Vercel y el proyecto Supabase de pruebas solo tras verificar que el servidor de firma, roles, secretos, respaldos y API estén aislados de producción. El laboratorio SQLite sirve para revisar el flujo. El registro PostgreSQL de fases anteriores es la base candidata de certificación y su integración con este flujo aún necesita validación.
- Conectar repositorios de lectura de Event 360°, clientes, cotizaciones y Finanzas mediante un adaptador propio. Mapear roles administrativos, permisos por registro y la política de separación de aprobación y emisión. Luego verificar el alta contable y la conciliación de cobros con pruebas en un proyecto de datos separado.
- Confirmar en Mi SII los datos del emisor, resolución de certificación, firmante autorizado, clientes existentes y contrapartes válidas. Obtener CAF de prueba por tipo. Instalar el PFX y los CAF en un directorio privado con permisos restrictivos y usar la prevalidación de `cert_credentials.py`. La contraseña se ingresa por terminal. Conectar la llave y el CAF aprobados al servicio de firma, sin incorporarlos a Git, logs ni respaldos de aplicación.
- Regenerar con fecha, folios y firma de certificación el set 5205459, sus libros 5205460 y 5205461 y las pruebas aplicables de boleta. Verificar físicamente los timbres. Validar envíos, respuestas por documento, reparos y casos de resultado incierto en Maullín. Configurar el trabajo de conciliación con persistencia y alertas, después de validar el mapeo de respuestas oficiales.
- Habilitar un buzón de QA para los correos premium y probar el portal bajo TLS con límites de solicitudes. Probar recuperación de respaldos cifrados con claves custodiadas por separado e importar una muestra histórica validada sin generar ingresos ni cuentas por cobrar duplicadas.

## Antes de activar producción

- Confirmar la autorización del SII por tipo y el inventario vigente de folios emitidos, anulados y disponibles en el sistema actual. El 1104 es el último folio informado por el usuario, pendiente de conciliación.
- Solicitar confirmación del rango futuro al SII. **2000 se acepta en la planificación solo si pertenece a un CAF productivo autorizado y supera el último folio conciliado.** El planificador no reserva ni consume folios. El laboratorio solamente puede usar sus rangos sintéticos 101–109.
- Validar aislamiento de credenciales y series por ambiente y tipo, bloqueo de concurrencia con el software vigente, monitoreo, permisos y rendimiento con datos de prueba. Confirmar corte con contador y representante legal antes de habilitar la emisión productiva. La fase 6 no cambia la operación de ORBIT v2.1.8.

## Fuentes SII

- [Cambio a software de desarrollo propio](https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_6529.htm)
- [Instructivo de emisión DTE](https://www.sii.cl/factura_electronica/factura_mercado/instructivo_emision.pdf)
- [Instrucciones del set de pruebas](https://www.sii.cl/servicios_online/docs/inst_set_pruebas.pdf)
