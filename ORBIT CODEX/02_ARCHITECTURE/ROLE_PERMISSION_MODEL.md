# Role and Permission Model

| Rol | Alcance |
|---|---|
| Founder / CEO | Control administrativo completo y decisiones explícitas |
| Administrator | Capacidades concedidas por permisos y Module Manager |
| Sales / Operations | Ámbito funcional autorizado |
| Staff | Solo sus eventos e información operacional |
| Customer | Solo su portal, evento y documentos autorizados |

RLS y RPCs validan identidad; las interfaces no reemplazan autorización. Customer no se elimina. Staff nunca ve finanzas comerciales. Finance y Dashboard son superficies de lectura. Los documentos privados usan autorización y URLs firmadas cuando corresponde.
