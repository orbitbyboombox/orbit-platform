import { createStaffManagementSnapshot } from "../engine/staff-management.indicators";
import type { StaffManagementInput } from "../types/staff-management.types";

export const MOCK_STAFF_MANAGEMENT_INPUT: StaffManagementInput = {
  members: [
    {
      profile: { id: "staff-felipe", firstName: "Felipe", lastName: "Contreras", rut: "18.234.567-8", phone: "+56 9 6123 4587", email: "felipe@boom-box.cl", address: "Av. El Valle 1450", commune: "Huechuraba", emergencyContact: { name: "Paula Contreras", phone: "+56 9 8877 2211" }, startDate: "15 marzo 2024", status: "ACTIVE" },
      employment: { staffType: "OPERATOR", classification: "CALYPSO", capabilities: ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"], specializations: ["CLASSIC", "BLACK_STUDIO"], dailyEventRate: 75000, installationRate: 30000, removalRate: 30000, drivingLicense: "Clase B", canDriveCompanyVehicle: true, availability: "Disponible desde las 16:00", observations: "Experiencia en Classic y Black Studio." },
      history: { completedEvents: 86, acceptedEvents: 92, rejectedEvents: 3, lateArrivals: 0, currentAssignments: 0, upcomingAssignments: 4 },
      financial: { operatorCost: 75000, installationCost: 0, removalCost: 0, totalStaffCost: 75000 },
    },
    {
      profile: { id: "staff-marcelo", firstName: "Marcelo", lastName: "Riquelme", rut: "17.905.432-1", phone: "+56 9 5544 1802", email: "marcelo@boom-box.cl", address: "Los Alerces 822", commune: "Colina", emergencyContact: { name: "Carolina Riquelme", phone: "+56 9 4433 0921" }, startDate: "02 septiembre 2023", status: "ACTIVE" },
      employment: { staffType: "INSTALLATION", classification: "CALYPSO", capabilities: ["ASSEMBLY", "OPERATOR", "DISASSEMBLY"], specializations: [], dailyEventRate: 0, installationRate: 40000, removalRate: 35000, drivingLicense: "Clase B", canDriveCompanyVehicle: true, availability: "Asignado hasta las 23:30", observations: "Responsable de ruta norte." },
      history: { completedEvents: 124, acceptedEvents: 131, rejectedEvents: 5, lateArrivals: 1, currentAssignments: 2, upcomingAssignments: 6 },
      today: { id: "assignment-marcelo", eventName: "Matrimonio · CasaPiedra", callTime: "18:00", vehicle: "CHANGAN MD201", blackBox: "Box 01", booth: "Cabina 01", departureTime: "17:15", responseStatus: "ACCEPTED" },
      financial: { operatorCost: 0, installationCost: 40000, removalCost: 35000, totalStaffCost: 75000 },
    },
    {
      profile: { id: "staff-sebastian", firstName: "Sebastián", lastName: "Muñoz", rut: "19.112.875-4", phone: "+56 9 7233 6401", email: "sebastian@boom-box.cl", address: "Santa Elena 331", commune: "Quilicura", emergencyContact: { name: "Rosa Muñoz", phone: "+56 9 3344 6502" }, startDate: "10 enero 2025", status: "ACTIVE" },
      employment: { staffType: "OPERATOR", classification: "GREEN", capabilities: ["OPERATOR"], specializations: [], dailyEventRate: 70000, installationRate: 25000, removalRate: 25000, drivingLicense: "Clase B", canDriveCompanyVehicle: true, availability: "Asignado a Ruta Norte", observations: "Disponible para desmontaje posterior." },
      history: { completedEvents: 48, acceptedEvents: 51, rejectedEvents: 1, lateArrivals: 0, currentAssignments: 1, upcomingAssignments: 3 },
      today: { id: "assignment-sebastian", eventName: "Empresa · Espacio Riesco", callTime: "17:30", vehicle: "KYC X5 Plus", blackBox: "Box 05", booth: "Cabina 05", departureTime: "16:45", responseStatus: "PENDING" },
      financial: { operatorCost: 70000, installationCost: 0, removalCost: 0, totalStaffCost: 70000 },
    },
    {
      profile: { id: "staff-camila", firstName: "Camila", lastName: "Soto", rut: "18.776.543-2", phone: "+56 9 9981 2340", email: "camila@boom-box.cl", address: "Las Flores 920", commune: "Las Condes", emergencyContact: { name: "Jorge Soto", phone: "+56 9 8900 1277" }, startDate: "20 junio 2024", status: "ACTIVE" },
      employment: { staffType: "ADMINISTRATOR", capabilities: [], specializations: [], dailyEventRate: 65000, installationRate: 0, removalRate: 0, canDriveCompanyVehicle: false, availability: "Disponible", observations: "Coordinación y asistencia operacional." },
      history: { completedEvents: 62, acceptedEvents: 68, rejectedEvents: 2, lateArrivals: 0, currentAssignments: 0, upcomingAssignments: 2 },
      financial: { operatorCost: 65000, installationCost: 0, removalCost: 0, totalStaffCost: 65000 },
    },
  ],
};

export const MOCK_STAFF_MANAGEMENT_SNAPSHOT = createStaffManagementSnapshot(MOCK_STAFF_MANAGEMENT_INPUT);
