import { projectSchema, type Project, type ProjectStatus } from "../domain";

export interface ChangeProjectStatusInput {
  project: Project;
  status: ProjectStatus;
  updatedAt: string;
}

export type ChangeProjectStatusOutput = Project;

export function changeProjectStatus({ project, status, updatedAt }: ChangeProjectStatusInput): ChangeProjectStatusOutput {
  return projectSchema.parse({
    ...project,
    status,
    updatedAt,
  });
}
