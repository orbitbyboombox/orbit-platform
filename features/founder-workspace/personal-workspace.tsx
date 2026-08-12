"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, EyeOff, MoreVertical } from "lucide-react";
import { saveFounderWorkspaceAction } from "./actions";
import { MODULE_WORKSPACES, type FounderWorkspacePreferences, type ModuleWorkspaceKey } from "./catalog";

const WorkspaceContext = createContext<{
  preferences: FounderWorkspacePreferences;
  update: (next: FounderWorkspacePreferences) => void;
} | null>(null);

export function PersonalWorkspaceProvider({ children, initialPreferences }: { children: React.ReactNode; initialPreferences: FounderWorkspacePreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [, startTransition] = useTransition();
  const update = (next: FounderWorkspacePreferences) => {
    setPreferences(next);
    startTransition(async () => { await saveFounderWorkspaceAction(next); });
  };
  return <WorkspaceContext.Provider value={{ preferences, update }}>{children}</WorkspaceContext.Provider>;
}

export type WorkspaceSection = { key: string; label: string; content: React.ReactNode };

function WorkspaceSectionMenu({ label, moduleKey, sectionKey }: { label: string; moduleKey: ModuleWorkspaceKey; sectionKey: string }) {
  const { preferences, update } = usePersonalWorkspace(); const [open,setOpen]=useState(false); const config=preferences.moduleWorkspaces[moduleKey]; const index=config.sectionOrder.indexOf(sectionKey);
  const persist=(order:string[],hidden=config.hiddenSections)=>update({...preferences,moduleWorkspaces:{...preferences.moduleWorkspaces,[moduleKey]:{...config,sectionOrder:order,hiddenSections:hidden}}});
  const move=(offset:number)=>{const target=index+offset;if(index<0||target<0||target>=config.sectionOrder.length)return;const order=[...config.sectionOrder];[order[index],order[target]]=[order[target],order[index]];persist(order);setOpen(false)};
  return <div className="relative z-20 ml-auto w-fit"><button aria-expanded={open} aria-label={`Administrar ${label}`} className="grid size-11 place-items-center text-brand transition hover:text-orange-300" onClick={()=>setOpen(value=>!value)} type="button"><MoreVertical className="size-5"/></button>{open?<div className="absolute right-0 top-10 z-50 w-44 max-w-[calc(100vw-2rem)] rounded-xl border bg-card p-1.5 shadow-xl"><button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background" disabled={index<=0} onClick={()=>move(-1)} type="button"><ArrowUp className="size-4"/>Mover arriba</button><button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background" disabled={index<0||index>=config.sectionOrder.length-1} onClick={()=>move(1)} type="button"><ArrowDown className="size-4"/>Mover abajo</button><button className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-background" onClick={()=>persist(config.sectionOrder,[...new Set([...config.hiddenSections,sectionKey])])} type="button"><EyeOff className="size-4"/>Ocultar sección</button></div>:null}</div>;
}

export function PersonalWorkspaceSections({ moduleKey, sections }: { moduleKey: ModuleWorkspaceKey; sections: WorkspaceSection[] }) {
  const context = useContext(WorkspaceContext);
  const [dragged, setDragged] = useState<string | null>(null);
  const config = context?.preferences.moduleWorkspaces[moduleKey];
  useEffect(()=>{if(!context||!config)return;const missing=sections.filter(section=>!config.sectionOrder.includes(section.key));const labels=Object.fromEntries(sections.map(section=>[section.key,section.label]));if(!missing.length&&Object.entries(labels).every(([key,label])=>config.sectionLabels?.[key]===label))return;context.update({...context.preferences,moduleWorkspaces:{...context.preferences.moduleWorkspaces,[moduleKey]:{...config,sectionOrder:[...config.sectionOrder,...missing.map(section=>section.key)],hiddenSections:[...config.hiddenSections,...missing.map(section=>section.key)],sectionLabels:{...config.sectionLabels,...labels}}}})},[config,context,moduleKey,sections]);
  if (!context||!config) return <>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</>;
  const known = sections.map((section) => section.key);
  const orderedKeys = [...config.sectionOrder.filter((key) => known.includes(key)), ...known.filter((key) => !config.sectionOrder.includes(key))];
  const visible = orderedKeys.filter((key) => !config.hiddenSections.includes(key));
  const byKey = new Map(sections.map((section) => [section.key, section]));
  const saveConfig = (sectionOrder: string[], hiddenSections = config.hiddenSections) => context.update({
    ...context.preferences,
    moduleWorkspaces: { ...context.preferences.moduleWorkspaces, [moduleKey]: { ...config, sectionOrder, hiddenSections } },
  });
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    const order = [...config.sectionOrder];
    const from = order.indexOf(dragged); const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setDragged(null); saveConfig(order);
  };
  return <div className="space-y-7">{visible.map((key) => { const section = byKey.get(key); if (!section) return null; return <section data-workspace-block data-workspace-key={key} data-workspace-label={section.label} draggable key={key} onDragStart={() => setDragged(key)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(key)}>
    {section.content}
  </section>; })}</div>;
}

export function DomWorkspaceControls({ moduleKey, selectors }: { moduleKey: ModuleWorkspaceKey; selectors: Record<string,string> }) {
  const { preferences, update }=usePersonalWorkspace(); const [targets,setTargets]=useState<Record<string,HTMLElement>>({}); const config=preferences.moduleWorkspaces[moduleKey];
  useEffect(()=>{const found:Record<string,HTMLElement>={};for(const[key,selector]of Object.entries(selectors)){const element=document.querySelector<HTMLElement>(selector);if(element){element.style.position="relative";found[key]=element}}setTargets(found)},[selectors]);
  useEffect(()=>{let dragged="";const cleanups:ClearEventListener[]=[];for(const[key,element]of Object.entries(targets)){element.draggable=true;element.style.order=String(config.sectionOrder.indexOf(key));element.style.display=config.hiddenSections.includes(key)?"none":"";const start=()=>{dragged=key};const over=(event:DragEvent)=>event.preventDefault();const drop=()=>{if(!dragged||dragged===key)return;const order=[...config.sectionOrder];const from=order.indexOf(dragged),to=order.indexOf(key);if(from<0||to<0)return;order.splice(to,0,order.splice(from,1)[0]);update({...preferences,moduleWorkspaces:{...preferences.moduleWorkspaces,[moduleKey]:{...config,sectionOrder:order}}});dragged=""};element.addEventListener("dragstart",start);element.addEventListener("dragover",over);element.addEventListener("drop",drop);cleanups.push(()=>{element.removeEventListener("dragstart",start);element.removeEventListener("dragover",over);element.removeEventListener("drop",drop)})}return()=>cleanups.forEach(cleanup=>cleanup())},[config,moduleKey,preferences,targets,update]);
  const labels=new Map<string,string>(((MODULE_WORKSPACES[moduleKey as keyof typeof MODULE_WORKSPACES]??[]) as readonly {key:string;label:string}[]).map(section=>[section.key,section.label]));
  return <>{Object.entries(targets).map(([key,target])=>createPortal(<div className="absolute right-3 top-3 z-20"><WorkspaceSectionMenu label={labels.get(key)??key} moduleKey={moduleKey} sectionKey={key}/></div>,target,`workspace-control-${moduleKey}-${key}`))}</>;
}

type ClearEventListener=()=>void;

const ROUTE_MODULES:[RegExp,ModuleWorkspaceKey][]=[[/^\/operations|^\/$/,"DASHBOARD"],[/^\/customers/,"CUSTOMERS"],[/^\/(events|projects)/,"EVENTS"],[/^\/finance\/receivables/,"RECEIVABLES"],[/^\/finance/,"FINANCE"],[/^\/resources\/staff/,"STAFF"],[/^\/resources/,"RESOURCES"],[/^\/reports/,"REPORTS"],[/^\/settings/,"SETTINGS"]];
const BLOCK_SELECTOR='[data-workspace-block],section[id],article[class*="border"],details[class*="border"]';

export function GlobalLayoutEngine(){
  const pathname=usePathname();const context=useContext(WorkspaceContext);const[targets,setTargets]=useState<Record<string,HTMLElement>>({});const moduleKey=ROUTE_MODULES.find(([pattern])=>pattern.test(pathname))?.[1];
  useEffect(()=>{if(!context||!moduleKey)return;let timer:ReturnType<typeof setTimeout>;const discover=()=>{const root=document.getElementById("platform-workspace-content");if(!root)return;const candidates=[...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter(element=>!element.closest('[data-workspace-ignore]')&&!element.dataset.workspaceControl&&element.offsetParent!==null);const used=new Map<string,number>();const found:Record<string,HTMLElement>={};const labels:Record<string,string>={};for(const element of candidates){const label=workspaceLabel(element);const base=element.dataset.workspaceKey||element.id||slug(label)||element.tagName.toLowerCase();const count=used.get(base)??0;used.set(base,count+1);const key=count?`${base}-${count+1}`:base;element.dataset.workspaceKey=key;element.dataset.workspaceLabel=label;element.style.position="relative";found[key]=element;labels[key]=label}setTargets(found);const config=context.preferences.moduleWorkspaces[moduleKey];const keys=Object.keys(found);const missing=keys.filter(key=>!config.sectionOrder.includes(key));const changedLabels=keys.some(key=>config.sectionLabels?.[key]!==labels[key]);if(missing.length||changedLabels)context.update({...context.preferences,moduleWorkspaces:{...context.preferences.moduleWorkspaces,[moduleKey]:{...config,sectionOrder:[...config.sectionOrder,...missing],hiddenSections:config.hiddenSections,sectionLabels:{...config.sectionLabels,...labels}}}})};discover();const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(discover,80)});const root=document.getElementById("platform-workspace-content");if(root)observer.observe(root,{childList:true,subtree:true});return()=>{clearTimeout(timer);observer.disconnect()}},[context,moduleKey,pathname]);
  useEffect(()=>{if(!context||!moduleKey)return;const config=context.preferences.moduleWorkspaces[moduleKey];for(const[key,element]of Object.entries(targets)){element.style.display=config.hiddenSections.includes(key)?"none":"";element.style.order=String(config.sectionOrder.indexOf(key))}},[context,moduleKey,targets]);
  if(!context||!moduleKey)return null;const labels=context.preferences.moduleWorkspaces[moduleKey].sectionLabels??{};return <>{Object.entries(targets).map(([key,target])=>createPortal(<div className="absolute right-2 top-2 z-30" data-workspace-control="true"><WorkspaceSectionMenu label={labels[key]??target.dataset.workspaceLabel??key} moduleKey={moduleKey} sectionKey={key}/></div>,target,`global-layout-${moduleKey}-${key}`))}</>;
}

function workspaceLabel(element:HTMLElement){return element.dataset.workspaceLabel||element.getAttribute("aria-label")||element.querySelector("h1,h2,h3,summary")?.textContent?.trim()||element.querySelector("[data-workspace-label]")?.textContent?.trim()||element.textContent?.trim().slice(0,60)||"Sección"}
function slug(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,64)}

export function usePersonalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("PersonalWorkspaceProvider no está disponible.");
  return value;
}
