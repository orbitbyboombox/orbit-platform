import type { Project } from "../types/project";

export const initialProjects: Project[] = [
  {
    id: "silva-wedding",
    name: "Silva Wedding",
    type: "Wedding",
    client: { name: "Camila Silva", email: "camila@example.com", phone: "+56 9 5555 0142" },
    event: { date: "2026-10-17", time: "18:30", location: "Casa García-Huidobro", city: "Santiago" },
    services: ["Classic", "360"],
    status: "Active",
    health: "Healthy",
  },
  {
    id: "northstar-summit",
    name: "Northstar Summit",
    type: "Corporate",
    client: { name: "Daniel Reyes", email: "daniel@example.com", phone: "+56 9 5555 0188" },
    event: { date: "2026-11-05", time: "09:00", location: "Metropolitan Santiago", city: "Santiago" },
    services: ["Black Studio", "LightBox"],
    status: "Upcoming",
    health: "Attention",
  },
];

export function findMockProject(id: string) {
  return initialProjects.find((project) => project.id === id);
}
