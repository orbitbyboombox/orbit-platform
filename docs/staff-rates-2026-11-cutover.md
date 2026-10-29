# Tarifario Staff — vigencia 2026-11-01

Estado: especificación de implementación; NO desplegado.

## Reglas confirmadas
- Fecha de corte: fecha local del evento en America/Santiago, NO fecha de publicación, liquidación o pago.
- Eventos hasta 2026-10-31 inclusive: tarifas originales, sin modificación retroactiva.
- Eventos desde 2026-11-01: operación de 2 h CLP 20.000; cada hora adicional CLP 5.000, sin máximo comercial.
- Montaje CLP 10.000; desmontaje CLP 10.000; ambos CLP 20.000.
- No alterar anticipos, movilidad, estacionamiento, reembolsos, boletas, pagos cerrados ni overrides manuales.
- Publicaciones anticipadas de eventos de noviembre deben mostrar las tarifas nuevas.

## Puntos de integración identificados en producción
- public.refresh_staff_event_payment: usa cost_master_entries por código OPERATOR_N_HOURS, ASSEMBLY, DISASSEMBLY.
- public.refresh_staff_block_payment: usa cost_master_entries por duración de bloque.
- public.resolve_staff_operator_rate: restringe 120..600 minutos.
- public.apply_combined_staff_rate: invoca refresh_staff_event_payment.
- public.recalculate_event_staff_settlement y vistas de liquidación mensual: verificar antes de cambiar.
- features/operations/staff-assignment-payment.ts: lector de tarifas globales.
- event_staff_payments: campos automatic_*, original_*, override_* y settlement_status.
- event_staff_block_costs y staff_monthly_payroll: proyección financiera.
- event_staff_payments.contracted_hours: comprobar restricción de 2..10 vigente antes de permitir horas ilimitadas.

## Requisitos previos al merge
1. Inventariar todos los consumidores de cost_master_entries y las fechas oficiales de proyectos y bloques.
2. Versionar la resolución de tarifas por fecha local de evento sin cambiar entradas históricas.
3. Aplicar la misma función de resolución en cálculos por evento, bloques, vista Staff y liquidaciones.
4. Proteger pagos PAID/FINALIZED, overrides y snapshots históricos.
5. Probar 2026-10-31 y 2026-11-01; publicación previa al evento; cierre posterior; 2,3,4,5,10,11 horas; montaje, desmontaje y ambos.
6. Revisar plan de rollback, CI y Preview antes de producción.

NO ejecutar actualización masiva de costos históricos.
