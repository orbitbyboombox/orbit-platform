# Portal Architecture

Portal Cliente y Portal Staff son superficies separadas del Founder. Cada una usa autenticación y sesiones propias en `portal_access_sessions`, con auditoría en `portal_access_attempts`.

- Portal Cliente: información vigente, documentos, contrato, datos bancarios y carga de comprobantes.
- Portal Staff: oportunidades publicadas, asignaciones confirmadas, información operacional, documentos autorizados, checklist, check-in y Academy.

La sincronización del portal no implica notificación. Staff no accede a datos comerciales ni financieros del cliente.
