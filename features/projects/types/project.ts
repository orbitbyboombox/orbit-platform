export const projectTypes = ["Wedding", "Corporate", "Birthday", "Graduation", "Private", "Other"] as const;
export const projectServices = ["Classic", "Polaroid", "Black Studio", "360", "LightBox", "BoomBall"] as const;
export const projectStatuses = ["Active", "Upcoming", "Completed", "Archived"] as const;
export const projectHealthLevels = ["Healthy", "Attention", "Risk", "Critical"] as const;
export const projectCommercialStages = ["New", "Contacted", "Quoting", "Waiting", "Reserved", "Confirmed", "Production", "Finished"] as const;
export const projectOrigins = ["WhatsApp", "Instagram", "Google", "Website", "Referral", "FormerClient", "Other"] as const;

export type ProjectType = (typeof projectTypes)[number];
export type ProjectService = (typeof projectServices)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectHealth = (typeof projectHealthLevels)[number];
export type ProjectCommercialStage = (typeof projectCommercialStages)[number];
export type ProjectOrigin = (typeof projectOrigins)[number];
export type ProjectFilter = "All" | ProjectCommercialStage;

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  client: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    rut?: string;
    address?: string;
  };
  event: {
    date: string;
    time: string;
    location: string;
    city: string;
    durationHours?: number;
    extras?: string[];
  };
  services: ProjectService[];
  status: ProjectStatus;
  health: ProjectHealth;
  stage?: string;
  score?: number;
  commercialStage: ProjectCommercialStage;
  origin?: ProjectOrigin;
  notes?: string;
  customerVersion?: number;
  lastCommunication?: string;
  salesOwner?: string;
  nextAction?: string;
  tags?: string[];
}

export interface ProjectDraft {
  type?: ProjectType;
  client: Project["client"];
  event: Project["event"];
  services: ProjectService[];
  origin?: ProjectOrigin;
  notes: string;
}
