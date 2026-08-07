export type TaskStatus = "PENDING" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW";

export interface OperationalTask {
  id: string;
  title: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  orbitEventId: string | null;
  assignedTo: string | null;
  assignedUser: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt: string | null;
  createdAt: string;
  completedAt: string | null;
  sourceModule: string;
  timelineReference: string | null;
  auditReference: number | null;
  version: number;
}

export interface TaskCenterSummary {
  pending: number;
  critical: number;
  overdue: number;
  today: number;
}
