/**
 * Current official BOOMBOX payment instructions.
 *
 * This is presentation/configuration data only. It is intentionally kept
 * separate from customer, invoice and payment records so rendering a bank
 * detail cannot inherit a stale or misspelled legal name from an old setting.
 */
export const OFFICIAL_BOOMBOX_BANK_DETAILS = Object.freeze({
  companyLabel: "PRODUCCIONES BOOMBOX COMPANY SPA",
  bankName: "BCI",
  accountType: "Cuenta Corriente",
  accountNumber: "52093409",
  rut: "76.565.272-3",
  email: "contabilidad@bbox.cl",
});

export type OfficialBoomboxBankDetails = typeof OFFICIAL_BOOMBOX_BANK_DETAILS;
