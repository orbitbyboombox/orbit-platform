import type { Project, ProjectHealth, ProjectStatus, ProjectType } from "../domain";

export type ProjectId = Project["id"];

export interface ProjectPersistenceDTO
  extends Omit<Project, "projectType" | "status" | "health"> {
  projectType: string;
  status: string;
  health: string;
}

export interface FindAllProjectsOptions {
  status?: ProjectStatus;
  health?: ProjectHealth;
  projectType?: ProjectType;
}

export type ProjectRepositoryResult = Promise<Project>;
export type OptionalProjectRepositoryResult = Promise<Project | null>;
export type ProjectCollectionRepositoryResult = Promise<Project[]>;
export type ProjectDeletionRepositoryResult = Promise<void>;
