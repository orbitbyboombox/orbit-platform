export const projectTypes = ["Wedding", "Corporate", "Birthday", "Private", "Other"] as const;
export const projectServices = ["Classic", "Polaroid", "Black Studio", "360", "LightBox", "BoomBall"] as const;
export const projectStatuses = ["Active", "Upcoming", "Completed", "Archived"] as const;
export const projectHealthLevels = ["Healthy", "Attention", "Risk", "Critical"] as const;

export type ProjectType = (typeof projectTypes)[number];
export type ProjectService = (typeof projectServices)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type ProjectHealth = (typeof projectHealthLevels)[number];
export type ProjectFilter = "All" | ProjectStatus;

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  client: {
    name: string;
    email: string;
    phone: string;
    company?: string;
  };
  event: {
    date: string;
    time: string;
    location: string;
    city: string;
  };
  services: ProjectService[];
  status: ProjectStatus;
  health: ProjectHealth;
}

export interface ProjectDraft {
  type?: ProjectType;
  client: Project["client"];
  event: Project["event"];
  services: ProjectService[];
}
