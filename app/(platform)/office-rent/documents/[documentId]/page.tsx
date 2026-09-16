import { notFound, redirect } from "next/navigation";
import { OfficeRentReceiptViewer } from "@/features/office-rent/office-rent-receipt-viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OfficeRentReceiptPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const client = await createSupabaseServerClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) redirect(`/login?next=${encodeURIComponent(`/office-rent/documents/${documentId}`)}`);
  const [{ data: profile, error: profileError }, { data: document, error: documentError }] = await Promise.all([
    client.from("profiles").select("role").eq("id", auth.user.id).single(),
    client.from("office_lease_documents").select("id,document_type,office_lease_payments(receipt_number)").eq("id", documentId).is("deleted_at", null).single(),
  ]);
  if (profileError) throw profileError;
  if (!profile || !["CEO", "ADMINISTRATOR"].includes(profile.role)) redirect("/operations");
  if (documentError || !document || document.document_type !== "INCOME_RECEIPT") notFound();
  const paymentValue = document.office_lease_payments;
  const payment = Array.isArray(paymentValue) ? paymentValue[0] : paymentValue;
  if (!payment?.receipt_number) notFound();
  return <OfficeRentReceiptViewer documentId={document.id} receiptNumber={Number(payment.receipt_number)}/>;
}
