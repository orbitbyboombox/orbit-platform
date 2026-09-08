"use server";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import {
  CUSTOMER_SESSION_COOKIE,
  STAFF_SESSION_COOKIE,
  requestEvidence,
  revokePortalSession,
} from "./portal-auth.service";
import { portalTokenHash } from "@/features/customer-portal/customer-portal.service";
import { GoogleGmailApiProvider } from "@/features/connectors/google-gmail/provider/google-gmail-live.provider";
import { loadGoogleWorkspaceAccessToken } from "@/features/connectors/google-workspace/application/google-workspace.repository";
import { formatChileanRut, requireValidChileanRut } from "@/lib/chile/rut";

const FAILURE = "No fue posible validar la información ingresada.";
const friendlyPortalError = (error: unknown, fallback = FAILURE) => {
  const value = error instanceof Error ? error.message : "";
  return /coerce|json object|pgrst|schema|constraint|violates|column/i.test(
    value,
  )
    ? fallback
    : value || fallback;
};
type PortalEventOption = {
  projectId: string;
  orbCode: string;
  name: string;
  date: string;
  time: string;
  location: string;
  service: string;
};
type PortalLookupRow = {
  id: string;
  orbit_event_id: string | null;
  name: string | null;
  event_date: string;
  event_time: string | null;
  location: string | null;
  customers: { rut?: string | null; metadata?: Record<string, unknown> | null } | Array<{ rut?: string | null; metadata?: Record<string, unknown> | null }> | null;
  project_services: Array<{ service_code: string | null }> | null;
};
type Result = { ok: false; error: string; events?: PortalEventOption[] };
const cookieOptions = (expires: string) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires: new Date(expires),
});

