"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Link2,
  LoaderCircle,
  PenLine,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { ChileanMobileInput } from "@/components/forms/chilean-mobile-input";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { MunicipalityCombobox } from "@/components/forms/municipality-combobox";
import type { ActiveMunicipality } from "@/features/settings/master-data/municipality-master-data";
import { cn } from "@/lib/utils";
import { filterExtrasForEventType, includedExtrasForEventType, resolveBrandingMinimum } from "../reservation-business-rules";
import { formatChileanRut, isValidChileanRut, normalizeChileanMobileLocal, normalizeChileanPhone } from "@/lib/chile/rut";
import { sendAutomaticBookingInvitationAction } from "@/features/automatic-booking/actions";
import { sendManualReservationConfirmationAction } from "../actions/customer.actions";
import {
  projectOrigins,
  projectTypes,
  type Project,
  type ProjectDraft,
  type ProjectOrigin,
  type ProjectService,
  type ProjectType,
} from "../types/project";

const steps = [
  "Método",
  "Cliente",
  "Evento",
  "Servicio + extras",
  "Contrato",
  "Pago",
  "Confirmación",
] as const;
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
  Scrapbook: "SCRAPBOOK",
} as const;
type ServiceExtra = "Branding" | "QR" | "Imanes" | "Scrapbook";
type ServiceConfiguration = {
  hours: number;
  additionalHours: number;
  extras: ServiceExtra[];
  magnetsMode: "NONE" | "PAID" | "BENEFIT";
  brandingQuantity: number;
};
type CreditTerm = "CASH" | "15" | "30" | "45" | "60" | "90" | "CUSTOM";
type PaymentCondition = "FIFTY_FIFTY" | "CASH" | "CORPORATE_CREDIT";
type NegotiationMode = "OFFICIAL" | "NEGOTIATED";
const initialService = (service: ReservationService): ServiceConfiguration => ({
  hours: service.minimumHours as ServiceConfiguration["hours"],
  additionalHours: 0,
  extras: service.defaultExtras
    .map(masterExtraToReservation)
    .filter((extra): extra is ServiceExtra => extra !== null),
  magnetsMode: service.defaultExtras.includes("UNLIMITED_MAGNETS")
    ? "PAID"
    : "NONE",
  brandingQuantity: 2,
});
const currency = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const reservationProcessingTimeoutMs = 60_000;
const manualReservationDraftKey = "orbit:manual-reservation-draft:v1";

async function withReservationTimeout<T>(operation: Promise<T>) {
  let timeoutId = 0;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () =>
            reject(
              new Error(
                "La reserva está tardando más de lo esperado. Inténtalo nuevamente.",
              ),
            ),
          reservationProcessingTimeoutMs,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const boomboxTerms = [
  [
    "Reserva y pago",
    "La fecha quedará reservada una vez firmado el contrato y abonado el 50% del valor total. El saldo restante deberá pagarse durante la semana previa al evento. La reserva no es reembolsable, pues bloquea exclusivamente la fecha y horario seleccionados.",
  ],
  [
    "Reprogramación",
    "El cliente podrá solicitar un cambio de fecha, sujeto a disponibilidad de BOOMBOX. Los valores podrán actualizarse si la nueva fecha corresponde a otra temporada, ubicación o condición de servicio. La reserva podrá cederse a otra persona previa autorización escrita.",
  ],
  [
    "Horario contratado",
    "El servicio comenzará y finalizará en el horario acordado. Los atrasos propios del evento no extenderán automáticamente el servicio. Toda hora adicional deberá ser solicitada y pagada, quedando sujeta a disponibilidad.",
  ],
  [
    "Acceso e instalación",
    "El cliente deberá asegurar acceso oportuno al recinto, un espacio adecuado y conexión eléctrica independiente de 220 V. Los costos generados por esperas, restricciones o una segunda visita podrán cobrarse adicionalmente.",
  ],
  [
    "Traslado",
    "El valor del traslado se calculará automáticamente según la ubicación seleccionada y se incorporará al total del servicio. Cualquier cambio posterior de dirección podrá modificar dicho valor.",
  ],
  [
    "Uso y daños",
    "El cliente será responsable por daños, pérdidas o roturas ocasionados por él o sus invitados al equipamiento, accesorios o elementos de BOOMBOX.",
  ],
  [
    "Seguridad",
    "BOOMBOX podrá suspender el servicio si existe mal uso, riesgo para las personas, agresiones al operador o peligro para los equipos.",
  ],
  [
    "Contingencias técnicas",
    "Ante una falla atribuible a BOOMBOX, la empresa dispondrá de hasta 45 minutos para intentar solucionarla. Si no fuera posible, se devolverá proporcionalmente el valor correspondiente al tiempo no prestado.",
  ],
  [
    "Entrega del material",
    "El respaldo digital será enviado dentro de los 7 días hábiles posteriores al evento mediante un enlace disponible durante 10 días.",
  ],
  [
    "Fuerza mayor",
    "Si el servicio no puede realizarse por hechos imprevisibles o ajenos a las partes, estas procurarán reprogramarlo de común acuerdo.",
  ],
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
export interface ReservationCrmCustomer {
  id: string;
  name: string;
  rut: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  commercialNotes: string;
  contacts: Array<{ name: string; email: string; phone: string }>;
  previousEvents: Array<{
    id: string;
    projectId: string;
    type: string;
    date: string | null;
    status: string;
  }>;
}
const masterExtraToReservation = (code: string): ServiceExtra | null =>
  code === "BRANDING"
    ? "Branding"
    : code === "QR"
      ? "QR"
      : code === "UNLIMITED_MAGNETS"
        ? "Imanes"
        : code === "SCRAPBOOK"
          ? "Scrapbook"
          : null;
export interface NewProjectDrawerProps {
  canNegotiate: boolean;
  commercialPrices: ReservationCommercialPrice[];
  crmCustomers: ReservationCrmCustomer[];
  municipalities: ActiveMunicipality[];
  services: ReservationService[];
  venues: ReservationVenue[];
  open: boolean;
  onClose: () => void;
  onCreate: (draft: ProjectDraft) => Promise<Project>;
}

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <input
        className="mt-2 h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/40"
        data-1p-ignore
        data-form-type="other"
        data-lpignore="true"
        id={id}
        {...props}
      />
    </label>
  );
}

function PhoneField({ label, value, onChange, disabled, required }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return <label className="block text-sm font-medium">{label}<span className="mt-2 block"><ChileanMobileInput disabled={disabled} onChange={onChange} required={required} value={value} /></span></label>;
}

function TextArea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <textarea
        className="mt-2 min-h-24 w-full rounded-lg border bg-background px-3 py-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/40"
        id={id}
        {...props}
      />
    </label>
  );
}

function SignaturePad({
  disabled,
  onConfirmed,
}: {
  disabled: boolean;
  onConfirmed: (confirmed: boolean, signatureDataUrl?: string) => void;
}) {
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
    if (canvas)
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setInk(false);
    setConfirmed(false);
    onConfirmed(false);
  };
  const confirm = () => {
    if (!ink) return;
    setConfirmed(true);
    onConfirmed(true, canvasRef.current?.toDataURL("image/png"));
  };
  return (
    <section className="rounded-2xl border bg-background/30 p-5">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-5 text-brand" />
        <div>
          <h3 className="font-semibold">Firma</h3>
          <p className="mt-1 text-sm text-muted">
            Firma con mouse, dedo o lápiz.
          </p>
        </div>
      </div>
      <canvas
        aria-label="Área para firmar"
        className="mt-5 h-56 w-full touch-none rounded-xl border border-dashed bg-background"
        onPointerCancel={stop}
        onPointerDown={start}
        onPointerLeave={stop}
        onPointerMove={draw}
        onPointerUp={stop}
        ref={canvasRef}
      />
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
        <ActionButton
          disabled={!ink || confirmed}
          icon={RotateCcw}
          label="Limpiar firma"
          onClick={clear}
          variant="outline"
        />
        <ActionButton
          disabled={!ink || confirmed}
          label={confirmed ? "Firma confirmada" : "Confirmar firma"}
          onClick={confirm}
        />
      </div>
    </section>
  );
}

