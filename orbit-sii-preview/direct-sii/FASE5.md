# ORBIT · Fase 5 · Expediente de certificación SII

**Estado: validación local.** Los documentos del expediente llevan la leyenda «Sin validez tributaria». Los XML se firmaron con certificados y CAF sintéticos para validar las estructuras y las firmas. Para el envío oficial se deben regenerar con los insumos de Maullín. El expediente no ejecuta solicitudes de red.

## Set básico 5205459

Los ocho casos conservan el orden, las glosas y los valores del set. Los montos están en pesos, redondeados a la unidad. El IVA es 19 % sobre el neto afecto. El descuento de devolución conserva las condiciones de las líneas de la factura original.

| Caso | DTE | Control de cumplimiento local | Neto | Exento | IVA | Total |
|---|---:|---|---:|---:|---:|---:|
| 1 | 33 | Cajón 148 × $2.327 y Relleno 63 × $3.847 | $586.757 | $0 | $111.484 | $698.241 |
| 2 | 33 | Pañuelo 521 × $4.086 con 7 % e Ítem 2 458 × $3.143 con 15 %. Descuentos de $149.016 y $215.624 | $3.203.360 | $0 | $608.638 | $3.811.998 |
| 3 | 33 | Dos líneas afectas y una línea por servicio exento de $35.026 | $867.691 | $35.026 | $164.861 | $1.067.578 |
| 4 | 33 | Descuento global de 15 % solo sobre los ítems afectos, equivalente a $234.496 | $1.328.813 | $13.606 | $252.474 | $1.594.893 |
| 5 | 61 | Corrige giro del receptor del caso 1. Referencia código 2, sin efecto monetario | $0 | $0 | $0 | $0 |
| 6 | 61 | Devuelve 191 y 310 unidades del caso 2. Referencia código 3 | $1.553.976 | $0 | $295.255 | $1.849.231 |
| 7 | 61 | Anula íntegramente el caso 3. Referencia código 1, conserva el monto exento | $867.691 | $35.026 | $164.861 | $1.067.578 |
| 8 | 56 | Anula la nota de crédito del caso 5. Referencia código 1, total cero | $0 | $0 | $0 | $0 |

La primera referencia de cada DTE identifica el caso con tipo SET. Las notas incluyen la referencia al documento correspondiente en la segunda línea. Validación local con el esquema EnvioDTE, ocho XML individuales y un sobre consolidado. El sobre contiene ocho firmas de DTE y una de envío. Los doce PDF conservan la diagramación aprobada y tienen timbres sintéticos. Los casos 1 a 4 tienen ejemplar tributario y cedible.

## Libros de prueba

- **Ventas 5205460.** Los ocho documentos del set, agrupados por tipo con sus montos, incluyendo los documentos de monto cero. Folio de notificación 1.
- **Compras 5205461.** Los siete registros del set con folio de notificación 2. La factura 781 lleva IVA de uso común de $5.670, factor 0,60 y crédito de $3.402. La factura 67 lleva IVA no recuperable de $1.962, código 4. La factura de compra 9 lleva retención total de $1.848. Las notas 451 y 211 corresponden a los proveedores de las facturas 234 y 32, respectivamente.
- Ambos usan tipo de libro ESPECIAL, envío TOTAL, mismo período tributario y validación con LibroCV. Los RUT y nombres de contrapartes del expediente son de laboratorio.

## Preparar los insumos de Maullín

1. El representante o firmante autorizado obtiene en Mi SII el número y fecha de resolución para certificación y descarga CAF de **certificación** para los tipos 33 (4 folios), 61 (3 folios) y 56 (1 folio). Registrar el origen y los hashes a partir de esa descarga. Un manifiesto local no demuestra por sí solo la procedencia de un CAF.
2. Montar un directorio de secretos exclusivo del operador en el entorno aislado. Usar permisos 0700 en el directorio y 0600 o 0400 en sus archivos. Incluir `firmante.pfx`, `caf-33.xml`, `caf-56.xml`, `caf-61.xml`, `sii-anchor.pem` y `maullin.json`. El ancla debe corresponder a los CAF descargados del SII.
3. El manifiesto contiene `environment: certification`, `issuer: 76565272-3`, `certificate_sha256` (huella SHA-256 del certificado DER), `anchor_sha256` (hash del PEM) y `caf_sha256` con los hashes exactos de los archivos y claves de tipo 33, 56 y 61. Ejecutar `python direct-sii/cert_credentials.py RUTA_PRIVADA`. La contraseña se ingresa por terminal. El comando verifica identidad, vigencia, archivos y llaves y muestra únicamente vencimiento y rangos.
4. Antes de la corrida oficial, configurar RUT del firmante autorizado, cuatro receptores existentes y distintos, proveedores válidos, fecha de emisión, resolución de certificación y folios de prueba libres. Confirmar giro, domicilio y unidad tributaria vigentes en Mi SII. El generador entregado usa datos y firmas locales; la prevalidación de credenciales queda separada de la firma oficial.
5. Tras la firma oficial en el entorno aislado, comprobar XML, PDF y lectura impresa. Solo entonces proceder al envío autorizado en certificación. Mantener el registro de folios y acuses separado de producción.

## Reproducir el expediente

Instalar los requisitos fijados del motor y las dependencias actuales de PDF del proyecto. Desde `orbit-sii-preview`, ejecutar `python direct-sii/certification_samples.py RUTA_NUEVA` con `ORBIT_XSD_DTE` apuntando a `EnvioDTE_v10.xsd` y `ORBIT_XSD_IECV` a `LibroCV_v10.xsd`. Mantener los XSD auxiliares de cada ZIP en su directorio. El comando no usa credenciales reales.

- [Instrucciones oficiales para el set de pruebas](https://www.sii.cl/servicios_online/docs/inst_set_pruebas.pdf)
- [Formato DTE](https://www.sii.cl/factura_electronica/formato_dte.pdf)
- [Formato IECV](https://www.sii.cl/factura_electronica/formato_iecv.pdf)
- [XSD DTE](https://www.sii.cl/factura_electronica/factura_mercado/schema_dte.zip) y [XSD IECV](https://www.sii.cl/factura_electronica/schema_iecv.zip)
