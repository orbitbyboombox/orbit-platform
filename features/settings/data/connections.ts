import {
  CreditCard,
  Mail,
  MessageCircle,
  PanelsTopLeft,
} from "lucide-react";
import type { ConnectionProvider } from "../types";

export const CONNECTION_PROVIDERS: readonly ConnectionProvider[] = [
  {
    id: "google-workspace",
    name: "Google Workspace",
    description: "Calendario, archivos y correo corporativo desde un solo proveedor.",
    icon: PanelsTopLeft,
    initialStatus: "CONFIGURED",
    services: [
      { id: "google-calendar", name: "Google Calendar" },
      { id: "google-drive", name: "Google Drive" },
      { id: "gmail", name: "Gmail" },
    ],
  },
  {
    id: "mercado-pago",
    name: "Mercado Pago",
    description: "Pagos electrónicos para futuras experiencias de reserva.",
    icon: CreditCard,
    initialStatus: "NOT_CONNECTED",
    services: [],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Mensajería para futuras comunicaciones con clientes y equipo.",
    icon: MessageCircle,
    initialStatus: "ERROR",
    services: [],
  },
  {
    id: "email",
    name: "Email",
    description: "Canal de correo para futuras notificaciones operacionales.",
    icon: Mail,
    initialStatus: "CONNECTED",
    services: [],
  },
];
