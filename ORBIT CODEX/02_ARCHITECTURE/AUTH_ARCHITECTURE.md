# Authentication Architecture

Founder y administradores usan Supabase Auth y sesiones protegidas por middleware. Portal Cliente autentica RUT + fecha del evento mediante RPC y sesión propia hasheada. Portal Staff autentica RUT + PIN/password mediante RPC, registra intentos, aplica bloqueo temporal y crea sesiones privadas. Onboarding usa tokens de invitación de duración limitada.

Los clientes de servidor con service role solo existen en código server-only. El navegador recibe únicamente credenciales publicables. Las rutas de documentos verifican sesión/propiedad antes de entregar contenido. Cron exige `Authorization: Bearer` con `CRON_SECRET`; no acepta User-Agent como identidad.
