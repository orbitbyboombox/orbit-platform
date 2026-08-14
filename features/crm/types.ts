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
  eventAddress?: string | null;
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
  commercialSummary: {
    service: string;
    duration: number;
    branding: string;
    qr: string;
    magnets: string;
    scrapbook: string;
    transport: string;
    additionalHours: string;
  };
  financialSummary: {
    net: number;
    vat: number;
    total: number;
  };
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
  invoices: Array<{ id: string; number: string; status: string; amount: number; dueDate: string | null }>;
  expenses: Array<{ id: string; date: string; category: string; description: string; total: number; status: string }>;
  profitability: {
    revenue: number;
    personnelCost: number;
    operationalCost: number;
    totalCost: number;
    costBreakdown: Array<{
      key: string;
      label: string;
      group: "PERSONNEL" | "OPERATIONAL";
      amount: number;
    }>;
    profit: number;
    margin: number;
    classification: string;
    calculatedAt: string;
  } | null;
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
  customerType: "PERSON" | "COMPANY";
  corporateBilling: {
    businessActivity: string;
    address: string;
    municipality: string;
    email: string;
  };
  primaryContact: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  };
  commercialNotes: string;
  contacts: Array<{ name: string; email: string; phone: string }>;
  commercialHistory: Array<{
    id: string;
    projectId: string;
    type: string;
    title: string;
    detail: string;
    date: string;
  }>;
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
