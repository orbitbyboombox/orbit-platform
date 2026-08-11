"use client";

import { Check, ChevronLeft, ChevronRight, Copy, FileSignature, Link2, LoaderCircle, PenLine, RotateCcw, Send, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { MunicipalityCombobox } from "@/components/forms/municipality-combobox";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";
import { cn } from "@/lib/utils";
import { sendAutomaticBookingInvitationAction } from "@/features/automatic-booking/actions";
import { projectOrigins, projectTypes, type Project, type ProjectDraft, type ProjectOrigin, type ProjectService, type ProjectType } from "../types/project";

const steps = ["Método", "Cliente", "Evento", "Servicio + extras", "Contrato", "Pago", "Confirmación"] as const;
const initialDraft: ProjectDraft = {
  client: { name: "", email: "", phone: "", rut: "", address: "" },
  event: {
    date: "",
    time: "",
    location: "",
    city: "",
    durationHours: 2,
    extras: [],
  },
  services: [],
  notes: "",
};
const typeLabels: Record<ProjectType, string> = {
  Wedding: "Matrimonio",
  Corporate: "Corporativo",
  Birthday: "Cumpleaños",
  Graduation: "Graduación",
  Private: "Privado",
  Other: "Otro",
};
const originLabels: Record<ProjectOrigin, string> = {
  WhatsApp: "WhatsApp",
  Instagram: "Instagram",
  Google: "Google",
  Website: "Página Web",
  Referral: "Referido",
  FormerClient: "Cliente antiguo",
  Other: "Otro",
};
const extraCodes = {
  Branding: "BRANDING",
  QR: "QR",
  Imanes: "UNLIMITED_MAGNETS",
} as const;
type ServiceExtra = "Branding" | "QR" | "Imanes" | "Scrapbook";
type ServiceConfiguration = {
  hours: number;
  additionalHours: number;
  extras: ServiceExtra[];
  brandingQuantity: number;
};
type CreditTerm = "CASH" | "15" | "30" | "45" | "60" | "90" | "CUSTOM";
const initialService = (service: ReservationService): ServiceConfiguration => ({
  hours: service.minimumHours as ServiceConfiguration["hours"],
  additionalHours: 0,
  extras: service.defaultExtras.map(masterExtraToReservation).filter((extra): extra is ServiceExtra => extra !== null),
  brandingQuantity: 2,
});
const currency = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const reservationProcessingTimeoutMs = 60_000;

async function withReservationTimeout<T>(operation: Promise<T>) {
  let timeoutId = 0;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("La reserva está tardando más de lo esperado. Inténtalo nuevamente.")), reservationProcessingTimeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const boomboxTerms = [
  ["Reserva y pago", "La fecha quedará reservada una vez firmado el contrato y abonado el 50% del valor total. El saldo restante deberá pagarse durante la semana previa al evento. La reserva no es reembolsable, pues bloquea exclusivamente la fecha y horario seleccionados."],
  ["Reprogramación", "El cliente podrá solicitar un cambio de fecha, sujeto a disponibilidad de BOOMBOX. Los valores podrán actualizarse si la nueva fecha corresponde a otra temporada, ubicación o condición de servicio. La reserva podrá cederse a otra persona previa autorización escrita."],
  ["Horario contratado", "El servicio comenzará y finalizará en el horario acordado. Los atrasos propios del evento no extenderán automáticamente el servicio. Toda hora adicional deberá ser solicitada y pagada, quedando sujeta a disponibilidad."],
  ["Acceso e instalación", "El cliente deberá asegurar acceso oportuno al recinto, un espacio adecuado y conexión eléctrica independiente de 220 V. Los costos generados por esperas, restricciones o una segunda visita podrán cobrarse adicionalmente."],
  ["Traslado", "El valor del traslado se calculará automáticamente según la ubicación seleccionada y se incorporará al total del servicio. Cualquier cambio posterior de dirección podrá modificar dicho valor."],
  ["Uso y daños", "El cliente será responsable por daños, pérdidas o roturas ocasionados por él o sus invitados al equipamiento, accesorios o elementos de BOOMBOX."],
  ["Seguridad", "BOOMBOX podrá suspender el servicio si existe mal uso, riesgo para las personas, agresiones al operador o peligro para los equipos."],
  ["Contingencias técnicas", "Ante una falla atribuible a BOOMBOX, la empresa dispondrá de hasta 45 minutos para intentar solucionarla. Si no fuera posible, se devolverá proporcionalmente el valor correspondiente al tiempo no prestado."],
  ["Entrega del material", "El respaldo digital será enviado dentro de los 7 días hábiles posteriores al evento mediante un enlace disponible durante 10 días."],
  ["Fuerza mayor", "Si el servicio no puede realizarse por hechos imprevisibles o ajenos a las partes, estas procurarán reprogramarlo de común acuerdo."],
] as const;

export interface ReservationCommercialPrice {
  category: "SERVICE" | "EXTRA" | "TRANSPORT";
  code: string;
  label: string;
  durationHours: number | null;
  destination: string | null;
  unitPrice: number | null;
  pricingStatus: "DEFINED" | "REQUIRES_QUOTE";
  rules?: Record<string, unknown>;
}
export interface ReservationVenue {
  name: string;
  municipality: string;
  province: string;
  surcharge: number;
}
export interface ReservationService {
  code: string;
  name: string;
  displayOrder: number;
  minimumHours: number;
  maximumHours: number;
  additionalHourPrice: number;
  compatibleExtras: string[];
  defaultExtras: string[];
  behavior: string;
}
const masterExtraToReservation = (code: string): ServiceExtra | null => code === "BRANDING" ? "Branding" : code === "QR" ? "QR" : code === "UNLIMITED_MAGNETS" ? "Imanes" : code === "SCRAPBOOK" ? "Scrapbook" : null;
export interface NewProjectDrawerProps {
  commercialPrices: ReservationCommercialPrice[];
  municipalities: ActiveMunicipality[];
  services: ReservationService[];
  venues: ReservationVenue[];
  open: boolean;
  onClose: () => void;
  onCreate: (draft: ProjectDraft) => Promise<Project>;
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <input className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/40" id={id} {...props} />
    </label>
  );
}

function TextArea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <textarea className="mt-2 min-h-24 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/40" id={id} {...props} />
    </label>
  );
}

