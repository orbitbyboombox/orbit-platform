"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, EyeOff, GripVertical, MoreVertical } from "lucide-react";
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
  const persist=(order:string[],hidden=config.hiddenSections)=>update({...preferences,moduleWorkspaces:{...preferences.moduleWorkspaces,[moduleKey]:{sectionOrder:order,hiddenSections:hidden}}});
  const move=(offset:number)=>{const target=index+offset;if(index<0||target<0||target>=config.sectionOrder.length)return;const order=[...config.sectionOrder];[order[index],order[target]]=[order[target],order[index]];persist(order);setOpen(false)};
  return <div className="relative z-20 ml-auto w-fit"><button aria-expanded={open} aria-label={`Administrar ${label}`} className="grid size-9 place-items-center rounded-lg border bg-background/90 text-muted shadow-sm hover:border-brand hover:text-foreground" onClick={()=>setOpen(value=>!value)} type="button"><MoreVertical className="size-4"/></button>{open?<div className="absolute right-0 top-11 z-50 w-44 rounded-xl border bg-card p-1.5 shadow-xl"><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background" disabled={index<=0} onClick={()=>move(-1)} type="button"><ArrowUp className="size-4"/>Mover arriba</button><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-background" disabled={index<0||index>=config.sectionOrder.length-1} onClick={()=>move(1)} type="button"><ArrowDown className="size-4"/>Mover abajo</button><button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-background" onClick={()=>persist(config.sectionOrder,[...new Set([...config.hiddenSections,sectionKey])])} type="button"><EyeOff className="size-4"/>Ocultar sección</button></div>:null}</div>;
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
  return <div className="space-y-7">{visible.map((key) => { const section = byKey.get(key); if (!section) return null; return <section draggable key={key} onDragStart={() => setDragged(key)} onDragOver={(event) => event.preventDefault()} onDrop={() => drop(key)}>
    <div className="mb-2 flex items-center justify-end gap-2 opacity-70 transition hover:opacity-100"><span className="inline-flex items-center gap-1 text-xs text-muted"><GripVertical className="size-3.5"/>Arrastrar</span><WorkspaceSectionMenu label={section.label} moduleKey={moduleKey} sectionKey={key}/></div>
    {section.content}
  </section>; })}</div>;
}

export function DomWorkspaceControls({ moduleKey, selectors }: { moduleKey: ModuleWorkspaceKey; selectors: Record<string,string> }) {
  const { preferences, update }=usePersonalWorkspace(); const [targets,setTargets]=useState<Record<string,HTMLElement>>({}); const config=preferences.moduleWorkspaces[moduleKey];
  useEffect(()=>{const found:Record<string,HTMLElement>={};for(const[key,selector]of Object.entries(selectors)){const element=document.querySelector<HTMLElement>(selector);if(element){element.style.position="relative";found[key]=element}}setTargets(found)},[selectors]);
  useEffect(()=>{let dragged="";const cleanups:ClearEventListener[]=[];for(const[key,element]of Object.entries(targets)){element.draggable=true;element.style.order=String(config.sectionOrder.indexOf(key));element.style.display=config.hiddenSections.includes(key)?"none":"";const start=()=>{dragged=key};const over=(event:DragEvent)=>event.preventDefault();const drop=()=>{if(!dragged||dragged===key)return;const order=[...config.sectionOrder];const from=order.indexOf(dragged),to=order.indexOf(key);if(from<0||to<0)return;order.splice(to,0,order.splice(from,1)[0]);update({...preferences,moduleWorkspaces:{...preferences.moduleWorkspaces,[moduleKey]:{...config,sectionOrder:order}}});dragged=""};element.addEventListener("dragstart",start);element.addEventListener("dragover",over);element.addEventListener("drop",drop);cleanups.push(()=>{element.removeEventListener("dragstart",start);element.removeEventListener("dragover",over);element.removeEventListener("drop",drop)})}return()=>cleanups.forEach(cleanup=>cleanup())},[config,moduleKey,preferences,targets,update]);
  const labels=new Map<string,string>((MODULE_WORKSPACES[moduleKey] as readonly {key:string;label:string}[]).map(section=>[section.key,section.label]));
  return <>{Object.entries(targets).map(([key,target])=>createPortal(<div className="absolute right-3 top-3 z-20"><WorkspaceSectionMenu label={labels.get(key)??key} moduleKey={moduleKey} sectionKey={key}/></div>,target,`workspace-control-${moduleKey}-${key}`))}</>;
}

type ClearEventListener=()=>void;

export function usePersonalWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("PersonalWorkspaceProvider no está disponible.");
  return value;
}
