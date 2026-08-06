export type StaffType = "OPERATOR" | "INSTALLATION" | "REMOVAL" | "ADMINISTRATOR" | "FUTURE";

export type StaffStatus = "AVAILABLE" | "ASSIGNED" | "UNAVAILABLE" | "INACTIVE";

export type StaffResponseStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "ASSISTANCE_REQUESTED";

export interface EmergencyContact {
  name: string;
  phone: string;
}

export interface StaffProfile {
  id: string;
  version?: number;
  firstName: string;
  lastName: string;
  rut: string;
  phone: string;
  email: string;
  address: string;
  commune: string;
  emergencyContact: EmergencyContact;
  startDate: string;
  status: StaffStatus;
}

export interface StaffEmploymentData {
  staffType: StaffType;
  dailyEventRate: number;
  installationRate: number;
  removalRate: number;
  drivingLicense?: string;
  canDriveCompanyVehicle: boolean;
  availability: string;
  observations?: string;
}

export interface StaffEventHistory {
  completedEvents: number;
  acceptedEvents: number;
  rejectedEvents: number;
  lateArrivals: number;
  currentAssignments: number;
  upcomingAssignments: number;
}

export interface StaffTodayAssignment {
  id: string;
  eventName: string;
  callTime: string;
  vehicle: string;
  blackBox: string;
  booth: string;
  departureTime: string;
  responseStatus: StaffResponseStatus;
}

export interface StaffFinancialData {
  operatorCost: number;
  installationCost: number;
  removalCost: number;
  totalStaffCost: number;
}

export interface StaffMember {
  profile: StaffProfile;
  employment: StaffEmploymentData;
  history: StaffEventHistory;
  today?: StaffTodayAssignment;
  financial: StaffFinancialData;
}

export interface StaffManagementInput {
  members: readonly StaffMember[];
}

export interface StaffOperationalIndicators {
  totalStaff: number;
  availableStaff: number;
  assignedStaff: number;
  capacityPercentage: number;
  activeAlerts: number;
}

export interface StaffRecommendation {
  title: string;
  reason: string;
  priority: "INFO" | "WARNING" | "CRITICAL";
}

export interface StaffManagementSnapshot extends StaffManagementInput {
  indicators: StaffOperationalIndicators;
  recommendation: StaffRecommendation;
}
