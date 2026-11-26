# ORBIT · Laboratorio tributario, fase 2

Vista previa autónoma de Finanzas y Event 360°. Solo usa tres eventos comerciales ficticios. Los tipos admitidos son factura 33, boleta 39 y nota de crédito total 61. Los archivos se marcan como simulados y el XML utiliza un esquema interno sin firma fiscal.

El adaptador de demostración implementa `submit` y `lookup`. El gateway reserva una sola intención por venta o nota, y una sola identidad de folio en el laboratorio. El arrendamiento transaccional permite conciliar un intento vencido y evita que una respuesta antigua sobrescriba otra. Los resultados inciertos conservan el folio. Los artefactos cifrados se leen mediante sesión administrativa y dejan un registro de auditoría. El laboratorio utiliza únicamente el esquema aislado `orbit_sii_phase2_qa` del proyecto de pruebas. No existe ninguna dependencia de pagos, Gmail ni SII.

## Desarrollo

- `npm install` y `npm test` ejecutan las pruebas de dominio, recuperación, protección y formatos.
- Worker de despliegue: agrupar `worker.js` como ESM con los loaders de texto para HTML, CSS y JS de la interfaz. El servidor acepta `QA_ADMIN_PASSWORD`, `QA_GATEWAY_SECRET` y `QA_SUPABASE_ANON_KEY` solo como secretos de entorno.
- El archivo `database/sandbox.sql` está destinado al proyecto de pruebas. El hash SHA-256 del secreto de gateway se registra por separado en la tabla privada del laboratorio, sin almacenar la clave en Git.
- La interfaz comercial del laboratorio usa los mismos conceptos de cotización, cliente, evento, traslado, descuento, neto e IVA de ORBIT. La futura conexión al Event 360° real requiere un repositorio de lectura de cotizaciones y la autorización del piloto.

## OpenFactura, ambiente de desarrollo

`OpenFacturaSandbox` se ejecuta por separado. Proporciónale la API key pública de pruebas y un DTE de las empresas demo de la colección oficial. La URL de desarrollo y la lista de emisores demo están fijadas en el adaptador. Emplea un identificador duradero por operación. Una respuesta OF-06 se concilia consultando el token original, sin crear otra intención. La ventana del proveedor es de 24 horas. La unicidad local debe persistir más allá de esa ventana y un resultado ambiguo exige conciliación antes de cualquier reenvío.

Los estados del sandbox describen el proveedor. La recepción ante SII requiere evidencia independiente y nunca se infiere por la existencia de PDF, folio o timbre. El módulo web conserva el simulador y los datos fiscales de prueba. La activación real requiere selección y autorización del proveedor, expediente tributario y pruebas en certificación.
