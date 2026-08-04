import { projectSchema, type Project } from "../domain";

export type ProjectChanges = Partial<Omit<Project, "id" | "createdAt" | "updatedAt">>;

export interface UpdateProjectInput {
  project: Project;
  changes: ProjectChanges;
  updatedAt: string;
}

export type UpdateProjectOutput = Project;

export function updateProject({ project, changes, updatedAt }: UpdateProjectInput): UpdateProjectOutput {
  return projectSchema.parse({
    ...project,
    ...changes,
    id: project.id,
    createdAt: project.createdAt,
    updatedAt,
  });
}
