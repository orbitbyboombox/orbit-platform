"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, MailPlus, Pencil, RotateCw, Trash2, UserRoundCheck, X } from "lucide-react";
import {
  inviteStaffAction,
  manageStaffInvitationAction,
  reviewStaffOnboardingAction,
} from "./staff-onboarding.actions";
import { formatChileanPhone } from "@/lib/chile/rut";

export type StaffOnboardingInvitation = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  status: string;
  submittedAt: string | null;
  reviewNotes: string | null;
  data: Record<string, unknown>;
  documents: Array<{ id: string; type: string; fileName: string }>;
};
export function StaffOnboardingCenter({
  invitations,
}: {
  invitations: StaffOnboardingInvitation[];
}) {
  const router=useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [reviewing, setReviewing] = useState<StaffOnboardingInvitation | null>(
    null,
  );
  const [editing, setEditing] = useState<StaffOnboardingInvitation | null>(null);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [router]);
  const submitInvite = (form: FormData) =>
    start(async () => {
      const result = await inviteStaffAction(form);
      setMessage(
        result.ok
          ? (result.message ?? "Invitación enviada.")
          : (result.error ?? "Error"),
      );
      if (result.ok){setInviteOpen(false);router.refresh();}
    });
  const review = (action: string, notes: string) => {
    if (!reviewing) return;
    start(async () => {
      const form = new FormData();
      form.set("invitationId", reviewing.id);
      form.set("action", action);
      form.set("notes", notes);
      const result = await reviewStaffOnboardingAction(form);
      setMessage(
        result.ok
          ? (result.message ?? "Revisión guardada.")
          : (result.error ?? "Error"),
      );
      if (result.ok){setReviewing(null);router.refresh();}
    });
  };
  const manage=(item:StaffOnboardingInvitation,action:string,values?:FormData)=>start(async()=>{
    const form=values??new FormData();form.set("invitationId",item.id);form.set("action",action);
    if((action==="CANCEL"||action==="DELETE")&&!window.confirm(action==="DELETE"?"¿Eliminar permanentemente esta invitación pendiente?":"¿Cancelar esta invitación?"))return;
    const result=await manageStaffInvitationAction(form);setMessage(result.ok?(result.message??"Operación completada."):(result.error??"Error"));if(result.ok){setEditing(null);router.refresh();}
  });
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
            Onboarding Staff
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Incorporación de colaboradores
          </h2>
          <p className="mt-2 text-sm text-muted">
            Invita con cuatro datos. El perfil se crea únicamente después de tu
            aprobación.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground"
          onClick={() => setInviteOpen(true)}
        >
          <MailPlus className="size-4" />
          Invitar colaborador
        </button>
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {invitations
          .map((item) => (
            <article className="rounded-xl border p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {item.firstName} {item.lastName}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {item.email} · {formatChileanPhone(item.mobile)}
                  </p>
                </div>
                <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                  {label(item.status)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Action icon={Eye} label="Ver" onClick={()=>setReviewing(item)}/>
                {item.status!=="APPROVED"?<><Action icon={Pencil} label="Editar" onClick={()=>setEditing(item)}/><Action icon={RotateCw} label="Reenviar" onClick={()=>manage(item,"RESEND")}/>{!["CANCELLED","REJECTED","EXPIRED"].includes(item.status)?<Action icon={X} label="Cancelar" onClick={()=>manage(item,"CANCEL")}/>:null}<Action icon={Trash2} label="Eliminar" onClick={()=>manage(item,"DELETE")}/></>:null}
                {item.status === "SUBMITTED" ? <Action icon={UserRoundCheck} label="Aprobar / revisar" onClick={()=>setReviewing(item)} primary/>:null}
              </div>
            </article>
          ))}
        {!invitations.length ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted">
            No hay invitaciones pendientes.
          </p>
        ) : null}
      </div>
      {message ? (
        <p className="mt-4 text-sm font-medium" role="status">
          {message}
        </p>
      ) : null}
      {inviteOpen ? (
        <InviteDialog
          close={() => setInviteOpen(false)}
          pending={pending}
          submit={submitInvite}
        />
      ) : null}
      {reviewing ? (
        <ReviewDialog
          invitation={reviewing}
          close={() => setReviewing(null)}
          pending={pending}
          review={review}
        />
      ) : null}
      {editing?<EditDialog invitation={editing} close={()=>setEditing(null)} pending={pending} submit={form=>manage(editing,"EDIT",form)}/>:null}
    </section>
  );
}
const label = (status: string) =>
  ({
    INVITED: "Invitado",
    OPENED: "Registro abierto",
    SUBMITTED: "Pendiente de aprobación",
    CHANGES_REQUESTED: "Cambios solicitados",
    REJECTED: "Rechazado",
    APPROVED: "Aprobado · Staff creado",
    CANCELLED: "Cancelado",
    EXPIRED: "Expirado",
  })[status] ?? status;
