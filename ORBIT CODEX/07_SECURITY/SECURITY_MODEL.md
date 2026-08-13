# Security Model

ORBIT aplica defensa por capas: Supabase Auth para administración, sesiones específicas para portales, RLS en datos, RPCs con grants mínimos, módulos server-only para service role, Storage privado, rutas autorizadas, secrets en Vercel/Supabase, bloqueo Staff por intentos y auditoría.

Los efectos externos se ejecutan después del commit canónico. Logs y diagnósticos nunca deben incluir tokens, PINs, RUT completo innecesario ni valores de variables sensibles.
