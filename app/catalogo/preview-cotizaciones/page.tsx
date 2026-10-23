import { renderPremiumQuotationEmail } from "@/features/connectors/google-gmail/application/boombox-premium-quotation-email.html";
import { buildSocialPlansEmail } from "@/features/commercial-hub/social-plans-email";

export const dynamic = "force-static";

const examples = [
  { label: "Matrimonios", message: "Gracias por considerar a BOOMBOX para uno de los días más importantes de sus vidas. Preparamos una propuesta especial para que cada recuerdo de su matrimonio sea inolvidable." },
  { label: "Eventos", message: "Gracias por pensar en BOOMBOX. Queremos que tu evento se transforme en una experiencia memorable para ti y tus invitados. Descubre nuestra propuesta preparada especialmente para tu celebración." },
  { label: "Cumpleaños", message: "¡Cada cumpleaños merece celebrarse en grande! Preparamos experiencias fotográficas para compartir, reír y guardar los mejores recuerdos de tu celebración." },
  { label: "Graduaciones", message: "Después de tanto esfuerzo, llegó el momento de celebrar. Queremos acompañarte con una experiencia fotográfica que capture la alegría de tu graduación." },
  { label: "Empresas", message: "Las mejores experiencias de marca se recuerdan. Preparamos una propuesta BOOMBOX para conectar con tus invitados y destacar tu evento corporativo." },
] as const;

export default function PremiumQuotationPreviewPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 12px", fontFamily: "Arial, sans-serif", color: "#20232b" }}>
      <h1 style={{ fontSize: 24 }}>BOOMBOX · Vista previa de correos</h1>
      <p style={{ lineHeight: 1.6 }}>Vista previa aislada. Los botones son demostrativos y no envían correos ni generan cotizaciones. La plantilla de PDF corresponde al envío formal; los planes por categoría conservan su flujo propio.</p>
      {examples.map(({ label, message }) => {
        const html = renderPremiumQuotationEmail({
          preheader: "Tu propuesta BOOMBOX está lista",
          eyebrow: "COTIZACIÓN BOOMBOX",
          title: "Tu propuesta está lista",
          contentHtml: `<p style="margin:0 0 16px">Hola,</p><p style="margin:0 0 16px">${message}</p>`,
          website: "https://www.boom-box.cl",
          primaryAction: { href: "https://example.invalid/cotizacion", label: "VER COTIZACIÓN PDF" },
          secondaryAction: label === "Empresas" ? undefined : { href: "https://example.invalid/traslado", label: "CONOCER VALOR DE TRASLADO" },
          attachmentNote: "La cotización PDF se adjunta en un envío real.",
          signatureHtml: "<p>Un abrazo,<br><strong>Equipo BOOMBOX</strong></p>",
        });
        return <section key={label} style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 19 }}>{label} · Propuesta con PDF</h2>
          <iframe title={`Vista previa cotización ${label}`} srcDoc={html} style={{ display: "block", width: "100%", height: 830, border: "1px solid #d7d7d7", borderRadius: 12, background: "#fff" }} />
        </section>;
      })}
      <section style={{ marginTop: 30 }}>
        <h2 style={{ fontSize: 19 }}>Correo de planes y valores · Flujo social actual</h2>
        <iframe title="Vista previa correo de planes y valores" srcDoc={buildSocialPlansEmail({
          body: "Hola,\n\nConoce nuestras experiencias para tu celebración.\n\nNUESTRA PROPUESTA\n\nRevisa los planes y valores disponibles.",
          contact: "Cliente",
          website: "https://www.boom-box.cl",
          catalogUrl: "https://example.invalid/planes",
          transportUrl: "https://example.invalid/traslado",
          transportLabel: "CONOCER VALOR DE TRASLADO",
        }).html} style={{ display: "block", width: "100%", height: 850, border: "1px solid #d7d7d7", borderRadius: 12, background: "#fff" }} />
      </section>
    </main>
  );
}
