const KNOWN_PRODUCTION_PROJECT_REF = "uiwlcmbrowtmqwhnsnxz";

export type OrbitEnvironment = "production" | "preview" | "test" | "local" | "unknown";
type EnvironmentInput = Readonly<Record<string, string | undefined>>;

function projectRefFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.split(".")[0] : null;
  } catch {
    return null;
  }
}

export function resolveOrbitEnvironment(env: EnvironmentInput = process.env): OrbitEnvironment {
  const explicit = env.ORBIT_ENVIRONMENT?.trim().toLowerCase();
  if (explicit === "production" || explicit === "preview" || explicit === "test" || explicit === "local") return explicit;
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.NODE_ENV === "production") return "production";
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return "local";
  return "unknown";
}

export function isReadOnlyVisualPreview(env: EnvironmentInput = process.env) {
  return resolveOrbitEnvironment(env) === "preview" && env.ORBIT_READ_ONLY_VISUAL_PREVIEW === "true";
}

export function assertSupabaseEnvironmentSafe(url: string, env: EnvironmentInput = process.env) {
  const environment = resolveOrbitEnvironment(env);
  const projectRef = projectRefFromUrl(url);
  const productionRef = env.ORBIT_PRODUCTION_SUPABASE_PROJECT_REF?.trim() || KNOWN_PRODUCTION_PROJECT_REF;

  if (!projectRef) throw new Error("SUPABASE_URL must be a valid Supabase project URL.");
  if ((environment === "test" || environment === "preview") && projectRef === productionRef && !isReadOnlyVisualPreview(env)) {
    throw new Error("SUPABASE_PRODUCTION_TARGET_BLOCKED: TEST/PREVIEW cannot use the production project.");
  }

  return { environment, projectRef, productionMatch: projectRef === productionRef } as const;
}

export const productionSupabaseProjectRef = KNOWN_PRODUCTION_PROJECT_REF;
