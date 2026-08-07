"use client";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { DEFAULT_COMPANY_SETTINGS, type CompanySettings } from "./types";
const Context=createContext<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
export function CompanySettingsProvider({settings,children}:{settings:CompanySettings;children:ReactNode}){return <Context.Provider value={settings}><div style={{"--brand":settings.accentColor} as CSSProperties}>{children}</div></Context.Provider>}
export function useCompanySettings(){return useContext(Context)}
