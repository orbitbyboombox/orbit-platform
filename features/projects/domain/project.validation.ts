import { z } from "zod";
import { ProjectHealth, ProjectStatus, ProjectType } from "./project.enums";
import type {
  Project,
  ProjectBudget,
  ProjectClient,
  ProjectContract,
  ProjectDocument,
  ProjectFinance,
  ProjectOperations,
  ProjectResources,
  ProjectTimelineEntry,
} from "./project.types";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}(?::\d{2})?$/;

export const projectClientSchema: z.ZodType<ProjectClient> = z.object({
  id: z.string().min(1).nullable(),
  name: z.string().trim().min(1),
  email: z.email(),
  phone: z.string().trim().min(1),
});

export const projectBudgetSchema: z.ZodType<ProjectBudget> = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().trim().min(3).max(3),
});

export const projectContractSchema: z.ZodType<ProjectContract> = z.object({
  id: z.string().min(1).nullable(),
  status: z.string().trim().min(1).nullable(),
  signedAt: z.iso.datetime().nullable(),
});

export const projectFinanceSchema: z.ZodType<ProjectFinance> = z.object({
  currency: z.string().trim().min(3).max(3),
  total: z.number().nonnegative(),
  paid: z.number().nonnegative(),
  balance: z.number(),
});

export const projectOperationsSchema: z.ZodType<ProjectOperations> = z.object({
  stage: z.string().trim().min(1).nullable(),
  notes: z.string().trim().min(1).nullable(),
});

export const projectResourcesSchema: z.ZodType<ProjectResources> = z.object({
  resourceIds: z.array(z.string().min(1)),
});

export const projectDocumentSchema: z.ZodType<ProjectDocument> = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  url: z.url().nullable(),
  createdAt: z.iso.datetime(),
});

export const projectTimelineEntrySchema: z.ZodType<ProjectTimelineEntry> = z.object({
  id: z.string().min(1),
  type: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable(),
  occurredAt: z.iso.datetime(),
});

export const projectSchema: z.ZodType<Project> = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  client: projectClientSchema,
  projectType: z.enum(ProjectType),
  status: z.enum(ProjectStatus),
  health: z.enum(ProjectHealth),
  eventDate: z.string().regex(datePattern, "Expected date in YYYY-MM-DD format."),
  eventTime: z.string().regex(timePattern, "Expected time in HH:mm or HH:mm:ss format."),
  location: z.string().trim().min(1),
  city: z.string().trim().min(1),
  services: z.array(z.string().trim().min(1)),
  budget: projectBudgetSchema,
  contract: projectContractSchema,
  finance: projectFinanceSchema,
  operations: projectOperationsSchema,
  resources: projectResourcesSchema,
  documents: z.array(projectDocumentSchema),
  timeline: z.array(projectTimelineEntrySchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectOutput = z.output<typeof projectSchema>;
