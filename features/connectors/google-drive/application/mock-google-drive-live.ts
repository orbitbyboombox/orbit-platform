import { MOCK_GOOGLE_WORKSPACE_CONNECTION } from "../../google-workspace";
import { buildCustomerFolderPlan, buildRootFolderPlan, resolveAutomaticDestination } from "./google-drive-folder-strategy";

export const MOCK_GOOGLE_DRIVE_CONNECTION = MOCK_GOOGLE_WORKSPACE_CONNECTION;
export const MOCK_GOOGLE_DRIVE_ROOT_PLAN = buildRootFolderPlan();
export const MOCK_CUSTOMER_FOLDER_PLAN = buildCustomerFolderPlan("Camilo Almarza", "2027-01-18");
export const MOCK_DRIVE_DESTINATIONS = [
  { label: "Contrato de cliente", ...resolveAutomaticDestination({ kind: "CONTRACT", context: { customerName: "Camilo Almarza", eventDate: "2027-01-18" } }) },
  { label: "Compra de combustible", ...resolveAutomaticDestination({ kind: "ACCOUNTING_FUEL", context: { documentDate: "2027-01-18" } }) },
  { label: "Licencia de operador", ...resolveAutomaticDestination({ kind: "OPERATOR_LICENSE", context: { staffMemberName: "Felipe Contreras" } }) },
] as const;
