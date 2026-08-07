"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerActionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExperienceReviewResult={ok:true;message:string}|{ok:false;error:string};
const text=(form:FormData,key:string)=>String(form.get(key)??"").trim();

export async function completeExperienceReviewAction(projectId:string,form:FormData):Promise<ExperienceReviewResult>{
  try{
    const client=await createSupabaseServerActionClient(); const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user)throw authError??new Error("Sesión requerida.");
    const rating=Number(text(form,"generalRating")); if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error("Selecciona una calificación general.");
    const customerExperience=text(form,"customerExperience"); const operationalExperience=text(form,"operationalExperience"); const allowed=["EXCELLENT","GOOD","AVERAGE","POOR"];
    if(!allowed.includes(customerExperience)||!allowed.includes(operationalExperience))throw new Error("Completa la evaluación de experiencia.");
    const admin=createAdminClient(); const {data:project,error:projectError}=await admin.from("projects").select("id,customer_id,orbit_event_id,name,location,city,status").eq("id",projectId).is("deleted_at",null).single(); if(projectError)throw projectError;
    const {data:existing}=await admin.from("experience_reviews").select("id").eq("project_id",projectId).maybeSingle(); if(existing)throw new Error("Este evento ya tiene una revisión de experiencia permanente.");
    const reviewId=crypto.randomUUID(); const uploaded:{path:string;type:"SETUP"|"EVENT"|"TEARDOWN";contentType:string;size:number}[]=[];
    for(const [field,type] of [["setupEvidence","SETUP"],["eventEvidence","EVENT"],["teardownEvidence","TEARDOWN"]] as const){
      const file=form.get(field); if(!(file instanceof File)||!file.size)continue; if(file.size>15_728_640)throw new Error("Cada evidencia debe pesar menos de 15 MB."); if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("La evidencia debe ser JPG, PNG o WEBP.");
      const extension=file.name.split(".").pop()?.toLowerCase()||"jpg"; const path=`experience-reviews/${project.orbit_event_id}/${reviewId}/${type.toLowerCase()}.${extension}`;
      const {error}=await admin.storage.from("orbit-documents").upload(path,file,{contentType:file.type,upsert:false}); if(error)throw error; uploaded.push({path,type,contentType:file.type,size:file.size});
    }
    const equipment=(name:string)=>({condition:text(form,`${name}Condition`)||"Sin observaciones",maintenanceRequired:form.get(`${name}Maintenance`)==="on"});
    const {error:reviewError}=await admin.from("experience_reviews").insert({id:reviewId,project_id:project.id,customer_id:project.customer_id,orbit_event_id:project.orbit_event_id,venue_name:project.location||"Lugar sin registrar",venue_city:project.city,general_rating:rating,customer_experience:customerExperience,operational_experience:operationalExperience,equipment_review:{totem:equipment("totem"),case:equipment("case"),printer:equipment("printer"),camera:equipment("camera")},staff_review:{operator:text(form,"operatorReview"),assembly:text(form,"assemblyReview"),disassembly:text(form,"disassemblyReview"),comments:text(form,"staffComments")},venue_knowledge:text(form,"venueKnowledge"),customer_knowledge:text(form,"customerKnowledge"),lessons_repeat:text(form,"lessonsRepeat"),lessons_avoid:text(form,"lessonsAvoid"),recommendations:text(form,"recommendations"),status:"ARCHIVED",archived_at:new Date().toISOString(),created_by:auth.user.id});
    if(reviewError){await Promise.all(uploaded.map(item=>admin.storage.from("orbit-documents").remove([item.path])));throw reviewError;}
    if(uploaded.length){const {error:evidenceError}=await admin.from("experience_review_evidence").insert(uploaded.map(item=>({review_id:reviewId,evidence_type:item.type,storage_path:item.path,content_type:item.contentType,file_size:item.size,created_by:auth.user.id})));if(evidenceError)throw evidenceError;}
    const {data:assignments,error:assignmentError}=await admin.from("assignments").select("staff_id,assignment_type").eq("project_id",project.id).is("deleted_at",null); if(assignmentError)throw assignmentError;
    if(assignments?.length){const feedback:Record<string,string>={OPERATOR:text(form,"operatorReview"),ASSEMBLY:text(form,"assemblyReview"),DISASSEMBLY:text(form,"disassemblyReview")};const {error:staffLinkError}=await admin.from("experience_review_staff").insert(assignments.map(item=>({review_id:reviewId,staff_id:item.staff_id,assignment_type:item.assignment_type,feedback:feedback[item.assignment_type]??text(form,"staffComments")})));if(staffLinkError)throw staffLinkError;}
    const occurredAt=new Date().toISOString(); const {error:timelineError}=await admin.from("timeline_events").insert({customer_id:project.customer_id,project_id:project.id,orbit_event_id:project.orbit_event_id,actor_id:auth.user.id,actor_label:auth.user.email??"Operaciones",source:"Operations",action:"EXPERIENCE_REVIEW_COMPLETED",entity_type:"ExperienceReview",entity_id:reviewId,event_type:"EXPERIENCE_REVIEW_COMPLETED",title:"Revisión de experiencia completada",description:"El evento fue archivado y su aprendizaje operacional quedó disponible.",human_message:"Revisión de experiencia completada y evento archivado.",correlation_id:`experience-review-${reviewId}`,created_by:auth.user.id,occurred_at:occurredAt}); if(timelineError)throw timelineError;
    const {error:archiveError}=await admin.from("projects").update({status:"Archived",approval_reason:"Cierre mediante Experience Review",approved_by:auth.user.id,approved_at:occurredAt,updated_by:auth.user.id}).eq("id",project.id); if(archiveError)throw archiveError;
    revalidatePath(`/projects/${projectId}`); revalidatePath("/operations"); revalidatePath("/projects"); return{ok:true,message:"Experiencia archivada. El conocimiento ya está disponible para futuras operaciones."};
  }catch(error){return{ok:false,error:error instanceof Error?error.message:"No fue posible completar la revisión de experiencia."};}
}
