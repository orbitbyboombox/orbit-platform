export const dynamic = "force-static";

const signatureUrl =
  "https://uiwlcmbrowtmqwhnsnxz.supabase.co/storage/v1/object/public/orbit-branding/email/signature-070051e0-f626-4785-96e4-5fa8d453a3d3.gif";

export default function BoomboxEmailPreviewPage() {
  return (
    <main className="preview-page">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        .preview-page {
          min-height: 100vh;
          background: #ece9e3;
          padding: 28px 12px 44px;
          font-family: Arial, Helvetica, sans-serif;
        }
        .preview-note {
          width: min(100%, 640px);
          margin: 0 auto 14px;
          color: #645f58;
          font-size: 12px;
          text-align: center;
        }
        .email-card {
          width: min(100%, 640px);
          margin: 0 auto;
          background: #0b0c0e;
          border: 1px solid #333437;
          border-radius: 24px;
          overflow: hidden;
        }
        .accent { height: 6px; background: #f78900; }
        .header {
          padding: 34px 30px 26px;
          background: #111214;
          text-align: center;
        }
        .logo {
          display: block;
          width: 190px;
          max-width: 100%;
          height: auto;
          margin: 0 auto;
        }
        .header-label {
          margin-top: 8px;
          color: #f78900;
          font-size: 10px;
          line-height: 1.5;
          letter-spacing: .18em;
        }
        .body {
          padding: 36px 30px 30px;
          color: #e9e9ea;
          line-height: 1.68;
        }
        .eyebrow {
          margin: 0 0 14px;
          color: #f78900;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .18em;
          text-transform: uppercase;
        }
        .body h1 {
          margin: 0 0 28px;
          color: #fff;
          font-size: 38px;
          line-height: 1.08;
          letter-spacing: -.03em;
        }
        .body h2 {
          margin: 38px 0 18px;
          color: #f78900;
          font-size: 18px;
          line-height: 1.3;
          letter-spacing: .08em;
        }
        .body p {
          margin: 0 0 20px;
          color: #e9e9ea;
          font-size: 15px;
          line-height: 1.68;
        }
        .action {
          display: block;
          width: min(100%, 360px);
          margin: 26px auto 0;
          padding: 15px 20px;
          border-radius: 12px;
          text-align: center;
          text-decoration: none;
          color: #171717;
          font-size: 14px;
          line-height: 1.35;
          font-weight: 800;
          letter-spacing: .04em;
        }
        .primary { background: #f78900; }
        .secondary {
          margin-top: 18px;
          background: #fff;
          border: 1px solid #d9d2c7;
        }
        .fallback {
          margin: 14px 0 0 !important;
          color: #716b63 !important;
          font-size: 12px !important;
          line-height: 1.5 !important;
          text-align: center;
        }
        .fallback span { color: #d76d00; text-decoration: underline; }
        .note {
          margin: 26px 0 0;
          padding: 17px 18px;
          border-radius: 12px;
          background: #f7f5f1;
          color: #5d574f;
          font-size: 13px;
          line-height: 1.55;
        }
        .note strong { color: #4f4a43; }
        .closing-first { margin-top: 26px !important; }
        .signature {
          margin-top: 24px;
          text-align: center;
        }
        .signature img {
          display: block;
          width: 100%;
          max-width: 520px;
          height: auto;
          margin: 0 auto;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid #343538;
          color: #b8b8ba;
          font-size: 10px;
          line-height: 1.7;
          letter-spacing: .18em;
        }
        .footer a { color: #f78900; }
        .software {
          margin: 18px 0 0 !important;
          color: #77787c !important;
          font-size: 10px !important;
          line-height: 1.5 !important;
          letter-spacing: .08em;
        }
        @media (max-width: 520px) {
          .preview-page { padding: 10px 6px 30px; }
          .preview-note { padding: 0 12px; font-size: 11px; }
          .email-card { border-radius: 16px; }
          .header { padding: 27px 20px 23px; }
          .logo { width: 172px; }
          .body { padding: 30px 20px 27px; line-height: 1.7; }
          .eyebrow { margin-bottom: 16px; font-size: 10px; }
          .body h1 { margin-bottom: 28px; font-size: 30px; line-height: 1.12; }
          .body h2 { margin-top: 36px; margin-bottom: 18px; font-size: 17px; }
          .body p { margin-bottom: 22px; font-size: 14px; line-height: 1.7; }
          .action {
            width: 100%;
            margin-top: 22px;
            padding: 14px 14px;
            font-size: 13px;
          }
          .secondary { margin-top: 18px; }
          .fallback { margin-top: 15px !important; font-size: 11px !important; }
          .note { margin-top: 26px; padding: 16px; font-size: 12px; }
          .closing-first { margin-top: 27px !important; }
          .signature { margin-top: 22px; }
          .signature img { max-width: 360px; }
          .footer {
            display: block;
            margin-top: 28px;
            padding-top: 18px;
          }
          .footer-right { margin-top: 12px; }
        }
      `}</style>

      <p className="preview-note">
        PREVIEW · todavía no es la versión definitiva de los correos BOOMBOX
      </p>

      <section className="email-card" aria-label="Preview email BOOMBOX">
        <div className="accent" />
        <header className="header">
          <img
            className="logo"
            src="/branding/boombox-official-logo.png"
            alt="BOOMBOX®"
          />
          <div className="header-label">EXPERIENCIAS QUE CONECTAN</div>
        </header>

        <div className="body">
          <p className="eyebrow">PLANES Y VALORES</p>
          <h1>Hola Matías,</h1>

          <p>
            Hace 16 años creamos experiencias fotográficas que conectan personas,
            marcas y momentos.
          </p>
          <p>
            Hemos preparado nuestra propuesta para que puedas conocer las distintas
            experiencias, formatos y valores disponibles.
          </p>

          <h2>NUESTRA PROPUESTA</h2>
          <p>
            Encontrarás el detalle completo de nuestras experiencias y valores al
            abrir Planes y Valores.
          </p>

          <a className="action primary" href="#planes">
            VER PLANES Y VALORES
          </a>
          <p className="fallback">
            Si tienes problemas con el botón, puedes abrir los planes y valores{" "}
            <span>aquí</span>.
          </p>

          <a className="action secondary" href="#traslado">
            CONOCER VALOR DE TRASLADO
          </a>

          <p style={{ marginTop: 28 }}>
            Si alguna alternativa te interesa, respóndenos este correo y te
            ayudaremos a revisar disponibilidad y preparar tu cotización.
          </p>

          <div className="note">
            <strong>Importante:</strong> Las fechas se confirman mediante reserva y
            están sujetas a disponibilidad.
          </div>

          <p className="closing-first">Esperamos ser parte de tu celebración.</p>
          <p>Un abrazo,</p>

          <div className="signature">
            <img src={signatureUrl} alt="Firma Matías Maira BOOMBOX" />
          </div>

          <footer className="footer">
            <div>
              <a href="https://www.bbox.cl">www.bbox.cl</a>
            </div>
            <div className="footer-right">
              EXPERIENCIAS
              <br />
              RECUERDOS
              <br />
              MOMENTOS
            </div>
          </footer>
          <p className="software">
            COMUNICACIÓN EMITIDA MEDIANTE ORBIT SOFTWARE DESARROLLADO POR BOOMBOX®
          </p>
        </div>
      </section>
    </main>
  );
}
