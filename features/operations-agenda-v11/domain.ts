export type Window={start:string|null;end:string|null};
export function overlap(a:Window,b:Window){if(!a.start||!a.end||!b.start||!b.end)return "NO_VERIFICABLE" as const;return new Date(a.start)<new Date(b.end)&&new Date(b.start)<new Date(a.end)?"CONFLICTO" as const:"SIN_CONFLICTO" as const}
export function reminderLabel(status:string){return ({SENT:"COMPLETADO",PENDING:"PENDIENTE",FAILED:"ERROR",BLOCKED:"BLOQUEADO",SCHEDULED:"PROGRAMADO"} as Record<string,string>)[status]??"PENDIENTE"}
export function alertPriority(hours:number){return hours<48?"CRITICAL":hours<72?"HIGH":"MEDIUM"}
export function agendaStatus(input:{checklist:number;required:number;staff:string;resources:string;reminder:string}){if(input.staff==="CONFLICTO"||input.resources==="CONFLICTO"||input.reminder==="ERROR"||input.reminder==="BLOQUEADO")return "CRÍTICO";if(input.checklist<input.required||input.staff==="NO_VERIFICABLE"||input.resources==="NO_VERIFICABLE")return "ATENCIÓN";return "LISTO"}
