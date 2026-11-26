# ORBIT · Integración tributaria nativa, fase 7

La rama parte de 365a25f e incorpora una ruta de la aplicación Next.js real, bajo el AppShell de ORBIT. El acceso desde menú, Event 360°, perfil de cliente y cobranzas queda detrás de la configuración de vista previa. Las preferencias de Founder Workspace se conservan. No se cambian los ledgers, los KPI, la reserva, las cuentas por cobrar ni los documentos existentes.

## Alcance comprobado

- Los RPC PostgreSQL comprobados en una instancia local desechable comienzan apagados. Requieren sesión CEO o ADMINISTRATOR y registran al actor de cada transición. Los esquemas privados deniegan acceso directo.
- La intención 33 o 39 toma el snapshot comercial aceptado e inmutable, exige que el cliente coincida y es idempotente para el mismo evento y tipo. Aprobar aquí solo cambia la intención de prueba. Se pueden vincular intenciones 61 y 56 para revisar referencias internas, sin folio fiscal.
- El PDF de intención 33 o 39 usa el renderizador corporativo previo y los logos aprobados. Se permite cuando las líneas completas, el IVA y el total cuadran con la cotización. Los casos sin desglose determinable devuelven una respuesta de revisión fiscal.
- El archivo consulta los DTE externos existentes del evento por medio de la sesión de ORBIT y el punto de descarga vigente. No hay escritura ni importación de esos registros.
- El último folio informado es 1104. No se conciliaron folios en producción. El objetivo 2000 queda condicionado a un CAF autorizado que lo incluya y a un corte conciliado. Esta ruta no tiene asignador ni operación de emisión.

## Configuración y pendientes

La creación del proyecto Vercel separado fue rechazada por permisos. La ruta no se publicó. Para abrir una vista privada hace falta un proyecto habilitado para despliegue privado, un Supabase exclusivo con una copia sanitizada y una sesión administrativa de prueba. Configurar ORBIT_ENVIRONMENT=preview, ORBIT_TRIBUTARY_PREVIEW=true, NEXT_PUBLIC_ORBIT_TRIBUTARY_PREVIEW=true y ORBIT_TRIBUTARY_ISOLATED_PROJECT_REF con el ref de la copia. Aplicar manualmente supabase/phase7/01_native_preview.sql solo allí y habilitar su interruptor después de probar roles y permisos.

Quedan por revisar el build íntegro, los flujos en navegador y los snapshots comerciales en la copia. La rama preserva el motor XML, el registro CAF, el precontrol PFX, los timbres y la conciliación de fases anteriores. Falta cablear ese motor al flujo nativo por un servicio aislado, incorporar las variantes fiscales de cotización, completar el archivo e importación con validación, preparar el correo premium con PDF y XML, y validar el respaldo y restauración en PostgreSQL. La conexión física a Maullín, los certificados y CAF de prueba y la autorización del SII siguen siendo pasos separados.
