import { projectSchema, type Project } from "../domain";

export interface DuplicateProjectInput {
  project: Project;
  newId: string;
  newName?: string;
  createdAt: string;
  updatedAt: string;
}

export type DuplicateProjectOutput = Project;

export function duplicateProject({ project, newId, newName, createdAt, updatedAt }: DuplicateProjectInput): DuplicateProjectOutput {
  return projectSchema.parse({
    ...project,
    id: newId,
    name: newName ?? `${project.name} Copy`,
    client: { ...project.client },
    services: [...project.services],
    budget: { ...project.budget },
    contract: { ...project.contract },
    finance: { ...project.finance },
    operations: { ...project.operations },
    resources: { resourceIds: [...project.resources.resourceIds] },
    documents: project.documents.map((document) => ({ ...document })),
    timeline: project.timeline.map((entry) => ({ ...entry })),
    createdAt,
    updatedAt,
  });
}
