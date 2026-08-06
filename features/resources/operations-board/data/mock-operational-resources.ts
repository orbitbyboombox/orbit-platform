import { createOperationsBoardSnapshot } from "../engine/operations-board.indicators";
import type { OperationsBoardInput } from "../types/operations-board.types";

export const MOCK_OPERATIONAL_RESOURCES: OperationsBoardInput = {
  blackBoxes: [
    { id: "box-01", number: "Box 01", status: "IN_USE", currentEvent: "Matrimonio · CasaPiedra", nextEvent: "Empresa · 08 ago", maintenanceStatus: "HEALTHY" },
    { id: "box-02", number: "Box 02", status: "RESERVED", nextEvent: "Cumpleaños · 06 ago", maintenanceStatus: "HEALTHY" },
    { id: "box-03", number: "Box 03", status: "AVAILABLE", nextEvent: "Sin asignación", maintenanceStatus: "HEALTHY" },
    { id: "box-04", number: "Box 04", status: "MAINTENANCE", nextEvent: "Disponible · 09 ago", maintenanceStatus: "UPCOMING" },
    { id: "box-05", number: "Box 05", status: "RESERVED", nextEvent: "Graduación · 07 ago", maintenanceStatus: "HEALTHY" },
    { id: "box-06", number: "Box 06", status: "AVAILABLE", nextEvent: "Sin asignación", maintenanceStatus: "HEALTHY" },
  ],
  booths: [
    { id: "booth-01", number: "Cabina 01", status: "IN_USE", assignedBox: "Box 01", currentEvent: "Matrimonio · CasaPiedra", maintenanceStatus: "HEALTHY" },
    { id: "booth-02", number: "Cabina 02", status: "RESERVED", assignedBox: "Box 02", currentEvent: "Mañana · Vitacura", maintenanceStatus: "HEALTHY" },
    { id: "booth-03", number: "Cabina 03", status: "AVAILABLE", assignedBox: "Sin asignar", currentEvent: "Sin evento", maintenanceStatus: "HEALTHY" },
    { id: "booth-04", number: "Cabina 04", status: "MAINTENANCE", assignedBox: "Box 04", currentEvent: "En taller", maintenanceStatus: "OVERDUE" },
    { id: "booth-05", number: "Cabina 05", status: "RESERVED", assignedBox: "Box 05", currentEvent: "07 ago · Las Condes", maintenanceStatus: "HEALTHY" },
    { id: "booth-06", number: "Cabina 06", status: "AVAILABLE", assignedBox: "Sin asignar", currentEvent: "Sin evento", maintenanceStatus: "HEALTHY" },
  ],
  vehicles: [
    { id: "vehicle-md201", name: "CHANGAN MD201", plate: "LV-KD-20", status: "IN_USE", currentRoute: "Ruta Norte", currentKm: 89200, remainingMaintenanceKm: 800, maintenanceStatus: "UPCOMING" },
    { id: "vehicle-kyc", name: "KYC X5 Plus", plate: "RP-HX-55", status: "AVAILABLE", currentRoute: "Sin ruta", currentKm: 42350, remainingMaintenanceKm: 7650, maintenanceStatus: "HEALTHY" },
  ],
  operators: [
    { id: "operator-01", name: "Nicolás Rojas", currentAssignment: "Matrimonio · CasaPiedra", availability: "Ocupado hasta 01:00", todayEvents: 1, status: "IN_USE" },
    { id: "operator-02", name: "Camila Soto", currentAssignment: "Empresa · Huechuraba", availability: "Disponible 20:00", todayEvents: 2, status: "IN_USE" },
    { id: "operator-03", name: "Diego Muñoz", currentAssignment: "Sin asignación", availability: "Disponible", todayEvents: 0, status: "AVAILABLE" },
    { id: "operator-04", name: "Fernanda Silva", currentAssignment: "Graduación · Las Condes", availability: "Reservada", todayEvents: 1, status: "RESERVED" },
    { id: "operator-05", name: "Tomás Pérez", currentAssignment: "Sin asignación", availability: "Disponible", todayEvents: 0, status: "AVAILABLE" },
  ],
  capacityIndicators: [
    { id: "saturday", label: "Sábado", percentage: 95 },
    { id: "sunday", label: "Domingo", percentage: 45 },
    { id: "next-saturday", label: "Próximo sábado", percentage: 100 },
  ],
  alerts: [
    { id: "alert-vehicle", message: "CHANGAN MD201 requiere mantenimiento en 800 km.", severity: "WARNING" },
    { id: "alert-booth", message: "Cabina 04 se encuentra en mantenimiento vencido.", severity: "CRITICAL" },
    { id: "alert-operator", message: "Revisar continuidad de Camila Soto entre dos eventos.", severity: "WARNING" },
    { id: "alert-capacity", message: "La capacidad del próximo sábado está completamente reservada.", severity: "INFO" },
  ],
};

export const MOCK_OPERATIONS_BOARD_SNAPSHOT = createOperationsBoardSnapshot(MOCK_OPERATIONAL_RESOURCES);
