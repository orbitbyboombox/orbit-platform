export type OrbitRole = "CEO" | "ADMINISTRATOR" | "STAFF" | "CUSTOMER" | "META_REVIEWER" | string;

export function isAdministrativeRole(role: OrbitRole | null | undefined) {
  return role === "CEO" || role === "ADMINISTRATOR";
}

export function unauthorizedLandingForRole(role: OrbitRole | null | undefined) {
  return role === "STAFF" ? "/login?access=staff" : "/login?access=customer";
}

export function isMetaReviewerRole(role: OrbitRole | null | undefined) {
  return role === "META_REVIEWER";
}
