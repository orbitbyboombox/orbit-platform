import { notFound } from "next/navigation";
import { CustomerPortalHome } from "@/features/customer-portal/customer-portal-home";
import type { loadCustomerPortal } from "@/features/customer-portal/customer-portal.service";

export const dynamic = "force-dynamic";

type DemoData = NonNullable<Awaited<ReturnType<typeof loadCustomerPortal>>>;

/**
 * Preview-only visual harness for the real customer portal component.
 * It deliberately never loads a customer token or calls a write-capable action.
 */
export default function CustomerPortalDemoPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  return <CustomerPortalHome data={demoData} token="preview-demo-token" />;
}

const demoData = {
  access: {
    id: "demo-access",
    project_id: "demo-project",
    customer_id: "demo-customer",
    expires_at: "2027-12-31T23:59:59.000Z",
  },
  project: {
    id: "demo-project",
    orbit_event_id: "ORB-DEMO-2027",
    name: "Celebración Demo BOOMBOX",
    project_type: "PRIVATE_EVENT",
    status: "CONFIRMED",
    event_date: "2027-04-24",
    event_time: "18:00–22:00",
    location: "Centro de Eventos Demo",
    city: "Santiago",
    customers: { full_name: "Camila Demo", email: "qa@example.invalid", phone: "+56900000000", metadata: {} },
    project_services: [{ service_code: "CLASSIC", duration_hours: 4, extras: ["Libro de firmas"] }],
    event_post_reservation_extras: [{ name: "Libro de firmas", amount: 0, status: "ACTIVE" }],
    finance: { status: "PARTIALLY_PAID", paymentStatus: "PARTIALLY_PAID", reservationAmount: 250000, remainingBalance: 250000, totalPaid: 250000, paymentMethod: "TRANSFER" },
    operations: { status: "READY", designStatus: "APPROVED", designNotes: "Diseño aprobado para demostración.", designApprovedAt: "2026-10-10T15:00:00.000Z", designDocumentId: "demo-design", arrivalTime: "17:00", eventAddress: "Av. Dirección Demo 123, Santiago", operationalContact: "Equipo BOOMBOX", operationalPhone: "+56900000000" },
  },
  quotation: { id: "demo-quotation", status: "ACCEPTED", quotation_number: "COT-DEMO-2027", subtotal: 500000, transport_total: 0, discount_total: 0, grand_total: 500000, final_customer_price: 500000, expiration_date: "2026-12-31", pdf_storage_path: null, drive_file_id: null },
  agreement: { id: "demo-agreement", status: "SIGNED", signed_pdf_path: "demo/contract.pdf", drive_file_id: null, created_at: "2026-10-01T12:00:00.000Z", updated_at: "2026-10-08T12:00:00.000Z", signed_at: "2026-10-08T12:00:00.000Z" },
  evidence: { id: "demo-evidence", signer_name: "Camila Demo", signature_path: null, signed_at: "2026-10-08T12:00:00.000Z" },
  documents: [
    { id: "demo-contract", document_type: "SIGNED_AGREEMENT", drive_file_id: null, storage_bucket: null, storage_path: null, created_at: "2026-10-08T12:00:00.000Z", updated_at: "2026-10-08T12:00:00.000Z", original_filename: "Contrato-demo.pdf", mime_type: "application/pdf", version: 1, is_current: true, workflow_status: "APPROVED", approved_at: "2026-10-08T12:00:00.000Z" },
    { id: "demo-design", document_type: "DESIGN", drive_file_id: null, storage_bucket: null, storage_path: null, created_at: "2026-10-10T15:00:00.000Z", updated_at: "2026-10-10T15:00:00.000Z", original_filename: "Diseño-demo.pdf", mime_type: "application/pdf", version: 1, is_current: true, workflow_status: "APPROVED", approved_at: "2026-10-10T15:00:00.000Z" },
    { id: "demo-receipt", document_type: "PAYMENT_RECEIPT", drive_file_id: null, storage_bucket: null, storage_path: null, created_at: "2026-10-09T12:00:00.000Z", updated_at: "2026-10-09T12:00:00.000Z", original_filename: "Comprobante-demo.pdf", mime_type: "application/pdf", version: 1, is_current: true, workflow_status: "APPROVED", approved_at: "2026-10-09T12:00:00.000Z" },
    { id: "demo-photo-strip", document_type: "PHOTO_STRIP_DESIGN", drive_file_id: null, storage_bucket: null, storage_path: null, created_at: "2026-10-10T15:00:00.000Z", updated_at: "2026-10-10T15:00:00.000Z", original_filename: "Tira-demo.pdf", mime_type: "application/pdf", version: 1, is_current: true, workflow_status: "APPROVED", approved_at: "2026-10-10T15:00:00.000Z" },
  ],
  requests: [{ id: "demo-request", request_type: "GENERAL", subject: "Solicitud de demostración", message: "Este contenido es ficticio y solo sirve para QA visual.", status: "COMPLETED", created_at: "2026-10-11T12:00:00.000Z" }],
  payments: [{ id: "demo-payment", subject: "Reserva registrada", status: "SENT", occurred_at: "2026-10-09T12:00:00.000Z" }],
  uploads: [],
  contractTimeline: [{ id: "demo-contract-sent", action: "AGREEMENT_SENT", title: "Contrato enviado", occurred_at: "2026-10-02T12:00:00.000Z" }, { id: "demo-contract-signed", action: "AGREEMENT_SIGNED", title: "Contrato firmado", occurred_at: "2026-10-08T12:00:00.000Z" }],
  contractFolder: null,
  invoice: { id: "demo-invoice", status: "PARTIALLY_PAID", amount: 500000, paid_amount: 250000, due_date: "2027-03-24", payment_term: "50% reserva", invoice_payments: [{ id: "demo-invoice-payment", amount: 250000, paid_at: "2026-10-09T12:00:00.000Z", method: "TRANSFER", reference: "QA-DEMO" }] },
  designTimeline: [{ id: "demo-design-approved", action: "DESIGN_APPROVED", title: "Diseño aprobado", description: "Aprobación de demostración.", occurred_at: "2026-10-10T15:00:00.000Z" }],
  communications: [{ id: "demo-communication", communication_type: "RESERVATION_CONFIRMATION", subject: "Reserva confirmada", body: "Comunicación ficticia para QA.", status: "SENT", external_message_id: null, occurred_at: "2026-10-09T12:00:00.000Z", created_at: "2026-10-09T12:00:00.000Z" }],
  communicationTimeline: [{ id: "demo-timeline", communication_id: null, action: "RESERVATION_CONFIRMED", title: "Reserva confirmada", description: "Evento ficticio de demostración.", occurred_at: "2026-10-09T12:00:00.000Z" }],
  gallery: { status: "COMING_SOON", photos: [], videos: [], albums: [] },
  customerDocuments: {
    status: "AVAILABLE",
    rootFolderUrl: null,
    files: [
      { id: "demo-contract", name: "Contrato-demo.pdf", category: "CONTRACTS", categoryLabel: "Contrato", mimeType: "application/pdf", createdTime: "2026-10-08T12:00:00.000Z", modifiedTime: "2026-10-08T12:00:00.000Z", webViewLink: null, folderId: "demo-folder", folderUrl: "#documents" },
      { id: "demo-design", name: "Diseño-demo.pdf", category: "DESIGN", categoryLabel: "Diseño", mimeType: "application/pdf", createdTime: "2026-10-10T15:00:00.000Z", modifiedTime: "2026-10-10T15:00:00.000Z", webViewLink: null, folderId: "demo-folder", folderUrl: "#documents" },
    ],
  },
} as unknown as DemoData;
