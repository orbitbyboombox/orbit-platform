import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad · ORBIT",
  description: "Información sobre el tratamiento de datos en la integración de ORBIT con WhatsApp Business Platform.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-5 py-12 text-white sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-white/[.04] p-6 shadow-2xl shadow-black/30 sm:p-10">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-orange-400">BOOMBOX · ORBIT</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Política de privacidad</h1>
          <p className="text-sm text-white/60">Última actualización: 5 de septiembre de 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Alcance</h2>
          <p className="leading-7 text-white/75">
            Esta página describe el tratamiento de datos realizado por ORBIT, la plataforma interna de operaciones de BOOMBOX, cuando se conecta con WhatsApp Business Platform de Meta. No reemplaza las condiciones o avisos que Meta publique para sus propios servicios.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Datos tratados</h2>
          <p className="leading-7 text-white/75">
            La integración puede recibir y registrar el identificador de WhatsApp, nombre de perfil, tipo y contenido del mensaje, fecha y hora, identificadores técnicos del evento y estados de procesamiento. ORBIT también conserva los registros operativos necesarios para evitar duplicados y mantener la trazabilidad.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Finalidades y base operativa</h2>
          <p className="leading-7 text-white/75">
            Los datos se usan para ingresar conversaciones al CRM y a los registros operativos de BOOMBOX, atender solicitudes autorizadas, mantener la seguridad de la integración y auditar su funcionamiento. La sincronización técnica del portal es independiente de cualquier comunicación al cliente. Las comunicaciones comerciales requieren una acción explícita del Founder.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Proveedores y seguridad</h2>
          <p className="leading-7 text-white/75">
            WhatsApp Business Platform y sus servicios de infraestructura son proporcionados por Meta. ORBIT valida las firmas de los webhooks, limita el acceso a personal autorizado y mantiene las credenciales únicamente en configuración segura del servidor. Las credenciales no se exponen en el navegador, el código fuente ni los registros.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Conservación y derechos</h2>
          <p className="leading-7 text-white/75">
            Los datos se conservan mientras sean necesarios para la relación operativa, seguridad, soporte o cumplimiento de obligaciones aplicables, y luego se eliminan o anonimizan según corresponda. Para solicitar acceso, rectificación, actualización o eliminación cuando sea procedente, escribe a contacto@boom-box.cl indicando el contexto de la solicitud.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6 text-sm leading-6 text-white/55">
          ORBIT mantiene desactivadas las respuestas automáticas y los envíos comerciales automáticos. Cualquier activación futura requerirá una decisión explícita de BOOMBOX.
        </footer>
      </article>
    </main>
  );
}
