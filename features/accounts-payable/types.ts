export type PayableType="STAFF"|"SUPPLIER"|"COMPANY_EXPENSE"|"BANK"|"MERCADO_PAGO";
export type PayableStatus="PENDING"|"PARTIAL"|"PAID"|"OVERDUE"|"CANCELLED"|"ARCHIVED";
export type PayableTimelineItem={id:string;kind:"CREATED"|"ADJUSTMENT"|"PAYMENT"|"RECEIPT"|"STATUS";date:string;label:string;detail:string;amount:number|null};
export type PayableItem={
  id:string;sourceId:string;sourceTable:string;beneficiary:string;type:PayableType;
  relatedEvent:string|null;projectId:string|null;originalAmount:number;adjustments:number;
  reimbursements:number;alreadyPaid:number;outstanding:number;dueDate:string;
  status:PayableStatus;documentLabel:string;documentAvailable:boolean;canonicalHref:string;
  recurring:boolean;criticalSupplier:boolean;timeline:readonly PayableTimelineItem[];
};
export type AccountsPayableDataset={generatedAt:string;items:readonly PayableItem[];metrics:{totalPending:number;overdue:number;thisWeek:number;nextWeek:number;recurring:number;supplierBalance:number;staffBalance:number}};
