export function usesNOVAGoogleCore() {
  return Boolean(
    process.env.ORBIT_ORGANIZATION_ID?.trim()
    && process.env.ORBIT_TENANT_SLUG?.trim()
    && process.env.ORBIT_CONNECT_CLIENT_TOKEN?.trim(),
  );
}
