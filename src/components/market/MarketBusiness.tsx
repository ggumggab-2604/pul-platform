"use client";
import Link from "next/link";
import {businessHref} from "@/lib/market/marketStores";
import {StartupQa} from "./StartupQa";
import {MarketStores} from "./MarketStores";
export function MarketBusiness({search,userId}:{search:string;userId:string|null}){const stores=new URLSearchParams(search).get("business_tab")==="stores";return <div className="min-w-0 space-y-4"><nav aria-label="창업·매장매매 내부 메뉴" className="flex flex-wrap gap-2">{([["questions","질문답변"],["stores","매장매매"]] as const).map(([tab,label])=><Link key={tab} href={businessHref(search,tab)} aria-current={(tab==="stores")===stores?"page":undefined} className={"inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 text-sm font-bold "+((tab==="stores")===stores?"bg-pul-point text-white":"bg-white")}>{label}</Link>)}</nav>{stores?<MarketStores key={search+userId} search={search} userId={userId}/>:<StartupQa key={search+userId} search={search} userId={userId}/>}</div>;}
