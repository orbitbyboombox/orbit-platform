"use client";

import { createContext, useContext, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { defaultModuleStates, type OrbitModuleKey } from "./catalog";
import type { ModuleStateMap } from "./repository";

const ModuleContext=createContext<ModuleStateMap>(defaultModuleStates);
export function ModuleManagerProvider({children,modules}:{children:React.ReactNode;modules:ModuleStateMap}){return <ModuleContext.Provider value={modules}>{children}</ModuleContext.Provider>}
export function useModuleManager(){const modules=useContext(ModuleContext);return useMemo(()=>({modules,isEnabled:(key:OrbitModuleKey)=>modules[key]!==false}),[modules])}

const routeModules:[string,OrbitModuleKey][]=[["/finance","FINANCE"],["/reports","REPORTS"],["/resources/staff","STAFF"],["/resources","RESOURCES"],["/tasks","OPERATIONS"],["/notifications","OPERATIONS"],["/projects","PROJECTS"],["/operations","DASHBOARD"]];
export function ModuleAvailabilityGuard({children}:{children:React.ReactNode}){const pathname=usePathname();const{isEnabled}=useModuleManager();const match=routeModules.find(([prefix])=>pathname.startsWith(prefix));if(match&&!isEnabled(match[1]))return <section className="mx-auto max-w-2xl rounded-3xl border bg-card p-8 text-center sm:p-12"><p className="text-xs font-semibold uppercase tracking-[.18em] text-brand">Módulo desactivado</p><h1 className="mt-3 text-3xl font-semibold">Esta área no está disponible.</h1><p className="mt-3 text-sm leading-6 text-muted">El módulo permanece instalado y conserva todos sus datos. Founder puede volver a activarlo desde ORBIT Module Manager.</p><Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-black" href="/settings#module-manager">Abrir Module Manager</Link></section>;return children}
