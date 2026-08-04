import type { ProjectHealth, ProjectStatus, ProjectType } from "./project.enums";

export interface ProjectClient {
  id: string | null;
  name: string;
  email: string;
  phone: string;
}

export interface ProjectBudget {
  amount: number;
  currency: string;
}

export interface ProjectContract {
  id: string | null;
  status: string | null;
  signedAt: string | null;
}

export interface ProjectFinance {
  currency: string;
  total: number;
  paid: number;
  balance: number;
}

export interface ProjectOperations {
  stage: string | null;
  notes: string | null;
}

export interface ProjectResources {
  resourceIds: string[];
}

export interface ProjectDocument {
  id: string;
  name: string;
  type: string;
  url: string | null;
  createdAt: string;
}

export interface ProjectTimelineEntry {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
}

export interface Project {
  id: string;
  name: string;
  client: ProjectClient;
  projectType: ProjectType;
  status: ProjectStatus;
  health: ProjectHealth;
  eventDate: string;
  eventTime: string;
  location: string;
  city: string;
  services: string[];
  budget: ProjectBudget;
  contract: ProjectContract;
  finance: ProjectFinance;
  operations: ProjectOperations;
  resources: ProjectResources;
  documents: ProjectDocument[];
  timeline: ProjectTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}
