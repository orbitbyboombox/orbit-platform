"use server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {synchronizeConfirmedReservationCalendar} from "./google-calendar-sync.service";
import type {GoogleCalendarSyncOperation} from "../types/google-calendar-live.types";

type Result={ok:true;operation:string}|{ok:false;error:string};
export async function synchronizeProjectCalendarAction(projectId:string,operation:GoogleCalendarSyncOperation="UPSERT"):Promise<Result>{try{const client=await createSupabaseServerClient();const{data:auth,error:authError}=await client.auth.getUser();if(authError||!auth.user)throw authError??new Error("Inicia sesión para sincronizar el calendario.");const result=await synchronizeConfirmedReservationCalendar({client,projectId,actorId:auth.user.id,operation,requireCommercialReadiness:true});if(!result)throw new Error("No existe un evento de Calendar para esta reserva.");revalidatePath(`/projects/${projectId}`);return{ok:true,operation:result.operation};}catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible sincronizar Google Calendar."}}}
