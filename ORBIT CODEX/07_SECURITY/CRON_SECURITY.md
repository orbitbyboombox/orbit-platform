# Cron Security

La ruta `/api/cron/staff-assignment-reminders` exige `Authorization: Bearer <CRON_SECRET>`. Si la variable falta responde `503`; si la autorización es incorrecta responde `401`. El `User-Agent` nunca concede acceso.

El valor vive en Vercel Production y no se registra. Para verificar seguridad, hacer solo solicitudes no autorizadas y confirmar rechazo; una prueba autorizada puede generar comunicaciones y requiere aprobación operacional.
