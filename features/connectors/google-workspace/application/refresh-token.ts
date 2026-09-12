/** Prefer a newly issued refresh token, but never erase a still-usable token when
 * Google omits it on a subsequent consent exchange. */
export function selectRefreshToken(next?: string, existing?: string | null) {
  return next ?? existing ?? null;
}
