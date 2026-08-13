# Codex Master Context

ORBIT es la plataforma operativa inteligente de BOOMBOX, empresa de eventos. Centraliza CRM, Events, reservas, documentos, pagos, Staff, operaciones, costos y Finance. Founder: Matías Maira. Product Director: ChatGPT. Engineering execution: Codex. Modelo: sprint por sprint.

Stack: Next.js 15/React 19/TypeScript/Tailwind en Vercel; Supabase PostgreSQL/Auth/Storage; Google Workspace Gmail/Calendar/Drive. Production: `orbit.boom-box.cl`. Baseline: tag `orbit-v1.0-certified`, SHA `c7b5f706…`.

Reglas inviolables: leer `docs/orbit-constitution.md`; un Pipeline de Reserva; Customer permanente/Event operacional; Payment Ledger por movimientos; Event Settlement como verdad Staff; Finance/Dashboard read-only; recalculación automática; comunicación Customer solo por acción Founder; Workspace persistente; datos activos únicamente; clientes protegidos nunca se recrean/eliminan.

Estado: ORBIT v1.0 CERTIFIED, P0/P1 = 0. Deuda v1.0.1 está en Roadmap y no debe mezclarse con incidentes. Antes de una función importante se revisa arquitectura; después se valida técnicamente y el Founder certifica operacionalmente. Los módulos certificados están congelados salvo bugs críticos.

Nunca incluir secretos en prompts, commits, logs o respuestas. Antes de Database/Production, identificar impacto, rollback, datos protegidos y Boundary B.
