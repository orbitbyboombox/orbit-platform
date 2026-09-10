import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isInvalidSessionError, isMissingSessionError } from "./auth-errors";
import { isAdministrativeRole, isMetaReviewerRole, unauthorizedLandingForRole } from "@/lib/auth/roles";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: new Headers(request.headers) } });
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return NextResponse.redirect(new URL("/login", request.url));
  const cookieDefaults={httpOnly:true,path:"/",maxAge:60*60*24*365,sameSite:"lax" as const,secure:process.env.NODE_ENV==="production"};
  const supabase = createServerClient(url,publishableKey,{cookieOptions:cookieDefaults,cookies:{getAll:()=>request.cookies.getAll(),setAll:(items)=>{items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request:{headers:new Headers(request.headers)}});items.forEach(({name,value,options})=>response.cookies.set(name,value,{...cookieDefaults,...options}))}}});
  const { data: { user },error } = await supabase.auth.getUser();
  const isPublicEntry = request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/login";
  if(error){if(isMissingSessionError(error)){if(isPublicEntry)return response;const login=new URL("/login",request.url);login.searchParams.set("next",request.nextUrl.pathname+request.nextUrl.search);return NextResponse.redirect(login)}if(isInvalidSessionError(error))return NextResponse.redirect(new URL("/api/auth/session-expired",request.url));return response}
  if (!user){if(isPublicEntry)return response;const login=new URL("/login",request.url);login.searchParams.set("next",request.nextUrl.pathname+request.nextUrl.search);return NextResponse.redirect(login)}
  const{data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
  if(profileError)return response;
  if(!profile||(!isAdministrativeRole(profile.role)&&!isMetaReviewerRole(profile.role))){return NextResponse.redirect(new URL(unauthorizedLandingForRole(profile?.role),request.url))}
  if(isMetaReviewerRole(profile.role)&&request.nextUrl.pathname!=="/leads")return NextResponse.redirect(new URL("/leads",request.url));
  return response;
}
