# ORBIT · Motor propio SII · Fase 3B

## Alcance y arquitectura

Motor inicial separado del laboratorio web y de ORBIT productivo. La vista de pruebas conserva su simulador. La misma plantilla BOOMBOX puede imprimir un PDF417 sintético con el TED del XML de prueba. El flujo objetivo es:

1. Event 360° o Finanzas aprueba una intención inmutable y su alcance comercial.
2. Un servicio privado reserva el folio en el rango CAF del emisor, tipo y ambiente. Construye el XML, firma TED, documento y sobre, valida el XSD y fija los bytes exactos.
3. El adaptador de certificación obtiene semilla y token, envía el sobre y registra Track ID. Los tipos 33 y 61 usan WS SOAP y carga multipart; el 39 usa REST. El Track ID indica recepción del envío. Para cerrar un documento se exige evidencia de estado de ese DTE.
4. Una pérdida de respuesta deja el envío bloqueado para conciliación. El operador coteja el historial SII cuando falta Track ID. Se conserva la identidad y los bytes de la intención; nunca se inicia un segundo POST automático.
5. La consulta de boletas usa un token aleatorio por documento aceptado. El prototipo devuelve folio, fecha y total. El portal público aún debe entregar el PDF mediante un enlace protegido y revocable, con límites de acceso y política de retención. No publicar XML ni permitir búsqueda masiva por folio.

`motor.py` implementa 33 afecto, 39 afecta y 61 de anulación total con referencia. Incluye deducción global, validación de CAF contra ancla suministrada, verificación de las dos firmas XML, verificación de firma del TED, conservación de sus bytes y validación XSD local. `registro.py` protege la intención, la porción de venta y el folio con restricciones únicas en SQLite y reclama el envío antes de llamar a la red. `transporte.py` prepara los contratos de certificación. El transporte saliente está cerrado por defecto y el perfil de producción está deshabilitado. Las respuestas del adaptador se prueban con fixtures, sin iniciar sesión ante el SII.

SQLite es una herramienta de prueba. Para desplegar, sustituirlo por PostgreSQL privado con transacciones y reserva por emisor/tipo/ambiente, permitir estados terminales únicamente por evidencia adjunta, y registrar token de trabajo, Track ID, respuesta cifrada y auditoría. Mantener bases, usuarios, redes, respaldos, certificados y CAF separados entre certificación y producción. Guardar llaves bajo control del firmante en una bóveda, y pinzar anclas públicas de CAF por IDK. Autorizar por rol y exigir aprobación humana antes de habilitar producción. Mantener separadas las credenciales de certificado y CAF. Usar respaldos comprobados, retención del XML de boletas conforme al SII y alertas de folio/expiración.

## Comprobación fuera de línea

