# ORBIT v1.0 — Release Candidate RC-2

## Estado ejecutivo

RC-2 mejora la honestidad operacional y prepara contratos de producción sin implementar persistencia, autorización ni integraciones externas. La arquitectura permanece congelada y los motores de negocio no fueron modificados.

El activo maestro `public/branding/ORBIT V1-0 SINFONDO.png` es ahora la única referencia visual. Login, shell, Sidebar, Portal, PDF, Gmail y superficies de conectores consumen la misma ruta sin recortes, recoloración ni variantes generadas.

**Recomendación:** GO para validación interna con datos simulados. NO GO para operación real hasta resolver los riesgos críticos descritos al final.

## Arquitectura actualizada

Se incorporaron contratos aditivos en la capa compartida `types/`:

- `ProductionDataState`: distingue Real, Estimado, Preparado, Pendiente, Datos simulados y Demostración.
- `AuditMetadata`, `ApprovalMetadata` y `AuditEvent`: preparan autoría, timestamps, razones e identificadores inmutables.
- `PersistenceRepository`, `AppendOnlyEventRepository` y `PersistenceContractRegistry`: preparan Customer, Project, Timeline, Assignment, Calendar Sync, Drive Sync, Expense, Supply, Profit y Staff.
- `OrbitRole` y `PermissionPolicy`: preparan Administrador, Operaciones, Staff, Ventas, Cliente y Solo lectura.
- `SignedAgreementRecord` y `SignatureEvidence`: preparan Firma → PDF firmado → Drive → Gmail → Timeline sin fingir persistencia.
- `CustomerProfileProjection`: mantiene Customer independiente de Project y reúne proyectos, historial y comunicación como vista relacional.

No se agregó infraestructura, base de datos, autenticación por rol ni lógica de negocio.

## Estados productivos

- El shell interno declara globalmente que los datos de negocio visibles son simulados y no persistidos.
- Dashboard dejó de presentar conectores preparados como salud productiva verificada.
- Workspace distingue presupuesto estimado, contrato simulado y abonos no confirmados.
- Finanzas distingue estimado, simulado y no contable.
- Calendar, Drive, Gmail, Centro de Conexiones y Centro de Comunicaciones declaran su estado de demostración.
- Los estados técnicos continúan disponibles para validar UX, pero no se presentan como evidencia externa real.

## UX y operación

- Centro de Comando prioriza resumen crítico, próximo evento, recomendación y trabajo de hoy.
- Capacidad, mantenimiento, plan operacional y horizontes futuros usan divulgación progresiva para reducir desplazamiento.
- Staff incorpora búsqueda por nombre, rol y disponibilidad.
- El contenido deja espacio inferior en Mobile y el panel flotante respeta el área segura.
- Etiquetas estructurales y de comunicación visibles fueron normalizadas al español.

## Google Calendar

La plantilla conserva cliente, servicio, duración, llamada, montaje, inicio, término, desmontaje, dirección, Maps, contacto, Black Box, cabina, vehículo, extras, ORBIT Event ID y acceso a ORBIT.

El pago del operador se representa únicamente como estado operacional configurable (`Pendiente`, `Confirmado` o `No aplica`). El monto permanece excluido para cumplir la prohibición de exponer costos internos.

## Google Drive

La estrategia final permanece:

```text
BOOMBOX ORBIT/
├── CLIENTES/
├── CONTABILIDAD/
├── STAFF/
├── OPERACIONES/
├── ACTIVOS/
├── DOCUMENTACIÓN/
├── REPORTES/
└── SISTEMA/
```

Las rutas se determinan por contrato y no existe selección manual de destino.

## Riesgos de producción pendientes

### Críticos

1. No existe persistencia para entidades ni acciones.
2. Los roles son contratos; no existe enforcement de autorización.
3. Firma, PDF, Drive, Gmail y Timeline no forman todavía una transacción durable.
4. Calendar, Drive, Gmail y Communication Hub no tienen adaptadores productivos, idempotencia durable, retries ni observabilidad.

### Altos

1. Falta repositorio de auditoría append-only.
2. Falta recuperación ante fallos y conflictos de versión.
3. Customer Profile es un contrato de proyección, no una lectura persistida.
4. Los datos sensibles de Staff requieren políticas aplicadas por servidor.
5. Las métricas financieras siguen siendo estimaciones con fixtures.

### Medios

1. Settings necesita navegación secundaria al crecer el contenido.
2. Los estados visuales compartidos deberían alimentarse desde respuestas de infraestructura cuando esta exista.
3. Las vistas operativas extensas necesitan filtros persistentes y preferencias por rol.

## Confirmación de arquitectura

- Business Core continúa como fuente única de reglas comerciales.
- Time Intelligence continúa como fuente temporal.
- Project State Machine continúa como autoridad de estado.
- Operations Gate continúa como punto único de confirmación.
- Communication Hub continúa como frontera única de canales.
- ORBIT continúa siendo fuente de verdad frente a Google.
- RC-2 solo añade contratos y presentación honesta de estado.

## Recomendación final

- **GO:** pruebas internas, QA, validación de experiencia y certificación de arquitectura con información simulada.
- **NO GO:** clientes reales, pagos, contratos legales, asignaciones de Staff o sincronización externa hasta implementar los contratos productivos.
