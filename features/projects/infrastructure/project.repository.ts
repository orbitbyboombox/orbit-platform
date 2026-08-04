import type { Project } from "../domain";
import type {
  FindAllProjectsOptions,
  OptionalProjectRepositoryResult,
  ProjectCollectionRepositoryResult,
  ProjectDeletionRepositoryResult,
  ProjectId,
  ProjectRepositoryResult,
} from "./repository.types";

export interface ProjectRepository {
  create(project: Project): ProjectRepositoryResult;
  update(project: Project): ProjectRepositoryResult;
  archive(project: Project): ProjectRepositoryResult;
  duplicate(project: Project): ProjectRepositoryResult;
  findById(id: ProjectId): OptionalProjectRepositoryResult;
  findAll(options?: FindAllProjectsOptions): ProjectCollectionRepositoryResult;
  delete(id: ProjectId): ProjectDeletionRepositoryResult;
}
