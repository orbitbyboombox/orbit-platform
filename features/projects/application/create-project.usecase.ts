import { projectSchema, type Project, type ProjectInput } from "../domain";

export interface CreateProjectInput {
  project: ProjectInput;
}

export type CreateProjectOutput = Project;

export function createProject({ project }: CreateProjectInput): CreateProjectOutput {
  return projectSchema.parse(project);
}
