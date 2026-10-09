"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";
import {
  destinationKindLabels, hasVerifiedDestination, hasVehicleDestination, startCourseKakaoNavi,
  type CourseDestination, type KakaoNaviSdk,
} from "@/lib/courses/courseDirections";

type Point = object;
type MapInstance = { relayout(): void; setCenter(point: Point): void };
type Marker = { setMap(map: MapInstance | null): void };
type Maps = {
  load(ready: () => void): void;
  LatLng: new (latitude: number, longitude: number) => Point;
  Map: new (node: HTMLElement, options: { center: Point; level: number; scrollwheel: boolean; draggable: boolean }) => MapInstance;
  Marker: new (options: { position: Point; map: MapInstance }) => Marker;
};
declare global {
  interface Window {
    kakao?: { maps: Maps };
    Kakao?: KakaoNaviSdk & { init(key: string): void };
  }
}
const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();
const configured = !!key && /^[a-f\d]{32}$/i.test(key);
let mapsReady: Promise<Maps> | undefined;
function loadMaps() {
  if (mapsReady) return mapsReady;
  const pending: Promise<Maps> = new Promise<Maps>((resolve, reject) => {
    const maps = window.kakao?.maps;
    if (!maps) { reject(new Error("Map SDK unavailable")); return; }
    // This watches SDK loading only; it never guesses app launch success.
    const timeout = window.setTimeout(() => reject(new Error("Map SDK loading failed")), 10000);
    try { maps.load(() => { window.clearTimeout(timeout); resolve(maps); }); }
    catch { window.clearTimeout(timeout); reject(new Error("Map SDK loading failed")); }
  }).catch(error => {
    if (mapsReady === pending) mapsReady = undefined;
    throw error;
  });
  return mapsReady = pending;
}

export function CourseKakaoMap({ course, href }: { course: CourseDestination; href: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const verified = hasVerifiedDestination(course);
  const canLoad = configured && verified;
  useEffect(() => {
    if (!canLoad || !sdkReady) return;
    let active = true;
    let marker: Marker | undefined;
    let observer: ResizeObserver | undefined;
    const node = container.current;
    void loadMaps().then(maps => {
      if (!active || !node) return;
      const center = new maps.LatLng(course.latitude!, course.longitude!);
      const map = new maps.Map(node, { center, level: 3, scrollwheel: false, draggable: false });
      marker = new maps.Marker({ position: center, map });
      observer = new ResizeObserver(() => { map.relayout(); map.setCenter(center); });
      observer.observe(node);
      setStatus("ready");
    }).catch(() => { if (active) setStatus("failed"); });
    return () => {
      active = false;
      observer?.disconnect();
      marker?.setMap(null);
      node?.replaceChildren();
    };
  }, [canLoad, sdkReady, course.latitude, course.longitude]);
  const label = course.destinationKind === "parking" && verified ? "이용 주차장 위치 보기" : "지도에서 위치 보기";
  const fallback = !canLoad || status === "failed";
  return <>
    <div className="relative mt-3 h-24 overflow-hidden rounded-lg border border-pul-border bg-pul-page">
      {canLoad ? <div ref={container} role="region" aria-label={destinationKindLabels[course.destinationKind!] + ": " + course.name} className="h-full w-full" /> : null}
      {fallback ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex items-center justify-center gap-2 bg-pul-page px-4 text-sm font-bold text-pul-deep"><MapPin size={20} aria-hidden="true" />{label}<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
      {canLoad && status === "loading" ? <p role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-pul-muted">지도를 불러오는 중입니다.</p> : null}
    </div>
    <p className="mt-1 text-xs leading-5 text-pul-muted">{status === "failed" ? "지도를 불러오지 못했습니다. " : ""}<a href={href} target="_blank" rel="noopener noreferrer" className="underline">{label} ↗</a></p>
    {canLoad ? <Script id="pul-kakao-map-sdk" src={"https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=" + key} strategy="afterInteractive" onReady={() => setSdkReady(true)} onLoad={() => setSdkReady(true)} onError={() => setStatus("failed")} /> : null}
  </>;
}

export function CourseKakaoNavi({ course, className, onNotice }: { course: CourseDestination; className: string; onNotice: (notice: string) => void }) {
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const verified = hasVehicleDestination(course);
  function initialize() {
    if (!active.current) return;
    try {
      if (!window.Kakao) throw new Error("Navi SDK unavailable");
      if (!window.Kakao.isInitialized()) window.Kakao.init(key!);
      if (!window.Kakao.isInitialized()) throw new Error("Navi initialization failed");
      setStatus("ready");
    } catch { setStatus("failed"); onNotice("카카오내비를 준비하지 못했습니다. 웹 보기나 주소 복사를 이용하세요."); }
  }
  function start() {
    if (!configured) { onNotice("카카오내비 설정 전입니다. 웹 보기나 주소 복사를 이용하세요."); return; }
    if (status === "failed") { onNotice("카카오내비를 불러오지 못했습니다. 웹 보기나 주소 복사를 이용하세요."); return; }
    if (status !== "ready") { onNotice("카카오내비를 준비 중입니다. 잠시 후 다시 눌러 주세요."); return; }
    onNotice("");
    try {
      if (startCourseKakaoNavi(course, window.Kakao) !== "requested") onNotice("웹 보기나 주소 복사를 이용하세요.");
    } catch { onNotice("카카오내비를 열지 못했습니다. 웹 보기나 주소 복사를 이용하세요."); }
  }
  return <>
    <button type="button" disabled={!verified} className={className + (!verified ? " text-pul-muted" : "")} onClick={start}><span className="whitespace-nowrap">카카오내비</span><span className="text-xs font-normal">{verified ? "목적지 전달" : "입구 미확인"}</span></button>
    {configured && verified ? <Script id="pul-kakao-navi-sdk" src="https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js" integrity="sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy" crossOrigin="anonymous" strategy="afterInteractive" onReady={initialize} onLoad={initialize} onError={() => { if (!active.current) return; setStatus("failed"); onNotice("카카오내비를 불러오지 못했습니다. 웹 보기나 주소 복사를 이용하세요."); }} /> : null}
  </>;
}
