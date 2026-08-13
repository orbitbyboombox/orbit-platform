import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { staffOnboardingTokenHash } from "@/features/staff-onboarding/staff-onboarding.service";

const documents = [
  { field: "identityFront", type: "IDENTITY_FRONT" },
  { field: "identityBack", type: "IDENTITY_BACK" },
  { field: "licenseFront", type: "DRIVER_LICENSE_FRONT" },
  { field: "licenseBack", type: "DRIVER_LICENSE_BACK" },
] as const;
export async function POST(request: Request) {
  const uploaded: string[] = [];
  try {
    const form = await request.formData(),
      token = String(form.get("token") ?? ""),
      payload = JSON.parse(String(form.get("payload") ?? "{}")) as Record<
        string,
        unknown
      >;
    const admin = createAdminClient(),
      now = new Date().toISOString();
    const { data: invitation, error } = await admin
      .from("staff_onboarding_invitations")
      .select("id,email,status")
      .eq("token_hash", staffOnboardingTokenHash(token))
      .gt("expires_at", now)
      .in("status", ["INVITED", "OPENED", "CHANGES_REQUESTED"])
      .maybeSingle();
    if (error || !invitation)
      return NextResponse.json(
        { message: "La invitación ya no está disponible." },
        { status: 404 },
      );
    const required = [
      "rut",
      "birthDate",
      "address",
      "district",
      "city",
      "phone",
      "emergencyName",
      "emergencyPhone",
      "bank",
      "accountType",
      "accountNumber",
      "accountHolder",
    ];
    if (
      required.some((key) => !String(payload[key] ?? "").trim()) ||
      !Array.isArray(payload.capabilities) ||
      payload.capabilities.length === 0
    )
      return NextResponse.json(
        { message: "Completa toda la información solicitada." },
        { status: 400 },
      );
    const requiresLicense =
      Boolean(payload.canDrive) ||
      (payload.capabilities as string[]).some(
        (item) => item === "ASSEMBLY" || item === "DISASSEMBLY",
      );
    for (const item of documents) {
      const file = form.get(item.field);
      if (!(file instanceof File) || file.size === 0) {
        if (item.field.startsWith("license") && !requiresLicense) continue;
        throw new Error(
          `Adjunta ${item.type.toLowerCase().replaceAll("_", " ")}.`,
        );
      }
      if (file.size > 10_485_760) throw new Error(`${file.name} supera 10 MB.`);
      if (
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          file.type,
        )
      )
        throw new Error("Los documentos deben ser JPG, PNG, WEBP o PDF.");
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin",
        path = `staff-onboarding/${invitation.id}/${item.type.toLowerCase()}-${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage
        .from("orbit-documents")
        .upload(path, await file.arrayBuffer(), {
          contentType: file.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploaded.push(path);
      const { data: previous } = await admin
        .from("staff_onboarding_documents")
        .select("storage_bucket,storage_path")
        .eq("invitation_id", invitation.id)
        .eq("document_type", item.type)
        .maybeSingle();
      await admin
        .from("staff_onboarding_documents")
        .delete()
        .eq("invitation_id", invitation.id)
        .eq("document_type", item.type);
      if (previous?.storage_path)
        await admin.storage
          .from(previous.storage_bucket)
          .remove([previous.storage_path]);
      const { error: documentError } = await admin
        .from("staff_onboarding_documents")
        .insert({
          invitation_id: invitation.id,
          document_type: item.type,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
        });
      if (documentError) throw documentError;
    }
    const { error: updateError } = await admin
      .from("staff_onboarding_invitations")
      .update({
        status: "SUBMITTED",
        submitted_data: payload,
        submitted_at: now,
        review_notes: null,
        updated_at: now,
      })
      .eq("id", invitation.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (uploaded.length) {
      const admin = createAdminClient();
      await admin.storage.from("orbit-documents").remove(uploaded);
    }
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No fue posible enviar el registro.",
      },
      { status: 400 },
    );
  }
}