export async function customerPortalLoginAction(
  _: Result | undefined,
  form: FormData,
): Promise<Result> {
  let rut: string;
  try {
    rut = requireValidChileanRut(String(form.get("rut") ?? ""));
  } catch (error) {
    return { ok: false, error: friendlyPortalError(error) };
  }
  const eventDate = String(form.get("eventDate") ?? "");
  const selectedProjectId = String(form.get("projectId") ?? "");
  const admin = createAdminClient();
  const { data: matches, error: lookupError } = await admin
    .from("projects")
    .select(
      "id,orbit_event_id,name,event_date,event_time,location,status,customers!inner(id,rut,metadata),project_services(service_code)",
    )
    .eq("event_date", eventDate)
    .is("deleted_at", null)
    .not("status", "in", "(COMPLETED,ARCHIVED,CANCELLED,CANCELED)");
  if (lookupError) return { ok: false, error: FAILURE };
  const normalize = (value: string) =>
    value.toUpperCase().replace(/[^0-9K]/g, "");
  const events = (matches ?? [])
    .filter((row: PortalLookupRow) => {
      const customer = Array.isArray(row.customers)
        ? row.customers[0]
        : row.customers;
      return (
        normalize(String(customer?.rut ?? customer?.metadata?.rut ?? "")) ===
        normalize(rut)
      );
    })
    .map((row: PortalLookupRow) => {
      const services = Array.isArray(row.project_services)
        ? row.project_services
        : [];
      return {
        projectId: row.id,
        orbCode: row.orbit_event_id ?? row.id,
        name: row.name ?? "Evento BOOMBOX",
        date: row.event_date,
        time: row.event_time ?? "Por confirmar",
        location: row.location ?? "Lugar por confirmar",
        service:
          services
            .map((item) => item.service_code)
            .filter(Boolean)
            .join(" + ") || "Servicio por confirmar",
      };
    });
  if (events.length > 1 && !selectedProjectId)
    return { ok: false, error: "Selecciona tu evento para continuar.", events };
  if (
    selectedProjectId &&
    !events.some((event) => event.projectId === selectedProjectId)
  )
    return { ok: false, error: FAILURE };
  const evidence = requestEvidence(await headers());
  const { data, error } = selectedProjectId
    ? await admin.rpc("authenticate_customer_portal_project", {
        p_rut: rut,
        p_event_date: eventDate,
        p_project_id: selectedProjectId,
        p_ip_hash: evidence.ipHash,
        p_user_agent: evidence.userAgent,
        p_device: evidence.device,
      })
    : await admin.rpc("authenticate_customer_portal", {
        p_rut: rut,
        p_event_date: eventDate,
        p_ip_hash: evidence.ipHash,
        p_user_agent: evidence.userAgent,
        p_device: evidence.device,
      });
  const session = data?.[0];
  if (error || !session) return { ok: false, error: FAILURE };
  const { data: project } = await admin
    .from("projects")
    .select("customer_id")
    .eq("id", session.project_id)
    .single();
  if (!project) return { ok: false, error: FAILURE };
  await admin
    .from("customer_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", session.project_id)
    .is("revoked_at", null);
  const { error: tokenError } = await admin
    .from("customer_portal_tokens")
    .insert({
      project_id: session.project_id,
      customer_id: project.customer_id,
      token_hash: portalTokenHash(session.session_token),
      expires_at: session.expires_at,
    });
  if (tokenError) return { ok: false, error: FAILURE };
  (await cookies()).set(
    CUSTOMER_SESSION_COOKIE,
    session.session_token,
    cookieOptions(session.expires_at),
  );
  redirect(`/p/${session.session_token}`);
}
export async function staffPortalLoginAction(
  _: Result | undefined,
  form: FormData,
): Promise<Result> {
  let rut: string;
  try {
    rut = requireValidChileanRut(String(form.get("rut") ?? ""));
  } catch (error) {
    return { ok: false, error: friendlyPortalError(error) };
  }
  const pin = String(form.get("pin") ?? "");
  const evidence = requestEvidence(await headers());
  const { data, error } = await createAdminClient().rpc(
    "authenticate_staff_portal",
    {
      p_rut: rut,
      p_pin: pin,
      p_ip_hash: evidence.ipHash,
      p_user_agent: evidence.userAgent,
      p_device: evidence.device,
    },
  );
  const session = data?.[0];
  if (error || !session) {
    const rutHash = createHash("sha256").update(rut).digest("hex");
    const { data: attempt } = await createAdminClient()
      .from("portal_access_attempts")
      .select("failure_code")
      .eq("access_type", "STAFF")
      .eq("normalized_rut_hash", rutHash)
      .order("attempted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    console.warn("[ORBIT][STAFF_PORTAL_AUTH_REJECTED]", {
      failureCode: attempt?.failure_code ?? (error ? "RPC_ERROR" : "UNKNOWN"),
    });
    return { ok: false, error: FAILURE };
  }
  (await cookies()).set(
    STAFF_SESSION_COOKIE,
    session.session_token,
    cookieOptions(session.expires_at),
  );
  redirect("/staff-portal");
}
export async function portalLogoutAction(type: "CUSTOMER" | "STAFF") {
  await revokePortalSession(type);
  redirect(
    type === "CUSTOMER" ? "/login?access=customer" : "/login?access=staff",
  );
}
export async function resetStaffPinAction(form: FormData) {
  const client = await createSupabaseServerActionClient();
  const staffId = String(form.get("staffId") ?? "");
  const pin = String(form.get("pin") ?? "");
  const reason = String(form.get("reason") ?? "");
  const { error } = await client.rpc("set_staff_portal_pin", {
    p_staff_id: staffId,
    p_pin: pin,
    p_reason: reason,
  });
  return error
    ? {
        ok: false,
        error: friendlyPortalError(error, "No fue posible generar el PIN."),
      }
    : {
        ok: true,
        message: `PIN ${pin} generado. El colaborador deberá crear su contraseña al ingresar.`,
      };
}
export async function setStaffPortalActivationAction(
  staffId: string,
  enabled: boolean,
) {
  const client = await createSupabaseServerActionClient();
  const { error } = await client.rpc("set_staff_portal_activation", {
    p_staff_id: staffId,
    p_enabled: enabled,
    p_reason: enabled
      ? "Activación desde perfil de Staff"
      : "Desactivación desde perfil de Staff",
  });
  if (!error) revalidatePath("/resources/staff");
  return error
    ? {
        ok: false,
        error: friendlyPortalError(
          error,
          "No fue posible cambiar el estado del Portal Staff.",
        ),
      }
    : {
        ok: true,
        message: enabled
          ? "Portal Staff activado."
          : "Portal Staff desactivado.",
      };
}
export async function sendStaffPortalInvitationAction(form: FormData) {
  const client = await createSupabaseServerActionClient(),
    staffId = String(form.get("staffId") ?? ""),
    pin = String(form.get("pin") ?? "");
  const { data: member, error } = await client
    .from("staff")
    .select("first_name,last_name,rut,email,portal_enabled")
    .eq("id", staffId)
    .maybeSingle();
  if (error || !member?.email)
    return {
      ok: false,
      error: friendlyPortalError(
        error,
        "El colaborador no tiene correo registrado.",
      ),
    };
  if (!member.portal_enabled)
    return {
      ok: false,
      error: "Activa el Portal Staff antes de enviar la invitación.",
    };
  if (!/^\d{4}$/.test(pin))
    return { ok: false, error: "Genera un PIN antes de enviar la invitación." };
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://orbit.boom-box.cl"}/login?access=staff`,
      rut = formatChileanRut(member.rut);
    await new GoogleGmailApiProvider(
      await loadGoogleWorkspaceAccessToken(),
    ).send({
      to: member.email,
      subject: "Tu acceso al Portal Staff BOOMBOX",
      textBody: `Hola ${member.first_name}. Ingresa en ${url} con tu RUT ${rut} y PIN temporal ${pin}. Deberás crear una contraseña en tu primer ingreso.`,
      htmlBody: `<main style="font-family:Arial,sans-serif;color:#171717"><h1>Portal Staff BOOMBOX</h1><p>Hola ${member.first_name}, tu acceso operacional está activo.</p><p><strong>RUT:</strong> ${rut}<br><strong>PIN temporal:</strong> ${pin}</p><p>Al ingresar deberás crear tu contraseña personal.</p><p><a href="${url}" style="display:inline-block;background:#F78900;color:#111;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Ingresar al Portal Staff</a></p></main>`,
      driveFileIds: [],
    });
    const { error: markError } = await client.rpc(
      "mark_staff_portal_invitation_sent",
      { p_staff_id: staffId },
    );
    if (markError) throw markError;
    return { ok: true, message: `Invitación enviada a ${member.email}.` };
  } catch (error) {
    return {
      ok: false,
      error: friendlyPortalError(error, "No fue posible enviar la invitación."),
    };
  }
}
