import type { OperationalVehicle, VehicleId } from "../types";

export const OPERATIONAL_VEHICLES = [
  {
    id: "CHANGAN_MD201",
    name: "CHANGAN MD201",
    year: 2020,
    fuel: "GASOLINE_93",
    body: "CLOSED",
    heightMeters: 2.3,
    boothCapacity: 6,
    blackBoxCapacity: 6,
    maintenanceIntervalKm: 10_000,
  },
  {
    id: "KYC_X5_PLUS",
    name: "KYC X5 Plus",
    year: null,
    fuel: "GASOLINE_93",
    body: "CLOSED",
    heightMeters: 2.2,
    boothCapacity: 6,
    blackBoxCapacity: 6,
    maintenanceIntervalKm: 10_000,
  },
] as const satisfies readonly OperationalVehicle[];

export const OPERATIONAL_VEHICLE_BY_ID: Readonly<Record<VehicleId, OperationalVehicle>> =
  Object.fromEntries(OPERATIONAL_VEHICLES.map((vehicle) => [vehicle.id, vehicle])) as unknown as Readonly<
    Record<VehicleId, OperationalVehicle>
  >;
