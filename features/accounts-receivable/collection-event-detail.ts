import {
  canonicalEventDuration,
  commercialServiceList,
} from "../projects/reservation-presentation.ts";

type CollectionProjectDetail = {
  eventDate?: string | null;
  location?: string | null;
  city?: string | null;
  operations?: unknown;
  services?: readonly {
    serviceCode?: string | null;
    durationHours?: number | null;
  }[];
  operationalContract?: {
    serviceStartAt?: string | null;
    serviceEndAt?: string | null;
  } | null;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function collectionEventLocation(input: {
  location?: string | null;
  city?: string | null;
}) {
  const values = [input.location, input.city]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return Array.from(new Set(values)).join(" · ") || null;
}

export function resolveCollectionEventDetail(input: CollectionProjectDetail) {
  const operations = object(input.operations);
  const eventDurationHours = Number(operations.durationHours ?? 0) || null;

  return {
    eventDate: input.eventDate ?? null,
    eventLocation: collectionEventLocation(input),
    service: commercialServiceList(
      (input.services ?? [])
        .map((item) => item.serviceCode?.trim() ?? "")
        .filter(Boolean),
    ),
    eventDuration: canonicalEventDuration({
      serviceStartAt: input.operationalContract?.serviceStartAt,
      serviceEndAt: input.operationalContract?.serviceEndAt,
      eventDurationHours,
      serviceDurations: (input.services ?? []).map(
        (item) => item.durationHours,
      ),
    }),
  };
}