function CommercialSummary({
  extrasPrice,
  plan,
  transportPrice,
  total,
}: {
  extrasPrice: number;
  plan: { name: string; hours: number; price: number } | null;
  transportPrice: number;
  total: number;
}) {
  return (
    <section
      aria-live="polite"
      className="reservation-summary-panel rounded-2xl border bg-card p-5 shadow-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
        Resumen de reserva
      </p>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="rounded-xl border bg-background/40 p-3">
          <dt className="text-xs font-semibold uppercase tracking-[.14em] text-muted">
            Plan contratado
          </dt>
          <dd className="mt-1 space-y-1 font-medium">
            {plan ? (
              <span className="flex items-start justify-between gap-3">
                <span>
                  <strong className="block">{plan.name}</strong>
                  {plan.hours} Horas
                </span>
                <strong className="shrink-0 text-brand">
                  {currency.format(plan.price)}
                </strong>
              </span>
            ) : (
              "Servicio pendiente"
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Extras · precio aplicado</dt>
          <dd className="font-medium">{currency.format(extrasPrice)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Transporte · precio aplicado</dt>
          <dd className="font-medium">{currency.format(transportPrice)}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t pt-3">
          <dt className="font-semibold">TOTAL</dt>
          <dd className="text-xl font-semibold text-brand">
            {currency.format(total)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function NewProjectDrawer({
  canNegotiate,
  commercialPrices,
  crmCustomers,
  municipalities,
  services,
  venues,
  open,
  onClose,
  onCreate,
}: NewProjectDrawerProps) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<"MANUAL" | "AUTOMATIC">("MANUAL");
  const [invitationEmail, setInvitationEmail] = useState("");
  const [invitationFeedback, setInvitationFeedback] = useState("");
  const [invitationPending, setInvitationPending] = useState(false);
  const [draft, setDraft] = useState<ProjectDraft>(initialDraft);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [configurations, setConfigurations] = useState<
    Partial<Record<ProjectService, ServiceConfiguration>>
  >({});
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
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [commercialFormalization, setCommercialFormalization] =
    useState<NonNullable<ProjectDraft["commercialFormalization"]>["type"]>(
      "CONTRACT_INVOICE",
    );
  const [paymentMethod, setPaymentMethod] = useState<
    "TRANSFER" | "MERCADO_PAGO"
  >("TRANSFER");
  const [creditTerm, setCreditTerm] = useState<CreditTerm>("CASH");
  const [customCreditDays, setCustomCreditDays] = useState(0);
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [receipt, setReceipt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryingTransaction, setRetryingTransaction] = useState(false);
  const [error, setError] = useState("");
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [portalMessage, setPortalMessage] = useState("");
  const [confirmationPreview, setConfirmationPreview] = useState(false);
  const [confirmationSending, setConfirmationSending] = useState(false);
  const [negotiatedServicePrice, setNegotiatedServicePrice] = useState<
    number | null
  >(null);
  const [negotiatedExtrasPrice, setNegotiatedExtrasPrice] = useState<
    number | null
  >(null);
  const [transportOverride, setTransportOverride] = useState<number | null>(
    null,
  );
  const [paymentCondition, setPaymentCondition] =
    useState<PaymentCondition>("FIFTY_FIFTY");
  const [paymentReceiptRequired, setPaymentReceiptRequired] = useState(true);
  const [corporateCreditApproved, setCorporateCreditApproved] = useState(false);
  const [corporateVatApplied, setCorporateVatApplied] = useState(false);
  const recoveryChecked = useRef(false);
  const serviceByCode = new Map(
    services.map((service) => [service.code, service]),
  );
  const serviceLabel = (service: ProjectService) =>
    serviceByCode.get(service)?.name ?? service;
  const additionalHourRate = (service: ProjectService) =>
    serviceByCode.get(service)?.additionalHourPrice ?? 0;
  const compatibleExtras = (service: ProjectService) =>
    filterExtrasForEventType(
      draft.type ?? "",
      (serviceByCode.get(service)?.compatibleExtras ?? [])
        .map(masterExtraToReservation)
        .filter((extra): extra is ServiceExtra => extra !== null),
    );

  const selectedMunicipality =
    municipalities.find((item) => item.name === draft.event.city) ?? null;
  const selectedVenue =
    venues.find(
      (venue) =>
        venue.name.localeCompare(draft.event.location.trim(), "es", {
          sensitivity: "base",
        }) === 0,
    ) ?? null;
  const transportTotal =
    selectedMunicipality?.pricingStatus === "DEFINED"
      ? selectedMunicipality.transport
      : null;
  const venueSurcharge = Number(selectedVenue?.surcharge ?? 0);
  const includedExtras: ServiceExtra[] = includedExtrasForEventType(
    draft.type ?? "",
  );
  const priceFor = (
    category: ReservationCommercialPrice["category"],
    code: string,
    durationHours?: number,
  ) =>
    commercialPrices.find(
      (price) =>
        price.category === category &&
        price.code === code &&
        (category !== "SERVICE" ||
          price.durationHours === durationHours ||
          price.durationHours === null),
    );
  const brandingPrice = priceFor("EXTRA", extraCodes.Branding);
  const brandingMinimum = resolveBrandingMinimum(
    brandingPrice?.rules?.minimumQuantity,
  );
  const brandingMaximum = Math.min(
    4,
    Math.max(
      brandingMinimum,
      Number(brandingPrice?.rules?.maximumQuantity ?? 4),
    ),
  );
  const includedExtrasForService = (service: ProjectService) =>
    Array.from(
      new Set([
        ...includedExtras,
        ...(serviceByCode.get(service)?.defaultExtras ?? [])
          .map(masterExtraToReservation)
          .filter((extra): extra is ServiceExtra => extra !== null),
      ]),
    );
  const extraUnitPrice = (
    service: ProjectService,
    extra: ServiceExtra,
  ) => {
    if (includedExtrasForService(service).includes(extra)) return 0;
    const code = extraCodes[extra as keyof typeof extraCodes];
    return code ? (priceFor("EXTRA", code)?.unitPrice ?? 0) : 0;
  };
  const compatibleIncludedExtras = (service: ProjectService) =>
    includedExtrasForService(service).filter((extra) =>
      compatibleExtras(service).includes(extra),
    );
  const serviceBasePrice = (
    service: ProjectService,
    configuration: ServiceConfiguration,
  ) => {
    const definition = serviceByCode.get(service);
    const exact = priceFor("SERVICE", service, configuration.hours)?.unitPrice;
    const base = priceFor(
      "SERVICE",
      service,
      definition?.minimumHours,
    )?.unitPrice;
    if (exact != null) return Number(exact);
    return (
      Number(base ?? 0) +
      Math.max(
        0,
        configuration.hours - (definition?.minimumHours ?? configuration.hours),
      ) *
        additionalHourRate(service)
    );
  };
  const serviceTotal = (
    service: ProjectService,
    configuration: ServiceConfiguration,
  ) => {
    const base = serviceBasePrice(service, configuration);
    const extras = Array.from(
      new Set([...configuration.extras, ...compatibleIncludedExtras(service)]),
    ).reduce(
      (sum, extra) =>
        sum +
        (extra === "Imanes" && configuration.magnetsMode === "BENEFIT"
          ? 0
          : extra === "Branding"
          ? Number(extraUnitPrice(service, extra)) *
            configuration.brandingQuantity
          : Number(extraUnitPrice(service, extra))),
      0,
    );
    return (
      base +
      configuration.additionalHours * additionalHourRate(service) +
      extras
    );
  };
  const servicesTotal = (
    Object.entries(configurations) as Array<
      [ProjectService, ServiceConfiguration]
    >
  ).reduce(
    (sum, [service, configuration]) =>
      sum + serviceTotal(service, configuration),
    0,
  );
  const officialServicePrice = (
    Object.entries(configurations) as Array<
      [ProjectService, ServiceConfiguration]
    >
  ).reduce(
    (sum, [service, configuration]) =>
      sum +
      serviceBasePrice(service, configuration) +
      configuration.additionalHours * additionalHourRate(service),
    0,
  );
  const officialExtras = Math.max(0, servicesTotal - officialServicePrice);
  const officialTransport = Number(transportTotal ?? 0);
  const officialExtrasTotal = officialExtras + venueSurcharge;
  const appliedServicePrice = Math.max(
    0,
    negotiatedServicePrice ?? officialServicePrice,
  );
  const appliedExtrasPrice = Math.max(
    0,
    negotiatedExtrasPrice ?? officialExtrasTotal,
  );
  const appliedTransport = Math.max(0, transportOverride ?? officialTransport);
  const officialTotal =
    officialServicePrice + officialExtrasTotal + officialTransport;
  const negotiatedOfficialTotal =
    appliedServicePrice + appliedExtrasPrice + appliedTransport;
  const adjustedSubtotal = negotiatedOfficialTotal;
  const negotiationDifference = adjustedSubtotal - officialTotal;
  const negotiationDifferencePercentage =
    officialTotal > 0 ? (negotiationDifference / officialTotal) * 100 : 0;
  const negotiationMode: NegotiationMode =
    negotiationDifference === 0 ? "OFFICIAL" : "NEGOTIATED";
  const vatAmount =
    draft.type === "Corporate" && corporateVatApplied
      ? Math.round(adjustedSubtotal * 0.19)
      : 0;
  const payableTotal = Math.round(
    (adjustedSubtotal + vatAmount) *
      (paymentMethod === "MERCADO_PAGO" ? 1.05 : 1),
  );
  const reservationTotal =
    paymentCondition === "CASH"
      ? payableTotal
      : paymentCondition === "CORPORATE_CREDIT"
        ? 0
        : Math.round(payableTotal * 0.5);
  const balanceTotal = payableTotal - reservationTotal;
  const compatibleIncludedExtrasSelected = (
    Object.keys(configurations) as ProjectService[]
  ).flatMap(compatibleIncludedExtras);
  const primaryService = draft.services[0] ?? null;
  const primaryConfiguration = primaryService
    ? (configurations[primaryService] ?? null)
    : null;
  const plan =
    primaryService && primaryConfiguration
      ? {
          name: draft.services.map(serviceLabel).join(" + "),
          hours: primaryConfiguration.hours,
          price: appliedServicePrice,
        }
      : null;
  const isCorporateCustomer = draft.type === "Corporate";
  const paymentDueDate = (() => {
    const base =
      paymentCondition === "CORPORATE_CREDIT"
        ? new Date()
        : draft.event.date
          ? new Date(`${draft.event.date}T12:00:00`)
          : null;
    if (!base || Number.isNaN(base.getTime())) return null;
    const days =
      paymentCondition === "CORPORATE_CREDIT"
        ? creditTerm === "CUSTOM"
          ? customCreditDays
          : Number(creditTerm === "CASH" ? 0 : creditTerm)
        : paymentCondition === "CASH"
          ? 0
          : -7;
    base.setDate(base.getDate() + days);
    return base;
  })();
  const formattedDueDate = paymentDueDate
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "long" }).format(
        paymentDueDate,
      )
    : "Pendiente de fecha del evento";
  const mercadoPagoCommission = payableTotal - adjustedSubtotal;

  useEffect(() => {
    if (!open || recoveryChecked.current) return;
    recoveryChecked.current = true;
    const saved = window.localStorage.getItem(manualReservationDraftKey);
    if (!saved) return;
    if (
      !window.confirm(
        "Encontramos una reserva sin terminar. ¿Deseas reanudar el borrador?",
      )
    ) {
      window.localStorage.removeItem(manualReservationDraftKey);
      return;
    }
    try {
      const value = JSON.parse(saved) as Record<string, unknown>;
      if (value.draft) {
        const recovered = value.draft as ProjectDraft;
        setDraft(recovered);
        setSelectedCustomerId(recovered.crmCustomerId ?? null);
      }
      if (value.configurations)
        setConfigurations(
          value.configurations as Partial<
            Record<ProjectService, ServiceConfiguration>
          >,
        );
      if (typeof value.step === "number") setStep(value.step);
      if (typeof value.eventAddress === "string")
        setEventAddress(value.eventAddress);
      if (typeof value.operationalContact === "string")
        setOperationalContact(value.operationalContact);
      if (typeof value.operationalPhone === "string") {
        const recoveredLocal = normalizeChileanMobileLocal(value.operationalPhone);
        setOperationalPhone(/^9{8}$/.test(recoveredLocal) ? "+569" : value.operationalPhone);
      }
      if (typeof value.mainContact === "string")
        setMainContact(value.mainContact);
      if (typeof value.specialRequests === "string")
        setSpecialRequests(value.specialRequests);
      if (typeof value.commercialNotes === "string")
        setCommercialNotes(value.commercialNotes);
      if (typeof value.negotiatedServicePrice === "number")
        setNegotiatedServicePrice(value.negotiatedServicePrice);
      if (typeof value.negotiatedExtrasPrice === "number")
        setNegotiatedExtrasPrice(value.negotiatedExtrasPrice);
      if (typeof value.transportOverride === "number")
        setTransportOverride(value.transportOverride);
      if (typeof value.paymentCondition === "string")
        setPaymentCondition(value.paymentCondition as PaymentCondition);
      if (typeof value.paymentMethod === "string")
        setPaymentMethod(value.paymentMethod as "TRANSFER" | "MERCADO_PAGO");
      if (typeof value.corporateCreditApproved === "boolean")
        setCorporateCreditApproved(value.corporateCreditApproved);
      if (typeof value.corporateVatApplied === "boolean")
        setCorporateVatApplied(value.corporateVatApplied);
    } catch {
      window.localStorage.removeItem(manualReservationDraftKey);
    }
  }, [open]);
  useEffect(() => {
    if (!open || createdProject || method !== "MANUAL") return;
    window.localStorage.setItem(
      manualReservationDraftKey,
      JSON.stringify({
        draft,
        configurations,
        step,
        eventAddress,
        operationalContact,
        operationalPhone,
        mainContact,
        specialRequests,
        commercialNotes,
        negotiatedServicePrice,
        negotiatedExtrasPrice,
        transportOverride,
        paymentCondition,
        paymentMethod,
        corporateCreditApproved,
        corporateVatApplied,
      }),
    );
  });
  useEffect(() => {
    if (!selectedCustomerId) return;
    const canonical = crmCustomers.find(
      (customer) => customer.id === selectedCustomerId,
    );
    if (!canonical) {
      setSelectedCustomerId(null);
      setDraft((current) => ({ ...current, crmCustomerId: undefined }));
      return;
    }
    setCommercialNotes(canonical.commercialNotes);
    setDraft((current) => {
      const canonicalClient: ProjectDraft["client"] = {
        name: canonical.name,
        rut: canonical.rut,
        email: canonical.email,
        phone: canonical.phone,
        company: canonical.company || undefined,
        address: canonical.address,
      };
      if (
        current.crmCustomerId === canonical.id &&
        current.client.name === canonicalClient.name &&
        current.client.rut === canonicalClient.rut &&
        current.client.email === canonicalClient.email &&
        current.client.phone === canonicalClient.phone &&
        current.client.company === canonicalClient.company &&
        current.client.address === canonicalClient.address
      )
        return current;
      return {
        ...current,
        crmCustomerId: canonical.id,
        client: canonicalClient,
      };
    });
  }, [crmCustomers, selectedCustomerId]);

  if (!open) return null;
  const client = (field: keyof ProjectDraft["client"], value: string) =>
    setDraft((current) => ({
      ...current,
      client: { ...current.client, [field]: value },
    }));
  const normalizeCustomerSearch = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9@]/g, "")
      .toLocaleLowerCase("es-CL");
  const customerMatches =
    customerSearch.trim().length >= 2
      ? crmCustomers
          .filter((customer) => {
            const needle = normalizeCustomerSearch(customerSearch);
            return [
              customer.rut,
              customer.name,
              customer.company,
              customer.phone,
              customer.email,
            ].some((value) => normalizeCustomerSearch(value).includes(needle));
          })
          .slice(0, 8)
      : [];
  const selectedCustomer = selectedCustomerId
    ? (crmCustomers.find((customer) => customer.id === selectedCustomerId) ??
      null)
    : null;
  const selectCrmCustomer = (customer: ReservationCrmCustomer) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearch("");
    setCommercialNotes(customer.commercialNotes);
    setDraft((current) => ({
      ...current,
      crmCustomerId: customer.id,
      client: {
        name: customer.name,
        rut: customer.rut,
        email: customer.email,
        phone: customer.phone,
        company: customer.company || undefined,
        address: customer.address,
      },
    }));
  };
  const clearCrmCustomer = () => {
    setSelectedCustomerId(null);
    setCustomerSearch("");
    setCommercialNotes("");
    setDraft((current) => ({
      ...current,
      crmCustomerId: undefined,
      client: initialDraft.client,
    }));
  };
  const event = (
    field: keyof ProjectDraft["event"],
    value: string | number | string[],
  ) =>
    setDraft((current) => ({
      ...current,
      event: { ...current.event, [field]: value },
    }));
  const reset = () => {
    window.localStorage.removeItem(manualReservationDraftKey);
    recoveryChecked.current = false;
    setStep(0);
    setMethod("MANUAL");
    setInvitationEmail("");
    setInvitationFeedback("");
    setInvitationPending(false);
    setDraft(initialDraft);
    setCustomerSearch("");
    setSelectedCustomerId(null);
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
    setSignatureDataUrl("");
    setCommercialFormalization("CONTRACT_INVOICE");
    setPaymentMethod("TRANSFER");
    setCreditTerm("CASH");
    setCustomCreditDays(0);
    setPurchaseOrder("");
    setReceipt("");
    setSubmitting(false);
    setRetryingTransaction(false);
    setError("");
    setCreatedProject(null);
    setPortalMessage("");
    setNegotiatedServicePrice(null);
    setNegotiatedExtrasPrice(null);
    setTransportOverride(null);
    setPaymentCondition("FIFTY_FIFTY");
    setCreditTerm("CASH");
    setCustomCreditDays(0);
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
      services: current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service],
    }));
  };
  const updateService = (
    service: ProjectService,
    update: Partial<ServiceConfiguration>,
  ) =>
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
      extras: configuration.extras.includes(extra)
        ? configuration.extras.filter((item) => item !== extra)
        : [...configuration.extras, extra],
    });
  };
  const existingCustomerValid = Boolean(
    selectedCustomer && draft.crmCustomerId === selectedCustomer.id,
  );
  const newCustomerValid = Boolean(
    !selectedCustomer &&
      (draft.client.name ?? "").trim() &&
      isValidChileanRut(draft.client.rut ?? "") &&
      (draft.client.phone ?? "").length === 12 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        (draft.client.email ?? "").trim(),
      ) &&
      draft.origin,
  );
  const customerValid = existingCustomerValid || newCustomerValid;
  const paymentTermDays =
    paymentCondition === "CORPORATE_CREDIT"
      ? creditTerm === "CUSTOM"
        ? customCreditDays
        : Number(creditTerm === "CASH" ? 0 : creditTerm)
      : 0;
  const paymentClause =
    paymentCondition === "CASH"
      ? "El pago deberá realizarse al contado."
      : paymentCondition === "CORPORATE_CREDIT"
        ? `El pago deberá realizarse dentro de los ${paymentTermDays} días posteriores a la emisión de la factura.`
        : "La reserva corresponde al 50% del valor total y el saldo deberá pagarse antes del evento.";
  const negotiationValid = negotiationMode === "OFFICIAL" || canNegotiate;
  const requiresSignature = commercialFormalization === "CONTRACT_INVOICE";
  const receiptSatisfied =
    paymentMethod === "MERCADO_PAGO" ||
    !paymentReceiptRequired ||
    Boolean(receipt);
  const valid =
    step === 0
      ? method === "MANUAL"
      : step === 1
        ? customerValid
        : step === 2
          ? Boolean(
              draft.type &&
                draft.event.location &&
                eventAddress &&
                draft.event.city &&
                draft.event.date &&
                draft.event.time &&
                operationalContact &&
                /^569\d{8}$/.test(normalizeChileanPhone(operationalPhone)) &&
                (draft.type === "Wedding" ? bride && groom : mainContact),
            )
          : step === 3
            ? draft.services.length > 0 && negotiationValid
            : step === 4
              ? !requiresSignature ||
                (termsAccepted &&
                  signatureConfirmed &&
                  Boolean(signatureDataUrl))
              : step === 5
                ? receiptSatisfied &&
                  (paymentCondition !== "CORPORATE_CREDIT" ||
                    corporateCreditApproved)
                : true;
  const create = async () => {
    if (!valid) return;
    setSubmitting(true);
    setError("");
    try {
      const reservationTransactionId =
        draft.reservationTransactionId ?? crypto.randomUUID();
      if (!draft.reservationTransactionId) {
        const identifiedDraft = { ...draft, reservationTransactionId };
        setDraft(identifiedDraft);
        window.localStorage.setItem(
          manualReservationDraftKey,
          JSON.stringify({
            draft: identifiedDraft,
            configurations,
            step,
            eventAddress,
            operationalContact,
            operationalPhone,
            mainContact,
            specialRequests,
            commercialNotes,
            negotiatedServicePrice,
            negotiatedExtrasPrice,
            transportOverride,
            paymentCondition,
            paymentMethod,
            corporateCreditApproved,
            corporateVatApplied,
          }),
        );
      }
      const serviceDetails = (
        Object.entries(configurations) as Array<
          [ProjectService, ServiceConfiguration]
        >
      )
        .map(
          ([service, configuration]) =>
            `${serviceLabel(service)}: ${configuration.hours} h + ${configuration.additionalHours} h adicionales · ${Array.from(new Set([...configuration.extras.map((extra) => extra === "Imanes" && configuration.magnetsMode === "BENEFIT" ? "Imanes · Beneficio BOOMBOX · Incluido $0" : extra), ...compatibleIncludedExtras(service)])).join(", ") || "sin extras"}`,
        )
        .join("\n");
      const maximumHours = Math.max(
        2,
        ...(Object.values(configurations) as ServiceConfiguration[]).map(
          (configuration) =>
            configuration.hours + configuration.additionalHours,
        ),
      );
      const project = await withReservationTimeout(
        onCreate({
          ...draft,
          reservationTransactionId,
          commercialFormalization: {
            type: commercialFormalization,
            requiresSignature,
            documentType: requiresSignature
              ? "SIGNED_CONTRACT"
              : "COMMERCIAL_DOCUMENT",
            signatureDataUrl: requiresSignature ? signatureDataUrl : undefined,
          },
          commercialAdjustment: {
            type: "COMMERCIAL_NEGOTIATION",
            mode: negotiationMode,
            value: adjustedSubtotal,
            reason:
              negotiationMode === "OFFICIAL"
                ? "Uso de precios oficiales"
                : "Precio final acordado para esta reserva",
            subtotal: officialTotal,
            officialTotal,
            officialServicePrice,
            officialExtras,
            officialTransport,
            officialVenueSurcharge: venueSurcharge,
            negotiatedServicePrice: appliedServicePrice,
            negotiatedExtras: appliedExtrasPrice,
            negotiatedTransport: appliedTransport,
            negotiatedTotal: adjustedSubtotal,
            difference: negotiationDifference,
            differencePercentage: negotiationDifferencePercentage,
            discountAmount: 0,
            discountReason: "OTHER",
            discountReasonDetail:
              negotiationMode === "NEGOTIATED"
                ? "Precio final acordado para esta reserva"
                : undefined,
            commercialCharge: 0,
            appliedTransport,
            courtesyValue: 0,
            courtesies: [],
            paymentCondition,
            paymentTermDays,
            paymentReceiptRequired,
            corporateCreditApproved,
            corporateVatApplied,
            netAmount: adjustedSubtotal,
            vatAmount,
            finalPrice: payableTotal,
          },
          event: {
            ...draft.event,
            durationHours: maximumHours,
            extras: [
              ...Array.from(
                new Set([
                  ...(
                    Object.values(configurations) as ServiceConfiguration[]
                  ).flatMap((configuration) =>
                    configuration.extras.map((extra) =>
                      extra === "Imanes" &&
                      configuration.magnetsMode === "BENEFIT"
                        ? "Imanes · Beneficio BOOMBOX · Incluido $0"
                        : extra === "Branding"
                          ? `Branding · ${configuration.brandingQuantity} caras`
                          : extra,
                    ),
                  ),
                  ...compatibleIncludedExtrasSelected,
                ]),
              ),
              ...(transportTotal !== null ? ["Transporte"] : []),
            ],
          },
          notes: [
            draft.notes,
            `Formalización comercial: ${commercialFormalization}`,
            `Dirección evento: ${eventAddress}`,
            `Provincia: ${selectedMunicipality?.province ?? "Por confirmar"}`,
            `Contacto operacional: ${operationalContact} · ${operationalPhone}`,
            draft.type === "Wedding"
              ? `Novia: ${bride} · Novio: ${groom}`
              : `Contacto principal: ${mainContact}`,
            serviceDetails,
            specialRequests && `Solicitudes especiales: ${specialRequests}`,
            commercialNotes && `Notas comerciales: ${commercialNotes}`,
            requiresSignature && "Términos BOOMBOX aceptados",
            requiresSignature && "Firma manuscrita confirmada",
            paymentClause,
            `Total comercial: ${currency.format(payableTotal)}`,
            `Método de pago: ${paymentMethod}`,
            `Estado de pago: Pendiente`,
            `Vencimiento: ${formattedDueDate}`,
            purchaseOrder && `Orden de compra: ${purchaseOrder}`,
            receipt && `Comprobante vinculado: ${receipt}`,
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      );
      setCreatedProject(project);
      window.localStorage.removeItem(manualReservationDraftKey);
      setStep(6);
    } catch (cause) {
      setRetryingTransaction(true);
      console.error("[ORBIT][RESERVATION_CONFIRMATION_FAILED]", cause);
      setError(
        cause instanceof Error
          ? `No fue posible completar la reserva: ${cause.message}`
          : "No fue posible completar la reserva. Revisa el registro técnico en ORBIT.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const portalUrl = createdProject
    ? `${window.location.origin}/projects/${createdProject.id}#portal-cliente`
    : "";

  const summary = (
    <CommercialSummary
      extrasPrice={appliedExtrasPrice}
      plan={plan}
      transportPrice={appliedTransport}
      total={payableTotal}
    />
  );

  return (
    <>
      <button
        aria-label="Cerrar nueva reserva"
        className="fixed inset-0 z-40 cursor-default bg-black/45 backdrop-blur-[2px]"
        onClick={reset}
      />
      <aside
        aria-label="Nueva reserva"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l bg-card shadow-2xl"
      >
        {submitting && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-card p-6 text-center">
            <div className="max-w-lg">
              <LoaderCircle className="mx-auto size-12 animate-spin text-brand" />
              <h2 className="mt-6 text-3xl font-semibold">
                {retryingTransaction
                  ? "Reserva ya creada. Reanudando confirmación pendiente..."
                  : "Preparando tu experiencia BOOMBOX..."}
              </h2>
              <p className="mt-3 leading-7 text-muted">
                {retryingTransaction
                  ? "ORBIT conservará la misma reserva y continuará únicamente las etapas pendientes."
                  : "Estamos creando la reserva, contrato, Portal, Calendar, Drive y correo. Tiempo estimado: 60–90 segundos."}
              </p>
              <ol className="mt-6 grid gap-2 text-left text-sm sm:grid-cols-2">
                {[
                  "Reserva",
                  "Contrato",
                  "Portal",
                  "Calendar",
                  "Drive",
                  "Correo",
                ].map((item) => (
                  <li className="rounded-xl border p-3" key={item}>
                    ⏳ {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
        <header className="flex items-start justify-between border-b p-5 sm:p-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
              Nueva reserva · Paso {step + 1} de {steps.length}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {steps[step]}
            </h2>
          </div>
          <Button
            aria-label="Cerrar"
            onClick={reset}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="flex gap-1.5 border-b px-5 py-4 sm:px-7">
          {steps.map((label, index) => (
            <span
              aria-label={label}
              className={cn(
                "h-1.5 flex-1 rounded-full bg-accent",
                index <= step && "bg-brand",
              )}
              key={label}
            />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {step === 0 && (
            <div className="mx-auto max-w-xl space-y-4">
              <h3 className="text-xl font-semibold">
                ¿Cómo deseas crear esta reserva?
              </h3>
              <button
                className={cn(
                  "flex w-full items-start gap-4 rounded-2xl border p-5 text-left",
                  method === "MANUAL" && "border-brand bg-brand/5",
                )}
                onClick={() => setMethod("MANUAL")}
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                    method === "MANUAL" && "border-brand",
                  )}
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      method === "MANUAL" && "bg-brand",
                    )}
                  />
                </span>
                <span>
                  <PenLine className="size-5 text-brand" />
                  <span className="mt-3 block font-semibold">Manual</span>
                  <span className="mt-1 block text-sm text-muted">
                    Completa toda la reserva dentro de ORBIT.
                  </span>
                </span>
              </button>
              <button
                className={cn(
                  "flex w-full gap-4 rounded-2xl border p-5 text-left",
                  method === "AUTOMATIC" && "border-brand bg-brand/5",
                )}
                onClick={() => {
                  setMethod("AUTOMATIC");
                  setInvitationFeedback("");
                }}
                type="button"
              >
                <span className="mt-0.5 size-5 shrink-0 rounded-full border" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <Sparkles className="size-5" />
                    <span className="rounded-full border border-brand/30 px-3 py-1 text-xs font-semibold text-brand">
                      Disponible
                    </span>
                  </span>
                  <span className="mt-3 block font-semibold">Automática</span>
                  <span className="mt-1 block text-sm text-muted">
                    Ingresa solo el correo. El cliente completa el proceso.
                  </span>
                </span>
              </button>
              {method === "AUTOMATIC" && (
                <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5">
                  <p className="text-sm font-semibold">Correo del cliente</p>
                  <input
                    autoComplete="email"
                    className="mt-3 h-12 w-full rounded-xl border bg-background px-4"
                    onChange={(event) => setInvitationEmail(event.target.value)}
                    placeholder="cliente@correo.cl"
                    type="email"
                    value={invitationEmail}
                  />
                  <Button
                    className="mt-4 w-full"
                    disabled={
                      invitationPending ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitationEmail)
                    }
                    onClick={async () => {
                      setInvitationPending(true);
                      setInvitationFeedback("");
                      const result =
                        await sendAutomaticBookingInvitationAction(
                          invitationEmail,
                        );
                      setInvitationFeedback(result.message);
                      setInvitationPending(false);
                    }}
                  >
                    <Send className="size-4" />
                    {invitationPending
                      ? "Enviando invitación…"
                      : "Enviar invitación"}
                  </Button>
                  {invitationFeedback && (
                    <p className="mt-3 text-sm" role="status">
                      {invitationFeedback}
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
          {step === 1 && (
            <div className="mx-auto max-w-3xl space-y-5">
              {!selectedCustomer && (
                <section className="relative rounded-2xl border bg-background/30 p-5">
                  <div className="flex items-center gap-3">
                    <Search className="size-5 text-brand" />
                    <div>
                      <h3 className="font-semibold">Buscar cliente en CRM</h3>
                      <p className="mt-1 text-sm text-muted">
                        RUT, empresa, nombre, teléfono o email.
                      </p>
                    </div>
                  </div>
                  <input
                    autoComplete="off"
                    autoFocus
                    className="mt-4 h-12 w-full rounded-xl border bg-background px-4 outline-none focus:ring-2 focus:ring-brand/40"
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Ej. 76.626.167-1 o Soledad Provens"
                    value={customerSearch}
                  />
                  {customerMatches.length > 0 && (
                    <div className="absolute inset-x-5 top-full z-10 mt-2 overflow-hidden rounded-xl border bg-card shadow-xl">
                      {customerMatches.map((customer) => (
                        <button
                          className="flex w-full items-center justify-between border-b p-4 text-left last:border-0 hover:bg-accent"
                          key={customer.id}
                          onClick={() => selectCrmCustomer(customer)}
                          type="button"
                        >
                          <span>
                            <strong className="block">{customer.name}</strong>
                            <span className="mt-1 block text-xs text-muted">
                              {customer.company || "Cliente particular"} ·{" "}
                              {customer.rut} ·{" "}
                              {customer.email || customer.phone}
                            </span>
                          </span>
                          <span className="text-xs text-brand">
                            Seleccionar
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {customerSearch.trim().length >= 2 &&
                    customerMatches.length === 0 && (
                      <div className="mt-4 rounded-xl border border-dashed p-4">
                        <p className="font-medium">Cliente no encontrado.</p>
                        <p className="mt-1 text-sm text-muted">
                          Completa los datos para crear un nuevo cliente CRM.
                        </p>
                      </div>
                    )}
                </section>
              )}
              {selectedCustomer && (
                <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-3">
                      <UserCheck className="mt-0.5 size-5 text-emerald-400" />
                      <div>
                        <h3 className="font-semibold text-emerald-300">
                          Cliente existente encontrado
                        </h3>
                        <p className="mt-1 text-sm">
                          {selectedCustomer.name} · {selectedCustomer.rut}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          Se utilizará la ficha maestra del CRM. Sólo se creará
                          un nuevo Evento, Proyecto y Reserva.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={clearCrmCustomer}
                      size="sm"
                      variant="outline"
                    >
                      Cambiar
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-xl border bg-card/60 p-4 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-muted">Empresa:</span>{" "}
                      {selectedCustomer.company || "Cliente particular"}
                    </p>
                    <p>
                      <span className="text-muted">Email:</span>{" "}
                      {selectedCustomer.email || "Sin email"}
                    </p>
                    <p>
                      <span className="text-muted">Teléfono:</span>{" "}
                      {selectedCustomer.phone || "Sin teléfono"}
                    </p>
                    <p>
                      <span className="text-muted">Dirección:</span>{" "}
                      {selectedCustomer.address || "Sin dirección"}
                    </p>
                    {selectedCustomer.commercialNotes && (
                      <p className="sm:col-span-2">
                        <span className="text-muted">Notas comerciales:</span>{" "}
                        {selectedCustomer.commercialNotes}
                      </p>
                    )}
                    {selectedCustomer.contacts.length > 0 && (
                      <div className="sm:col-span-2">
                        <p className="text-muted">Contactos</p>
                        {selectedCustomer.contacts.map((contact, index) => (
                          <p className="mt-1" key={`${contact.name}-${index}`}>
                            {contact.name} · {contact.phone || contact.email}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted">
                      Eventos anteriores
                    </p>
                    {selectedCustomer.previousEvents.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedCustomer.previousEvents
                          .slice(0, 6)
                          .map((event) => (
                            <span
                              className="rounded-full border px-3 py-1.5 text-xs"
                              key={event.id}
                            >
                              {event.type} ·{" "}
                              {event.date
                                ? new Date(
                                    `${event.date}T12:00:00Z`,
                                  ).toLocaleDateString("es-CL")
                                : "Sin fecha"}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted">
                        Sin eventos anteriores.
                      </p>
                    )}
                    <p className="mt-4 font-medium text-brand">
                      Crear nuevo evento →
                    </p>
                  </div>
                </section>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  autoComplete="off"
                  disabled={Boolean(selectedCustomer)}
                  label="Nombre y Apellido o Empresa"
                  onChange={(e) => client("name", e.target.value)}
                  required
                  value={draft.client.name}
                />
                <Field
                  autoComplete="off"
                  inputMode="text"
                  label="RUT"
                  onChange={(e) => {
                    client("rut", formatChileanRut(e.target.value));
                  }}
                  placeholder="12345678-9"
                  required
                  disabled={Boolean(selectedCustomer)}
                  value={draft.client.rut}
                />
                <Field
                  autoComplete="off"
                  disabled={Boolean(selectedCustomer)}
                  label="Empresa (opcional)"
                  onChange={(e) => client("company", e.target.value)}
                  value={draft.client.company ?? ""}
                />
                <PhoneField disabled={Boolean(selectedCustomer)} label="Teléfono" onChange={(phone) => client("phone", phone)} required value={draft.client.phone} />
                <Field
                  autoComplete="off"
                  disabled={Boolean(selectedCustomer)}
                  label="Correo"
                  onChange={(e) => client("email", e.target.value)}
                  required
                  type="email"
                  value={draft.client.email}
                />
              </div>
              <Field
                autoComplete="off"
                disabled={Boolean(selectedCustomer)}
                label="Dirección"
                onChange={(e) => client("address", e.target.value)}
                value={draft.client.address}
              />
              <label className="block text-sm font-medium">
                Origen del contacto
                <select
                  className="mt-2 h-11 w-full rounded-lg border bg-background px-3"
                  disabled={Boolean(selectedCustomer)}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      origin: e.target.value as ProjectOrigin,
                    }))
                  }
                  value={draft.origin ?? ""}
                >
                  <option value="">
                    {selectedCustomer
                      ? "Origen registrado en CRM"
                      : "Selecciona un origen"}
                  </option>
                  {projectOrigins.map((origin) => (
                    <option key={origin} value={origin}>
                      {originLabels[origin]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button
                  className="gap-2"
                  onClick={() =>
                    document
                      .querySelector<HTMLInputElement>(
                        'input[autocomplete="name"]',
                      )
                      ?.focus()
                  }
                  variant="outline"
                >
                  <PenLine className="size-4" />
                  Editar
                </Button>
                <Button
                  className="gap-2 text-danger"
                  onClick={() => {
                    if (window.confirm("¿Eliminar los datos ingresados?")) {
                      setSelectedCustomerId(null);
                      setDraft((current) => ({
                        ...current,
                        crmCustomerId: undefined,
                        client: initialDraft.client,
                        origin: undefined,
                      }));
                    }
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
                      <button
                        className={cn(
                          "min-h-12 rounded-xl border p-3 text-left text-sm",
                          draft.type === type && "border-brand bg-brand/5",
                        )}
                        key={type}
                        onClick={() =>
                          setDraft((current) => ({ ...current, type }))
                        }
                      >
                        {typeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <Field
                      autoComplete="off"
                      label="Lugar"
                      list="orbit-event-venues"
                      onChange={(e) => {
                        const value = e.target.value;
                        const venue = venues.find(
                          (item) =>
                            item.name.localeCompare(value.trim(), "es", {
                              sensitivity: "base",
                            }) === 0,
                        );
                        setDraft((current) => ({
                          ...current,
                          event: {
                            ...current.event,
                            location: value,
                            city: venue?.municipality ?? "",
                          },
                        }));
                      }}
                      placeholder="Escribe el nombre de la sede"
                      value={draft.event.location}
                    />
                    <datalist id="orbit-event-venues">
                      {venues.map((venue) => (
                        <option key={venue.name} value={venue.name}>
                          {venue.municipality}
                        </option>
                      ))}
                    </datalist>
                    {draft.event.location && !selectedVenue && (
                      <p className="mt-2 text-xs text-muted">
                        Selecciona una sede configurada en las sugerencias.
                      </p>
                    )}
                  </div>
                  <Field
                    label="Dirección del evento"
                    onChange={(e) => setEventAddress(e.target.value)}
                    value={eventAddress}
                  />
                  <MunicipalityCombobox
                    items={municipalities}
                    onChange={(value) => event("city", value)}
                    value={draft.event.city}
                  />
                  <Field
                    label="Fecha del evento"
                    onChange={(e) => event("date", e.target.value)}
                    required
                    type="date"
                    value={draft.event.date}
                  />
                  <Field
                    label="Inicio del servicio BOOMBOX"
                    onChange={(e) => event("time", e.target.value)}
                    type="time"
                    value={draft.event.time}
                  />
                  <Field
                    label="Contacto operacional"
                    onChange={(e) => setOperationalContact(e.target.value)}
                    value={operationalContact}
                  />
                  <PhoneField label="Teléfono del contacto operacional" onChange={setOperationalPhone} value={operationalPhone} />
                  {draft.type === "Wedding" ? (
                    <>
                      <Field
                        label="Nombre de la novia"
                        onChange={(e) => setBride(e.target.value)}
                        value={bride}
                      />
                      <Field
                        label="Nombre del novio"
                        onChange={(e) => setGroom(e.target.value)}
                        value={groom}
                      />
                    </>
                  ) : draft.type ? (
                    <Field
                      label="Contacto principal"
                      onChange={(e) => setMainContact(e.target.value)}
                      value={mainContact}
                    />
                  ) : null}
                </div>
                {selectedVenue && selectedMunicipality && (
                  <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
                    <p className="font-semibold text-success">
                      Transporte calculado automáticamente
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {selectedVenue.name} · {selectedVenue.municipality} ·
                      Provincia {selectedVenue.province}
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {transportTotal == null
                        ? "Precio por confirmar"
                        : currency.format(transportTotal)}
                    </p>
                    {venueSurcharge > 0 && (
                      <p className="mt-1 text-sm font-medium">
                        Recargo especial de sede:{" "}
                        {currency.format(venueSurcharge)}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted">
                  La hora de término se calcula automáticamente según las horas
                  contratadas.
                </p>
              </div>
              <aside className="h-fit max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-0">
                {summary}
              </aside>
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-5">
                <div>
                  <p className="mb-3 text-sm font-medium">
                    Servicio principal y servicios adicionales
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {services.map((service) => (
                      <button
                        className={cn(
                          "min-h-12 rounded-xl border p-3 text-left text-sm",
                          configurations[service.code] &&
                            "border-brand bg-brand/5",
                        )}
                        key={service.code}
                        onClick={() => toggleService(service.code)}
                      >
                        <span className="block font-medium">
                          {service.name}
                        </span>
                        {draft.services[0] === service.code && (
                          <span className="mt-1 block text-xs text-brand">
                            Servicio principal
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {(
                  Object.entries(configurations) as Array<
                    [ProjectService, ServiceConfiguration]
                  >
                ).map(([service, configuration]) => (
                  <section className="rounded-2xl border p-5" key={service}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{serviceLabel(service)}</h3>
                      <strong className="text-brand">
                        {currency.format(serviceTotal(service, configuration))}
                      </strong>
                    </div>
                    {serviceByCode.get(service)?.behavior === "FIXED" ? (
                      <div className="mt-4 rounded-xl border bg-background/40 p-4">
                        <p className="text-xs font-medium uppercase tracking-[.14em] text-muted">
                          Duración fija
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {configuration.hours} Horas
                        </p>
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
                            {Array.from(
                              {
                                length: Math.max(
                                  1,
                                  (serviceByCode.get(service)?.maximumHours ??
                                    configuration.hours) -
                                    (serviceByCode.get(service)?.minimumHours ??
                                      configuration.hours) +
                                    1,
                                ),
                              },
                              (_, index) =>
                                (serviceByCode.get(service)?.minimumHours ??
                                  configuration.hours) + index,
                            ).map((hours) => (
                              <option key={hours} value={hours}>
                                {hours} horas
                              </option>
                            ))}
                          </select>
                        </label>
                        {serviceByCode
                          .get(service)
                          ?.compatibleExtras.includes("ADDITIONAL_HOURS") && (
                          <Field
                            label={`Horas adicionales · ${currency.format(additionalHourRate(service))} c/u`}
                            min="0"
                            onChange={(e) =>
                              updateService(service, {
                                additionalHours: Math.max(
                                  0,
                                  Number(e.target.value),
                                ),
                              })
                            }
                            type="number"
                            value={configuration.additionalHours}
                          />
                        )}
                      </div>
                    )}
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {compatibleExtras(service).map((extra) => {
                        const included =
                          compatibleIncludedExtras(service).includes(extra);
                        const selected =
                          included || configuration.extras.includes(extra);
                        const unit = extraUnitPrice(service, extra);
                        if (extra === "Branding")
                          return (
                            <label
                              className={cn(
                                "rounded-xl border p-3 text-sm",
                                selected && "border-brand bg-brand/5",
                              )}
                              key={extra}
                            >
                              <span className="font-semibold">Branding</span>
                              <span className="mt-1 block text-xs text-muted">
                                {currency.format(Number(unit))} por cara ·
                                mínimo {brandingMinimum}
                              </span>
                              <select
                                className="mt-3 h-10 w-full rounded-lg border bg-background px-3"
                                onChange={(e) => {
                                  const quantity = Number(e.target.value);
                                  const hasBranding =
                                    configuration.extras.includes("Branding");
                                  if (quantity === 0 && hasBranding)
                                    toggleServiceExtra(service, "Branding");
                                  else if (quantity > 0) {
                                    if (!hasBranding)
                                      toggleServiceExtra(service, "Branding");
                                    updateService(service, {
                                      brandingQuantity: quantity,
                                    });
                                  }
                                }}
                                value={
                                  configuration.extras.includes("Branding")
                                    ? configuration.brandingQuantity
                                    : 0
                                }
                              >
                                <option value={0}>Sin Branding</option>
                                {Array.from(
                                  {
                                    length:
                                      brandingMaximum - brandingMinimum + 1,
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
                        if (extra === "Imanes")
                          return (
                            <label
                              className={cn(
                                "rounded-xl border p-3 text-sm",
                                selected && "border-brand bg-brand/5",
                              )}
                              key={extra}
                            >
                              <span className="font-semibold">Imanes</span>
                              <span className="mt-1 block text-xs text-muted">
                                Precio oficial {currency.format(Number(unit))}
                              </span>
                              <select
                                className="mt-3 h-10 w-full rounded-lg border bg-background px-3"
                                onChange={(event) => {
                                  const magnetsMode = event.target.value as
                                    | "NONE"
                                    | "PAID"
                                    | "BENEFIT";
                                  updateService(service, {
                                    magnetsMode,
                                    extras:
                                      magnetsMode === "NONE"
                                        ? configuration.extras.filter(
                                            (item) => item !== "Imanes",
                                          )
                                        : Array.from(
                                            new Set([
                                              ...configuration.extras,
                                              "Imanes" as ServiceExtra,
                                            ]),
                                          ),
                                  });
                                }}
                                value={
                                  configuration.extras.includes("Imanes")
                                    ? (configuration.magnetsMode ?? "PAID")
                                    : "NONE"
                                }
                              >
                                <option value="NONE">No incluidos</option>
                                <option value="PAID">
                                  +{currency.format(Number(unit))}
                                </option>
                                <option value="BENEFIT">
                                  Incluido · Beneficio BOOMBOX · $0
                                </option>
                              </select>
                            </label>
                          );
                        return (
                          <div
                            className={cn(
                              "rounded-xl border p-3",
                              selected && "border-brand bg-brand/5",
                            )}
                            key={extra}
                          >
                            <label className="flex items-start gap-3 text-sm">
                              <input
                                checked={selected}
                                disabled={included}
                                onChange={() =>
                                  toggleServiceExtra(service, extra)
                                }
                                type="checkbox"
                              />
                              <span>
                                <strong>
                                  {extra === "QR" ? "QR Instantáneo" : extra}
                                </strong>
                                <span className="mt-1 block text-xs text-muted">
                                  {included
                                    ? "Incluido · $0 · Bloqueado"
                                    : `+${currency.format(Number(unit))}`}
                                </span>
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <TextArea
                  label="Solicitudes especiales"
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  value={specialRequests}
                />
                <TextArea
                  label="Notas comerciales"
                  onChange={(e) => setCommercialNotes(e.target.value)}
                  value={commercialNotes}
                />
                <section className="rounded-2xl border p-5">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    Formalización comercial
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    Define el documento oficial y si la reserva requiere firma.
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["CONTRACT_INVOICE", "Contrato + Factura"],
                        ["INVOICE_ONLY", "Solo Factura"],
                        ["PURCHASE_ORDER", "Orden de Compra"],
                        ["BOOMBOX_AGREEMENT", "Acuerdo BOOMBOX"],
                        ["NO_CONTRACT", "Sin Contrato"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm",
                          commercialFormalization === value &&
                            "border-brand bg-brand/10",
                        )}
                        key={value}
                      >
                        <input
                          checked={commercialFormalization === value}
                          name="commercial-formalization"
                          onChange={() => {
                            setCommercialFormalization(value);
                            setTermsAccepted(false);
                            setSignatureConfirmed(false);
                            setSignatureDataUrl("");
                          }}
                          type="radio"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    {commercialFormalization === "CONTRACT_INVOICE"
                      ? "Requiere aceptación y firma del cliente."
                      : "Genera Documento con Factura sin sección de firma."}
                  </p>
                </section>
                <section className="rounded-2xl border border-brand/25 bg-brand/5 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
                      💼 Negociación comercial
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      Negociación Comercial
                    </h3>
                    <p className="mt-1 text-sm text-muted">
                      Los precios oficiales provienen de Master Data y nunca se
                      modifican. Cualquier ajuste pertenece exclusivamente a
                      esta reserva.
                    </p>
                  </div>
                  <dl className="mt-4 grid gap-3 rounded-xl border bg-background/40 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-muted">Servicio oficial</dt>
                      <dd className="mt-1 font-semibold">
                        {currency.format(officialServicePrice)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Extras oficiales</dt>
                      <dd className="mt-1 font-semibold">
                        {currency.format(officialExtrasTotal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Transporte oficial</dt>
                      <dd className="mt-1 font-semibold">
                        {currency.format(officialTransport)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Total oficial</dt>
                      <dd className="mt-1 font-semibold text-brand">
                        {currency.format(officialTotal)}
                      </dd>
                    </div>
                  </dl>
                  {!canNegotiate && (
                    <p className="mt-4 rounded-xl border p-3 text-sm text-muted">
                      Tu perfil puede consultar los precios oficiales, pero no
                      aplicar ajustes.
                    </p>
                  )}
                  <fieldset className="mt-5 space-y-5" disabled={!canNegotiate}>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field
                        label="✏ Precio aplicado · Servicio"
                        min="0"
                        onChange={(event) =>
                          setNegotiatedServicePrice(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={negotiatedServicePrice ?? officialServicePrice}
                      />
                      <Field
                        label="✏ Precio aplicado · Extras"
                        min="0"
                        onChange={(event) =>
                          setNegotiatedExtrasPrice(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={negotiatedExtrasPrice ?? officialExtrasTotal}
                      />
                      <Field
                        label="✏ Precio aplicado · Transporte"
                        min="0"
                        onChange={(event) =>
                          setTransportOverride(
                            Math.max(0, Number(event.target.value)),
                          )
                        }
                        type="number"
                        value={transportOverride ?? officialTransport}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">
                        💳 Condición de pago
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {(
                          [
                            ["FIFTY_FIFTY", "Reserva 50% + saldo"],
                            ["CASH", "Pago al contado"],
                            ["CORPORATE_CREDIT", "Crédito Empresa"],
                          ] as Array<[PaymentCondition, string]>
                        ).map(([value, label]) => (
                          <label
                            className={cn(
                              "flex min-h-11 items-center gap-2 rounded-xl border bg-background/40 px-3 text-sm",
                              paymentCondition === value &&
                                "border-brand bg-brand/10",
                            )}
                            key={value}
                          >
                            <input
                              checked={paymentCondition === value}
                              name="payment-condition"
                              onChange={() => setPaymentCondition(value)}
                              type="radio"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      {paymentCondition === "CORPORATE_CREDIT" && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                          {(
                            [
                              ["CASH", "Al día"],
                              ["15", "15 días"],
                              ["30", "30 días"],
                              ["45", "45 días"],
                              ["60", "60 días"],
                              ["CUSTOM", "Otro"],
                            ] as Array<[CreditTerm, string]>
                          ).map(([value, label]) => (
                            <label
                              className={cn(
                                "flex min-h-11 items-center gap-2 rounded-xl border bg-background/40 px-3 text-xs",
                                creditTerm === value &&
                                  "border-brand bg-brand/10",
                              )}
                              key={value}
                            >
                              <input
                                checked={creditTerm === value}
                                name="commercial-credit-term"
                                onChange={() => setCreditTerm(value)}
                                type="radio"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                      {paymentCondition === "CORPORATE_CREDIT" &&
                        creditTerm === "CUSTOM" && (
                          <div className="mt-3">
                            <Field
                              label="Días de crédito"
                              min="0"
                              onChange={(event) =>
                                setCustomCreditDays(
                                  Math.max(0, Number(event.target.value)),
                                )
                              }
                              type="number"
                              value={customCreditDays || ""}
                            />
                          </div>
                        )}
                    </div>
                  </fieldset>
                  <p className="mt-4 border-t pt-4 text-right text-lg font-semibold">
                    TOTAL{" "}
                    <span className="ml-3 text-brand">
                      {currency.format(adjustedSubtotal)}
                    </span>
                  </p>
                </section>
              </div>
              <aside className="h-fit max-lg:sticky max-lg:bottom-0 lg:sticky lg:top-0">
                {summary}
              </aside>
            </div>
          )}
          {step === 4 && (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex items-center gap-3">
                <FileSignature className="size-6 text-brand" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    {requiresSignature ? "CONTRATO" : "DOCUMENTO CON FACTURA"}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold">
                    {requiresSignature
                      ? "Resumen, condiciones y firma"
                      : "Resumen y condiciones comerciales"}
                  </h3>
                </div>
              </div>
              {summary}
              <section className="rounded-2xl border p-5 sm:p-6">
                <h3 className="text-xl font-semibold">
                  Términos y Condiciones BOOMBOX
                </h3>
                <p className="mt-2 text-sm text-muted">
                  Desplázate hasta el final para continuar.
                </p>
                <div
                  className="mt-5 max-h-80 space-y-5 overflow-y-auto rounded-xl border bg-background/30 p-5"
                  onScroll={(e) => {
                    const element = e.currentTarget;
                    if (
                      element.scrollHeight -
                        element.scrollTop -
                        element.clientHeight <
                      12
                    )
                      setTermsRead(true);
                  }}
                  tabIndex={0}
                >
                  {(
                    [
                      ["Condición de pago", paymentClause],
                      ...boomboxTerms,
                    ] as ReadonlyArray<readonly [string, string]>
                  ).map(([title, content]) => (
                    <section key={title}>
                      <h4 className="font-semibold">{title}</h4>
                      <p className="mt-2 text-sm leading-6 text-muted">
                        {content}
                      </p>
                    </section>
                  ))}
                </div>
                {requiresSignature ? (
                  <label
                    className={cn(
                      "mt-5 flex items-start gap-3 rounded-xl border p-4",
                      !termsRead && "cursor-not-allowed opacity-60",
                    )}
                  >
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
                      <strong>
                        He leído y acepto los Términos y Condiciones.
                      </strong>
                      <span className="mt-1 block text-sm text-muted">
                        {termsRead
                          ? "La firma se habilitará inmediatamente."
                          : "Lee el contrato completo para continuar."}
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="mt-5 rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
                    Se emitirá un documento comercial oficial sin firma. Las
                    condiciones comerciales y del evento permanecerán visibles.
                  </p>
                )}
              </section>
              {requiresSignature && termsAccepted && (
                <SignaturePad
                  disabled={!termsAccepted}
                  onConfirmed={(confirmed, dataUrl) => {
                    setSignatureConfirmed(confirmed);
                    setSignatureDataUrl(dataUrl ?? "");
                  }}
                />
              )}
            </div>
          )}
          {step === 5 && (
            <div className="mx-auto max-w-4xl space-y-5">
              <section>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">
                  Resumen de reserva
                </p>
                {summary}
              </section>
              <div className="space-y-5">
                <section className="rounded-2xl border p-5">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    Cliente
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {isCorporateCustomer ? "Empresa" : "Cliente Particular"}
                  </h3>
                  {paymentCondition === "CORPORATE_CREDIT" ? (
                    <div className="mt-4 space-y-5">
                      <p className="rounded-xl border bg-background/40 p-4 text-sm">
                        <span className="block text-muted">
                          Condición acordada
                        </span>
                        <strong className="mt-1 block">
                          Crédito Empresa ·{" "}
                          {paymentTermDays === 0
                            ? "Pago al día"
                            : `${paymentTermDays} días`}
                        </strong>
                      </p>
                      <Field
                        label="Orden de compra (opcional)"
                        onChange={(e) => setPurchaseOrder(e.target.value)}
                        value={purchaseOrder}
                      />
                      <dl className="grid gap-3 rounded-xl bg-background/40 p-4 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-muted">Factura</dt>
                          <dd className="mt-1 font-semibold">
                            Se generará al confirmar
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Saldo pendiente</dt>
                          <dd className="mt-1 font-semibold">
                            {currency.format(payableTotal)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Vencimiento</dt>
                          <dd className="mt-1 font-semibold">
                            {formattedDueDate}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted">Estado</dt>
                          <dd className="mt-1 font-semibold">
                            Crédito corporativo
                          </dd>
                        </div>
                      </dl>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm">
                          <input
                            checked={paymentReceiptRequired}
                            onChange={(e) =>
                              setPaymentReceiptRequired(e.target.checked)
                            }
                            type="checkbox"
                          />
                          Comprobante de pago requerido
                        </label>
                        <label className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm">
                          <input
                            checked={corporateCreditApproved}
                            onChange={(e) =>
                              setCorporateCreditApproved(e.target.checked)
                            }
                            type="checkbox"
                          />
                          Crédito corporativo aprobado
                        </label>
                      </div>
                    </div>
                  ) : (
                    <dl className="mt-4 grid gap-3 rounded-xl bg-background/40 p-4 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-muted">
                          {paymentCondition === "CASH"
                            ? "Pago al contado"
                            : "Reserva · 50%"}
                        </dt>
                        <dd className="mt-1 text-lg font-semibold">
                          {currency.format(reservationTotal)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">
                          {paymentCondition === "CASH"
                            ? "Saldo restante"
                            : "Saldo restante · 50%"}
                        </dt>
                        <dd className="mt-1 text-lg font-semibold">
                          {currency.format(balanceTotal)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Vencimiento del saldo</dt>
                        <dd className="mt-1 font-semibold">
                          {formattedDueDate}
                        </dd>
                        <p className="mt-1 text-xs text-muted">
                          {paymentCondition === "CASH"
                            ? "Pago total acordado."
                            : "Una semana antes del evento."}
                        </p>
                      </div>
                    </dl>
                  )}
                </section>
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    Método de pago
                  </p>
                  {isCorporateCustomer && (
                    <div className="mb-4 rounded-xl border p-4">
                      <p className="font-semibold">Tratamiento tributario</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => setCorporateVatApplied(false)}
                          variant={!corporateVatApplied ? "default" : "outline"}
                        >
                          Valor NETO
                        </Button>
                        <Button
                          onClick={() => setCorporateVatApplied(true)}
                          variant={corporateVatApplied ? "default" : "outline"}
                        >
                          + IVA
                        </Button>
                      </div>
                      {corporateVatApplied && (
                        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <dt className="text-muted">Neto</dt>
                            <dd>{currency.format(adjustedSubtotal)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">IVA</dt>
                            <dd>{currency.format(vatAmount)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted">Total</dt>
                            <dd className="font-semibold">
                              {currency.format(adjustedSubtotal + vatAmount)}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => setPaymentMethod("TRANSFER")}
                      variant={
                        paymentMethod === "TRANSFER" ? "default" : "outline"
                      }
                    >
                      Transferencia
                    </Button>
                    <Button
                      onClick={() => setPaymentMethod("MERCADO_PAGO")}
                      variant={
                        paymentMethod === "MERCADO_PAGO" ? "default" : "outline"
                      }
                    >
                      Mercado Pago +5%
                    </Button>
                  </div>
                </section>
                {paymentMethod === "TRANSFER" ? (
                  <div className="rounded-2xl border p-5 text-sm">
                    <p className="font-semibold">
                      PRODUCCIONES BOOMBOX COMPANY SPA
                    </p>
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
                        <dd className="font-medium">
                          contabilidad@boom-box.cl
                        </dd>
                      </div>
                    </dl>
                    <label className="mt-5 block font-medium">
                      Comprobante
                      <input
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="mt-2 block w-full rounded-xl border p-3"
                        onChange={(e) =>
                          setReceipt(e.target.files?.[0]?.name ?? "")
                        }
                        required={paymentReceiptRequired}
                        type="file"
                      />
                      <span className="mt-2 block text-xs text-muted">
                        JPG, PNG, WEBP o PDF.{" "}
                        {receipt
                          ? `Vinculado: ${receipt}`
                          : paymentReceiptRequired
                            ? "Obligatorio para continuar."
                            : "Opcional para este crédito corporativo."}
                      </span>
                    </label>
                  </div>
                ) : (
                  <div className="rounded-xl border border-brand/25 bg-brand/5 p-4 text-sm">
                    <p className="font-semibold">Comisión Mercado Pago</p>
                    <p className="mt-1 text-muted">
                      5% · {currency.format(mercadoPagoCommission)}
                    </p>
                    <p className="mt-3 font-medium">
                      El total, la reserva y el saldo se actualizaron
                      automáticamente.
                    </p>
                  </div>
                )}
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    Estado del pago
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      "Pendiente",
                      "Reserva recibida",
                      "Pagado",
                      "Crédito corporativo",
                    ].map((status, index) => (
                      <div
                        className={cn(
                          "rounded-xl border p-3 text-center text-xs font-medium",
                          index === 0 && "border-brand bg-brand/5 text-brand",
                        )}
                        key={status}
                      >
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
                <h3 className="text-3xl font-semibold">
                  Reserva creada correctamente.
                </h3>
                <p className="mt-3 text-lg font-medium">
                  El Founder decide cuándo comunicarla al cliente.
                </p>
              </div>
              <div className="grid gap-3 text-left sm:grid-cols-2">
                {[
                  "Documento oficial preparado",
                  "Reserva registrada",
                  "Portal disponible",
                  "Correo pendiente de decisión",
                ].map((label) => (
                  <div
                    className="flex items-center gap-3 rounded-xl border p-4"
                    key={label}
                  >
                    <Check className="size-5 text-success" />
                    <span className="font-medium">{label}</span>
                  </div>
                ))}
              </div>
              {summary}
              <section className="rounded-2xl border p-5 text-left">
                <h4 className="text-lg font-semibold">¿Qué deseas hacer?</h4>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <Button onClick={() => setConfirmationPreview(true)}>
                    <Send className="size-4" />
                    Enviar confirmación al cliente
                  </Button>
                  <Button onClick={reset} variant="outline">
                    Enviar más tarde
                  </Button>
                  <Button
                    onClick={() =>
                      window.location.assign(`/projects/${createdProject.id}`)
                    }
                    variant="outline"
                  >
                    Volver al evento
                  </Button>
                </div>
              </section>
              {confirmationPreview && (
                <section className="rounded-2xl border border-brand/30 bg-brand/5 p-5 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[.16em] text-brand">
                    Vista previa antes de enviar
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted">Cliente</dt>
                      <dd className="font-semibold">
                        {createdProject.client.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Destino</dt>
                      <dd className="font-semibold">
                        {createdProject.client.email}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Servicio</dt>
                      <dd>
                        {createdProject.services.map(serviceLabel).join(" + ")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Documento</dt>
                      <dd>
                        {requiresSignature
                          ? "Contrato firmado"
                          : "Documento comercial"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Precio aplicado</dt>
                      <dd>{currency.format(adjustedSubtotal)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">IVA</dt>
                      <dd>
                        {corporateVatApplied
                          ? currency.format(vatAmount)
                          : "No aplicado"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Portal</dt>
                      <dd className="truncate">{portalUrl}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Total</dt>
                      <dd className="font-semibold">
                        {currency.format(payableTotal)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex gap-2">
                    <Button
                      disabled={confirmationSending}
                      onClick={async () => {
                        setConfirmationSending(true);
                        const result =
                          await sendManualReservationConfirmationAction(
                            createdProject.id,
                          );
                        setPortalMessage(result.message);
                        if (result.ok) setConfirmationPreview(false);
                        setConfirmationSending(false);
                      }}
                    >
                      {confirmationSending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Enviar
                    </Button>
                    <Button
                      disabled={confirmationSending}
                      onClick={() => setConfirmationPreview(false)}
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </div>
                </section>
              )}
              {portalMessage && (
                <p className="text-sm text-success">{portalMessage}</p>
              )}
              <section className="rounded-2xl border p-5 text-left sm:p-6">
                <p className="leading-7">
                  No se enviará ninguna comunicación hasta que el Founder
                  confirme el envío.
                </p>
                <p className="mt-5 font-semibold">
                  Desde ahora podrás acceder al Portal BOOMBOX utilizando:
                </p>
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
          {step > 0 && step < 6 ? (
            <ActionButton
              disabled={submitting}
              icon={ChevronLeft}
              label="Atrás"
              onClick={() => setStep((current) => current - 1)}
              variant="outline"
            />
          ) : (
            <span />
          )}
          {step === 0 && method === "AUTOMATIC" ? (
            <span />
          ) : step < 5 ? (
            <ActionButton
              disabled={!valid}
              icon={ChevronRight}
              iconPosition="end"
              label="Continuar"
              onClick={() => setStep((current) => current + 1)}
            />
          ) : step === 5 ? (
            <Button
              aria-live="polite"
              disabled={!valid || submitting}
              onClick={() => void create()}
            >
              {submitting && (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              )}
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