function SignaturePad({ disabled, onConfirmed }: { disabled: boolean; onConfirmed: (confirmed: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [ink, setInk] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const context = canvas.getContext("2d");
      if (context) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 2.5 * ratio;
        context.strokeStyle = "#f59e0b";
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || confirmed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = event.currentTarget.getContext("2d");
    const current = point(event);
    context?.beginPath();
    context?.moveTo(current.x, current.y);
  };
  const draw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled || confirmed) return;
    const context = event.currentTarget.getContext("2d");
    const current = point(event);
    context?.lineTo(current.x, current.y);
    context?.stroke();
    setInk(true);
  };
  const stop = () => {
    drawing.current = false;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setInk(false);
    setConfirmed(false);
    onConfirmed(false);
  };
  const confirm = () => {
    if (!ink) return;
    setConfirmed(true);
    onConfirmed(true);
  };
  return (
    <section className="rounded-2xl border bg-background/30 p-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-brand" />
        <div>
          <h3 className="font-semibold">Firma</h3>
          <p className="mt-1 text-sm text-muted">Firma con mouse, dedo o lápiz.</p>
        </div>
      </div>
      <canvas aria-label="Área para firmar" className="mt-5 h-56 w-full touch-none rounded-xl border border-dashed bg-background" onPointerCancel={stop} onPointerDown={start} onPointerLeave={stop} onPointerMove={draw} onPointerUp={stop} ref={canvasRef} />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <ActionButton disabled={!ink || confirmed} icon={RotateCcw} label="Limpiar firma" onClick={clear} variant="outline" />
        <ActionButton disabled={!ink || confirmed} label={confirmed ? "Firma confirmada" : "Confirmar firma"} onClick={confirm} />
      </div>
    </section>
  );
}

