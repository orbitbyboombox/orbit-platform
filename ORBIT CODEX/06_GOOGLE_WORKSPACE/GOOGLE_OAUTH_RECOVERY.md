# Google OAuth Recovery

```mermaid
flowchart TD
  A[Connection status CONNECTED?] -->|No| B[Revisar registro y autorización]
  A -->|Sí| C[Token vigente?]
  C -->|No| D[Refresh funciona?]
  D -->|No| E[Client ID correcto?]
  E --> F[Secret existe en Vercel?]
  F --> G[Redirect URI exacto?]
  G --> H[Scopes concedidos?]
  H --> I[APIs habilitadas en Google Cloud?]
  D -->|Sí| J[Probar APIs read-only]
  C -->|Sí| J
```

Registrar status HTTP y timestamps sin tokens. `401` después de refresh indica credencial/consentimiento; `403` suele indicar scope, API o policy. Solo reconectar después de agotar verificaciones read-only. No rotar ni eliminar los dos secretos OAuth existentes sin una decisión separada y plan de rollback.
