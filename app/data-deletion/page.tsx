import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de datos · ORBIT",
  description: "Instrucciones para solicitar la eliminación de datos tratados por la integración de ORBIT con WhatsApp Business Platform.",
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[#070707] px-5 py-12 text-white sm:px-8">
      <article className="mx-auto max-w-3xl space-y-8 rounded-3xl border border-white/10 bg-white/[.04] p-6 shadow-2xl shadow-black/30 sm:p-10">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[.28em] text-orange-400">BOOMBOX · ORBIT</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Eliminación de datos</h1>
          <p className="text-sm text-white/60">Última actualización: 5 de septiembre de 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Cómo solicitarla</h2>
          <p className="leading-7 text-white/75">
            Para solicitar acceso, corrección o eliminación de los datos asociados a una conversación de WhatsApp tratada por ORBIT, escribe a <a className="text-orange-300 underline underline-offset-4" href="mailto:contacto@boom-box.cl">contacto@boom-box.cl</a>.
          </p>
          <p className="leading-7 text-white/75">
            Incluye el número de WhatsApp con código de país y una descripción breve de la solicitud. Verificaremos la identidad del solicitante antes de actuar y responderemos dentro de un plazo razonable conforme a las obligaciones aplicables.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Qué se elimina</h2>
          <p className="leading-7 text-white/75">
            Cuando corresponda, eliminaremos o anonimizaremos los datos de perfil, contenido de mensajes y registros técnicos asociados, salvo los datos que debamos conservar por seguridad, prevención de fraude, resolución de disputas u obligación legal.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6 text-sm leading-6 text-white/55">
          Esta página corresponde a la integración de ORBIT con WhatsApp Business Platform de Meta. No activa respuestas automáticas ni envíos de mensajes.
        </footer>
      </article>
    </main>
  );
}
