# Google Workspace Architecture

ORBIT usa un OAuth Client web del proyecto Google Cloud **ORBIT Production**. La conexión singleton guarda tokens únicamente en Supabase; el Client ID, Client Secret y Redirect URI viven en Vercel. El backend renueva el access token con el refresh token y opera Gmail, Calendar y Drive según scopes concedidos.

Calendar y Drive son efectos posteriores al commit canónico. Gmail de cliente solo se usa por acción explícita; las notificaciones internas siguen su política operativa. System Health muestra conexión, scopes y actividad sin exponer credenciales.
