"use client";
import {useEffect} from "react";
import {acquireModalScrollLock} from "./modal-scroll-lock";

export function LegacyModalScrollGuard(){useEffect(()=>{let release:(()=>void)|null=null;const synchronize=()=>{const hasLegacyModal=[...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')].some(node=>!node.hasAttribute("data-orbit-modal-overlay")&&!node.hasAttribute("data-global-search-surface"));if(hasLegacyModal&&!release)release=acquireModalScrollLock();else if(!hasLegacyModal&&release){release();release=null}};const observer=new MutationObserver(synchronize);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["aria-modal"]});synchronize();return()=>{observer.disconnect();release?.()}},[]);return null;}
