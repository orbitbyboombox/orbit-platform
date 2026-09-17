import { deflateSync } from "node:zlib";

const SIGNATURE_WIDTH = 192;
const SIGNATURE_HEIGHT = 72;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes); body.set(data, typeBytes.length);
  const output = new Uint8Array(12 + data.length);
  new DataView(output.buffer).setUint32(0, data.length);
  output.set(body, 4);
  new DataView(output.buffer).setUint32(8 + data.length, crc32(body));
  return output;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

/** A real PNG signature fixture; it is intentionally not a production bypass. */
export function createSyntheticSignatureDataUrl(): string {
  const pixels = new Uint8Array((SIGNATURE_WIDTH * 4 + 1) * SIGNATURE_HEIGHT);
  for (let y = 0; y < SIGNATURE_HEIGHT; y += 1) {
    const row = y * (SIGNATURE_WIDTH * 4 + 1); pixels[row] = 0;
    for (let x = 0; x < SIGNATURE_WIDTH; x += 1) {
      const stroke = Math.abs(y - (18 + Math.round(x * 0.18 + 7 * Math.sin(x / 18)))) <= 2 ||
        (x > 48 && x < 55 && y > 20 && y < 55) || (x > 124 && x < 130 && y > 28 && y < 60);
      const pixel = row + 1 + x * 4;
      pixels[pixel] = stroke ? 24 : 255; pixels[pixel + 1] = stroke ? 24 : 255; pixels[pixel + 2] = stroke ? 24 : 255; pixels[pixel + 3] = 255;
    }
  }
  const ihdr = new Uint8Array(13); const view = new DataView(ihdr.buffer);
  view.setUint32(0, SIGNATURE_WIDTH); view.setUint32(4, SIGNATURE_HEIGHT); ihdr[8] = 8; ihdr[9] = 6;
  const png = join(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", new Uint8Array()),
  );
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

export function decodeSyntheticSignature(dataUrl: string): Uint8Array {
  return Uint8Array.from(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
}
