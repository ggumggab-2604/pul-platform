"use client";
import {useEffect,useId,useRef,type ReactNode} from "react";
import {useBodyScrollLock} from "@/components/ui/InfoModal";
export const clubInput="mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base";
export const clubButton="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 py-2 text-sm font-semibold text-pul-deep hover:bg-pul-light disabled:opacity-50";
export function ClubEditorDialog({title,busy=false,onClose,children}:{title:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
 const id=useId(),panel=useRef<HTMLDivElement>(null);useBodyScrollLock(true);
 useEffect(()=>{panel.current?.querySelector<HTMLButtonElement>('button')?.focus();},[]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();onClose();}if(event.key!=='Tab')return;const nodes=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]')??[]).filter(e=>!e.closest('[hidden]'));if(!nodes.length)return;if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[busy,onClose]);
 return <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={id}><div ref={panel} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-pul-border bg-white shadow-xl"><header className="flex items-center justify-between gap-3 border-b border-pul-border p-4"><h2 id={id} className="text-xl font-bold text-pul-deep">{title}</h2><button type="button" aria-label={title+" 닫기"} disabled={busy} onClick={onClose} className={clubButton}>닫기</button></header><div className="overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div></div></div>;
}
