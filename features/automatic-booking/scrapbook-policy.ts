// Public booking categories use the existing ORBIT values: Private = Eventos.
export function canSelectScrapbook(eventType: string) {
  return eventType === "Private" || eventType === "Birthday";
}

export function isScrapbook(extra: string) {
  return extra.trim().toUpperCase() === "SCRAPBOOK";
}

export function validateScrapbookSelection(eventType: string, extras: string[]) {
  const selected = extras.filter(isScrapbook);
  if (selected.length && !canSelectScrapbook(eventType)) {
    throw new Error("SCRAPBOOK solo está disponible para Eventos y Cumpleaños.");
  }
  if (selected.length > 1) throw new Error("SCRAPBOOK no puede seleccionarse más de una vez.");
}

export function scrapbookPrice(prices: Array<{ category: string; code: string; unit_price: number | string; pricing_status?: string }>) {
  const rows = prices.filter(price => price.category === "EXTRA" && price.code === "SCRAPBOOK");
  const row = rows[0];
  if (rows.length !== 1 || Number(row?.unit_price) !== 50000 || (row.pricing_status && row.pricing_status !== "DEFINED")) {
    throw new Error("SCRAPBOOK no tiene un precio oficial disponible.");
  }
  return Number(row.unit_price);
}
