import { NextResponse } from "next/server";
import { sendOverdueCollections } from "@/features/accounts-receivable/overdue-automatic-collection";
export async function GET(request:Request){
  // Safe rollout: dashboard/history can deploy without activating customer emails.
  if(process.env.OVERDUE_COLLECTIONS_ENABLED!=="true") return NextResponse.json({ok:true,skipped:true,reason:"Overdue collections disabled by rollout flag",sent:0});
  const secret=process.env.CRON_SECRET;
  if(!secret || request.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({error:"Unauthorized"},{status:401});
  try{
    const result=await sendOverdueCollections(new Date());
    console.info(JSON.stringify({event:"overdue_collection.cron_completed",...result}));
    return NextResponse.json({ok:result.failed===0,...result},{status:result.failed?500:200});
  }catch(error){
    console.error(JSON.stringify({event:"overdue_collection.cron_failed",errorName:error instanceof Error?error.name:"Unknown"}));
    return NextResponse.json({ok:false,error:"Overdue collection failed"},{status:500});
  }
}