Instalar las dependencias fijadas de Python y, desde `orbit-sii-preview`, los paquetes Node del laboratorio y del subdirectorio `direct-sii`. Descargar y descomprimir los [XSD de DTE](https://www.sii.cl/factura_electronica/factura_mercado/schema_dte.zip) y los [XSD de boleta](https://www.sii.cl/factura_electronica/factura_mercado/schema_envio_bol.zip) en directorios distintos. Esquemas comprobados: `EnvioDTE_v10.xsd` y `EnvioBOLETA_v11.xsd`. Los imports relativos se resuelven localmente.

```sh
python -m pip install -r direct-sii/requirements.txt
npm install
npm install --prefix direct-sii
mkdir -p /tmp/orbit-sii-samples
ORBIT_SYNTHETIC_SAMPLES=/tmp/orbit-sii-samples \
ORBIT_XSD_DTE=/ruta/dte/EnvioDTE_v10.xsd \
ORBIT_XSD_BOLETA=/ruta/boleta/EnvioBOLETA_v11.xsd \
python -m unittest discover -s direct-sii -v
node direct-sii/pdf417.mjs /tmp/orbit-sii-samples/33.json /tmp/orbit-sii-samples/33.pdf
```

Repetir el render para 39 y 61. El script acepta exclusivamente el emisor sintético del fixture y la plantilla marca los PDF sin validez. La verificación de lectura con un escáner y las muestras impresas oficiales siguen pendientes.

## Iniciar la certificación

1. El representante legal comprueba en Mi SII el RUT emisor, los datos fiscales vigentes, los tipos ya autorizados, el estado de habilitación para software propio y el modelo de boleta declarado. Registra o confirma los usuarios firmantes, de envío y de folios. Si el contribuyente ya es emisor autorizado, entra al ambiente de certificación y genera los sets que correspondan según la guía de cambio de software.
2. Para DTE 33/61, descargar el set asignado y los CAF de certificación por tipo. Cargar certificado de un firmante habilitado mediante un canal seguro. Confirmar llave pública SII para cada IDK, fecha/número de resolución del ambiente y especificaciones WSDL. Ejecutar set asignado, simulación, intercambio y muestras impresas, incluida la representación cedible cuando aplique a la factura. Verificar rechazo y observaciones además de aceptación.
3. Para 39, solicitar el set de boleta como representante legal. Seguir el correo vigente del SII para folios de prueba, XML, reporte de consumo/resumen de ventas que solicite, consulta web y solicitud de revisión por Track ID. Completar cobertura de estado por documento, consulta pública y verificación del PDF417 con lectura física. El formato oficial contempla disponibilidad para clientes durante tres meses y conservación del XML durante seis años.
4. Conciliar en certificación cada folio y cada referencia contra el historial SII. Probar error de firma, CAF agotado o vencido, ausencia de Track ID y reinicio durante un envío. Verificar vigencia/custodia de la llave y evitar que un timeout autorice otra emisión. Cerrar evidencia técnica y declarar cumplimiento conforme al flujo de cada familia.
5. Validar registro o habilitación como emisor, ambiente y resolución antes de configurar credenciales y CAF productivos. La activación exige una fase autorizada separada.

Fuentes: [SII certificación DTE](https://www.sii.cl/factura_electronica/factura_mercado/proceso_certificacion.htm) · [SII cambio de software](https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_6529.htm) · [SII certificación boletas](https://www.sii.cl/servicios_online/1039-guia_emitir_boleta_servicio-1184.html) · [SII instructivo TED](https://www.sii.cl/factura_electronica/factura_mercado/instructivo_emision.pdf) · [SII autenticación SOAP](https://www.sii.cl/factura_electronica/autenticacion.pdf) · [SII formato vigente de boletas](https://www.sii.cl/factura_electronica/factura_mercado/formato_boleta_electronica.pdf).

## Costos de referencia

- Usar dos workers aislados en instancias Linux AWS Lightsail desde USD 5 mensuales cada una, y dos proyectos Micro de Supabase desde USD 35 mensuales en una organización Pro nueva (USD 25 con un Micro cubierto + USD 10 adicional). Base de referencia desde **USD 45 al mes**. Con una organización Pro ya contratada y el crédito consumido, dos Micro adicionales y dos workers partirían de **USD 30 incrementales**. No incluye impuestos, región, bóveda, respaldos de retención extendida, almacenamiento, red ni observabilidad.
- Certificado tributario anual publicado desde **CLP 7.990 + IVA** por firmante en una oferta comercial, sujeto a compatibilidad y vigencia. Si ya existe un certificado vigente y utilizable, ese gasto puede quedar cubierto.
- Mantenimiento estimado, no tarifa contratada: **4–8 horas al mes** como presupuesto inicial para monitoreo, rotación de secretos, control de folios, revisión del XSD y conciliación. La preparación de sets, corrección de rechazos de certificación y operación de incidentes se presupuestan aparte.

Fuentes: [AWS Lightsail](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html) · [Supabase precios](https://supabase.com/pricing) · [Certificadora del Sur](https://shoppingcart.certificadoradelsur.cl/shoppingcart/fes.jsp) · [Entidades reconocidas por el SII](https://www.sii.cl/preguntas_frecuentes/clave_secr_repr_electr/001_100_0579.htm).
