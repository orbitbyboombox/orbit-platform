"use client";
import {
  ArrowLeft,
  Building2,
  CakeSlice,
  Copy,
  FileDown,
  FilePlus2,
  GraduationCap,
  GripVertical,
  Mail,
  Plus,
  ReceiptText,
  Send,
  Trash2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  createFormalQuoteAction,
  convertCommercialQuoteAction,
  sendCommercialInformationAction,
  sendFormalQuoteAction,
} from "./actions";
import type {
  CommercialCategory,
  CommercialHubData,
  DiscountType,
  FormalQuoteDraft,
  QuoteLineDraft,
} from "./types";
import { calculateFormalQuote } from "./quote-calculation";
import { displayChileanPhone, formalQuoteSubject, formatChileanRutInput, moneyInputNumber, normalizeChileanPhone, normalizeEmailNewlines, quoteDisplayFilename, titleCasePerson } from "./presentation";
import { PdfViewer } from "./pdf-viewer";

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const categoryDocument: Record<
  Exclude<CommercialCategory, "COMPANIES_QUOTE">,
  string
> = {
  WEDDINGS: "WEDDINGS",
  BIRTHDAYS: "EVENTS",
  GRADUATIONS: "EVENTS",
  COMPANIES_CATALOG: "COMPANIES",
};
const categoryCards = [
  {
    id: "WEDDINGS" as const,
    title: "Matrimonios",
    detail: "Enviar información",
    icon: UsersRound,
  },
  {
    id: "BIRTHDAYS" as const,
    title: "Cumpleaños",
    detail: "Enviar información",
    icon: CakeSlice,
  },
  {
    id: "GRADUATIONS" as const,
    title: "Graduaciones",
    detail: "Enviar información",
    icon: GraduationCap,
  },
  {
    id: "COMPANIES" as const,
    title: "Empresas",
    detail: "Catálogo o cotización formal",
    icon: Building2,
  },
];
const uid = () => crypto.randomUUID();

export function CommercialHub({ data }: { data: CommercialHubData }) {
  const [view, setView] = useState<"HOME" | CommercialCategory | "COMPANIES">(
    "HOME",
  );
  const [draftToEdit, setDraftToEdit] = useState<FormalQuoteDraft | undefined>();
  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">
          Commercial Hub 1.1
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Centro comercial BOOMBOX
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Clientes, reservas, catálogos y cotizaciones profesionales desde
          cualquier dispositivo.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Button asChild className="min-h-12 justify-start">
            <Link href="/customers">
              <Plus />
              Nuevo cliente
            </Link>
          </Button>
          <Button asChild className="min-h-12 justify-start" variant="outline">
            <Link href="/projects?reservation=new">
              <Plus />
              Nueva reserva
            </Link>
          </Button>
          <Button
            className="min-h-12 justify-start"
            onClick={() => setView("COMPANIES_QUOTE")}
            variant="outline"
          >
            <ReceiptText />
            Cotizar
          </Button>
        </div>
      </header>
      {view !== "HOME" && (
        <button
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-foreground"
          onClick={() => setView("HOME")}
        >
          <ArrowLeft className="size-4" />
          Volver al hub
        </button>
      )}
      {view === "HOME" ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {categoryCards.map(({ id, title, detail, icon: Icon }) => (
            <button
              className="min-h-40 rounded-2xl border bg-card p-5 text-left transition hover:-translate-y-0.5 hover:border-brand/50"
              key={id}
              onClick={() => setView(id)}
            >
              <Icon className="size-6 text-brand" />
              <h2 className="mt-6 text-xl font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{detail}</p>
            </button>
          ))}
        </section>
      ) : view === "COMPANIES" ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <button
            className="rounded-2xl border bg-card p-6 text-left"
            onClick={() => setView("COMPANIES_CATALOG")}
          >
            <Mail className="text-brand" />
            <h2 className="mt-5 text-xl font-semibold">Enviar catálogo</h2>
            <p className="mt-2 text-sm text-muted">
              Pegar correo, previsualizar y enviar.
            </p>
          </button>
          <button
            className="rounded-2xl border bg-card p-6 text-left"
            onClick={() => setView("COMPANIES_QUOTE")}
          >
            <FilePlus2 className="text-brand" />
            <h2 className="mt-5 text-xl font-semibold">
              Crear cotización formal
            </h2>
            <p className="mt-2 text-sm text-muted">
              Constructor flexible con cantidades y precios especiales.
            </p>
          </button>
        </section>
      ) : view === "COMPANIES_QUOTE" ? (
        <FormalBuilder data={data} initialDraft={draftToEdit} />
      ) : (
        <InformationSender category={view} data={data} />
      )}
      <RecentQuotes quotes={data.recentQuotes} onEdit={(draft) => { setDraftToEdit(draft); setView("COMPANIES_QUOTE"); }} />
      <SendHistory sends={data.recentSends} />
    </main>
  );
}

