export type AccountantExportConfig={preferredFormat:"ZIP"|"XLSX"|"CSV"|"PDF";dateFormat:"DD/MM/YYYY"|"YYYY-MM-DD";decimalSeparator:","|".";csvSeparator:";"|",";accountingSoftware:string};
export const DEFAULT_ACCOUNTANT_EXPORT_CONFIG:AccountantExportConfig={preferredFormat:"ZIP",dateFormat:"DD/MM/YYYY",decimalSeparator:",",csvSeparator:";",accountingSoftware:"General"};

export type Cell=string|number|null;
export type ExportTable={name:string;fileName:string;headers:string[];rows:Cell[][]};
export type AccountantSummary={totalRevenue:number;totalExpenses:number;totalIncome:number;totalOutgoing:number;netRevenue:number;netExpenses:number;vatDebit:number;vatCredit:number;vatDifference:number;accountsReceivable:number;accountsPayable:number;bankBalance:number;grossMargin:number;netMargin:number};
export type AccountantExportData={from:string;to:string;company:{legalName:string;taxId:string;currency:string};tables:ExportTable[];summary:AccountantSummary};
