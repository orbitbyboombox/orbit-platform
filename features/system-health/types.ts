export type HealthStatus="HEALTHY"|"WARNING"|"CRITICAL"|"UNAVAILABLE";
export interface HealthSignal{label:string;status:HealthStatus;value:string;detail?:string;href?:string}
export interface HealthAlert{id:string;severity:"WARNING"|"CRITICAL";message:string;status:string;lastSeenAt:string}
export interface HealthScore{label:string;value:number}
export interface SystemHealthSnapshot{
  checkedAt:string;overallStatus:"HEALTHY"|"WARNING"|"CRITICAL";overallScore:number;version:string;deployment:string;domain:string;responseTimeMs:number|null;
  scores:readonly HealthScore[];vercel:readonly HealthSignal[];supabase:readonly HealthSignal[];google:readonly HealthSignal[];services:readonly HealthSignal[];
  security:readonly HealthSignal[];storage:readonly HealthSignal[];jobs:readonly HealthSignal[];alerts:readonly HealthAlert[];recommendations:readonly string[];
  links:{supabase:string;vercel:string;drive?:string};
}