function CommercialSummary({ balance, discount, extras, plan, reservation, subtotal, total }: { balance: number; discount: number; extras: Array<{ label: string; value: string }>; plan: { name: string; hours: number; price: number } | null; reservation: number; subtotal: number; total: number }) {
  return (
    <section aria-live="polite" className="reservation-summary-panel rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Resumen de reserva</p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="rounded-xl border bg-background/40 p-3">
          <dt className="text-xs font-semibold uppercase tracking-[.14em] text-muted">Plan contratado</dt>
          <dd className="mt-1 space-y-1 font-medium">
            {plan ? <span className="flex items-start justify-between gap-3"><span><strong className="block">{plan.name}</strong>{plan.hours} Horas</span><strong className="shrink-0 text-brand">{currency.format(plan.price)}</strong></span> : "Servicio pendiente"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[.14em] text-muted">Extras</dt>
          <dd className="mt-2 space-y-2">
            {extras.length ? extras.map((item) => <span className="flex justify-between gap-3" key={item.label}><span className="text-muted">{item.label}</span><strong className="text-right font-medium">{item.value}</strong></span>) : <span className="text-muted">Sin extras</span>}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">SUBTOTAL</dt>
          <dd className="font-semibold">{currency.format(subtotal)}</dd>
        </div>
        {discount > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Descuento comercial</dt><dd className="font-semibold text-success">−{currency.format(discount)}</dd></div>}
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Reserva</dt>
          <dd className="font-medium">{currency.format(reservation)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Saldo restante</dt>
          <dd className="font-medium">{currency.format(balance)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">TOTAL</dt>
          <dd className="text-xl font-semibold text-brand">{currency.format(total)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function NewProjectDrawer({ commercialPrices, municipalities, services, venues, open, onClose, onCreate }: NewProjectDrawerProps) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"MANUAL" | "AUTOMATIC">("MANUAL");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationFeedback, setInvitationFeedback] = useState("");
  const [invitationPending, setInvitationPending] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  const [configurations, setConfigurations] = useState<Partial<Record<ProjectService, ServiceConfiguration>>>({});
  const [eventAddress, setEventAddress] = useState("");
  const [operationalContact, setOperationalContact] = useState("");
  const [operationalPhone, setOperationalPhone] = useState("+569");
  const [mainContact, setMainContact] = useState("");
  const [bride, setBride] = useState("");
  const [groom, setGroom] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [commercialNotes, setCommercialNotes] = useState("");
  const [termsRead, setTermsRead] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signatureConfirmed, setSignatureConfirmed] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"TRANSFER" | "MERCADO_PAGO">("TRANSFER");
  const [creditTerm, setCreditTerm] = useState<CreditTerm>("CASH");
  const [customCreditDays, setCustomCreditDays] = useState(0);
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [receipt, setReceipt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [portalMessage, setPortalMessage] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [adjustmentValue, setAdjustmentValue] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const serviceByCode = new Map(services.map((service) => [service.code, service]));
  const serviceLabel = (service: ProjectService) => serviceByCode.get(service)?.name ?? service;
  const additionalHourRate = (service: ProjectService) => serviceByCode.get(service)?.additionalHourPrice ?? 0;
  const compatibleExtras = (service: ProjectService) => (serviceByCode.get(service)?.compatibleExtras ?? []).map(masterExtraToReservation).filter((extra): extra is ServiceExtra => extra !== null);

  const selectedMunicipality = municipalities.find((item) => item.name === draft.event.city) ?? null;
  const selectedVenue = venues.find((venue) => venue.name.localeCompare(draft.event.location.trim(), "es", { sensitivity: "base" }) === 0) ?? null;
  const transportTotal = selectedMunicipality?.pricingStatus === "DEFINED" ? selectedMunicipality.transport : null;
  const venueSurcharge = Number(selectedVenue?.surcharge ?? 0);
  const includedExtras: ServiceExtra[] = draft.type === "Wedding" ? ["QR", "Scrapbook"] : draft.type === "Birthday" || draft.type === "Graduation" ? ["QR"] : [];
  const priceFor = (category: ReservationCommercialPrice["category"], code: string, durationHours?: number) => commercialPrices.find((price) => price.category === category && price.code === code && (category !== "SERVICE" || price.durationHours === durationHours || price.durationHours === null));
  const brandingPrice = priceFor("EXTRA", extraCodes.Branding);
  const brandingMinimum = Math.max(2, Number(brandingPrice?.rules?.minimumQuantity ?? 2));
  const brandingMaximum = Math.min(4, Math.max(brandingMinimum, Number(brandingPrice?.rules?.maximumQuantity ?? 4)));
  const extraUnitPrice = (extra: ServiceExtra) => {
    if (includedExtras.includes(extra)) return 0;
    if (extra === "Scrapbook" && draft.type === "Corporate") return 50_000;
    const code = extraCodes[extra as keyof typeof extraCodes];
    return code ? (priceFor("EXTRA", code)?.unitPrice ?? 0) : 0;
  };
  const compatibleIncludedExtras = (service: ProjectService) => includedExtras.filter((extra) => compatibleExtras(service).includes(extra));
  const serviceBasePrice = (service: ProjectService, configuration: ServiceConfiguration) => {
    const definition = serviceByCode.get(service);
    const exact = priceFor("SERVICE", service, configuration.hours)?.unitPrice;
    const base = priceFor("SERVICE", service, definition?.minimumHours)?.unitPrice;
    if (exact != null) return Number(exact);
    return Number(base ?? 0) + Math.max(0, configuration.hours - (definition?.minimumHours ?? configuration.hours)) * additionalHourRate(service);
  };
  const serviceTotal = (service: ProjectService, configuration: ServiceConfiguration) => {
    const base = serviceBasePrice(service, configuration);
    const extras = Array.from(new Set([...configuration.extras, ...compatibleIncludedExtras(service)])).reduce((sum, extra) => sum + (extra === "Branding" ? Number(extraUnitPrice(extra)) * configuration.brandingQuantity : Number(extraUnitPrice(extra))), 0);
    return base + configuration.additionalHours * additionalHourRate(service) + extras;
  };
  const servicesTotal = (Object.entries(configurations) as Array<[ProjectService, ServiceConfiguration]>).reduce((sum, [service, configuration]) => sum + serviceTotal(service, configuration), 0);
  const commercialTotal = servicesTotal + Number(transportTotal ?? 0) + venueSurcharge;
  const discountTotal = Math.min(commercialTotal, Math.max(0, adjustmentType === "PERCENT" ? Math.round(commercialTotal * Math.min(adjustmentValue, 100) / 100) : adjustmentValue));
  const adjustedSubtotal = commercialTotal - discountTotal;
  const payableTotal = Math.round(adjustedSubtotal * (paymentMethod === "MERCADO_PAGO" ? 1.05 : 1));
  const reservationTotal = Math.round(payableTotal * 0.5);
  const balanceTotal = payableTotal - reservationTotal;
  const compatibleIncludedExtrasSelected = (Object.keys(configurations) as ProjectService[]).flatMap(compatibleIncludedExtras);
  const consolidatedExtras =
    Array.from(new Set([...(Object.values(configurations) as ServiceConfiguration[]).flatMap((configuration) => configuration.extras), ...compatibleIncludedExtrasSelected]))
      .map((extra) => (extra === "Branding" ? `Branding (${Math.max(...(Object.values(configurations) as ServiceConfiguration[]).map((configuration) => (configuration.extras.includes("Branding") ? configuration.brandingQuantity : 0)))} caras)` : extra))
      .join(" · ") || "Sin extras";
  const selectedConfigurations = Object.values(configurations) as ServiceConfiguration[];
  const extraSelected = (extra: ServiceExtra) => compatibleIncludedExtrasSelected.includes(extra) || selectedConfigurations.some((configuration) => configuration.extras.includes(extra));
  const extraSubtotal = (extra: ServiceExtra) => selectedConfigurations.reduce((sum, configuration) => sum + (configuration.extras.includes(extra) ? Number(extraUnitPrice(extra)) * (extra === "Branding" ? configuration.brandingQuantity : 1) : 0), 0);
  const brandingQuantityTotal = selectedConfigurations.reduce((sum, configuration) => sum + (configuration.extras.includes("Branding") ? configuration.brandingQuantity : 0), 0);
  const primaryService = draft.services[0] ?? null;
  const primaryConfiguration = primaryService ? configurations[primaryService] ?? null : null;
  const plan = primaryService && primaryConfiguration ? { name: serviceLabel(primaryService), hours: primaryConfiguration.hours, price: serviceBasePrice(primaryService, primaryConfiguration) } : null;
  const commercialExtras: Array<{ label: string; value: string }> = [];
  draft.services.slice(1).forEach((service) => { const configuration = configurations[service]; if (configuration) commercialExtras.push({ label: `${serviceLabel(service)} · ${configuration.hours} horas`, value: `+${currency.format(serviceBasePrice(service, configuration))}` }); });
  (Object.entries(configurations) as Array<[ProjectService, ServiceConfiguration]>).forEach(([service, configuration]) => { if (configuration.additionalHours > 0) commercialExtras.push({ label: `${serviceLabel(service)} · ${configuration.additionalHours} h adicional${configuration.additionalHours > 1 ? "es" : ""}`, value: `+${currency.format(configuration.additionalHours * additionalHourRate(service))}` }); });
  if (brandingQuantityTotal) commercialExtras.push({ label: `Branding · ${brandingQuantityTotal} caras`, value: `+${currency.format(extraSubtotal("Branding"))}` });
  if (compatibleIncludedExtrasSelected.includes("QR")) commercialExtras.push({ label: "QR", value: "Incluido" }); else if (extraSelected("QR")) commercialExtras.push({ label: "QR", value: `+${currency.format(extraSubtotal("QR"))}` });
  if (extraSelected("Imanes")) commercialExtras.push({ label: "Imanes", value: `+${currency.format(extraSubtotal("Imanes"))}` });
  if (compatibleIncludedExtrasSelected.includes("Scrapbook")) commercialExtras.push({ label: "Scrapbook", value: "Incluido" }); else if (extraSelected("Scrapbook")) commercialExtras.push({ label: "Scrapbook", value: `+${currency.format(extraSubtotal("Scrapbook"))}` });
  if (selectedMunicipality && transportTotal !== null) commercialExtras.push({ label: `Transporte · ${selectedMunicipality.province}`, value: transportTotal ? `+${currency.format(transportTotal)}` : "Incluido" });
  if (venueSurcharge > 0) commercialExtras.push({ label: `Recargo sede · ${selectedVenue?.name}`, value: `+${currency.format(venueSurcharge)}` });
  const isCorporateCustomer = draft.type === "Corporate";
  const paymentDueDate = (() => {
    const base = isCorporateCustomer ? new Date() : draft.event.date ? new Date(`${draft.event.date}T12:00:00`) : null;
    if (!base || Number.isNaN(base.getTime())) return null;
    const days = isCorporateCustomer ? (creditTerm === "CUSTOM" ? customCreditDays : Number(creditTerm === "CASH" ? 0 : creditTerm)) : -7;
    base.setDate(base.getDate() + days);
    return base;
  })();
  const formattedDueDate = paymentDueDate ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(paymentDueDate) : "Pendiente de fecha del evento";
  const mercadoPagoCommission = payableTotal - adjustedSubtotal;
  const summaryExtras = [...commercialExtras, ...(paymentMethod === "MERCADO_PAGO" ? [{ label: "Comisión Mercado Pago", value: `+${currency.format(mercadoPagoCommission)}` }] : [])];

  if (!open) return null;
  const client = (field: keyof ProjectDraft["client"], value: string) =>
    setDraft((current) => ({
      ...current,
      client: { ...current.client, [field]: value },
    }));
  const event = (field: keyof ProjectDraft["event"], value: string | number | string[]) =>
    setDraft((current) => ({
      ...current,
      event: { ...current.event, [field]: value },
    }));
  const reset = () => {
    setStep(0);
    setMethod("MANUAL");
    setInvitationEmail("");
    setInvitationFeedback("");
    setInvitationPending(false);
    setDraft(initialDraft);
    setConfigurations({});
    setEventAddress("");
    setOperationalContact("");
    setOperationalPhone("+569");
    setMainContact("");
    setBride("");
    setGroom("");
    setSpecialRequests("");
    setCommercialNotes("");
    setTermsRead(false);
    setTermsAccepted(false);
    setSignatureConfirmed(false);
    setPaymentMethod("TRANSFER");
    setCreditTerm("CASH");
    setCustomCreditDays(0);
    setPurchaseOrder("");
    setReceipt("");
    setSubmitting(false);
    setError("");
    setCreatedProject(null);
    setPortalMessage("");
    setAdjustmentType("FIXED");
    setAdjustmentValue(0);
    setAdjustmentReason("");
    onClose();
  };
  const toggleService = (service: ProjectService) => {
    const definition = serviceByCode.get(service);
    if (!definition) return;
    setConfigurations((current) => {
      const next = { ...current };
      if (next[service]) delete next[service];
      else next[service] = initialService(definition);
      return next;
    });
    setDraft((current) => ({
      ...current,
      services: current.services.includes(service) ? current.services.filter((item) => item !== service) : [...current.services, service],
    }));
  };
  const updateService = (service: ProjectService, update: Partial<ServiceConfiguration>) =>
    setConfigurations((current) => ({
      ...current,
      [service]: {
        ...(current[service] ?? initialService(serviceByCode.get(service)!)),
        ...update,
      },
    }));
  const toggleServiceExtra = (service: ProjectService, extra: ServiceExtra) => {
    const definition = serviceByCode.get(service);
    if (!definition) return;
    const configuration = configurations[service] ?? initialService(definition);
    updateService(service, {
      extras: configuration.extras.includes(extra) ? configuration.extras.filter((item) => item !== extra) : [...configuration.extras, extra],
    });
  };
  const customerValid = Boolean((draft.client.name ?? "").trim() && /^[0-9]{7,8}-[0-9K]$/.test(draft.client.rut ?? "") && (draft.client.phone ?? "").length === 12 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.client.email ?? ""));
  const valid = step === 0 ? method === "MANUAL" : step === 1 ? customerValid : step === 2 ? Boolean(draft.type && draft.event.location && eventAddress && draft.event.city && draft.event.date && draft.event.time && operationalContact && operationalPhone.length === 12 && (draft.type === "Wedding" ? bride && groom : mainContact)) : step === 3 ? draft.services.length > 0 && (discountTotal === 0 || Boolean(adjustmentReason.trim())) : step === 4 ? termsAccepted && signatureConfirmed : step === 5 ? paymentMethod === "MERCADO_PAGO" || Boolean(receipt) : true;
  const create = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError("");
    try {
      const serviceDetails = (Object.entries(configurations) as Array<[ProjectService, ServiceConfiguration]>).map(([service, configuration]) => `${serviceLabel(service)}: ${configuration.hours} h + ${configuration.additionalHours} h adicionales · ${Array.from(new Set([...configuration.extras, ...compatibleIncludedExtras(service)])).join(", ") || "sin extras"}`).join("\n");
      const maximumHours = Math.max(2, ...(Object.values(configurations) as ServiceConfiguration[]).map((configuration) => configuration.hours + configuration.additionalHours));
      const project = await withReservationTimeout(
        onCreate({
          ...draft,
          commercialAdjustment: discountTotal > 0 ? { type: adjustmentType, value: adjustmentValue, reason: adjustmentReason.trim(), subtotal: commercialTotal } : undefined,
          event: {
            ...draft.event,
            durationHours: maximumHours,
            extras: [...Array.from(new Set([...(Object.values(configurations) as ServiceConfiguration[]).flatMap((configuration) => configuration.extras), ...compatibleIncludedExtrasSelected])), ...(transportTotal !== null ? ["Transporte"] : [])],
          },
          notes: [draft.notes, `Dirección evento: ${eventAddress}`, `Provincia: ${selectedMunicipality?.province ?? "Por confirmar"}`, `Contacto operacional: ${operationalContact} · ${operationalPhone}`, draft.type === "Wedding" ? `Novia: ${bride} · Novio: ${groom}` : `Contacto principal: ${mainContact}`, serviceDetails, specialRequests && `Solicitudes especiales: ${specialRequests}`, commercialNotes && `Notas comerciales: ${commercialNotes}`, "Términos BOOMBOX aceptados", "Firma manuscrita confirmada", `Total comercial: ${currency.format(payableTotal)}`, `Método de pago: ${paymentMethod}`, `Estado de pago: Pendiente`, `Vencimiento: ${formattedDueDate}`, isCorporateCustomer && `Condición de pago: ${creditTerm === "CUSTOM" ? `${customCreditDays} días` : creditTerm === "CASH" ? "Contado" : `${creditTerm} días`}`, purchaseOrder && `Orden de compra: ${purchaseOrder}`, receipt && `Comprobante vinculado: ${receipt}`].filter(Boolean).join("\n"),
        }),
      );
      setCreatedProject(project);
      setStep(6);
    } catch (cause) {
      console.error("[ORBIT][RESERVATION_CONFIRMATION_FAILED]", cause);
      setError("No pudimos confirmar la reserva. Revisa los datos e inténtalo nuevamente. Si el problema continúa, contacta al administrador de ORBIT.");
    } finally {
      setSubmitting(false);
    }
  };
  const portalUrl = createdProject ? `${window.location.origin}/projects/${createdProject.id}#portal-cliente` : "";
  const confirmationEmailBody = createdProject ? [`Hola ${createdProject.client.name},`, "¡Reserva confirmada! Bienvenido a BOOMBOX.", "Resumen comercial", ...(Object.entries(configurations) as Array<[ProjectService, ServiceConfiguration]>).map(([service, configuration]) => `${serviceLabel(service)} · ${configuration.hours + configuration.additionalHours} horas · ${currency.format(serviceTotal(service, configuration))}`), `Extras: ${consolidatedExtras}`, `Transporte: ${currency.format(Number(transportTotal ?? 0))}`, `Reserva: ${currency.format(reservationTotal)}`, `Saldo restante: ${currency.format(balanceTotal)}`, `TOTAL: ${currency.format(payableTotal)}`, "Portal BOOMBOX", portalUrl, "Accede utilizando tu RUT y la fecha de tu evento."].join("\n\n") : "";

  const summary = <CommercialSummary balance={balanceTotal} discount={discountTotal} extras={summaryExtras} plan={plan} reservation={reservationTotal} subtotal={commercialTotal} total={payableTotal} />;

  return (
    <>
      <button aria-label="Cerrar nueva reserva" className="fixed inset-0 z-40 cursor-default bg-black/45 backdrop-blur-[2px]" onClick={reset} />
      <aside aria-label="Nueva reserva" className="fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l bg-card shadow-2xl">
        <header className="flex items-start justify-between border-b p-5 sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              Nueva reserva · Paso {step + 1} de {steps.length}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">{steps[step]}</h2>
          </div>
          <Button aria-label="Cerrar" onClick={reset} size="icon" variant="ghost">
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex gap-1.5 border-b px-5 py-4 sm:px-7">
          {steps.map((label, index) => (
            <span aria-label={label} className={cn("h-1.5 flex-1 rounded-full bg-accent", index <= step && "bg-brand")} key={label} />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {step === 0 && (
            <div className="mx-auto max-w-xl space-y-4">
              <h3 className="text-xl font-semibold">¿Cómo deseas crear esta reserva?</h3>
              <button className={cn("flex w-full items-start gap-4 rounded-2xl border p-5 text-left", method === "MANUAL" && "border-brand bg-brand/5")} onClick={() => setMethod("MANUAL")}>
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", method === "MANUAL" && "border-brand")}>
                  <span className={cn("size-2.5 rounded-full", method === "MANUAL" && "bg-brand")} />
                </span>
                <span>
                  <PenLine className="size-5 text-brand" />
                  <span className="mt-3 block font-semibold">Manual</span>
                  <span className="mt-1 block text-sm text-muted">Completa toda la reserva dentro de ORBIT.</span>
                </span>
              </button>
              <button className={cn("flex w-full gap-4 rounded-2xl border p-5 text-left", method === "AUTOMATIC" && "border-brand bg-brand/5")} onClick={() => { setMethod("AUTOMATIC"); setInvitationFeedback(""); }} type="button">
                <span className="mt-0.5 size-5 shrink-0 rounded-full border" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <Sparkles className="size-5" />
                    <span className="rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand">Disponible</span>
                  </span>
                  <span className="mt-3 block font-semibold">Automática</span>
                  <span className="mt-1 block text-sm text-muted">Ingresa solo el correo. El cliente completa el proceso.</span>
                </span>
              </button>
              {method === "AUTOMATIC" && <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5"><p className="text-sm font-semibold">Correo del cliente</p><input autoComplete="email" className="mt-3 h-12 w-full rounded-xl border bg-background px-4" onChange={(event) => setInvitationEmail(event.target.value)} placeholder="cliente@correo.cl" type="email" value={invitationEmail}/><Button className="mt-4 w-full" disabled={invitationPending || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail)} onClick={async()=>{setInvitationPending(true);setInvitationFeedback("");const result=await sendAutomaticBookingInvitationAction(invitationEmail);setInvitationFeedback(result.message);setInvitationPending(false);}}><Send className="size-4"/>{invitationPending?"Enviando invitación…":"Enviar invitación"}</Button>{invitationFeedback&&<p className="mt-3 text-sm" role="status">{invitationFeedback}</p>}</section>}
            </div>
          )}
          {step === 1 && (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field autoComplete="name" label="Nombre y Apellido" onChange={(e) => client("name", e.target.value)} required value={draft.client.name} />
                <Field
                  autoComplete="off"
                  inputMode="text"
                  label="RUT"
                  onChange={(e) => {
                    const raw = e.target.value
                      .replace(/[^0-9kK]/g, "")
                      .toUpperCase()
                      .slice(0, 9);
                    client("rut", raw.length > 1 ? `${raw.slice(0, -1)}-${raw.slice(-1)}` : raw);
                  }}
                  placeholder="12345678-9"
                  required
                  value={draft.client.rut}
                />
                <Field autoComplete="tel" inputMode="tel" label="Teléfono" onChange={(e) => client("phone", `+569${e.target.value.replace(/\D/g, "").replace(/^569/, "").slice(0, 8)}`)} required value={draft.client.phone || "+569"} />
                <Field autoComplete="email" label="Correo" onChange={(e) => client("email", e.target.value)} required type="email" value={draft.client.email} />
              </div>
              <Field autoComplete="street-address" label="Dirección" onChange={(e) => client("address", e.target.value)} value={draft.client.address} />
              <label className="block text-sm font-medium">
                Origen del contacto
                <select
                  className="mt-2 h-11 w-full rounded-lg border bg-background px-3"
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      origin: e.target.value as ProjectOrigin,
                    }))
                  }
                  value={draft.origin ?? ""}
                >
                  <option value="">Selecciona un origen</option>
                  {projectOrigins.map((origin) => (
                    <option key={origin} value={origin}>
                      {originLabels[origin]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button className="gap-2" onClick={() => document.querySelector<HTMLInputElement>('input[autocomplete="name"]')?.focus()} variant="outline">
                  <PenLine className="size-4" />
                  Editar
                </Button>
                <Button
                  className="gap-2 text-danger"
                  onClick={() => {
                    if (window.confirm("¿Eliminar los datos ingresados?"))
                      setDraft((current) => ({
                        ...current,
                        client: initialDraft.client,
                        origin: undefined,
                      }));
                  }}
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-6">
                <div>
                  <p className="mb-3 text-sm font-medium">Tipo de evento</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {projectTypes.map((type) => (
                      <button className={cn("min-h-12 rounded-xl border p-3 text-left text-sm", draft.type === type && "border-brand bg-brand/5")} key={type} onClick={() => setDraft((current) => ({ ...current, type }))}>
                        {typeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Field autoComplete="off" label="Lugar" list="orbit-event-venues" onChange={(e) => { const value = e.target.value; const venue = venues.find((item) => item.name.localeCompare(value.trim(), "es", { sensitivity: "base" }) === 0); setDraft((current) => ({ ...current, event: { ...current.event, location: value, city: venue?.municipality ?? "" } })); }} placeholder="Escribe el nombre de la sede" value={draft.event.location} />
                    <datalist id="orbit-event-venues">{venues.map((venue) => <option key={venue.name} value={venue.name}>{venue.municipality}</option>)}</datalist>
                    {draft.event.location && !selectedVenue && <p className="mt-2 text-xs text-muted">Selecciona una sede configurada en las sugerencias.</p>}
                  </div>
                  <Field label="Dirección del evento" onChange={(e) => setEventAddress(e.target.value)} value={eventAddress} />
                  <MunicipalityCombobox items={municipalities} onChange={(value) => event("city", value)} value={draft.event.city} />
                  <Field label="Fecha del evento" onChange={(e) => event("date", e.target.value)} required type="date" value={draft.event.date} />
                  <Field label="Inicio del servicio BOOMBOX" onChange={(e) => event("time", e.target.value)} type="time" value={draft.event.time} />
                  <Field label="Contacto operacional" onChange={(e) => setOperationalContact(e.target.value)} value={operationalContact} />
                  <Field inputMode="tel" label="Teléfono del contacto operacional" onChange={(e) => setOperationalPhone(`+569${e.target.value.replace(/\D/g, "").replace(/^569/, "").slice(0, 8)}`)} value={operationalPhone} />
                  {draft.type === "Wedding" ? (
                    <>
                      <Field label="Nombre de la novia" onChange={(e) => setBride(e.target.value)} value={bride} />
                      <Field label="Nombre del novio" onChange={(e) => setGroom(e.target.value)} value={groom} />
                    </>
                  ) : draft.type ? (
                    <Field label="Contacto principal" onChange={(e) => setMainContact(e.target.value)} value={mainContact} />
                  ) : null}
                </div>
                {selectedVenue && selectedMunicipality && (
                  <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                    <p className="font-semibold text-success">Transporte calculado automáticamente</p>
                    <p className="mt-1 text-sm text-muted">
                      {selectedVenue.name} · {selectedVenue.municipality} · Provincia {selectedVenue.province}
                    </p>
                    <p className="mt-2 text-lg font-semibold">{transportTotal == null ? "Precio por confirmar" : currency.format(transportTotal)}</p>
                    {venueSurcharge > 0 && <p className="mt-1 text-sm font-medium">Recargo especial de sede: {currency.format(venueSurcharge)}</p>}
                  </div>
                )}
                <p className="text-xs text-muted">La hora de término se calcula automáticamente según las horas contratadas.</p>
              </div>
              <aside className="h-fit max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-0">{summary}</aside>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-5">
                <div>
                  <p className="mb-3 text-sm font-medium">Servicio principal y servicios adicionales</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {services.map((service) => (
                      <button className={cn("min-h-12 rounded-xl border p-3 text-left text-sm", configurations[service.code] && "border-brand bg-brand/5")} key={service.code} onClick={() => toggleService(service.code)}>
                        <span className="block font-medium">{service.name}</span>
                        {draft.services[0] === service.code && <span className="mt-1 block text-xs text-brand">Servicio principal</span>}
                      </button>
                    ))}
                  </div>
                </div>
                {(Object.entries(configurations) as Array<[ProjectService, ServiceConfiguration]>).map(([service, configuration]) => (
                  <section className="rounded-2xl border p-5" key={service}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{serviceLabel(service)}</h3>
                      <strong className="text-brand">{currency.format(serviceTotal(service, configuration))}</strong>
                    </div>
                    {serviceByCode.get(service)?.behavior === "FIXED" ? (
                      <div className="mt-4 rounded-xl border bg-background/40 p-4">
                        <p className="text-xs font-medium uppercase tracking-[.14em] text-muted">Duración fija</p>
                        <p className="mt-1 text-lg font-semibold">{configuration.hours} Horas</p>
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium">
                          Horas
                          <select
                            className="mt-2 h-11 w-full rounded-lg border bg-background px-3"
                            onChange={(e) =>
                              updateService(service, {
                                hours: Number(e.target.value),
                              })
                            }
                            value={configuration.hours}
                          >
                            {Array.from({ length: Math.max(1, (serviceByCode.get(service)?.maximumHours ?? configuration.hours) - (serviceByCode.get(service)?.minimumHours ?? configuration.hours) + 1) }, (_, index) => (serviceByCode.get(service)?.minimumHours ?? configuration.hours) + index).map((hours) => (
                              <option key={hours} value={hours}>
                                {hours} horas
                              </option>
                            ))}
                          </select>
                        </label>
                        {serviceByCode.get(service)?.compatibleExtras.includes("ADDITIONAL_HOURS") && <Field
                          label={`Horas adicionales · ${currency.format(additionalHourRate(service))} c/u`}
                          min="0"
                          onChange={(e) =>
                            updateService(service, {
                              additionalHours: Math.max(0, Number(e.target.value)),
                            })
                          }
                          type="number"
                          value={configuration.additionalHours}
                        />}
                      </div>
                    )}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {compatibleExtras(service).map((extra) => {
                        const included = compatibleIncludedExtras(service).includes(extra);
                        const selected = included || configuration.extras.includes(extra);
                        const unit = extraUnitPrice(extra);
                        if (extra === "Branding")
                          return (
                            <label className={cn("rounded-xl border p-3 text-sm", selected && "border-brand bg-brand/5")} key={extra}>
                              <span className="font-semibold">Branding</span>
                              <span className="mt-1 block text-xs text-muted">
                                {currency.format(Number(unit))} por cara · mínimo {brandingMinimum}
                              </span>
                              <select
                                className="mt-3 h-10 w-full rounded-lg border bg-background px-3"
                                onChange={(e) => {
                                  const quantity = Number(e.target.value);
                                  const hasBranding = configuration.extras.includes("Branding");
                                  if (quantity === 0 && hasBranding) toggleServiceExtra(service, "Branding");
                                  else if (quantity > 0) {
                                    if (!hasBranding) toggleServiceExtra(service, "Branding");
                                    updateService(service, {
                                      brandingQuantity: quantity,
                                    });
                                  }
                                }}
                                value={configuration.extras.includes("Branding") ? configuration.brandingQuantity : 0}
                              >
                                <option value={0}>Sin Branding</option>
                                {Array.from(
                                  {
                                    length: brandingMaximum - brandingMinimum + 1,
                                  },
                                  (_, index) => brandingMinimum + index,
                                ).map((quantity) => (
                                  <option key={quantity} value={quantity}>
                                    {quantity} caras
                                  </option>
                                ))}
                              </select>
                            </label>
                          );
                        return (
                          <div className={cn("rounded-xl border p-3", selected && "border-brand bg-brand/5")} key={extra}>
                            <label className="flex items-start gap-3 text-sm">
                              <input checked={selected} disabled={included} onChange={() => toggleServiceExtra(service, extra)} type="checkbox" />
                              <span>
                                <strong>{extra === "QR" ? "QR Instantáneo" : extra}</strong>
                                <span className="mt-1 block text-xs text-muted">{included ? "Incluido · $0 · Bloqueado" : `+${currency.format(Number(unit))}`}</span>
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <TextArea label="Solicitudes especiales" onChange={(e) => setSpecialRequests(e.target.value)} value={specialRequests} />
                <TextArea label="Notas comerciales" onChange={(e) => setCommercialNotes(e.target.value)} value={commercialNotes} />
                <section className="rounded-2xl border border-brand/25 bg-brand/5 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Solo administración</p>
                    <h3 className="mt-1 text-lg font-semibold">Ajustes comerciales</h3>
                    <p className="mt-1 text-sm text-muted">Aplica un descuento antes de generar el Contrato.</p>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium">Tipo de descuento<select className="mt-2 h-11 w-full rounded-lg border bg-background px-3" onChange={(event) => setAdjustmentType(event.target.value as "FIXED" | "PERCENT")} value={adjustmentType}><option value="FIXED">Monto fijo</option><option value="PERCENT">Porcentaje</option></select></label>
                    <Field label={adjustmentType === "PERCENT" ? "Porcentaje" : "Monto"} max={adjustmentType === "PERCENT" ? 100 : undefined} min="0" onChange={(event) => setAdjustmentValue(Math.max(0, Number(event.target.value)))} type="number" value={adjustmentValue || ""} />
                  </div>
                  <div className="mt-4"><Field label="Motivo del descuento" onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Obligatorio al aplicar un descuento" required={discountTotal > 0} value={adjustmentReason} /></div>
                  {discountTotal > 0 && <p className="mt-3 text-sm font-medium text-success">Descuento aplicado: −{currency.format(discountTotal)}</p>}
                </section>
              </div>
              <aside className="h-fit max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-0">{summary}</aside>
            </div>
          )}
          {step === 4 && (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex items-center gap-3">
                <FileSignature className="size-6 text-brand" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">CONTRATO</p>
                  <h3 className="mt-1 text-2xl font-semibold">Resumen, condiciones y firma</h3>
                </div>
              </div>
              {summary}
              <section className="rounded-2xl border p-5 sm:p-6">
                <h3 className="text-xl font-semibold">Términos y Condiciones BOOMBOX</h3>
                <p className="mt-2 text-sm text-muted">Desplázate hasta el final para continuar.</p>
                <div
                  className="mt-5 max-h-80 space-y-5 overflow-y-auto rounded-xl border bg-background/30 p-5"
                  onScroll={(e) => {
                    const element = e.currentTarget;
                    if (element.scrollHeight - element.scrollTop - element.clientHeight < 12) setTermsRead(true);
                  }}
                  tabIndex={0}
                >
                  {boomboxTerms.map(([title, content]) => (
                    <section key={title}>
                      <h4 className="font-semibold">{title}</h4>
                      <p className="mt-2 text-sm leading-6 text-muted">{content}</p>
                    </section>
                  ))}
                </div>
                <label className={cn("mt-5 flex items-start gap-3 rounded-xl border p-4", !termsRead && "cursor-not-allowed opacity-60")}>
                  <input
                    checked={termsAccepted}
                    className="mt-1 size-5"
                    disabled={!termsRead}
                    onChange={(e) => {
                      setTermsAccepted(e.target.checked);
                      if (!e.target.checked) setSignatureConfirmed(false);
                    }}
                    required
                    type="checkbox"
                  />
                  <span>
                    <strong>He leído y acepto los Términos y Condiciones.</strong>
                    <span className="mt-1 block text-sm text-muted">{termsRead ? "La firma se habilitará inmediatamente." : "Lee el contrato completo para continuar."}</span>
                  </span>
                </label>
              </section>
              {termsAccepted && (
                <SignaturePad
                  disabled={!termsAccepted}
                  onConfirmed={(confirmed) => {
                    setSignatureConfirmed(confirmed);
                    if (confirmed) setStep(5);
                  }}
                />
              )}
            </div>
          )}
          {step === 5 && (
            <div className="mx-auto max-w-4xl space-y-5">
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">Resumen de reserva</p>
                {summary}
              </section>
              <div className="space-y-5">
                <section className="rounded-2xl border p-5">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">Cliente</p>
                  <h3 className="mt-2 text-lg font-semibold">{isCorporateCustomer ? "Empresa" : "Cliente Particular"}</h3>
                  {isCorporateCustomer ? (
                    <div className="mt-4 space-y-5">
                      <fieldset>
                        <legend className="text-sm font-semibold">Condición de pago</legend>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(
                            [
                              ["CASH", "Contado"],
                              ["15", "15 días"],
                              ["30", "30 días"],
                              ["45", "45 días"],
                              ["60", "60 días"],
                              ["90", "90 días"],
                              ["CUSTOM", "Personalizado"],
                            ] as Array<[CreditTerm, string]>
                          ).map(([value, label]) => (
                            <label className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm", creditTerm === value && "border-brand bg-brand/5")} key={value}>
                              <input checked={creditTerm === value} name="credit-term" onChange={() => setCreditTerm(value)} type="radio" />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      {creditTerm === "CUSTOM" && <Field label="Días de crédito" min="0" onChange={(e) => setCustomCreditDays(Math.max(0, Number(e.target.value)))} type="number" value={customCreditDays} />}
                      <Field label="Orden de compra (opcional)" onChange={(e) => setPurchaseOrder(e.target.value)} value={purchaseOrder} />
                      <dl className="grid gap-3 rounded-xl bg-background/40 p-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Factura</dt>
                          <dd className="mt-1 font-semibold">Se generará al confirmar</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Saldo pendiente</dt>
                          <dd className="mt-1 font-semibold">{currency.format(payableTotal)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Vencimiento</dt>
                          <dd className="mt-1 font-semibold">{formattedDueDate}</dd>
                        </div>
                        <div>
                          <dt className="text-muted">Estado</dt>
                          <dd className="mt-1 font-semibold">Crédito corporativo</dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <dl className="mt-4 grid gap-3 rounded-xl bg-background/40 p-4 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted">Reserva · 50%</dt>
                        <dd className="mt-1 text-lg font-semibold">{currency.format(reservationTotal)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Saldo restante · 50%</dt>
                        <dd className="mt-1 text-lg font-semibold">{currency.format(balanceTotal)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Vencimiento del saldo</dt>
                        <dd className="mt-1 font-semibold">{formattedDueDate}</dd>
                        <p className="mt-1 text-xs text-muted">Una semana antes del evento.</p>
                      </div>
                    </dl>
                  )}
                </section>
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">Método de pago</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button onClick={() => setPaymentMethod("TRANSFER")} variant={paymentMethod === "TRANSFER" ? "default" : "outline"}>
                      Transferencia
                    </Button>
                    <Button onClick={() => setPaymentMethod("MERCADO_PAGO")} variant={paymentMethod === "MERCADO_PAGO" ? "default" : "outline"}>
                      Mercado Pago +5%
                    </Button>
                  </div>
                </section>
                {paymentMethod === "TRANSFER" ? (
                  <div className="rounded-2xl border p-5 text-sm">
                    <p className="font-semibold">PRODUCCIONES BOOMBOX COMPANY SPA</p>
                    <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">RUT</dt>
                        <dd className="font-medium">76.565.272-3</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Banco</dt>
                        <dd className="font-medium">BCI</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Cuenta Corriente</dt>
                        <dd className="font-medium">52093409</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Correo</dt>
                        <dd className="font-medium">contabilidad@boom-box.cl</dd>
                      </div>
                    </dl>
                    <label className="mt-5 block font-medium">
                      Comprobante
                      <input accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-2 block w-full rounded-xl border p-3" onChange={(e) => setReceipt(e.target.files?.[0]?.name ?? "")} required type="file" />
                      <span className="mt-2 block text-xs text-muted">JPG, PNG, WEBP o PDF. {receipt ? `Vinculado: ${receipt}` : "Obligatorio para continuar."}</span>
                    </label>
                  </div>
                ) : (
                  <div className="rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
                    <p className="font-semibold">Comisión Mercado Pago</p>
                    <p className="mt-1 text-muted">5% · {currency.format(mercadoPagoCommission)}</p>
                    <p className="mt-3 font-medium">El total, la reserva y el saldo se actualizaron automáticamente.</p>
                  </div>
                )}
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">Estado del pago</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {["Pendiente", "Reserva recibida", "Pagado", "Crédito corporativo"].map((status, index) => (
                      <div className={cn("rounded-xl border p-3 text-center text-xs font-medium", index === 0 && "border-brand bg-brand/5 text-brand")} key={status}>
                        {status}
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}
          {step === 6 && createdProject && (
            <div className="mx-auto max-w-3xl space-y-6 text-center">
              <div aria-hidden="true" className="text-5xl">
                🎉
              </div>
              <div>
                <h3 className="text-3xl font-semibold">¡Reserva Confirmada!</h3>
                <p className="mt-3 text-lg font-medium">Bienvenido a BOOMBOX</p>
              </div>
              <div className="grid gap-3 text-left sm:grid-cols-2">
                {["Contrato Firmado", "Reserva Confirmada", "Portal Disponible", "Correo Enviado"].map((label) => (
                  <div className="flex items-center gap-3 rounded-xl border p-4" key={label}>
                    <Check className="size-5 text-success" />
                    <span className="font-medium">{label}</span>
                  </div>
                ))}
              </div>
              {summary}
              <div className="grid gap-3 sm:grid-cols-3">
                <a className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground" href={portalUrl}>
                  Abrir Portal
                </a>
                <Button
                  onClick={() => {
                    void navigator.clipboard.writeText(portalUrl);
                    setPortalMessage("Enlace copiado.");
                  }}
                  variant="outline"
                >
                  <Copy className="mr-2 size-4" />
                  Copiar Enlace
                </Button>
                <a className="inline-flex min-h-11 items-center justify-center rounded-xl border px-4 text-sm font-semibold" href={`mailto:${encodeURIComponent(createdProject.client.email)}?subject=${encodeURIComponent("¡Tu reserva BOOMBOX está confirmada!")}&body=${encodeURIComponent(confirmationEmailBody)}`}>
                  <Send className="mr-2 size-4" />
                  Enviar Acceso
                </a>
              </div>
              {portalMessage && <p className="text-sm text-success">{portalMessage}</p>}
              <section className="rounded-2xl border p-5 text-left sm:p-6">
                <p className="leading-7">En los próximos minutos recibirás una copia del contrato firmado en tu correo electrónico.</p>
                <p className="mt-5 font-semibold">Desde ahora podrás acceder al Portal BOOMBOX utilizando:</p>
                <ul className="mt-3 list-inside list-disc space-y-1 text-muted">
                  <li>RUT</li>
                  <li>Fecha del Evento</li>
                </ul>
                <p className="mt-5 font-semibold">Desde el Portal podrás:</p>
                <ul className="mt-3 list-inside list-disc space-y-1 text-muted">
                  <li>Ver tu contrato</li>
                  <li>Revisar tu evento</li>
                  <li>Descargar documentos</li>
                  <li>Ver el estado de tu reserva</li>
                  <li>Contactar a BOOMBOX</li>
                </ul>
              </section>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t p-5 sm:p-7">
          {step > 0 && step < 6 ? <ActionButton disabled={submitting} icon={ChevronLeft} label="Atrás" onClick={() => setStep((current) => current - 1)} variant="outline" /> : <span />}
          {step === 0 && method === "AUTOMATIC" ? <span /> : step < 5 ? (
            <ActionButton disabled={!valid} icon={ChevronRight} iconPosition="end" label="Continuar" onClick={() => setStep((current) => current + 1)} />
          ) : step === 5 ? (
            <Button aria-live="polite" disabled={!valid || submitting} onClick={() => void create()}>
              {submitting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              {submitting ? "Procesando reserva..." : "Confirmar reserva"}
            </Button>
          ) : (
            <ActionButton icon={Link2} label="Cerrar" onClick={reset} />
          )}
        </footer>
      </aside>
    </>
  );
}
