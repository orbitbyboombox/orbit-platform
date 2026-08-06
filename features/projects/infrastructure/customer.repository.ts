import type { Project, ProjectDraft } from "../types/project";

export interface CustomerMutationInput {
  customerId: string;
  expectedVersion: number;
  fullName?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  reason: string;
}
export interface CustomerRepository {
  findAll(): Promise<Project[]>;
  createWithProject(draft: ProjectDraft): Promise<Project>;
  update(input: CustomerMutationInput): Promise<void>;
  softDelete(customerId: string, expectedVersion: number, reason: string): Promise<void>;
  restore(customerId: string, expectedVersion: number, reason: string): Promise<void>;
}
