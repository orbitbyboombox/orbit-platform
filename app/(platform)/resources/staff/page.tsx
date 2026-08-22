import { createSupabaseServerClient } from "@/lib/supabase/server";
import { StaffOperationCenter } from "@/features/resources/staff-operation-center";
import type { StaffOperationalRecord } from "@/features/resources/staff-operation-center.actions";
import {
  StaffPaymentsCenter,
  type StaffPaymentEvent,
  type StaffPaymentMonth,
} from "@/features/staff-payments";
import { StaffPinReset } from "@/features/portal-authentication/staff-pin-reset";
import { StaffWorkspaces } from "@/features/resources/staff-workspaces";
import {
  StaffOperationsView,
  type StaffOperationsEvent,
  type StaffOperationsRequest,
} from "@/features/resources/staff-operations-view";
import {
  StaffOnboardingCenter,
  type StaffOnboardingInvitation,
} from "@/features/staff-onboarding/staff-onboarding-center";
import { AcademyManager } from "@/features/academy/academy-manager";
import {
  loadAcademyArticles,
  loadAcademyStats,
} from "@/features/academy/repository";
import type {
  StaffDocumentCategory,
  StaffDocumentView,
} from "@/features/staff-documents/staff-document-model";

export default async function StaffManagementPage() {
  const client = await createSupabaseServerClient();
  const [
    { data: staff, error: staffError },
    { data: assignments, error: assignmentError },
    { data: history, error: historyError },
    { data: audit, error: auditError },
    { data: vehicles, error: vehicleError },
    { data: projects, error: projectError },
    { data: publications, error: publicationError },
    { data: requests, error: requestError },
    { data: onboarding, error: onboardingError },
    { data: staffDocuments, error: staffDocumentsError },
    { data: staffExpenseDocuments, error: staffExpenseDocumentsError },
  ] = await Promise.all([
    client
      .from("staff")
      .select(
        "id,version,first_name,last_name,rut,phone,email,role,capabilities,status,bank,account_type,account_number,emergency_contact,portal_enabled,pin_updated_at,portal_password_change_required,portal_invitation_sent_at",
      )
      .is("deleted_at", null)
      .order("last_name"),
    client
      .from("assignments")
      .select(
        "id,staff_id,project_id,assignment_type,status,resources,arrival_time,start_time,finish_time,assigned_vehicle,projects!inner(name,project_type,event_date),operational_assets(asset_code)",
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    client
      .from("timeline_events")
      .select("id,staff_id,event_type,human_message,occurred_at")
      .not("staff_id", "is", null)
      .order("occurred_at", { ascending: false })
      .limit(500),
    client
      .from("audit_events")
      .select("id,entity_id,action,occurred_at")
      .eq("entity_type", "staff")
      .order("occurred_at", { ascending: false })
      .limit(500),
    client
      .from("vehicle_profiles")
      .select("asset_id,model,operational_assets!inner(status,deleted_at)")
      .is("operational_assets.deleted_at", null)
      .eq("operational_assets.status", "AVAILABLE")
      .order("model"),
    client
      .from("projects")
      .select(
        "id,name,project_type,status,event_date,customer_id,customers(full_name),project_services(service_code)",
      )
      .is("deleted_at", null)
      .order("event_date"),
    client.from("staff_event_publications").select("project_id,published"),
    client
      .from("staff_assignment_requests")
      .select(
        "id,project_id,responsibility,status,staff(first_name,last_name),projects(name,event_date)",
      )
      .eq("status", "PENDING")
      .order("requested_at"),
    client
      .from("staff_onboarding_invitations")
      .select(
        "id,first_name,last_name,email,mobile,status,submitted_at,review_notes,submitted_data,staff_onboarding_documents(id,document_type,file_name)",
      )
      .order("created_at", { ascending: false }),
    client
      .from("staff_onboarding_documents")
      .select(
        "id,staff_id,document_type,category,file_name,friendly_label,created_at,applicable_month,status",
      )
      .not("staff_id", "is", null)
      .order("created_at", { ascending: false }),
    client
      .from("staff_expense_submissions")
      .select(
        "staff_id,document_id,description,occurred_on,status,submitted_at",
      )
      .not("document_id", "is", null)
      .order("submitted_at", { ascending: false }),
  ]);
  if (staffError) throw staffError;
  if (assignmentError) throw assignmentError;
  if (historyError) throw historyError;
  if (auditError) throw auditError;
  if (vehicleError) throw vehicleError;
  if (projectError) throw projectError;
  if (publicationError) throw publicationError;
  if (requestError) throw requestError;
  if (onboardingError) throw onboardingError;
  if (staffDocumentsError) throw staffDocumentsError;
  if (staffExpenseDocumentsError) throw staffExpenseDocumentsError;
  const { data: expenseDocumentMetadata, error: expenseDocumentMetadataError } =
    await client
      .from("documents")
      .select("id,original_filename,created_at")
      .in(
        "id",
        (staffExpenseDocuments ?? [])
          .map((item) => item.document_id)
          .filter((value): value is string => Boolean(value))
          .concat("00000000-0000-0000-0000-000000000000"),
      )
      .is("deleted_at", null);
  if (expenseDocumentMetadataError) throw expenseDocumentMetadataError;
  const expenseDocumentMetadataById = new Map(
    (expenseDocumentMetadata ?? []).map((item) => [item.id, item]),
  );
  const [
    { data: paymentRows, error: paymentError },
    { data: financialEvents, error: financialEventsError },
    { data: associatedExpenses, error: associatedExpenseError },
  ] = await Promise.all([
    client
      .from("event_staff_payments")
      .select(
        "id,staff_id,tasks,total_internal_payment,original_operator_payment,original_assembly_payment,original_disassembly_payment,automatic_operator_payment,automatic_assembly_payment,automatic_disassembly_payment,operator_payment,assembly_payment,disassembly_payment,override_reason,status,settlement_status,paid_amount,paid_at,accounting_month,sii_receipt_status,projects!inner(id,name,event_date,project_type,customer_id,customers!projects_customer_id_fkey(full_name),project_services(service_code,duration_hours))",
      )
      .is("deleted_at", null)
      .eq("status", "CONFIRMED")
      .gt("total_internal_payment", 0)
      .order("created_at", { ascending: false }),
    client.from("financial_event_records").select("project_id,revenue,status"),
    client
      .from("expenses")
      .select(
        "id,project_id,responsible_staff_id,event_staff_settlement_id,occurred_on,category,approval_reason,total,status,projects(name)",
      )
      .not("event_staff_settlement_id", "is", null)
      .is("deleted_at", null)
      .order("occurred_on", { ascending: false }),
  ]);
  if (paymentError) throw paymentError;
  if (financialEventsError) throw financialEventsError;
  if (associatedExpenseError) throw associatedExpenseError;
  const { data: settlementAdjustments, error: settlementAdjustmentError } =
    await client
      .from("event_staff_settlement_adjustments")
      .select("id,settlement_id,reason,amount,comment,created_at,created_by")
      .in(
        "settlement_id",
        (paymentRows ?? [])
          .map((item) => item.id)
          .concat("00000000-0000-0000-0000-000000000000"),
      )
      .order("created_at");
  if (settlementAdjustmentError) throw settlementAdjustmentError;
  const today = new Date().toISOString().slice(0, 10);
  const revenueByProject = new Map(
    (financialEvents ?? [])
      .filter((item) => item.status === "CONFIRMED")
      .map((item) => [item.project_id, Number(item.revenue)]),
  );
  const operationalStaff: StaffOperationalRecord[] = (staff ?? []).map(
    (row) => {
      const emergency = (row.emergency_contact ?? {}) as Record<
        string,
        unknown
      >;
      const timelineHistory = (history ?? [])
        .filter((item) => item.staff_id === row.id)
        .map((item) => ({
          id: `timeline-${item.id}`,
          message: item.human_message,
          occurredAt: item.occurred_at,
        }));
      const auditHistory = (audit ?? [])
        .filter((item) => item.entity_id === row.id)
        .map((item) => ({
          id: `audit-${item.id}`,
          message:
            item.action === "INSERT"
              ? "Perfil de Staff creado."
              : item.action === "UPDATE"
                ? "Perfil de Staff actualizado."
                : "Perfil de Staff eliminado.",
          occurredAt: item.occurred_at,
        }));
      const memberAssignments = (assignments ?? [])
        .filter((item) => item.staff_id === row.id)
        .flatMap((item) => {
          const project = Array.isArray(item.projects)
            ? item.projects[0]
            : item.projects;
          if (!project) return [];
          const asset = Array.isArray(item.operational_assets)
            ? item.operational_assets[0]
            : item.operational_assets;
          const resources = (item.resources ?? {}) as Record<string, unknown>;
          return [
            {
              id: item.id,
              projectId: item.project_id,
              eventName: project.name,
              service: project.project_type,
              date: project.event_date,
              vehicle:
                asset?.asset_code ??
                (typeof resources.vehicle === "string"
                  ? resources.vehicle
                  : "Sin vehículo"),
              role: item.assignment_type,
              status: item.status,
              arrivalTime: item.arrival_time?.slice(0, 5) ?? "",
              startTime: item.start_time?.slice(0, 5) ?? "",
              finishTime: item.finish_time?.slice(0, 5) ?? "",
            },
          ];
        });
      const memberPayments = (paymentRows ?? []).filter(
        (item) => item.staff_id === row.id && item.status !== "CANCELLED",
      );
      const projectIds = new Set(
        memberAssignments.map((item) => item.projectId),
      );
      const canonicalDocuments: StaffDocumentView[] = (staffDocuments ?? [])
        .filter((document) => document.staff_id === row.id)
        .map((document) => ({
          id: document.id,
          category: (document.category ?? "IDENTIDAD") as StaffDocumentCategory,
          documentType: document.document_type,
          fileName: document.file_name,
          label: document.friendly_label || document.file_name,
          createdAt: document.created_at,
          applicableMonth: document.applicable_month,
          status: document.status ?? "ACTIVE",
          source: "STAFF_DOCUMENT",
        }));
      const expenseReferences: StaffDocumentView[] = (
        staffExpenseDocuments ?? []
      )
        .filter(
          (document) => document.staff_id === row.id && document.document_id,
        )
        .map((document) => {
          const metadata = expenseDocumentMetadataById.get(document.document_id!);
          return {
            id: document.document_id!,
            category: "GASTOS",
            documentType: "STAFF_EXPENSE_RECEIPT",
            fileName:
              metadata?.original_filename ||
              `Comprobante-gasto-${document.occurred_on}`,
            label: document.description || "Comprobante de gasto operacional",
            createdAt: metadata?.created_at || document.submitted_at,
            applicableMonth: document.occurred_on.slice(0, 7),
            status: document.status,
            source: "EXPENSE_REFERENCE",
          };
        });
      return {
        id: row.id,
        version: row.version,
        firstName: row.first_name,
        lastName: row.last_name,
        rut: row.rut ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        role: row.role as StaffOperationalRecord["role"],
        skills: (row.capabilities ?? []) as StaffOperationalRecord["skills"],
        status: row.status as StaffOperationalRecord["status"],
        bank: row.bank ?? "",
        accountType: row.account_type ?? "",
        accountNumber: row.account_number ?? "",
        emergencyName: typeof emergency.name === "string" ? emergency.name : "",
        emergencyPhone:
          typeof emergency.phone === "string" ? emergency.phone : "",
        assignments: memberAssignments,
        history: [...timelineHistory, ...auditHistory].sort((a, b) =>
          b.occurredAt.localeCompare(a.occurredAt),
        ),
        documents: [...canonicalDocuments, ...expenseReferences],
        financial: {
          upcomingEvents: new Set(
            memberAssignments
              .filter(
                (item) =>
                  item.date >= today &&
                  !["COMPLETED", "CANCELLED", "REJECTED"].includes(item.status),
              )
              .map((item) => item.projectId),
          ).size,
          pendingPayments: memberPayments.reduce(
            (sum, item) =>
              sum +
              Math.max(
                0,
                Number(item.total_internal_payment) - Number(item.paid_amount),
              ),
            0,
          ),
          completedEvents: new Set(
            memberAssignments
              .filter((item) => item.status === "COMPLETED")
              .map((item) => item.projectId),
          ).size,
          revenueGenerated: [...projectIds].reduce(
            (sum, id) => sum + (revenueByProject.get(id) ?? 0),
            0,
          ),
          totalCost: memberPayments.reduce(
            (sum, item) => sum + Number(item.total_internal_payment),
            0,
          ),
        },
      };
    },
  );
  for (const member of operationalStaff) {
    member.associatedExpenses = (associatedExpenses ?? [])
      .filter((expense) => expense.responsible_staff_id === member.id)
      .map((expense) => {
        const project = Array.isArray(expense.projects)
          ? expense.projects[0]
          : expense.projects;
        let description = expense.approval_reason ?? "";
        try {
          const metadata = JSON.parse(description) as { description?: string };
          description = metadata.description ?? description;
        } catch {}
        return {
          id: expense.id,
          projectId: expense.project_id,
          eventName: project?.name ?? "Evento",
          date: expense.occurred_on,
          category: expense.category,
          description,
          amount: Number(expense.total),
          status: expense.status,
        };
      });
  }
  const projectOptions = (projects ?? []).map((project) => ({
    id: project.id,
    label: `${project.name} · ${project.event_date}`,
    service: project.project_type,
    date: project.event_date,
  }));
  const vehicleOptions = (vehicles ?? []).map((vehicle) => ({
    id: vehicle.asset_id,
    label: vehicle.model,
  }));
  const paymentEvents: StaffPaymentEvent[] = (paymentRows ?? []).flatMap(
    (row) => {
      const project = Array.isArray(row.projects)
        ? row.projects[0]
        : row.projects;
      if (!project) return [];
      const customer = Array.isArray(project.customers)
        ? project.customers[0]
        : project.customers;
      const service = Array.isArray(project.project_services)
        ? project.project_services[0]
        : project.project_services;
      const adjustments = (settlementAdjustments ?? []).filter(
        (item) => item.settlement_id === row.id,
      );
      const reimbursements = (associatedExpenses ?? []).filter(
        (item) =>
          item.event_staff_settlement_id === row.id &&
          item.status !== "CANCELLED",
      );
      const originalOperator = Number(
          row.original_operator_payment ??
            row.automatic_operator_payment ??
            row.operator_payment,
        ),
        originalAssembly = Number(
          row.original_assembly_payment ??
            row.automatic_assembly_payment ??
            row.assembly_payment,
        ),
        originalDisassembly = Number(
          row.original_disassembly_payment ??
            row.automatic_disassembly_payment ??
            row.disassembly_payment,
        ),
        originalNet = originalOperator + originalAssembly + originalDisassembly,
        adjustmentTotal = adjustments.reduce(
          (sum, item) => sum + Number(item.amount),
          0,
        ),
        reimbursementTotal = reimbursements.reduce(
          (sum, item) => sum + Number(item.total),
          0,
        ),
        finalAmount = originalNet + adjustmentTotal + reimbursementTotal;
      return [
        {
          id: row.id,
          staffId: row.staff_id,
          projectId: project.id,
          eventName: project.name,
          eventDate: project.event_date,
          accountingMonth: row.accounting_month,
          customer: customer?.full_name ?? "Sin cliente",
          service: service?.service_code ?? project.project_type,
          durationHours: Number(service?.duration_hours ?? 0),
          roles: row.tasks ?? [],
          amount: originalNet,
          originalNet,
          adjustmentTotal,
          reimbursementTotal,
          finalAmount,
          operator: originalOperator,
          assembly: originalAssembly,
          disassembly: originalDisassembly,
          overrideReason: row.override_reason ?? "",
          status: row.status,
          settlementStatus: row.settlement_status,
          paidAmount: Number(row.paid_amount),
          paidAt: row.paid_at ?? "",
          receiptStatus: row.sii_receipt_status,
        },
      ];
    },
  );
  const monthlyRecords: StaffPaymentMonth[] = [];
  const lastLoginByStaff = new Map<string, string>();
  for (const entry of history ?? []) {
    if (
      entry.staff_id &&
      entry.event_type === "STAFF_PORTAL_ACCESS" &&
      !lastLoginByStaff.has(entry.staff_id)
    )
      lastLoginByStaff.set(entry.staff_id, entry.occurred_at);
  }
  const portalAccess = (staff ?? []).map((member) => ({
    id: member.id,
    name: `${member.first_name} ${member.last_name}`,
    rut: member.rut ?? "",
    email: member.email ?? "",
    enabled: Boolean(member.portal_enabled),
    hasPin: Boolean(member.pin_updated_at),
    firstLoginPending: Boolean(member.portal_password_change_required),
    invitationSentAt: member.portal_invitation_sent_at ?? null,
    lastLoginAt: lastLoginByStaff.get(member.id) ?? null,
  }));
  const publicationMap = new Map(
    (publications ?? []).map((item) => [item.project_id, item.published]),
  );
  const staffNameById = new Map(
    (staff ?? []).map((item) => [
      item.id,
      `${item.first_name} ${item.last_name}`,
    ]),
  );
  const end = new Date(`${today}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 15);
  const operationsEvents: StaffOperationsEvent[] = (projects ?? [])
    .filter(
      (project) =>
        project.event_date >= today &&
        project.event_date <= end.toISOString().slice(0, 10),
    )
    .map((project) => {
      const customer = Array.isArray(project.customers)
        ? project.customers[0]
        : project.customers;
      const services = Array.isArray(project.project_services)
        ? project.project_services
        : [];
      const eventAssignments = (assignments ?? [])
        .filter(
          (item) =>
            item.project_id === project.id &&
            !["CANCELLED", "REJECTED"].includes(item.status),
        )
        .map((item) => `${item.assignment_type}: ${item.status}`);
      const settlements = (paymentRows ?? [])
        .filter((item) => {
          const linked = Array.isArray(item.projects)
            ? item.projects[0]
            : item.projects;
          return linked?.id === project.id && item.status !== "CANCELLED";
        })
        .map((item) => ({
          id: item.id,
          staff: staffNameById.get(item.staff_id) ?? "Staff",
          net: Number(item.total_internal_payment),
          paid: Number(item.paid_amount),
          status: item.settlement_status,
        }));
      return {
        id: project.id,
        date: project.event_date,
        customer: customer?.full_name ?? project.name,
        service:
          services.map((item) => item.service_code).join(" + ") ||
          project.project_type,
        published: publicationMap.get(project.id) ?? false,
        ready: Boolean(
          project.event_date &&
            (customer?.full_name ?? project.name) &&
            (services.some((item) => Boolean(item.service_code)) ||
              project.project_type),
        ),
        assignments: eventAssignments,
        settlements,
        eventStatus: project.status,
        requestCount: (requests ?? []).filter(
          (item) => item.project_id === project.id,
        ).length,
      };
    });
  const operationsRequests: StaffOperationsRequest[] = (requests ?? []).map(
    (request) => {
      const member = Array.isArray(request.staff)
        ? request.staff[0]
        : request.staff;
      const project = Array.isArray(request.projects)
        ? request.projects[0]
        : request.projects;
      return {
        id: request.id,
        projectId: request.project_id,
        staff: member ? `${member.first_name} ${member.last_name}` : "Staff",
        responsibility: request.responsibility,
        event: project?.name ?? "Evento",
        date: project?.event_date ?? "",
      };
    },
  );
  const paymentStaff = operationalStaff.map((member) => ({
    id: member.id,
    name: `${member.firstName} ${member.lastName}`,
    rut: member.rut,
  }));
  const onboardingInvitations: StaffOnboardingInvitation[] = (
    onboarding ?? []
  ).map((item) => ({
    id: item.id,
    firstName: item.first_name,
    lastName: item.last_name,
    email: item.email,
    mobile: item.mobile,
    status: item.status,
    submittedAt: item.submitted_at,
    reviewNotes: item.review_notes,
    data: (item.submitted_data ?? {}) as Record<string, unknown>,
    documents: (item.staff_onboarding_documents ?? []).map((document) => ({
      id: document.id,
      type: document.document_type,
      fileName: document.file_name,
    })),
  }));
  const academyArticles = await loadAcademyArticles(client);
  const academyStats = await loadAcademyStats(client, academyArticles);
  return (
    <StaffWorkspaces
      team={
        <div className="space-y-6">
          <StaffOnboardingCenter invitations={onboardingInvitations} />
          <StaffOperationCenter
            initialStaff={operationalStaff}
            portalAccess={portalAccess}
            paymentEvents={paymentEvents}
            paymentMonths={monthlyRecords}
            projects={projectOptions}
            vehicles={vehicleOptions}
          />
        </div>
      }
      operations={
        <StaffOperationsView
          events={operationsEvents}
          requests={operationsRequests}
        />
      }
      portal={<StaffPinReset members={portalAccess} />}
      payroll={
        <StaffPaymentsCenter
          staff={paymentStaff}
          events={paymentEvents}
          months={monthlyRecords}
        />
      }
      academy={
        <AcademyManager articles={academyArticles} stats={academyStats} />
      }
    />
  );
}
