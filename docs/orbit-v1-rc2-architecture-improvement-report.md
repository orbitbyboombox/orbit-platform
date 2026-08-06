# ORBIT v1.0 RC-2 — Architecture Improvement Report

Este informe registra oportunidades posteriores. Ninguna recomendación arquitectónica fue implementada durante RC-2.

## Riesgos críticos antes de producción real

1. Implementar adaptadores persistentes para los contratos de Customer, Project, Timeline, Assignment, Calendar Sync, Drive Sync, Expense, Supply, Profit y Staff.
2. Aplicar las políticas de permisos en servidor y auditar cada denegación relevante.
3. Orquestar Firma → PDF firmado → Drive → Gmail → Timeline con idempotencia, compensación y registro append-only.
4. Proveer OAuth durable, refresh tokens, retries y observabilidad para Google Workspace.
5. Separar inequívocamente fixtures de datos productivos también en las fuentes de datos, no solamente en presentación.

## Observaciones altas

- Customer Profile necesita un lector persistido y una estrategia de actualización consistente con Project y Communication Hub.
- Los modelos de Project orientados a dominio y presentación deben converger mediante mappers explícitos antes de conectar repositorios.
- Communication Hub requiere correlación por identificador externo, deduplicación, ordering y ownership durable durante traspasos humanos.
- El historial de auditoría necesita almacenamiento inmutable y retención definida.
- Los datos personales y tarifas de Staff requieren vistas filtradas por rol.

## Oportunidades UX

- Settings debería incorporar navegación secundaria cuando las integraciones sean reales.
- Centro de Comando puede recordar qué paneles secundarios prefiere cada rol.
- Staff debería ofrecer una vista móvil de jornada que oculte información administrativa innecesaria.
- Finanzas necesita filtros y comparación estimado versus confirmado cuando existan datos persistidos.
- Los indicadores productivos deberían incluir fuente y fecha de verificación de forma consistente.

## Branding

`ORBIT V1-0 SINFONDO.png` es el único activo oficial. Las variantes e isotype anteriores fueron retiradas de las referencias y del árbol de activos. Si en el futuro se requiere un favicon cuadrado, debe ser aprobado como un nuevo activo oficial; no debe recortarse automáticamente el PNG maestro.

## Confirmación

RC-2 no modificó Business Core, Project State Machine, Operations Intelligence, Profit Engine, Time Intelligence, Customer Memory, NOVA ni reglas de negocio.
