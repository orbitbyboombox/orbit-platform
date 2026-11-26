"""Ejecuta una vista previa privada en localhost con credenciales de laboratorio."""
import base64
import json
import os
from pathlib import Path
import secrets
import sys
from threading import Event, Thread

from werkzeug.serving import run_simple

from finance_preview import create_app


def main():
    directory = Path(os.environ.get("ORBIT_LAB_DATA", "~/.orbit-fase6-lab")).expanduser().resolve()
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.stat().st_mode & 0o077:
        raise SystemExit("El directorio de laboratorio requiere permisos 0700")
    settings = directory / "demo.json"
    try:
        descriptor = os.open(settings, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if settings.is_symlink() or not settings.is_file() or settings.stat().st_mode & 0o077:
            raise SystemExit("Las credenciales de laboratorio requieren un archivo regular privado")
    else:
        with os.fdopen(descriptor,"w") as file:
            json.dump({"ORBIT_LAB_KEY":base64.b64encode(secrets.token_bytes(32)).decode(),
                       "ORBIT_LAB_PASSWORD":secrets.token_urlsafe(24)},file)
    for name, value in json.loads(settings.read_text()).items():
        if name in {"ORBIT_LAB_KEY","ORBIT_LAB_PASSWORD"}:
            os.environ.setdefault(name,value)
    os.environ["ORBIT_LAB_DATA"]=str(directory)
    root=Path(__file__).resolve().parents[1]
    os.environ.setdefault("ORBIT_XSD_DTE",str(root/"schemas/dte/EnvioDTE_v10.xsd"))
    os.environ.setdefault("ORBIT_XSD_BOLETA",str(root/"schemas/boleta/EnvioBOLETA_v11.xsd"))
    for name in ("ORBIT_XSD_DTE","ORBIT_XSD_BOLETA"):
        if not Path(os.environ[name]).is_file():
            raise SystemExit(f"Falta el esquema oficial en {name}")
    app=create_app()
    stop=Event()

    def tick():
        while not stop.wait(5):
            result = app.test_cli_runner().invoke(args=["reconcile-lab"])
            if result.exit_code:
                app.logger.error("Falló la conciliación del laboratorio")

    worker=Thread(target=tick,daemon=True)
    worker.start()
    port=int(os.environ.get("ORBIT_LAB_PORT","8765"))
    print(f"Vista previa privada http://127.0.0.1:{port}",flush=True)
    print("Usuario: laboratorio",flush=True)
    if sys.stdout.isatty():
        print("Contraseña de laboratorio:",os.environ["ORBIT_LAB_PASSWORD"],flush=True)
    try:
        run_simple("127.0.0.1",port,app,threaded=True)
    finally:
        stop.set()
        worker.join()


if __name__=="__main__":
    main()