function InformationSender({
  category,
  data,
}: {
  category: Exclude<CommercialCategory, "COMPANIES_QUOTE">;
  data: CommercialHubData;
}) {
  const template = data.templates.find((item) => item.category === category);
  const document = data.documents.find(
    (item) => item.category === categoryDocument[category],
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(normalizeEmailNewlines(template?.body ?? ""));
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState(uid);
  const [pending, start] = useTransition();
  const send = () => {
    if (!window.confirm(`¿Enviar información a ${email}?`)) return;
    start(async () => {
      const result = await sendCommercialInformationAction({
        category,
        email,
        name,
        subject,
        body,
        documentId: document?.id ?? "",
        requestId,
      });
      setMessage(result.ok ? result.message : result.error);
      if (result.ok) setRequestId(uid());
    });
  };
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-7">
      <h2 className="text-2xl font-semibold">Enviar información</h2>
      <p className="mt-2 text-sm text-muted">
        El envío no crea un cliente automáticamente.
      </p>
      <div className="mt-6 grid min-w-0 gap-4">
        <Field label="Email">
          <input
            autoComplete="email"
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@empresa.cl"
            value={email}
          />
        </Field>
        <Field label="Nombre (opcional)">
          <input onChange={(e) => setName(e.target.value)} value={name} />
        </Field>
        <Field label="Asunto">
          <input onChange={(e) => setSubject(e.target.value)} value={subject} />
        </Field>
        <Field label="Mensaje">
          <textarea
            className="min-h-64"
            onChange={(e) => setBody(e.target.value)}
            value={body}
          />
        </Field>
        <div className="rounded-xl border bg-background p-4">
          <p className="text-sm font-semibold">Documento activo</p>
          <p className="mt-1 text-sm text-muted">
            {document
              ? `${document.name} · ${document.version}`
              : `Aún no has cargado el catálogo de ${category === "WEDDINGS" ? "Matrimonios" : category === "COMPANIES_CATALOG" ? "Empresas" : "Eventos"}.`}
          </p>
          {!document && <Link className="mt-3 inline-flex min-h-10 items-center rounded-lg border px-3 text-xs font-semibold text-brand" href="/settings#commercial-settings">Subir catálogo</Link>}
        </div>
        {preview && (
          <div className="rounded-xl border border-brand/30 bg-background p-4">
            <p className="text-xs font-semibold uppercase text-brand">
              Vista previa
            </p>
            <p className="mt-3 font-semibold">Para: {email || "—"}</p>
            <p className="mt-1">{subject}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm text-muted">
              {normalizeEmailNewlines(body).replaceAll("[Nombre]", titleCasePerson(name))}
            </p>
            <p className="mt-4 text-sm">Adjunto: {document?.filename ?? "—"}</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            onClick={() => setPreview((value) => !value)}
            variant="outline"
          >
            {preview ? "Cerrar vista previa" : "Previsualizar"}
          </Button>
          <Button disabled={pending || !document || !email} onClick={send}>
            <Send />
            {pending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
        {message && (
          <p aria-live="polite" className="text-sm font-medium">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}

function FormalBuilder({ data, initialDraft }: { data: CommercialHubData; initialDraft?: FormalQuoteDraft }) {
  const [customerId, setCustomerId] = useState(initialDraft?.existingCustomerId ?? "");
  const [temporary, setTemporary] = useState({ company: initialDraft?.company ?? "", rut: formatChileanRutInput(initialDraft?.rut ?? ""), contact: initialDraft?.contact ?? "", email: initialDraft?.email ?? "", phone: normalizeChileanPhone(initialDraft?.phone ?? ""), address: initialDraft?.address ?? "" });
  const [lines, setLines] = useState<QuoteLineDraft[]>(initialDraft?.lines ?? []);
  const [validityDays, setValidityDays] = useState(initialDraft?.validityDays ?? 10);
  const [depositPercent, setDepositPercent] = useState(initialDraft?.depositPercent ?? 50);
  const [globalDiscountType, setGlobalDiscountType] =
    useState<DiscountType | null>(initialDraft?.globalDiscountType ?? null);
  const [globalDiscountValue, setGlobalDiscountValue] = useState(initialDraft?.globalDiscountValue ?? 0);
  const [saveCustomer, setSaveCustomer] = useState(initialDraft?.saveTemporaryCustomer ?? false);
  const [eventName, setEventName] = useState(initialDraft?.eventName ?? "");
  const [eventDate, setEventDate] = useState(initialDraft?.eventDate ?? "");
  const [eventTime, setEventTime] = useState(initialDraft?.eventTime ?? "");
  const [eventLocation, setEventLocation] = useState(initialDraft?.eventLocation ?? "");
  const [eventCity, setEventCity] = useState(initialDraft?.eventCity ?? "");
  const [attachCatalog, setAttachCatalog] = useState(initialDraft?.attachCatalog ?? false);
  const [createdQuote, setCreatedQuote] = useState<{ id: string; number: string; total: number } | null>(null);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const selected = data.customers.find((item) => item.id === customerId);
  const addCatalog = (code: string) => {
    const item = data.catalog.find((row) => row.code === code);
    if (!item) return;
    setLines((current) => [
      ...current,
      {
        id: uid(),
        code: item.code,
        description: item.label,
        quantity: 1,
        catalogPrice: item.unitPrice,
        quotedPrice: item.unitPrice ?? 0,
        discountType: null,
        discountValue: 0,
        manual: false,
      },
    ]);
  };
  const addManual = () =>
    setLines((current) => [
      ...current,
      {
        id: uid(),
        code: `MANUAL-${uid()}`,
        description: "",
        quantity: 1,
        catalogPrice: null,
        quotedPrice: 0,
        discountType: null,
        discountValue: 0,
        manual: true,
      },
    ]);
  const update = (id: string, patch: Partial<QuoteLineDraft>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  const duplicate = (line: QuoteLineDraft) =>
    setLines((current) => [...current, { ...line, id: uid() }]);
  const move = (index: number, direction: -1 | 1) =>
    setLines((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  const totals = useMemo(
    () => calculateFormalQuote(lines, globalDiscountType, globalDiscountValue, depositPercent),
    [lines, globalDiscountType, globalDiscountValue, depositPercent],
  );
  const create = () =>
    start(async () => {
      const source = selected
        ? {
            company: selected.company || selected.name,
            rut: selected.rut,
            contact: selected.name,
            email: selected.email,
            phone: selected.phone,
            address: selected.address,
          }
        : { ...temporary, phone: temporary.phone ? `+569${normalizeChileanPhone(temporary.phone)}` : "" };
      const draft: FormalQuoteDraft = {
        quoteId: initialDraft?.quoteId,
        existingCustomerId: selected?.id ?? null,
        saveTemporaryCustomer: saveCustomer,
        ...source,
        eventName,
        eventDate,
        eventTime,
        eventLocation,
        eventCity,
        validityDays,
        depositPercent,
        globalDiscountType,
        globalDiscountValue,
        attachCatalog,
        lines,
      };
      const result = await createFormalQuoteAction(draft);
      setMessage(
        result.ok
          ? `${result.number} guardada por ${money.format(result.total)}.`
          : result.error,
      );
      if (result.ok) setCreatedQuote({ id: result.id, number: result.number, total: result.total });
    });
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border bg-card p-5 sm:p-7">
        <h2 className="text-2xl font-semibold">Constructor de cotizaciones</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Cliente existente">
            <select
              onChange={(e) => setCustomerId(e.target.value)}
              value={customerId}
            >
              <option value="">Cliente temporal</option>
              {data.customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.company || item.name} · {item.rut}
                </option>
              ))}
            </select>
          </Field>
          {!selected && (
            <>
              <Field label="Razón social / Cliente (opcional)">
                <input
                  value={temporary.company}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, company: e.target.value }))
                  }
                />
              </Field>
              <Field label="RUT (opcional)">
                <input
                  value={temporary.rut}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, rut: formatChileanRutInput(e.target.value) }))
                  }
                />
              </Field>
              <Field label="Contacto (opcional)">
                <input
                  value={temporary.contact}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, contact: e.target.value }))
                  }
                />
              </Field>
              <Field label="Email (requerido solo al enviar)">
                <input
                  inputMode="email"
                  value={temporary.email}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, email: e.target.value }))
                  }
                />
              </Field>
              <Field label="Teléfono (opcional)">
                <span className="flex min-w-0 items-center rounded-xl border bg-background pl-3 focus-within:ring-2"><span className="shrink-0 text-sm text-muted">+56 9</span><input className="min-w-0 flex-1 border-0"
                  inputMode="tel"
                  value={temporary.phone}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, phone: normalizeChileanPhone(e.target.value) }))
                  }
                /></span>
              </Field>
              <Field label="Dirección">
                <input
                  value={temporary.address}
                  onChange={(e) =>
                    setTemporary((v) => ({ ...v, address: e.target.value }))
                  }
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={saveCustomer}
                  onChange={(e) => setSaveCustomer(e.target.checked)}
                />
                Guardar también como cliente
              </label>
            </>
          )}
          <Field label="Evento / Proyecto (opcional)">
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Activación corporativa" />
          </Field>
          <Field label="Fecha del evento (opcional)">
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
          <Field label="Hora del evento (opcional)"><input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} /></Field>
          <Field label="Dirección del evento (opcional)"><input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} /></Field>
          <Field label="Comuna / Ciudad (opcional)"><input value={eventCity} onChange={(e) => setEventCity(e.target.value)} /></Field>
        </div>
      </div>
      <div className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3"
            defaultValue=""
            onChange={(e) => {
              addCatalog(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Agregar desde catálogo…</option>
            {data.catalog.map((item) => (
              <option key={`${item.category}-${item.code}`} value={item.code}>
                {item.label} ·{" "}
                {item.unitPrice == null
                  ? "Cotizar"
                  : money.format(item.unitPrice)}
              </option>
            ))}
          </select>
          <Button onClick={addManual} variant="outline">
            <Plus />
            Agregar ítem
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {lines.map((line, index) => (
            <article
              className="grid min-w-0 gap-3 rounded-xl border bg-background p-4 lg:grid-cols-[auto_minmax(0,2fr)_8rem_10rem_8rem_auto]"
              key={line.id}
            >
              <GripVertical className="hidden text-muted lg:block" />
              <input
                aria-label="Descripción"
                className="min-w-0"
                placeholder="Descripción"
                value={line.description}
                onChange={(e) =>
                  update(line.id, { description: e.target.value })
                }
              />
              <input
                aria-label="Cantidad"
                inputMode="numeric"
                min="1"
                type="number"
                value={line.quantity}
                onChange={(e) =>
                  update(line.id, { quantity: Number(e.target.value) })
                }
              />
              <MoneyInput
                aria-label="Precio unitario"
                value={line.quotedPrice}
                onValue={(value) => update(line.id, { quotedPrice: value })}
              />
              <p className="self-center font-semibold">
                {money.format(
                  Math.max(1, line.quantity) * Math.max(0, line.quotedPrice),
                )}
              </p>
              <div className="flex flex-wrap gap-1">
                <button aria-label="Mover línea arriba" className="rounded-lg p-2 hover:bg-accent" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
                <button aria-label="Mover línea abajo" className="rounded-lg p-2 hover:bg-accent" disabled={index === lines.length - 1} onClick={() => move(index, 1)}>↓</button>
                <button
                  aria-label="Duplicar línea"
                  className="rounded-lg p-2 hover:bg-accent"
                  onClick={() => duplicate(line)}
                >
                  <Copy className="size-4" />
                </button>
                <button
                  aria-label="Eliminar línea"
                  className="rounded-lg p-2 hover:bg-accent"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.id !== line.id),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <p className="text-xs text-muted lg:col-start-2 lg:col-span-5">
                Precio catálogo:{" "}
                {line.catalogPrice == null
                  ? "Sin referencia"
                  : money.format(line.catalogPrice)}
                {line.catalogPrice !== null &&
                line.catalogPrice !== line.quotedPrice
                  ? " · Precio especial aplicado"
                  : ""}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:col-start-2 lg:col-span-5">
                <Field label="Descuento de línea">
                  <select value={line.discountType ?? ""} onChange={(e) => update(line.id, { discountType: (e.target.value || null) as DiscountType | null })}>
                    <option value="">Sin descuento</option><option value="CLP">CLP</option><option value="PERCENT">%</option>
                  </select>
                </Field>
                <Field label="Valor descuento">
                  <MoneyInput value={line.discountValue} onValue={(value) => update(line.id, { discountValue: value })} />
                </Field>
              </div>
            </article>
          ))}
          {!lines.length && (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted">
              Agrega productos del catálogo o líneas manuales.
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-2xl border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vigencia (días)">
              <input
                min="1"
                type="number"
                value={validityDays}
                onChange={(e) => setValidityDays(Number(e.target.value))}
              />
            </Field>
            <Field label="Abono para reservar (%)">
              <input
                min="0"
                max="100"
                type="number"
                value={depositPercent}
                onChange={(e) => setDepositPercent(Number(e.target.value))}
              />
            </Field>
            <Field label="Descuento global">
              <select
                value={globalDiscountType ?? ""}
                onChange={(e) =>
                  setGlobalDiscountType(
                    (e.target.value || null) as DiscountType | null,
                  )
                }
              >
                <option value="">Sin descuento</option>
                <option value="CLP">CLP</option>
                <option value="PERCENT">%</option>
              </select>
            </Field>
            <Field label="Valor descuento">
              <MoneyInput
                value={globalDiscountValue}
                onValue={setGlobalDiscountValue}
              />
            </Field>
          </div>
        </div>
        <aside className="sticky bottom-3 z-10 rounded-2xl border bg-card/95 p-5 shadow-xl backdrop-blur lg:static lg:shadow-none">
          <dl className="space-y-3 text-sm">
            {[
              ["Neto", totals.net],
              ["Descuento", totals.discount],
              ["IVA 19%", totals.vat],
              ["TOTAL", totals.total],
              ["Abono para reservar", totals.deposit],
              ["Saldo", totals.balance],
            ].map(([label, value]) => (
              <div className="flex justify-between gap-4" key={label}>
                <dt className="text-muted">{label}</dt>
                <dd
                  className={
                    label === "TOTAL" ? "text-lg font-semibold" : "font-medium"
                  }
                >
                  {money.format(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 grid gap-2">
            <Button onClick={() => setPreview((v) => !v)} variant="outline">
              <FileDown />
              Previsualizar cotización
            </Button>
            <Button disabled={pending || !lines.length} onClick={create}>
              <FilePlus2 />
              {pending ? "Guardando…" : "Guardar borrador"}
            </Button>
          </div>
        </aside>
      </div>
      {preview && (
        <QuotePreview
          company={data.company}
          customer={selected?.company || selected?.name || temporary.company}
          lines={lines}
          totals={totals}
        />
      )}{" "}
      {createdQuote && (
        <FormalQuoteDelivery
          quote={createdQuote}
          email={selected?.email || temporary.email}
          company={selected?.company || selected?.name || temporary.company}
          catalog={data.documents.find((document) => document.category === "COMPANIES")}
          attachCatalog={attachCatalog}
          onAttachCatalog={setAttachCatalog}
          template={data.templates.find((item) => item.category === "COMPANIES_QUOTE")}
        />
      )}
      {message && (
        <p
          aria-live="polite"
          className="rounded-xl border p-4 text-sm font-medium"
        >
          {message}
        </p>
      )}
    </section>
  );
}

function FormalQuoteDelivery({ quote, email, company, catalog, attachCatalog, onAttachCatalog, template }: { quote: { id: string; number: string; total: number }; email: string; company: string; catalog?: CommercialHubData["documents"][number]; attachCatalog: boolean; onAttachCatalog: (value: boolean) => void; template?: CommercialHubData["templates"][number] }) {
  const templateSubject = formalQuoteSubject(quote.number, company);
  const [recipient, setRecipient] = useState(email);
  const variables = { "[NumeroCotizacion]": quote.number.replace(/^COTIZACIÓN\s*/i, ""), "[Empresa]": company, "[Nombre]": company };
  const applyVariables = (value: string) => Object.entries(variables).reduce((text, [key, replacement]) => text.replaceAll(key, replacement), normalizeEmailNewlines(value));
  const [subject, setSubject] = useState(template ? applyVariables(template.subject) : templateSubject);
  const [body, setBody] = useState(template ? applyVariables(template.body) : `Hola,\n\nGracias por considerar a BOOMBOX para su evento.\n\nTe enviamos adjunta la Cotización BOOMBOX ${quote.number.replace(/^COTIZACIÓN\s*/i, "")}, preparada según lo conversado.\n\nLlevamos 16 años creando experiencias fotográficas para empresas, marcas y eventos en Chile.\n\nQuedamos atentos.\n\nEquipo BOOMBOX`);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [requestId, setRequestId] = useState(uid);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <section className="rounded-2xl border bg-card p-5 sm:p-7">
    <h3 className="text-xl font-semibold">Previsualizar y enviar</h3>
    <p className="mt-1 text-sm text-muted">{quote.number} · {money.format(quote.total)}</p>
    <div className="mt-5 grid gap-4">
      <Field label="Para"><input inputMode="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></Field>
      <Field label="Asunto"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Mensaje"><textarea className="min-h-44" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="rounded-xl border bg-background p-4 text-sm"><p className="font-semibold">Adjuntos</p><p className="mt-2">{quote.number}.pdf</p>{catalog && <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={attachCatalog} onChange={(e) => onAttachCatalog(e.target.checked)} />{catalog.filename}</label>}</div>
      <div className="grid gap-3 sm:grid-cols-3"><Button onClick={() => setPdfOpen(true)} variant="outline"><FileDown />Abrir PDF</Button><Button disabled={pending} onClick={() => { if (!recipient.trim()) { setMessage("Ingresa un correo válido para enviar."); return; } if (!window.confirm(`¿Enviar ${quote.number} a ${recipient}?`)) return; start(async () => { const result = await sendFormalQuoteAction({ quoteId: quote.id, email: recipient, subject, body: normalizeEmailNewlines(body), requestId, catalogDocumentId: attachCatalog ? catalog?.id : undefined }); setMessage(result.ok ? result.message : result.error); if (result.ok) setRequestId(uid()); }); }}><Send />{pending ? "Enviando…" : "Enviar email"}</Button><Button disabled={pending} variant="outline" onClick={() => { if (!window.confirm(`¿Convertir ${quote.number} en Reserva usando el pipeline oficial?`)) return; start(async () => { const result = await convertCommercialQuoteAction(quote.id); setMessage(result.ok ? result.message : result.error); if (result.ok && result.projectId) window.location.href = `/projects/${result.projectId}`; }); }}>Convertir en reserva</Button></div>
      {message && <p aria-live="polite" className="text-sm font-medium">{message}</p>}
      {pdfOpen && <PdfViewer title={quoteDisplayFilename(quote.number)} src={`/api/commercial/quotes/${quote.id}/pdf`} onClose={() => setPdfOpen(false)} />}
    </div>
  </section>;
}

function QuotePreview({
  company,
  customer,
  lines,
  totals,
}: {
  company: CommercialHubData["company"];
  customer: string;
  lines: QuoteLineDraft[];
  totals: {
    net: number;
    discount: number;
    vat: number;
    total: number;
    deposit: number;
    balance: number;
  };
}) {
  return (
    <section className="rounded-2xl bg-white p-5 text-black shadow-xl sm:p-8">
      <div className="flex flex-col gap-4 border-b border-orange-500 pb-5 sm:flex-row sm:justify-between">
        <div>
          <p className="text-2xl font-black tracking-[.16em]">BOOMBOX®</p>
          <div className="mt-2 space-y-0.5 text-xs"><p className="font-bold uppercase">{company.legalName}</p><p>RUT {formatChileanRutInput(company.taxId)}</p><p>{[company.address, company.city].filter(Boolean).join(" · ")}</p><p>{displayChileanPhone(company.phone)} · {company.website}</p></div>
        </div>
        <div className="text-left sm:text-right">
          <h3 className="text-xl font-bold text-orange-600">COTIZACIÓN</h3>
          <p className="text-xs">Previsualizar cotización</p>
        </div>
      </div>
      <h4 className="mt-6 border-l-4 border-orange-500 pl-3 font-bold">
        {customer || "Cliente temporal"}
      </h4>
      <div className="mt-5 space-y-3 sm:hidden">
        {lines.map((line) => <article className="rounded-xl border p-3 text-sm" key={line.id}><p className="font-semibold">{line.description}</p><dl className="mt-2 grid grid-cols-2 gap-2"><div><dt className="text-xs text-muted">Cantidad</dt><dd>{line.quantity}</dd></div><div><dt className="text-xs text-muted">P. unitario</dt><dd>{money.format(line.quotedPrice)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted">Total</dt><dd className="font-semibold">{money.format(line.quotedPrice * line.quantity)}</dd></div></dl></article>)}
      </div>
      <div className="mt-5 hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-orange-500 text-white">
            <tr>
              <th className="p-2 text-left">Descripción</th>
              <th>Cantidad</th>
              <th>P. unitario</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr className="border-b" key={line.id}>
                <td className="p-2">{line.description}</td>
                <td className="text-center">{line.quantity}</td>
                <td className="text-right">{money.format(line.quotedPrice)}</td>
                <td className="text-right">
                  {money.format(line.quotedPrice * line.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto mt-6 max-w-xs space-y-2 text-sm">
        {Object.entries({
          Neto: totals.net,
          Descuento: totals.discount,
          "IVA 19%": totals.vat,
          TOTAL: totals.total,
          "Abono para reservar": totals.deposit,
          Saldo: totals.balance,
        }).map(([label, value]) => (
          <div className="flex justify-between" key={label}>
            <dt>{label}</dt>
            <dd
              className={
                label === "TOTAL" ? "text-lg font-bold" : "font-medium"
              }
            >
              {money.format(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function RecentQuotes({
  quotes,
  onEdit,
}: {
  quotes: CommercialHubData["recentQuotes"];
  onEdit: (draft: FormalQuoteDraft) => void;
}) {
  const [openPdf, setOpenPdf] = useState<{ id: string; number: string } | null>(null);
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Cotizaciones recientes</h2>
      <div className="mt-4 divide-y">
        {quotes.length ? (
          quotes.map((q) => (
            <div
              className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_1fr_auto_auto_auto_auto] sm:gap-4"
              key={q.id}
            >
              <span className="font-medium">{q.number}</span>
              <span>{q.customer}</span>
              <span>{money.format(q.total)}</span>
              <span className="text-muted">{q.status}</span>
              <button className="text-left font-medium text-brand" onClick={() => setOpenPdf({ id: q.id, number: q.number })}>PDF</button>
              {q.draft && <button className="font-medium text-brand" onClick={() => onEdit(q.draft!)}>Continuar</button>}
            </div>
          ))
        ) : (
          <p className="py-5 text-sm text-muted">Aún no hay cotizaciones.</p>
        )}
      </div>
      {openPdf && <PdfViewer title={quoteDisplayFilename(openPdf.number)} src={`/api/commercial/quotes/${openPdf.id}/pdf`} onClose={() => setOpenPdf(null)} />}
    </section>
  );
}
function SendHistory({ sends }: { sends: CommercialHubData["recentSends"] }) {
  return <section className="rounded-2xl border bg-card p-5"><h2 className="font-semibold">Historial de envíos</h2><div className="mt-4 divide-y">{sends.length ? sends.map((send) => <div className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:gap-4" key={send.id}><span className="font-medium">{send.recipient}</span><span className="truncate">{send.subject}</span><span>{send.category}</span><span className="text-muted">{send.status} · {send.sentAt.slice(0, 10)}</span></div>) : <p className="py-5 text-sm text-muted">Aún no hay envíos comerciales.</p>}</div></section>;
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <span className="contents [&_input]:min-h-11 [&_input]:min-w-0 [&_input]:rounded-xl [&_input]:border [&_input]:bg-background [&_input]:px-3 [&_select]:min-h-11 [&_select]:min-w-0 [&_select]:w-full [&_select]:max-w-full [&_select]:rounded-xl [&_select]:border [&_select]:bg-background [&_select]:px-3 [&_textarea]:min-w-0 [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:bg-background [&_textarea]:p-3">
        {children}
      </span>
    </label>
  );
}

function MoneyInput({ value, onValue, ...props }: { value: number; onValue: (value: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [draft, setDraft] = useState(String(value));
  return <input {...props} inputMode="numeric" min="0" type="text" value={draft} onChange={(event) => { const next = event.target.value.replace(/[^0-9]/g, ""); setDraft(next); if (next !== "") onValue(moneyInputNumber(next)); }} onBlur={() => { const normalized = moneyInputNumber(draft); setDraft(String(normalized)); onValue(normalized); }} />;
}
