export interface CrmCustomerSummary {
  id: string;
  fullName: string;
  rut: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  version: number;
  eventCount: number;
  nextEvent?: string;
  updatedAt: string;
}

export interface CrmEventSummary {
  id: string;
  projectId: string;
  orbitEventId: string;
  type: string;
  date: string | null;
  time: string | null;
  status: string;
  name: string;
  location: string | null;
  municipality: string | null;
  service: string;
  duration: number | null;
  transport: number;
}
export interface CrmOperationalEvent extends CrmEventSummary {
  customerId: string;
  customerName: string;
  company: string;
  operator: string;
}
export interface CrmCommercialNegotiation {
  id: string;
  projectId: string;
  orbitEventId: string;
  officialPrice: number;
  negotiatedPrice: number;
  difference: number;
  differencePercentage: number;
  reason: string;
  user: string;
  timestamp: string;
}
export interface CrmCustomerProfile extends CrmCustomerSummary {
  commercialNotes: string;
  events: CrmEventSummary[];
  activeEvents: number;
  archivedEvents: number;
  cancelledEvents: number;
  contracts: number;
  payments: number;
  invoices: number;
  totalRevenue: number;
  totalReceived: number;
  accountsReceivable: number;
  lifetimeValue: number;
  portalActive: boolean;
  documents: number;
  profitabilityRecords: number;
  timeline: Array<{ id: string; title: string; message: string; date: string }>;
  negotiations: CrmCommercialNegotiation[];
}
