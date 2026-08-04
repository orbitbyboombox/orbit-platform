import type { Project } from "../domain";
import type { ProjectPersistenceDTO } from "./repository.types";

export interface ProjectMapper {
  toDomain(persistence: ProjectPersistenceDTO): Project;
  toPersistence(project: Project): ProjectPersistenceDTO;
}
