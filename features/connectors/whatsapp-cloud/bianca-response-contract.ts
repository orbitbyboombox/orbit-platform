export type BiancaResponseContract = "RESPONSE_SENT" | "WAITING_HUMAN" | "INTENTIONALLY_SILENT" | "FAILED";

export function responseContract(input: { responseSent?: boolean; humanWaiting?: boolean; intentionallySilent?: boolean; failed?: boolean }): BiancaResponseContract {
  if (input.failed) return "FAILED";
  if (input.responseSent) return "RESPONSE_SENT";
  if (input.humanWaiting) return "WAITING_HUMAN";
  return input.intentionallySilent ? "INTENTIONALLY_SILENT" : "FAILED";
}
