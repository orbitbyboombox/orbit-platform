const labels: Record<string, string> = {
  "33": "Factura electrónica",
  "34": "Factura electrónica exenta",
  "39": "Boleta electrónica",
  "41": "Boleta electrónica exenta",
  "46": "Factura de compra electrónica",
  "52": "Guía de despacho electrónica",
  "56": "Nota de débito electrónica",
  "61": "Nota de crédito electrónica",
};

export const normalizeRcv = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function readRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index++; }
      else if (quoted || !field) quoted = !quoted;
      else throw new Error("El archivo contiene comillas inválidas.");
    } else if (!quoted && (char === ";" || char === "\n" || char === "\r")) {
      row.push(field.trim()); field = "";
      if (char !== ";") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && csv[index + 1] === "\n") index++;
      }
    } else field += char;
  }
  if (quoted) throw new Error("El archivo contiene un campo sin cerrar.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function money(value: string) {
  if (!value) return null;
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(value)) throw new Error("Importe no reconocido.");
  const amount = Number(value.replaceAll(".", ""));
  if (!Number.isSafeInteger(amount)) throw new Error("Importe fuera de rango.");
  return amount;
}

export function parseSiiRcv(bytes: ArrayBuffer) {
  const csv = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const [header, ...rows] = readRows(csv);
  const columns = (header ?? []).map(normalizeRcv);
  const purchase = columns.includes("rut proveedor");
  const sale = columns.includes("rut cliente");
  const vat = purchase ? "monto iva recuperable" : "monto iva";
  const tax = purchase ? "valor otro impuesto" : "valor otro imp.";
  const rutColumn = purchase ? "rut proveedor" : "rut cliente";
  const required = [rutColumn, "tipo doc", "folio", "fecha docto", "razon social", "monto neto", "monto exento", vat, "monto total", tax];
  if (purchase === sale || required.some(name => columns.filter(column => column === name).length !== 1)) {
    throw new Error("Selecciona una exportación de compras o ventas del Registro de Compras y Ventas del SII.");
  }
  const kind = purchase ? "Compras" : "Ventas";
  const groups = new Map<string, { count: number; taxes: number[] }>();
  const documents = rows.map((row, index) => {
    const get = (name: string) => row[columns.indexOf(name)] ?? "";
    try {
      if (row.length < columns.length || row.slice(columns.length).some(Boolean)) throw new Error("Columnas desalineadas.");
      const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(get("fecha docto"));
      const code = get("tipo doc"), folio = get("folio"), rut = get(rutColumn);
      const issued = date ? `${date[3]}-${date[2]}-${date[1]}` : "";
      if (!date || !Number.isFinite(Date.parse(issued)) || new Date(issued).toISOString().slice(0, 10) !== issued
        || !/^\d+$/.test(code) || !/^\d+$/.test(folio) || !rut) throw new Error("Identificación o fecha incompleta.");
      const key = [kind, rut.replace(/[^0-9k]/gi, "").toUpperCase(), code, folio.replace(/^0+(?=\d)/, "")].join("|");
      const group = groups.get(key) ?? { count: 0, taxes: [] };
      const additional = money(get(tax));
      const detail = !get("nro") && !get("monto total") && !get("monto neto") && !get("monto exento") && !get(vat) && additional !== null;
      if (additional !== null) group.taxes.push(additional);
      if (!detail) group.count++;
      groups.set(key, group);
      if (detail) return null;
      return {
        key, issued, rut, code, folio, company: get("razon social"), type: labels[code] ?? "Tipo de documento por revisar",
        net: money(get("monto neto")), exempt: money(get("monto exento")),
        vat: money(get(vat)), nonRecoverableVat: money(get("monto iva no recuperable")),
        total: money(get("monto total")), knownType: Boolean(labels[code]),
      };
    } catch (error) {
      throw new Error(`Documento ${index + 1}: ${error instanceof Error ? error.message : "revisa sus datos."}`);
    }
  });
  if ([...groups.values()].some(group => !group.count)) throw new Error("Hay impuestos adicionales sin documento asociado.");
  return { kind, documents: documents.flatMap(doc => {
    if (!doc) return [];
    const group = groups.get(doc.key)!;
    return [{ ...doc, otherTaxes: group.taxes, duplicate: group.count > 1 }];
  }) };
}
