import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffDocumentAdministrator } from "@/features/staff-documents/staff-document-auth";

type ProtectedDocument = {
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
};

const cleanFileName = (value: string) =>
  value.replace(/["\r\n]/g, "").slice(0, 180) || "documento";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ staffId: string; documentId: string }> },
) {
  const authorization = await requireStaffDocumentAdministrator();
  if (!authorization.ok)
    return NextResponse.json(
      { message: authorization.message },
      { status: authorization.status },
    );
  const { staffId, documentId } = await params;
  const admin = createAdminClient();
  const { data: staffDocument, error: staffDocumentError } = await admin
    .from("staff_onboarding_documents")
    .select("storage_bucket,storage_path,file_name,mime_type")
    .eq("id", documentId)
    .eq("staff_id", staffId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (staffDocumentError)
    return NextResponse.json({ message: "Documento no disponible." }, { status: 500 });

  let document: ProtectedDocument | null = staffDocument;
  if (!document) {
    const { data: submission } = await admin
      .from("staff_expense_submissions")
      .select("document_id,description,occurred_on")
      .eq("staff_id", staffId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (submission) {
      const { data: expenseDocument } = await admin
        .from("documents")
        .select("storage_bucket,storage_path,original_filename,mime_type")
        .eq("id", submission.document_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (expenseDocument?.storage_path)
        document = {
          storage_bucket: expenseDocument.storage_bucket || "orbit-expenses",
          storage_path: expenseDocument.storage_path,
          file_name:
            expenseDocument.original_filename ||
            `Comprobante-gasto-${submission.occurred_on}`,
          mime_type: expenseDocument.mime_type,
        };
    }
  }
  if (!document)
    return NextResponse.json({ message: "Documento no encontrado." }, { status: 404 });

  const { data, error } = await admin.storage
    .from(document.storage_bucket)
    .download(document.storage_path);
  if (error || !data)
    return NextResponse.json({ message: "Archivo no disponible." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(data, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${cleanFileName(document.file_name)}"`,
      "Content-Type": document.mime_type || data.type || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
