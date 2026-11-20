export const OFFICIAL_ROSTER_PLATES = ["KWSW28", "RVWW45", "SBVX33"] as const;

type RosterPlate = (typeof OFFICIAL_ROSTER_PLATES)[number];
export type RosterVehicles = { assembly: RosterPlate[]; disassembly: RosterPlate[] };

export function readRosterVehicles(value: unknown): RosterVehicles {
  const selection = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const plates = (phase: string) => {
    const values = selection[phase];
    return Array.isArray(values) ? OFFICIAL_ROSTER_PLATES.filter(plate => values.includes(plate)) : [];
  };
  return { assembly: plates("assembly"), disassembly: plates("disassembly") };
}
