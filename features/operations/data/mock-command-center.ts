export interface CommandCenterEvent {
  readonly id: string;
  readonly portalId: string;
  readonly customer: string;
  readonly eventType: string;
  readonly service: string;
  readonly duration: string;
  readonly dateLabel: string;
  readonly time: string;
  readonly location: string;
  readonly status: string;
  readonly statusVariant: "neutral" | "info" | "success" | "warning" | "danger";
}

export const TODAY_EVENTS: readonly CommandCenterEvent[] = [
  {
    id: "lumen-producciones",
    portalId: "BBX-26-000124",
    customer: "Lumen Producciones",
    eventType: "Empresa",
    service: "Classic",
    duration: "3 horas",
    dateLabel: "Hoy",
    time: "09:30",
    location: "Centro Parque",
    status: "Preparación",
    statusVariant: "warning",
  },
  {
    id: "matrimonio-silva",
    portalId: "BBX-26-000131",
    customer: "María González + Felipe Soto",
    eventType: "Matrimonio",
    service: "BBOX360",
    duration: "4 horas",
    dateLabel: "Hoy",
    time: "19:00",
    location: "CasaPiedra",
    status: "Listo",
    statusVariant: "success",
  },
] as const;

export const NEXT_SEVEN_DAYS_EVENTS: readonly CommandCenterEvent[] = [
  {
    id: "nova-summit",
    portalId: "BBX-26-000142",
    customer: "Nova Summit",
    eventType: "Empresa",
    service: "Black Studio",
    duration: "4 horas",
    dateLabel: "Mañana · 6 ago",
    time: "18:30",
    location: "Metropolitan Santiago",
    status: "Falta operador",
    statusVariant: "danger",
  },
  {
    id: "cumpleanos-vicente",
    portalId: "BBX-26-000145",
    customer: "Cumpleaños Vicente",
    eventType: "Cumpleaños",
    service: "Classic",
    duration: "3 horas",
    dateLabel: "8 ago",
    time: "17:00",
    location: "Club de Polo",
    status: "Confirmado",
    statusVariant: "info",
  },
  {
    id: "atlas-awards",
    portalId: "BBX-26-000151",
    customer: "Atlas Awards",
    eventType: "Empresa",
    service: "LightBox",
    duration: "5 horas",
    dateLabel: "11 ago",
    time: "20:00",
    location: "Espacio Riesco",
    status: "Diseño pendiente",
    statusVariant: "warning",
  },
] as const;

export const NEXT_FIFTEEN_DAYS_EVENTS: readonly CommandCenterEvent[] = [
  {
    id: "isidora-benjamin",
    portalId: "BBX-26-000158",
    customer: "Isidora + Benjamín",
    eventType: "Matrimonio",
    service: "Classic",
    duration: "4 horas",
    dateLabel: "14 ago",
    time: "18:30",
    location: "Casa García-Huidobro",
    status: "Transporte pendiente",
    statusVariant: "warning",
  },
  {
    id: "northstar",
    portalId: "BBX-26-000163",
    customer: "Cumbre Northstar",
    eventType: "Empresa",
    service: "BBOX360",
    duration: "3 horas",
    dateLabel: "17 ago",
    time: "09:00",
    location: "W Santiago",
    status: "Pago pendiente",
    statusVariant: "danger",
  },
  {
    id: "emilia-18",
    portalId: "BBX-26-000169",
    customer: "Emilia 18",
    eventType: "Fiesta",
    service: "Polaroid",
    duration: "3 horas",
    dateLabel: "20 ago",
    time: "21:00",
    location: "Club El Rodeo",
    status: "Confirmado",
    statusVariant: "success",
  },
] as const;

export const OPERATIONAL_ACTIONS = [
  { id: "operator", title: "Asignar operador", project: "Nova Summit", priority: "Crítica", variant: "danger" as const },
  { id: "logistics", title: "Confirmar logística", project: "Lumen Producciones", priority: "Importante", variant: "warning" as const },
  { id: "design", title: "Diseño pendiente", project: "Atlas Awards", priority: "Importante", variant: "warning" as const },
  { id: "payment", title: "Pago pendiente", project: "Cumbre Northstar", priority: "Crítica", variant: "danger" as const },
  { id: "transport", title: "Transporte pendiente", project: "Isidora + Benjamín", priority: "Importante", variant: "warning" as const },
] as const;
