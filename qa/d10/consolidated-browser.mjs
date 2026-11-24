import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const email = 'qa-admin@example.invalid';
const password = process.env.QA_ADMIN_PASSWORD;
if (!password) throw new Error('QA_ADMIN_PASSWORD is required');
const evidence = process.env.QA_EVIDENCE_DIR ?? '/tmp/d10-browser-evidence';
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ args: ['--no-proxy-server'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route('**/*', route => {
  const host = new URL(route.request().url()).hostname;
  if (['127.0.0.1', 'localhost'].includes(host)) return route.continue();
  return route.abort('blockedbyclient');
});
const page = await context.newPage();
const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', error: error instanceof Error ? error.message : String(error) }); throw error; }
};

await page.goto(`${base}/`, { waitUntil: 'networkidle' });
await check('Founder login', async () => {
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'INGRESAR A ORBIT' }).click();
  await page.waitForURL(/\/operations/, { timeout: 15000 });
});

await check('Customer collections view and amounts', async () => {
  await page.goto(`${base}/finance/collections`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'COBRANZA POR CLIENTE' }).click();
  await page.getByTestId('consolidated-customer-collections').getByText('GLOW PRO COMPANY', { exact: true }).waitFor();
  const section = page.getByTestId('consolidated-customer-collections');
  await section.getByText('$2.618.000').first().waitFor();
  await section.getByText('2 eventos').waitFor();
  await section.getByText('SP Wedding Planner Limitada', { exact: true }).waitFor();
  await section.getByText('RUT no informado', { exact: true }).first().waitFor();
  await section.getByText('Total seleccionado: $1.800.000').waitFor();
  await section.getByText(/^\d+ días$/).waitFor();
  await page.screenshot({ path: `${evidence}/customer-collections-mobile.png`, fullPage: true });
});

await check('Synthetic premium send and event history', async () => {
  const section = page.getByTestId('consolidated-customer-collections');
  const glow = section.locator('article').filter({ hasText: 'GLOW PRO COMPANY' });
  const glowChecks = glow.locator('input[type="checkbox"]');
  if (await glowChecks.nth(1).isChecked()) throw new Error('Upcoming event must not be selected by default');
  await glowChecks.nth(0).check();
  await glow.getByRole('button', { name: 'REVISAR Y ENVIAR COBRANZA GLOBAL' }).click();
  await page.getByRole('dialog').getByText('Vista previa real del correo').waitFor();
  await page.getByRole('dialog').locator('iframe[title="Vista previa del correo premium"]').waitFor();
  await page.getByRole('dialog').getByRole('button', { name: 'CONFIRMAR Y ENVIAR' }).click();
  await page.getByRole('status').getByText('Cobranza enviada').waitFor({ timeout: 15000 });
  await page.getByRole('status').getByText(/matias\.maira\.larrain@gmail\.com/).waitFor();
  await page.getByText('Historial real de cobranzas').waitFor();
  await page.screenshot({ path: `${evidence}/customer-collections-sent.png`, fullPage: true });
});

await page.reload({ waitUntil: 'networkidle' });
await check('Reloaded history is visible and idempotent', async () => {
  await page.getByText('Historial real de cobranzas').waitFor();
  await page.getByText('ENVIADO', { exact: true }).waitFor();
  const rows = await page.locator('[data-collection-email-id]').count();
  if (rows !== 1) throw new Error(`Expected exactly one consolidated history row, got ${rows}`);
});

fs.writeFileSync(`${evidence}/result.json`, JSON.stringify({ base, viewport: '390x844', checks }, null, 2));
await browser.close();
console.log(JSON.stringify({ base, checks }));
