# ORBIT Finanzas v2.1.5 — Etapa 2: contrato de diseño (NO-GO para despliegue)

## Alcance
Documento de implementación, no migración ni fuente de verdad de movimientos. La Etapa 1 (ledger canónico, PR #170) es dependencia; no modificarla en esta rama sin revisión. PR #169 (conciliación staff/costos) es independiente y NO-GO.

## Categorías maestras (exactamente seis)
1. **Personal y operación**: operadores, supervisores, montaje, desmontaje, capacitación, viáticos, reembolsos.
2. **Insumos y producción**: papel fotográfico, consumibles de impresora, pilas, doble contacto, álbumes/libros, imanes, utilería.
3. **Transporte y vehículos**: combustible, TAG, peajes, estacionamientos, mantenciones, traslados.
4. **Oficina y administración**: telefonía, internet, suscripciones, papelería, honorarios administrativos.
5. **Equipos y mantenimiento**: cámaras, impresoras, flashes, computadores, reparaciones.
6. **Comercial y marketing**: Google Ads, Meta Ads, web, SEO, branding, comisiones comerciales.

Las subcategorías son configuraciones internas; no crear una categoría maestra por cada artículo.

## Semántica contable obligatoria
- Separar **gasto reconocido**, **salida real de caja**, **compromiso por pagar** y **consumo de inventario**. Cada KPI declara su base temporal.
- Una compra de papel pagada genera una sola salida de caja; su consumo en eventos afecta costo de evento/inventario, **nunca una segunda salida de caja**.
- Registrar referencias estables al documento original y movimiento origen; evitar tablas o pipelines paralelos si ya existe una fuente canónica.
- Reembolsos, adelantos, liquidaciones y ajustes de Staff no se deben sumar dos veces. Respetar estados finales y movimientos reversados.
- Preservar compras y pagos históricos, eventos $0/regalo, impuestos/IVA, notas de crédito, anulaciones, pagos parciales y devoluciones.
- Gastos compartidos/no asociados a evento: centro de costo general; no forzar atribución a un evento.
- Distinguir costo directo de evento y gasto operativo general; utilidad de evento y utilidad empresarial son indicadores distintos.
- Facturas/boletas y fotos de comprobantes: vincular referencias a almacenamiento existente, no duplicar binarios.
- Para cualquier movimiento editable: auditoría de usuario, fecha, motivo y referencia a origen; reversar, no borrar transacciones contabilizadas.

## Modelo funcional mínimo (propuesta; validar contra esquema real)
- Registro de gasto: id, origen, referencia_origen, fecha_documento, fecha_pago, proveedor/beneficiario, descripción, categoría, subcategoría, centro_costo, evento_opcional, importe_neto, IVA, total, estado, medio_pago, comprobante_ref, moneda.
- Registro de compra: documento y proveedor, ítems, cantidades, costo unitario, impuesto, estado recepción, estado pago, referencias a inventario y gasto/caja.
- Movimiento inventario: artículo, cantidad firmada, unidad, fecha, origen_compra/consumo/ajuste, evento_opcional, referencia_origen; costo unitario de valorización documentado.
- Indicadores: ventas, cobrado, por cobrar, gasto final, utilidad, saldo caja; cada indicador con fórmula explícita, período y filtros.

## Orden de implementación seguro
1. Inventariar tablas, vistas, RPC, pantallas y flujos existentes de gastos, compras, papel, Staff, eventos, Caja, Drive/Storage. Entregar mapa de fuentes de verdad y matriz de doble conteo.
2. Construir catálogo puro de seis categorías con subcategorías y pruebas, sin escribir datos ni migrar.
3. Implementar adaptadores de lectura para gastos/compras existentes, con estados REVIEW_REQUIRED ante ambigüedad.
4. Mostrar desgloses por categoría y centro de costo con pruebas de sumas y reversas.
5. Solo tras validación y autorización explícita, diseñar escrituras/migraciones idempotentes si faltan capacidades.

## Casos de prueba bloqueantes
- Compra de papel $100.000 pagada; consumo de parte del papel: caja -$100.000 una vez, costo de eventos según unidades consumidas.
- Dos pagos legítimos del mismo monto no se descartan.
- Reverso/nota de crédito y devolución no inflan ventas, cobrado ni gastos.
- Staff con adelanto + liquidación + reembolso no se contabiliza dos veces.
- Gasto compartido sin evento y evento gratuito ($0) se representan correctamente.
- Factura con IVA y pago parcial mantiene neto/impuesto/total, por pagar y caja consistentes.
- Gastos por TAG, combustible y viáticos no se mezclan automáticamente con ingresos por traslado.

## Puertas de seguridad
- No modificar Supabase, Vercel, producción, pagos ni datos históricos en fase de diseño.
- No fusionar PR #169/#170 ni esta rama automáticamente.
- CI con instalación frozen, TypeScript, ESLint, tests y build; reconciliación de datos reales solo lectura antes de cualquier GO.
- Cualquier discrepancia => NO-GO y reporte con identificadores y montos (sin correcciones automáticas).
