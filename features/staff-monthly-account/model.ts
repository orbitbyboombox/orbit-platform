export type StaffMonthlyAccount = {
  id:string; staffId:string; month:string; expectedAmount:number;
  boletaStatus:"PENDING"|"RECEIVED"|"APPROVED"|"REJECTED";
  boletaDocumentId:string|null; rejectionReason:string;
  paymentStatus:"PENDING"|"READY_TO_PAY"|"PAID"; paidAmount:number; paidAt:string;
  paymentMethod:string; paymentReference:string; receiptDocumentId:string|null; driveSyncStatus:string;
};
export const staffMonthLabel=(month:string)=>new Date(`${month.slice(0,7)}-01T12:00:00Z`).toLocaleDateString("es-CL",{month:"long",year:"numeric"});
export const monthlyBoletaPath=(staffId:string,month:string,id:string,fileName:string)=>`staff/${staffId}/03_BOLETAS/${month.slice(0,7)}/${id}-${fileName.replace(/[^a-zA-Z0-9._-]+/g,"-")}`;
export const monthlyReceiptPath=(staffId:string,month:string,id:string,fileName:string)=>`staff/${staffId}/05_COMPROBANTES_PAGO/${month.slice(0,7)}/${id}-${fileName.replace(/[^a-zA-Z0-9._-]+/g,"-")}`;