function InviteDialog({
  close,
  pending,
  submit,
}: {
  close: () => void;
  pending: boolean;
  submit: (form: FormData) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <form
        action={submit}
        className="w-full max-w-lg rounded-2xl border bg-card p-6"
      >
        <div className="flex justify-between">
          <h3 className="text-xl font-semibold">Invitar colaborador</h3>
          <button aria-label="Cerrar" type="button" onClick={close}>
            <X />
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field name="firstName" label="Nombre" />
          <Field name="lastName" label="Apellido" />
          <Field name="email" label="Email" type="email" />
          <Field name="mobile" label="Móvil" type="tel" />
        </div>
        <button
          className="mt-6 w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground"
          disabled={pending}
        >
          {pending ? "Enviando…" : "Enviar invitación"}
        </button>
      </form>
    </div>
  );
}
function EditDialog({invitation,close,pending,submit}:{invitation:StaffOnboardingInvitation;close:()=>void;pending:boolean;submit:(form:FormData)=>void}){return <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><form action={submit} className="w-full max-w-lg rounded-2xl border bg-card p-6"><div className="flex justify-between"><h3 className="text-xl font-semibold">Editar invitación</h3><button aria-label="Cerrar" onClick={close} type="button"><X/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field defaultValue={invitation.firstName} name="firstName" label="Nombre"/><Field defaultValue={invitation.lastName} name="lastName" label="Apellido"/><Field defaultValue={invitation.email} name="email" label="Email" type="email"/><Field defaultValue={invitation.mobile} name="mobile" label="Móvil" type="tel"/></div><button className="mt-6 w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground" disabled={pending}>{pending?"Guardando…":"Guardar cambios"}</button></form></div>}
function Action({icon:Icon,label,onClick,primary=false}:{icon:typeof Eye;label:string;onClick:()=>void;primary?:boolean}){return <button className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${primary?"bg-brand text-brand-foreground":"border"}`} disabled={false} onClick={onClick}><Icon className="size-3.5"/>{label}</button>}
function Field({
  name,
  label,
  type = "text",
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3"
        name={name}
        defaultValue={defaultValue}
        required
        type={type}
      />
    </label>
  );
}
function ReviewDialog({
  invitation,
  close,
  pending,
  review,
}: {
  invitation: StaffOnboardingInvitation;
  close: () => void;
  pending: boolean;
  review: (action: string, notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const d = invitation.data;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4">
      <div className="mx-auto my-8 max-w-3xl rounded-2xl border bg-card p-6">
        <div className="flex justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-brand">
              Revisión Founder
            </p>
            <h3 className="mt-1 text-2xl font-semibold">
              {invitation.firstName} {invitation.lastName}
            </h3>
          </div>
          <button aria-label="Cerrar" onClick={close}>
            <X />
          </button>
        </div>
        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          {Object.entries(d)
            .filter(([key]) => key !== "capabilities")
            .map(([key, value]) => (
              <div className="rounded-xl border p-3" key={key}>
                <dt className="text-xs text-muted">{fieldLabel(key)}</dt>
                <dd className="mt-1 text-sm font-semibold">
                  {String(value || "—")}
                </dd>
              </div>
            ))}
        </dl>
        <div className="mt-5">
          <h4 className="font-semibold">Documentos</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {invitation.documents.map((doc) => (
              <a
                href={`/api/staff-onboarding/documents/${doc.id}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border px-3 py-2 text-sm"
                key={doc.id}
              >
                {doc.fileName}
              </a>
            ))}
          </div>
        </div>
        {invitation.status==="SUBMITTED"?<><textarea
          className="mt-5 min-h-24 w-full rounded-xl border bg-background p-3"
          placeholder="Observación o cambios solicitados"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            disabled={pending}
            onClick={() => review("REJECT", notes)}
          >
            Rechazar
          </button>
          <button
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
            disabled={pending}
            onClick={() => review("REQUEST_CHANGES", notes)}
          >
            Solicitar cambios
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
            disabled={pending}
            onClick={() => review("APPROVE", notes)}
          >
            <Check className="size-4" />
            Aprobar
          </button>
        </div></>:<p className="mt-5 rounded-xl border bg-background/40 p-3 text-sm text-muted">Esta invitación está en estado {label(invitation.status)} y se muestra en modo consulta.</p>}
      </div>
    </div>
  );
}
const fieldLabel = (key: string) =>
  ({
    rut: "RUT",
    birthDate: "Fecha de nacimiento",
    address: "Dirección",
    district: "Comuna",
    city: "Ciudad",
    phone: "Teléfono",
    emergencyName: "Contacto de emergencia",
    emergencyPhone: "Teléfono de emergencia",
    bank: "Banco",
    accountType: "Tipo de cuenta",
    accountNumber: "Número de cuenta",
    accountHolder: "Titular",
  })[key] ?? key;
