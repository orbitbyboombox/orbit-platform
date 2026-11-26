"""Portal Flask para desplegar en un proyecto aislado de certificación."""
import base64
import hmac
import os

from flask import Flask, Response, render_template_string, request
from psycopg import connect
from psycopg.rows import dict_row

from postgres_ledger import PostgresLedger


PAGE = """<!doctype html><html lang="es"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{{ title }} · BOOMBOX®</title>
<style>
body{margin:0;background:#f5f5f5;color:#161616;font:16px system-ui}
header{background:#0c0c0c;color:#fff;padding:24px;border-bottom:4px solid #f86c25}
main{max-width:64rem;margin:3rem auto;padding:24px;background:white}
label,input,button{display:block}input,button{margin:12px 0;padding:12px;font:inherit}
button{background:#f86c25;color:#0b0b0b;border:0;font-weight:700;cursor:pointer}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #ddd}
</style>
<header><strong>BOOMBOX®</strong> · Experiencias que conectan</header>
<main><p>ORBIT · Ambiente de certificación</p><h1>{{ title }}</h1>
{% if rows is defined %}
<div style="overflow:auto"><table><thead><tr><th>Emisor</th><th>Tipo</th><th>Folios</th><th>Certificado hasta (UTC)</th><th>Alertas</th></tr></thead>
<tbody>{% for row in rows %}<tr><td>{{row.legal_name}} · {{row.rut}}</td>
<td>{{row.kind}}</td><td>{{row.available}}</td><td>{{row.cert_until}}</td><td>
{% if row.certificate_alert %}Revisar vigencia del certificado. {% endif %}
{% if row.folios_alert %}Folios bajo el umbral. {% endif %}
{% if row.uncertain %}{{row.uncertain}} envío(s) requieren revisión. {% endif %}
</td></tr>{% else %}<tr><td colspan="5">Emisor de certificación pendiente de configuración.</td></tr>{% endfor %}</tbody>
</table></div>
{% else %}
{% if denied %}<p role="alert">No encontramos una boleta disponible para ese código.</p>{% endif %}
<form method="post" action="/boletas/descargar"><label for="code">Código de consulta</label>
<input id="code" name="code" minlength="43" maxlength="43" autocomplete="off" required>
<button>Descargar PDF</button></form>
{% endif %}</main></html>"""


def create_app(ledger=None, admin_secret=None):
    if ledger is None:
        dsn = os.environ["ORBIT_SII_CERT_DSN"]
        key = base64.b64decode(os.environ["ORBIT_SII_CERT_AES_KEY"], validate=True)
        ledger = PostgresLedger(lambda: connect(dsn, row_factory=dict_row, connect_timeout=5), key)
    if admin_secret is None:
        admin_secret = os.environ["ORBIT_SII_CERT_ADMIN_SECRET"]
    if len(admin_secret.encode()) < 32:
        raise ValueError("Se requiere un secreto administrativo de al menos 32 bytes")
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 1024

    @app.after_request
    def privacy(response):
        response.headers.update({
            "Cache-Control": "private, no-store",
            "X-Robots-Tag": "noindex, nofollow",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
        })
        return response

    @app.get("/boletas")
    def receipt_form():
        return render_template_string(PAGE, title="Consulta de boletas")

    @app.post("/boletas/descargar")
    def receipt_download():
        result = ledger.receipt_pdf(request.form.get("code", ""))
        if not result:
            return render_template_string(PAGE, title="Consulta de boletas", denied=True), 404
        folio, pdf = result
        return Response(pdf, mimetype="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="boleta-prueba-{folio}.pdf"'})

    @app.get("/admin/tributario")
    def configuration():
        auth = request.authorization
        if (not auth or auth.type != "basic" or auth.username != "certificacion" or
                not hmac.compare_digest((auth.password or "").encode(), admin_secret.encode())):
            return Response("Acceso administrativo requerido", 401,
                            {"WWW-Authenticate": 'Basic realm="ORBIT Certificacion"'})
        return render_template_string(PAGE, title="Configuración tributaria", rows=ledger.configuration())

    return app
