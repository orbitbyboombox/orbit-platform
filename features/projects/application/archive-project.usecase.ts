import { ProjectStatus, projectSchema, type Project } from "../domain";

export interface ArchiveProjectInput {
  project: Project;
  updatedAt: string;
}

export type ArchiveProjectOutput = Project;

export function archiveProject({ project, updatedAt }: ArchiveProjectInput): ArchiveProjectOutput {
  return projectSchema.parse({
    ...project,
    status: ProjectStatus.ARCHIVED,
    updatedAt,
  });
}
