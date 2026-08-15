export interface OperationalWindow {
  startAt: string;
  endAt: string;
}

export function operationalWindowsOverlap(
  left: OperationalWindow,
  right: OperationalWindow,
): boolean {
  return (
    new Date(left.startAt).getTime() < new Date(right.endAt).getTime() &&
    new Date(right.startAt).getTime() < new Date(left.endAt).getTime()
  );
}

export function missingPhysicalUnits(required: number, assigned: number): number {
  return Math.max(0, Math.ceil(required) - assigned);
}
