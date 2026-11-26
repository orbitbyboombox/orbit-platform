"""Prevalida insumos de Maullín desde un directorio privado, sin emitir ni transmitir."""
import argparse
from datetime import datetime, timezone
from getpass import getpass
from hashlib import sha256
import json
import os
from pathlib import Path
import stat

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12

from motor import integer, parse, verify, wire

COUNTS = {33: 4, 61: 3, 56: 1}


def private_bytes(path):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("El archivo debe ser privado (0600 o 0400) y de propiedad del operador")
        data = handle.read(1024 * 1024 + 1)
        if not data or len(data) > 1024 * 1024:
            raise ValueError("Tamaño de archivo no permitido")
        return data


def inspect(folder, password, *, include_dispatch=False):
    info = folder.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError("Usar un directorio de secretos privado (0700)")
    manifest = json.loads(private_bytes(folder / "maullin.json"))
    if manifest["environment"] != "certification" or manifest["issuer"] != "76565272-3":
        raise ValueError("Manifiesto fuera del ambiente o emisor autorizado")
    key, cert, _ = pkcs12.load_key_and_certificates(private_bytes(folder / "firmante.pfx"), password)
    now = datetime.now(timezone.utc)
    if (not isinstance(key, rsa.RSAPrivateKey) or cert is None
            or cert.public_key().public_numbers() != key.public_key().public_numbers()
            or not cert.not_valid_before_utc <= now < cert.not_valid_after_utc
            or cert.fingerprint(hashes.SHA256()).hex() != manifest["certificate_sha256"]):
        raise ValueError("Certificado no coincide con el manifiesto o está fuera de vigencia")
    anchor_bytes = private_bytes(folder / "sii-anchor.pem")
    if sha256(anchor_bytes).hexdigest() != manifest["anchor_sha256"]:
        raise ValueError("Ancla del SII inesperada")
    anchor = serialization.load_pem_public_key(anchor_bytes)
    result = {}
    for kind, required in ({**COUNTS, 52: 1} if include_dispatch else COUNTS).items():
        source = private_bytes(folder / f"caf-{kind}.xml")
        if sha256(source).hexdigest() != manifest["caf_sha256"][str(kind)]:
            raise ValueError(f"CAF {kind} no corresponde a la descarga de certificación registrada")
        root = parse(source)
        if root.tag != "AUTORIZACION":
            raise ValueError("Formato de autorización CAF inválido")
        caf = root.find("CAF")
        da = caf.find("DA")
        start, end = int(da.findtext("RNG/D")), int(da.findtext("RNG/H"))
        if (da.findtext("RE"), da.findtext("TD")) != (manifest["issuer"], str(kind)) or end-start+1 < required:
            raise ValueError(f"Emisor, tipo o rango CAF {kind} incompatible")
        if caf.find("FRMA").get("algoritmo") != "SHA1withRSA":
            raise ValueError("Algoritmo CAF inesperado")
        verify(anchor, caf.findtext("FRMA"), wire(da))
        caf_key = serialization.load_pem_private_key(root.findtext("RSASK").strip().encode(), password=None)
        pub = rsa.RSAPublicNumbers(integer(da.findtext("RSAPK/E")), integer(da.findtext("RSAPK/M")))
        if caf_key.public_key().public_numbers() != pub:
            raise ValueError("La llave TED no pertenece al CAF")
        result[kind] = {"primero": start, "ultimo": end, "requeridos": required}
    return {"certificado_vence": cert.not_valid_after_utc.isoformat(), "rangos": result}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("secrets", type=Path)
    parser.add_argument("--include-dispatch", action="store_true", help="Valida también un CAF 52 separado del set básico")
    args = parser.parse_args()
    with open("/dev/tty", "r+") as tty:
        secret = getpass("Contraseña PFX: ", stream=tty).encode()
    try:
        print(json.dumps(inspect(args.secrets, secret, include_dispatch=args.include_dispatch), indent=2))
    except Exception:
        raise SystemExit("Prevalidación rechazada. Revisar permisos, integridad, vigencia y procedencia en Maullín.") from None
