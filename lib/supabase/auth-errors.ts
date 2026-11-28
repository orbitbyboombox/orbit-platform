export function isMissingSessionError(error:unknown){const value=error&&typeof error==="object"?error as{message?:string}:{};return /auth session missing/i.test(value.message??"")}
export function isInvalidSessionError(error:unknown){const value=error&&typeof error==="object"?error as{code?:string;message?:string}:{};const message=value.message??"";return value.code==="PGRST303"||/jwt|token.*expired|issued at future|invalid.*session|refresh token/i.test(message)}
export function isTransientSupabaseTransportError(error:unknown){
  if(isInvalidSessionError(error)) return false;
  const value=error&&typeof error==="object"?error as{code?:string;name?:string;message?:string;status?:number}:{};
  const message=String(value.message??"");
  return value.name==="AbortError" || value.code==="PGRST003" || value.status===502 || value.status===503 || value.status===504 || /abort|fetch failed|network|timeout|temporarily unavailable|connection reset/i.test(message);
}
