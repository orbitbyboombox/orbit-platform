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
  boothQuantity?: number;
  transport: number;
  extras?: string[];
  appliedPrice?: number;
}
export interface CrmCustomerEventOperations {
  projectId: string;
  receivable: {
    id: string;
    invoiceNumber: string;
    amount: number;
    paidAmount: number;
    outstandingBalance: number;
    status: string;
    dueDate: string | null;
    movements: Array<{
      id: string;
      amount: number;
      paidAt: string;
      method: string;
      reason: string;
      type: string;
      receiptPath: string | null;
      receiptName: string | null;
      createdBy: string | null;
      createdAt: string;
    }>;
  } | null;
  staffAssignments: {
    projectId: string;
    assignments: Array<{
      id: string;
      staffId: string;
      staffName: string;
      role: string;
      status: string;
      arrivalTime: string;
      startTime: string;
      finishTime: string;
      vehicleId: string;
      vehicleName: string;
      observations: string;
    }>;
    staff: Array<{ id: string; name: string; role: string; capabilities: string[] }>;
    vehicles: Array<{ id: string; name: string }>;
  };
  agreement: { id: string; status: string } | null;
  documents: Array<{
    id: string;
    type: string;
    storagePath: string | null;
    driveFileId: string | null;
    createdAt: string;
  }>;
  calendar: {
    status: string;
    externalUrl: string | null;
    externalEventId: string | null;
  } | null;
  portalActive: boolean;
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
  contacts: Array<{ name: string; email: string; phone: string }>;
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
