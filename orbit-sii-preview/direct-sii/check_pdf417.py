"""Comprueba que cada PDF de prueba reproduce el TED firmado byte por byte."""
import base64
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

from PIL import Image
import zxingcpp


def verify_samples(directory):
    with TemporaryDirectory() as tmp:
        for kind in (33, 39, 61):
            bundle = json.loads((directory / f"{kind}.json").read_text(encoding="utf-8"))
            expected = base64.b64decode(bundle["ted"], validate=True)
            output = Path(tmp, str(kind))
            subprocess.run(["pdftoppm", "-r", "600", "-png", "-singlefile",
                            str(directory / f"{kind}.pdf"), str(output)], check=True)
            with Image.open(output.with_suffix(".png")) as image:
                if not any(code.bytes == expected for code in zxingcpp.read_barcodes(image)):
                    raise ValueError(f"El PDF417 del tipo {kind} no reproduce el TED")
            print(f"{kind}: {len(expected)} bytes verificados a 600 ppp")


if __name__ == "__main__":
    verify_samples(Path(sys.argv[1]))
