"use client";

import { CheckCircle2, FileSignature, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { useCompanySettings } from "@/features/company-settings";

export interface CustomerSigningExperienceProps { token: string; customer: string; project: string; eventDate: string; service: string; hours: string; extras: string; transport: string; total: number; agreementVersion: string; clauses: readonly { title: string; content: string }[]; }

const confirmationSteps = ["Validando firma", "Generando PDF", "Subiendo a Google Drive", "Actualizando historial", "Completando acuerdo"] as const;
const boomboxTerms = [
  ["Reserva y pago", "La fecha quedará reservada una vez firmado el contrato y abonado el 50% del valor total. El saldo restante deberá pagarse durante la semana previa al evento. La reserva no es reembolsable, pues bloquea exclusivamente la fecha y horario seleccionados."],
  ["Reprogramación", "El cliente podrá solicitar un cambio de fecha, sujeto a disponibilidad de BOOMBOX. Los valores podrán actualizarse si la nueva fecha corresponde a otra temporada, ubicación o condición de servicio. La reserva podrá cederse a otra persona previa autorización escrita."],
  ["Horario contratado", "El servicio comenzará y finalizará en el horario acordado. Los atrasos propios del evento no extenderán automáticamente el servicio. Toda hora adicional deberá ser solicitada y pagada, quedando sujeta a disponibilidad."],
  ["Acceso e instalación", "El cliente deberá asegurar acceso oportuno al recinto, un espacio adecuado, mesa cuando corresponda y conexión eléctrica independiente de 220 V ubicada a un máximo de 1,5 metros. Los costos generados por esperas, restricciones o una segunda visita podrán cobrarse adicionalmente."],
  ["Traslado", "El valor del traslado se calculará automáticamente según la ubicación seleccionada y se incorporará al total del servicio. Cualquier cambio posterior de dirección podrá modificar dicho valor."],
  ["Uso y daños", "El cliente será responsable por los daños, pérdidas o roturas ocasionados por él o sus invitados al equipamiento, accesorios o elementos de BOOMBOX. Los costos de reparación o reposición serán informados mediante cotización o respaldo técnico."],
  ["Seguridad", "BOOMBOX podrá suspender temporal o definitivamente el servicio si existe mal uso, riesgo para las personas, agresiones al operador o peligro para los equipos. Si la suspensión se debe a estas causas, no corresponderá devolución por el tiempo no utilizado."],
  ["Contingencias técnicas", "Ante una falla atribuible a BOOMBOX, la empresa dispondrá de hasta 45 minutos para intentar solucionarla. Si no fuera posible restablecer el servicio, se devolverá proporcionalmente el valor correspondiente al tiempo no prestado."],
  ["Entrega del material", "El respaldo digital será enviado dentro de los 7 días hábiles posteriores al evento mediante un enlace disponible durante 10 días. Será responsabilidad del cliente descargar y respaldar los archivos dentro de dicho plazo."],
  ["Fuerza mayor", "Si el servicio no puede realizarse por hechos imprevisibles o ajenos a las partes, estas procurarán reprogramarlo de común acuerdo. Cualquier modificación deberá quedar confirmada por escrito."],
] as const;

export function CustomerSigningExperience(props: CustomerSigningExperienceProps) {
  const company = useCompanySettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState(false);
  const [termsRead, setTermsRead] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const [portalMessage, setPortalMessage] = useState("");
  const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const reservation = Math.round(props.total * 0.5);
  const balance = props.total - reservation;
  const summary = <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-muted">Servicio</dt><dd className="font-semibold">{props.service}</dd></div><div><dt className="text-muted">Horas</dt><dd className="font-semibold">{props.hours}</dd></div><div><dt className="text-muted">Extras</dt><dd className="font-semibold">{props.extras}</dd></div><div><dt className="text-muted">Transporte</dt><dd className="font-semibold">{props.transport}</dd></div><div><dt className="text-muted">Reserva</dt><dd className="font-semibold">{money.format(reservation)}</dd></div><div><dt className="text-muted">Saldo restante</dt><dd className="font-semibold">{money.format(balance)}</dd></div><div className="border-t pt-3 sm:col-span-2"><dt className="font-semibold">TOTAL</dt><dd className="mt-1 text-2xl font-semibold text-brand">{money.format(props.total)}</dd></div></dl>;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * ratio));
      const height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (context) { context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = 2.5 * ratio; context.strokeStyle = "#f59e0b"; }
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pending) return;
    setProgressStep(0);
    const timer = window.setInterval(() => setProgressStep((current) => Math.min(current + 1, confirmationSteps.length - 1)), 10_000);
    return () => window.clearInterval(timer);
  }, [pending]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const canvas = event.currentTarget; const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) }; };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const context = event.currentTarget.getContext("2d"); const p = point(event); context?.beginPath(); context?.moveTo(p.x, p.y); };
  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const context = event.currentTarget.getContext("2d"); const p = point(event); context?.lineTo(p.x, p.y); context?.stroke(); setInk(true); };
  const stop = () => { drawing.current = false; };
  const clear = () => { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); setInk(false); setMessage(""); };
  const confirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !accepted || !ink) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/signing/${encodeURIComponent(props.token)}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signatureDataUrl: canvas.toDataURL("image/png") }) });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "No fue posible confirmar la firma del contrato.");
      setDone(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible confirmar la firma del contrato."); }
    finally { setPending(false); }
  };

  if (done) {
    const portalUrl = "https://orbit.boom-box.cl/portal";
    const benefits = ["Ver tu contrato", "Seguir tu evento", "Subir diseños", "Ver tus pagos", "Descargar documentos", "Descargar tu galería", `Contactar a ${company.brandName}`];
    const copyPortal = async () => { await navigator.clipboard.writeText(portalUrl); setPortalMessage("Enlace copiado."); };
    return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12"><div className="mx-auto max-w-3xl space-y-6"><header className="rounded-3xl border bg-card p-7 text-center shadow-2xl sm:p-12"><div aria-hidden="true" className="text-5xl">🎉</div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-brand">Reserva confirmada</p><h1 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">¡Reserva confirmada!</h1><p className="mt-5 text-lg font-medium">Bienvenido a {company.brandName}.</p><p className="mt-2 text-muted">Tu reserva ha sido confirmada correctamente.</p><div className="mt-7 rounded-2xl border bg-background/35 p-5 text-left"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Resumen comercial</p>{summary}</div><p className="mx-auto mt-6 max-w-xl text-sm leading-6 text-muted">En los próximos minutos recibirás una copia de tu contrato firmado en tu correo electrónico. Continúa tu experiencia desde el Portal {company.brandName}.</p><div className="mt-8 grid gap-3 sm:grid-cols-3"><a className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground" href={portalUrl}>Abrir Portal</a><ActionButton label="Copiar Portal" onClick={() => void copyPortal()} variant="outline"/><a className="inline-flex min-h-12 items-center justify-center rounded-xl border px-5 text-sm font-semibold" href={`mailto:?subject=${encodeURIComponent(`Acceso Portal ${company.brandName}`)}&body=${encodeURIComponent(portalUrl)}`}>Enviar Portal</a></div>{portalMessage&&<p aria-live="polite" className="mt-4 text-sm text-success">{portalMessage}</p>}</header><section className="rounded-3xl border bg-card p-6 sm:p-8"><h2 className="text-2xl font-semibold">Desde el Portal puedes</h2><ul className="mt-5 grid gap-3 sm:grid-cols-2">{benefits.map((item) => <li className="flex items-start gap-3 rounded-xl border bg-background/30 p-4 text-sm" key={item}><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success"/><span>{item}</span></li>)}</ul></section><section className="rounded-3xl border bg-card p-6 sm:p-8"><h2 className="text-2xl font-semibold">Accede utilizando</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border p-4 font-semibold">Tu RUT</div><div className="rounded-xl border p-4 font-semibold">La fecha de tu evento</div></div><p className="mt-5 text-sm font-medium text-brand">Sin cuenta. Sin contraseña. Sin registro.</p></section></div></main>;
  }

  return <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12"><div className="mx-auto max-w-3xl"><header className="rounded-3xl border bg-card p-6 sm:p-9"><div className="flex items-center gap-3 text-brand"><FileSignature className="size-6"/><span className="text-sm font-semibold">{company.brandName} · CONTRATO</span></div><h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">Revisa y firma tu contrato</h1><p className="mt-4 leading-7 text-muted">{props.customer} · {props.project} · {props.eventDate}</p><div className="mt-6 rounded-2xl border bg-background/40 p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Resumen comercial</p>{summary}<p className="mt-4 text-xs text-muted">Versión {props.agreementVersion}</p></div></header><section className="mt-6 rounded-3xl border bg-card p-6 sm:p-9"><h2 className="text-2xl font-semibold">Términos y condiciones BOOMBOX</h2><p className="mt-2 text-sm text-muted">Desplázate hasta el final para habilitar la aceptación.</p><div className="mt-6 max-h-[30rem] space-y-6 overflow-y-auto rounded-2xl border bg-background/30 p-5 sm:p-7" onScroll={(event) => { const element = event.currentTarget; if (element.scrollHeight - element.scrollTop - element.clientHeight < 12) setTermsRead(true); }} tabIndex={0}>{boomboxTerms.map(([title, content]) => <section key={title}><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{content}</p></section>)}</div><label className={`mt-7 flex items-start gap-3 rounded-xl border p-4 ${termsRead ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}><input checked={accepted} className="mt-1 size-5 accent-[var(--brand)]" disabled={!termsRead || pending} onChange={(event) => setAccepted(event.target.checked)} type="checkbox"/><span><strong>He leído y acepto.</strong><span className="mt-1 block text-sm text-muted">{termsRead ? "La firma quedará vinculada únicamente a este contrato." : "Lee el documento completo para continuar."}</span></span></label></section><section className={accepted?"mt-6 rounded-3xl border bg-card p-6 sm:p-9":"mt-6 rounded-3xl border bg-card p-6 opacity-55 sm:p-9"}><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-brand"/><h2 className="text-2xl font-semibold">Firma</h2></div><p className="mt-3 text-sm leading-6 text-muted">{accepted?"Firma con el dedo, mouse o lápiz.":"Lee y acepta los términos para habilitar la firma."}</p><canvas aria-label="Área para firmar" className="mt-6 h-64 w-full touch-none rounded-xl border border-dashed bg-background" onPointerCancel={stop} onPointerDown={!accepted||pending?undefined:start} onPointerLeave={stop} onPointerMove={!accepted||pending?undefined:draw} onPointerUp={stop} ref={canvasRef}/>{pending ? <div aria-live="polite" className="mt-6 rounded-2xl border bg-background/40 p-5 sm:p-6"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success"/><div><p className="font-semibold">Firma recibida.</p><p className="mt-1 text-sm text-muted">Estamos finalizando tu contrato.</p><p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-muted">Tiempo estimado: hasta 60 segundos.</p></div></div><ol className="mt-6 space-y-3">{confirmationSteps.map((step, index) => <li className="flex items-center gap-3 text-sm" key={step}><span className={index <= progressStep ? "grid size-6 place-items-center rounded-full bg-success-soft text-success" : "grid size-6 place-items-center rounded-full border text-muted"}>{index < progressStep ? "✓" : index + 1}</span><span className={index <= progressStep ? "font-medium" : "text-muted"}>{step}</span></li>)}</ol></div> : <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-between"><ActionButton disabled={!ink} icon={RotateCcw} label="Limpiar firma" onClick={clear} variant="outline"/><ActionButton disabled={!ink || !accepted} label="Confirmar firma" onClick={() => void confirm()}/></div>}{message&&<p className="mt-4 text-sm text-danger">{message}</p>}</section></div></main>;
}
