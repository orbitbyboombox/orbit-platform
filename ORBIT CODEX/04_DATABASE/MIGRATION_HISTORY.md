# Migration History

Fuente autoritativa: `supabase/migrations/`. Production y local fueron verificados alineados hasta `0117` durante RC-100. Los identificadores `0034` y `0066` no tienen archivo; no deben rellenarse retroactivamente.

| Nº | Archivo / finalidad |
|---|---|
| 0001 | `production_backbone` — esquema operativo base |
| 0002 | `timeline_production_cutover` — Timeline productiva |
| 0003 | `staff_production_cutover` — Staff productivo |
| 0004 | `profit_production_cutover` — Profit snapshots |
| 0005 | `supply_production_cutover` — suministros |
| 0006 | `google_workspace_oauth` — conexión OAuth |
| 0007 | `production_quotation_engine` — cotizaciones/precios |
| 0008 | `founders_beta_finalization` — activos y beta Founder |
| 0009 | `operational_payroll_engine` — payroll operacional |
| 0010 | `staff_import` — importación Staff |
| 0011 | `equipment_assignment_workflow` — equipos |
| 0012 | `digital_signature_workflow` — firma digital |
| 0013 | `staff_capability_model` — capacidades Staff |
| 0014 | `negotiated_pricing_engine` — precios negociados |
| 0015 | `master_data_center` — Master Data |
| 0016 | `customer_experience_portal` — Portal Cliente |
| 0017 | `task_center` — tareas |
| 0018 | `company_settings` — configuración empresarial |
| 0019 | `portal_authentication_v2` — autenticación portales |
| 0020 | `experience_review_engine` — revisión de experiencia |
| 0021 | `system_health_center` — salud del sistema |
| 0022 | `notification_center` — notificaciones |
| 0023 | `notification_classification_backfill` — clasificación histórica |
| 0024 | `accounts_receivable_center` — CxC |
| 0025 | `event_operations_checklist` — checklist |
| 0026 | `smart_venue_master_data` — venues |
| 0027 | `correct_casona_canaveral_venue` — corrección venue |
| 0028 | `equipment_operation_center` — operación equipos |
| 0029 | `initial_fleet` — flota |
| 0030 | `route_cost_engine` — rutas y combustible |
| 0031 | `staff_operation_center` — centro Staff |
| 0032 | `staff_assignment_center` — asignaciones |
| 0033 | `staff_payments` — pagos Staff iniciales |
| 0035 | `automatic_booking_engine` — reserva automática |
| 0036 | `rc01_service_duration_master_data` — duraciones |
| 0037 | `rc03_booking_experience_restoration` — experiencia reserva |
| 0038 | `cost_master_engine` — Cost Master |
| 0039 | `cost_master_history_hardening` — historial Cost Master |
| 0040 | `staff_intelligence_engine` — inteligencia Staff |
| 0041 | `rc16_master_business_rules` — reglas BOOMBOX |
| 0042 | `orbit_module_manager` — módulos |
| 0043 | `financial_single_source_of_truth` — Financial Truth |
| 0044 | `automatic_estimated_cost_engine` — costos estimados |
| 0045 | `data_lifecycle_engine` — ciclo de datos |
| 0046 | `real_cost_override_engine` — override costo real |
| 0047 | `event_profitability_engine` — rentabilidad |
| 0048 | `workforce_cost_engine` — costo personal |
| 0049 | `business_truth_engine` — Business Truth |
| 0050 | `manual_reservation_atomic_core` — reserva manual atómica |
| 0051 | `go_live_production_initialization` — inicialización Production |
| 0052 | `event_operation_cost_engine` — costos evento |
| 0053 | `founder_workspace_experience` — Workspace Founder |
| 0054 | `crm_customer_first_foundation` — CRM Customer First |
| 0055 | `manual_reservation_crm_lookup` — lookup CRM |
| 0056 | `reservation_execution_diagnostics` — diagnóstico reserva |
| 0057 | `founder_notification_engine` — notificación Founder |
| 0058 | `operation_pipeline_unification` — pipeline operacional |
| 0059 | `operation_pipeline_service_actor` — actor del pipeline |
| 0060 | `go_live_smart_cleanup` — limpieza controlada |
| 0061 | `smart_cleanup_service_preview` — preview limpieza |
| 0062 | `smart_cleanup_crm_identity` — identidad CRM |
| 0063 | `smart_cleanup_service_execution` — ejecución limpieza |
| 0064 | `smart_cleanup_immutable_records` — registros protegidos |
| 0065 | `smart_cleanup_financial_baseline` — baseline financiero |
| 0067 | `commercial_negotiation_engine` — negociación comercial |
| 0068 | `crm_profile_stability` — estabilidad CRM |
| 0069 | `founder_event_view_customization` — vista Event |
| 0070 | `crm_event_management_integrity` — integridad Event |
| 0071 | `payment_management_engine` — movimientos de pago |
| 0072 | `financial_record_integrity` — estados financieros |
| 0073 | `reservation_transaction_idempotency` — idempotencia |
| 0074 | `unified_reservation_pipeline` — pipeline único |
| 0075 | `rc_final_p0_reservation_correction` — primer intento |
| 0076 | `rc_final_p0_reservation_records` — persistencia reserva |
| 0077 | `rc27_crm_events_experience` — CRM/Events UX |
| 0078 | `customers_operational_center` — Customer Center |
| 0079 | `customer_payment_movement_management` — editar movimientos |
| 0080 | `customer_payment_ledger` — ledger cliente |
| 0081 | `customer_module_certification` — documentos CRM |
| 0082 | `customer_module_final_certification` — edición Event |
| 0083 | `customer_profile_calendar_portal_completion` — Calendar/Portal |
| 0084 | `rc29_personal_workspace_engine` — Workspace global |
| 0085 | `rc30_staff_operation_center` — liquidaciones Staff |
| 0086 | `rc30_operations_center` — Operations Center |
| 0087 | `rc30a_event_assignment_center` — asignación Event |
| 0088 | `rc30b_staff_portal` — Portal Staff |
| 0089 | `rc30a1_staff_operation_correction` — gastos Staff/Event |
| 0090 | `rc30b_staff_request_workflow` — solicitudes Staff |
| 0091 | `rc30b1_staff_portal_activation` — activación Portal |
| 0092 | `event_settlement_single_source` — settlement canónico |
| 0093 | `official_staff_payment_table` — tabla oficial pagos |
| 0094 | `event_settlement_confirmation_sync` — sincronización settlement |
| 0095 | `staff_financial_migration` — retiro modelo mensual legacy |
| 0096 | `staff_payroll_accounting_month` — mes contable |
| 0097 | `staff_settlement_adjustments` — ajustes/reembolsos |
| 0098 | `rc30d_staff_onboarding` — onboarding |
| 0099 | `rc30d1_staff_publication_security` — publicación segura |
| 0100 | `rc31g_banking_reconciliation` — banca/reconciliación |
| 0101 | `rc_stability_01_core` — invitaciones y estabilidad |
| 0102 | `rc52a_boombox_academy` — Academy |
| 0103 | `rc52b_staff_assignment_lifecycle` — cancelaciones |
| 0104 | `rc52_2_smart_assignment_experience` — aceptación/aprobación |
| 0105 | `rc52_2_staff_approval_permissions` — grants aprobación |
| 0106 | `rc52_2_timeline_canonical_correlation` — idempotencia Timeline |
| 0107 | `rc52_2_timeline_boundary` — Timeline Boundary B |
| 0108 | `rc52_4_staff_cancellation_boundary` — cancelación Boundary B |
| 0109 | `rc52_5_staff_cancellation_recovery` — alertas y recuperación |
| 0110 | `rc52_5_canonical_cancellation_adapters` — cancelación única |
| 0111 | `rc_cost_01_branding_cost_master` — Branding por cara |
| 0112 | `rc_cost_01_historical_branding_snapshot` — snapshot histórico |
| 0113 | `rc_cost_01_branding_quantity_recovery` — cantidad Branding |
| 0114 | `rc_profitability_tax_truth` — IVA/retención en margen |
| 0115 | `staff_cancellation_founder_response` — canal operacional |
| 0116 | `founder_external_notification_email` — inbox externo Founder |
| 0117 | `rc99_final_stabilization` — ledger, Boundary B y seguridad |
