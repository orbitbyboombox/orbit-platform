const CHILE_TIME_ZONE="America/Santiago";
export type CanonicalSchedule={serviceStartAt:string;serviceEndAt:string;staffCallAt:string|null};
const parse=(value:string)=>{const match=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);if(!match)throw new Error("Horario operacional inválido.");return new Date(`${match[1]}T${match[2]}:${match[3]}:00Z`)};
export function normalizeEventSchedule(serviceStart:string,serviceEnd:string,staffCall?:string|null):CanonicalSchedule{const start=parse(serviceStart),end=parse(serviceEnd);if(end<=start)end.setUTCDate(end.getUTCDate()+1);if(end.getTime()-start.getTime()>86400000)throw new Error("El servicio no puede superar 24 horas.");return{serviceStartAt:serviceStart,serviceEndAt:end.toISOString().slice(0,16),staffCallAt:staffCall?staffCall:null}}
export function dateTimeLocal(date:string,time:string){return`${date}T${time.slice(0,5)}`}
export function chileDateTime(value:string|null|undefined){if(!value)return"Por confirmar";return new Intl.DateTimeFormat("es-CL",{dateStyle:"medium",timeStyle:"short",timeZone:CHILE_TIME_ZONE}).format(new Date(value))}
export function chileDateAndTime(value:string){const date=new Date(value);return{date:new Intl.DateTimeFormat("en-CA",{timeZone:CHILE_TIME_ZONE}).format(date),time:new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:CHILE_TIME_ZONE}).format(date)}}
