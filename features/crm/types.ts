export interface CrmCustomerSummary {
  id:string;fullName:string;rut:string;company:string;phone:string;email:string;address:string;city:string;version:number;eventCount:number;nextEvent?:string;updatedAt:string;
}

export interface CrmEventSummary {id:string;projectId:string;orbitEventId:string;type:string;date:string|null;status:string;name:string;location:string|null;municipality:string|null;}
export interface CrmCommercialNegotiation {id:string;projectId:string;orbitEventId:string;officialPrice:number;negotiatedPrice:number;difference:number;differencePercentage:number;reason:string;user:string;timestamp:string;}
export interface CrmCustomerProfile extends CrmCustomerSummary {commercialNotes:string;events:CrmEventSummary[];contracts:number;payments:number;invoices:number;portalActive:boolean;timeline:Array<{id:string;title:string;message:string;date:string}>;negotiations:CrmCommercialNegotiation[];}
