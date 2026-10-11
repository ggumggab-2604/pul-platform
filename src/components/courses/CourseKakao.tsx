"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MapPin, LocateFixed, Plus, Minus, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  destinationKindLabels, hasVerifiedDestination, hasVehicleDestination, startCourseKakaoNavi,
  type CourseDestination, type KakaoNaviSdk, type NearbyCategory,
} from "@/lib/courses/courseDirections";
import { NearbySearchSession, nearbyCourseCenter, type CategoryService, type NearbyPlace, type NearbyState } from "@/lib/courses/courseNearby";

type Point = { getLat(): number; getLng(): number };
type MapInstance = {
  relayout(): void; setCenter(point: Point): void; getCenter(): Point; panTo(point: Point): void;
  setLevel(level: number): void; getLevel(): number; setDraggable(value: boolean): void; setZoomable(value: boolean): void;
};
type Overlay = { setMap(map: MapInstance | null): void };
type Maps = {
  load(ready: () => void): void;
  LatLng: new (latitude: number, longitude: number) => Point;
  Map: new (node: HTMLElement, options: { center: Point; level: number; scrollwheel: boolean; draggable: boolean }) => MapInstance;
  CustomOverlay: new (options: { position: Point; map: MapInstance; content: HTMLElement; yAnchor: number }) => Overlay;
  event: { addListener(map: MapInstance, event: string, callback: () => void): void; removeListener(map: MapInstance, event: string, callback: () => void): void };
  services?: { Places: new () => CategoryService; Status: { OK: string; ZERO_RESULT: string }; SortBy: { DISTANCE: string } };
};
declare global {
  interface Window {
    kakao?: { maps: Maps };
    Kakao?: KakaoNaviSdk & { init(key: string): void };
  }
}
const key = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim();
const configured = !!key && /^[a-f\d]{32}$/i.test(key);
const mapSdkSrc = "https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=" + key;
let retryScript: Promise<void> | undefined;
function retryMapSdk() {
  if (window.kakao?.maps) return Promise.resolve();
  if (retryScript) return retryScript;
  // next/script retains a failed URL in its cache. Retry only an absent SDK,
  // through one owned script; an already loaded SDK is always reused.
  const pending = new Promise<void>((resolve, reject) => {
    document.getElementById("pul-kakao-map-sdk")?.remove();
    const script = document.createElement("script");
    script.id = "pul-kakao-map-sdk-retry"; script.src = mapSdkSrc;
    const timeout = window.setTimeout(fail, 10000);
    function fail() { window.clearTimeout(timeout); script.remove(); reject(new Error("Map SDK retry failed")); }
    script.onerror = fail;
    script.onload = () => { window.clearTimeout(timeout); if (window.kakao?.maps) resolve(); else fail(); };
    document.head.append(script);
  }).catch(error => { if (retryScript === pending) retryScript = undefined; throw error; });
  return retryScript = pending;
}
let mapsReady: Promise<Maps> | undefined;
function loadMaps() {
  if (mapsReady) return mapsReady;
  const pending: Promise<Maps> = new Promise<Maps>((resolve, reject) => {
    const maps = window.kakao?.maps;
    if (!maps) { reject(new Error("Map SDK unavailable")); return; }
    const timeout = window.setTimeout(() => reject(new Error("Map SDK loading failed")), 10000);
    try { maps.load(() => { window.clearTimeout(timeout); resolve(maps); }); }
    catch { window.clearTimeout(timeout); reject(new Error("Map SDK loading failed")); }
  }).catch(error => {
    if (mapsReady === pending) mapsReady = undefined;
    throw error;
  });
  return mapsReady = pending;
}

export type CourseNearbyView = {
  category: NearbyCategory | null; attempt: number; state: NearbyState; selected: NearbyPlace | null;
  onState(state: NearbyState): void; onSelect(place: NearbyPlace, button: HTMLButtonElement): void; onClose(): void;
};
type MapProps = { course: CourseDestination; href: string; mobile: boolean; expanded: boolean; onExpanded(value: boolean): void; nearby: CourseNearbyView };
const mapButton = "flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-pul-border bg-white px-2 text-xs font-bold text-pul-deep shadow-sm";

export function CourseKakaoMap({ course, href, mobile, expanded, onExpanded, nearby }: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLElement>(null);
  const markerButtons = useRef(new Map<string, HTMLButtonElement>());
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [mapAttempt, setMapAttempt] = useState(0);
  const [touchActive, setTouchActive] = useState(false);
  const [instance, setInstance] = useState<{ maps: Maps; map: MapInstance; session: NearbySearchSession | null } | null>(null);
  const verified = hasVerifiedDestination(course);
  const canLoad = configured && verified;
  const interactive = expanded && (!mobile || touchActive);
  const { category, attempt, state, selected, onState, onSelect, onClose } = nearby;
  const center = nearbyCourseCenter(course);
  const centerLat = center?.latitude;
  const centerLng = center?.longitude;

  useEffect(() => {
    if (!canLoad || !sdkReady) return;
    let active = true;
    let courseMarker: Overlay | undefined;
    let observer: ResizeObserver | undefined;
    let cleanupCenter: (() => void) | undefined;
    const node = container.current;
    void loadMaps().then(maps => {
      if (!active || !node) return;
      const initial = new maps.LatLng(course.latitude!, course.longitude!);
      const map = new maps.Map(node, { center: initial, level: 4, scrollwheel: false, draggable: false });
      let preserved = initial, width = node.clientWidth, height = node.clientHeight, relayouting = false;
      const remember = () => { if (!relayouting && width === node.clientWidth && height === node.clientHeight) preserved = map.getCenter(); };
      maps.event.addListener(map, "center_changed", remember);
      cleanupCenter = () => maps.event.removeListener(map, "center_changed", remember);
      const content = document.createElement("span");
      content.className = "inline-flex rounded-md border-2 border-white bg-pul-deep px-2 py-1 text-xs font-bold text-white shadow-md";
      content.textContent = course.destinationKind === "parking" ? "⚑ 이용 주차장" : "⚑ 구장";
      content.setAttribute("aria-label", destinationKindLabels[course.destinationKind!] + ": " + course.name);
      courseMarker = new maps.CustomOverlay({ position: initial, map, content, yAnchor: 1 });
      observer = new ResizeObserver(() => {
        relayouting = true; map.relayout(); map.setCenter(preserved);
        width = node.clientWidth; height = node.clientHeight; relayouting = false;
      });
      observer.observe(node);
      const services = maps.services;
      const session = services ? new NearbySearchSession(new services.Places(), c => new maps.LatLng(c.latitude, c.longitude),
        { ...services.Status, DISTANCE: services.SortBy.DISTANCE }) : null;
      setInstance({ maps, map, session }); setStatus("ready");
    }).catch(() => { if (active) setStatus("failed"); });
    return () => { active = false; observer?.disconnect(); cleanupCenter?.(); courseMarker?.setMap(null); node?.replaceChildren(); };
  }, [canLoad, sdkReady, mapAttempt, course.latitude, course.longitude, course.destinationKind, course.name]);

  useEffect(() => {
    instance?.map.setDraggable(interactive);
    // SDK mouse wheel zoom is disabled. Mobile pinch belongs to the explicit map mode.
    instance?.map.setZoomable(expanded && mobile && touchActive);
  }, [instance, interactive, expanded, mobile, touchActive]);
  useEffect(() => {
    const node = container.current;
    if (!node || !instance) return;
    const wheel = (event: WheelEvent) => {
      event.stopImmediatePropagation();
      if (expanded && event.ctrlKey) {
        event.preventDefault();
        instance.map.setLevel(Math.max(1, Math.min(10, instance.map.getLevel() + (event.deltaY > 0 ? 1 : -1))));
      }
    };
    node.addEventListener("wheel", wheel, { passive: false, capture: true });
    return () => node.removeEventListener("wheel", wheel, { capture: true });
  }, [instance, expanded]);

  useEffect(() => {
    if (!category) return;
    if (centerLat === undefined || centerLng === undefined) { onState({ status: "unavailable", places: [] }); return; }
    if (!canLoad || status === "failed" || (status === "ready" && !instance?.session)) { onState({ status: "failed", places: [] }); return; }
    onState({ status: "loading", places: [] });
    if (status !== "ready" || !instance?.session) return;
    let active = true;
    void instance.session.search({ latitude: centerLat, longitude: centerLng }, category, attempt).then(places => {
      if (active) onState({ status: places.length ? "ready" : "empty", places });
    }).catch(() => { if (active) onState({ status: "failed", places: [] }); });
    return () => { active = false; };
  }, [category, attempt, instance, status, canLoad, centerLat, centerLng, onState]);

  useEffect(() => {
    if (!instance) return;
    const buttons = markerButtons.current;
    const overlays = state.places.map((place, index) => {
      const button = document.createElement("button"); button.type = "button";
      button.className = "inline-flex min-h-11 items-center gap-1 rounded-full border-2 border-pul-gold bg-white px-2 text-xs font-bold text-pul-deep shadow-md";
      const number = document.createElement("span");
      number.className = "rounded-full bg-pul-gold px-1.5 py-0.5 text-pul-deep"; number.textContent = String(index + 1);
      button.append(number, document.createTextNode(category ?? ""));
      button.setAttribute("aria-label", place.name + " 시설 정보"); button.setAttribute("aria-pressed", "false");
      button.dataset.placeId = place.id; button.onclick = () => onSelect(place, button); buttons.set(place.id, button);
      return new instance.maps.CustomOverlay({ map: instance.map, position: new instance.maps.LatLng(place.latitude, place.longitude), content: button, yAnchor: 1 });
    });
    return () => { overlays.forEach(overlay => overlay.setMap(null)); buttons.forEach(button => { button.onclick = null; }); buttons.clear(); };
  }, [instance, state.places, category, onSelect]);
  useEffect(() => {
    markerButtons.current.forEach((button, id) => { button.setAttribute("aria-pressed", String(id === selected?.id)); button.style.boxShadow = id === selected?.id ? "0 0 0 3px #0f766e" : ""; });
    if (selected) info.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected, state.places]);

  function zoom(delta: number) { if (expanded && instance) instance.map.setLevel(Math.max(1, Math.min(10, instance.map.getLevel() + delta))); }
  const label = course.destinationKind === "parking" && verified ? "이용 주차장 위치 보기" : "지도에서 위치 보기";
  return <>
    <div ref={frame} className={"relative mt-3 overflow-hidden rounded-lg border border-pul-border bg-pul-page " + (expanded ? "h-[clamp(270px,43dvh,360px)] min-[701px]:h-[clamp(300px,37vw,390px)]" : "h-24")}>
      {canLoad ? <div ref={container} role="region" aria-label="구장 지도" tabIndex={expanded ? 0 : -1} className="h-full w-full" style={{ touchAction: interactive ? "none" : "pan-y" }} onKeyDown={event => {
        if (!expanded || !instance) return;
        if (["+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
          event.preventDefault();
          if (["+", "=", "-"].includes(event.key)) zoom(event.key === "-" ? 1 : -1);
          else { const point = instance.map.getCenter(); instance.map.panTo(new instance.maps.LatLng(point.getLat() + (event.key === "ArrowUp" ? .0004 : event.key === "ArrowDown" ? -.0004 : 0), point.getLng() + (event.key === "ArrowRight" ? .0004 : event.key === "ArrowLeft" ? -.0004 : 0))); }
        }
      }} /> : null}
      {!canLoad || status === "failed" ? <a href={href} target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex items-center justify-center gap-2 bg-pul-page px-4 text-sm font-bold text-pul-deep"><MapPin size={20} aria-hidden="true" />{label}<ArrowUpRight size={16} aria-hidden="true" /></a> : null}
      {canLoad && status === "loading" ? <p role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-pul-muted">지도를 불러오는 중입니다.</p> : null}
      {expanded && status === "ready" && canLoad ? <>
        <button type="button" className={mapButton + " absolute left-3 top-3 z-10"} onClick={() => instance?.map.panTo(new instance.maps.LatLng(course.latitude!, course.longitude!))}><LocateFixed size={16} aria-hidden="true" />구장 위치로</button>
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1"><button type="button" aria-label="지도 확대" className={mapButton} onClick={() => zoom(-1)}><Plus size={20} aria-hidden="true" /></button><button type="button" aria-label="지도 축소" className={mapButton} onClick={() => zoom(1)}><Minus size={20} aria-hidden="true" /></button></div>
      </> : null}
    </div>
    <div className="mt-1 flex justify-center gap-2">
      <button type="button" aria-expanded={expanded} className={mapButton + " border-transparent shadow-none"} onClick={() => {
        if (expanded) {
          setTouchActive(false);
          if (instance) { instance.map.setLevel(4); instance.map.setCenter(new instance.maps.LatLng(course.latitude!, course.longitude!)); }
        }
        onExpanded(!expanded);
      }}>{expanded ? <>지도 접기<ChevronUp size={16} aria-hidden="true" /></> : <>지도 펼치기<ChevronDown size={16} aria-hidden="true" /></>}</button>
      {expanded && mobile && canLoad && status === "ready" ? <button type="button" aria-pressed={touchActive} className={mapButton} onClick={() => setTouchActive(!touchActive)}>{touchActive ? "페이지 스크롤" : "지도 조작"}</button> : null}
    </div>
    <p className="mt-1 text-xs leading-5 text-pul-muted">{!verified ? "구장 위치 미확인 · 주소 검색이나 주소 복사를 이용해 주세요." : status === "failed" ? "지도를 불러오지 못했습니다. " : expanded ? mobile ? touchActive ? "지도 조작 중 · 끝나면 페이지 스크롤로 전환하세요." : "지도 조작 버튼으로 이동·확대할 수 있습니다." : "드래그 이동 · Ctrl + 휠 확대 · 일반 휠은 페이지 스크롤" : "펼치면 이동·확대할 수 있습니다."}{" "}<a href={href} target="_blank" rel="noopener noreferrer" className="underline">{label} ↗</a></p>
    {canLoad && status === "failed" ? <button type="button" className={mapButton + " mt-2"} onClick={() => {
      setStatus("loading");
      void retryMapSdk().then(() => { if (active.current) { setSdkReady(true); setMapAttempt(value => value + 1); } })
        .catch(() => { if (active.current) setStatus("failed"); });
    }}>지도 다시 불러오기</button> : null}
    {selected ? <section ref={info} aria-label="선택한 시설 정보" className="relative mt-3 rounded-lg border border-pul-point bg-pul-light p-3 pr-14">
      <h4 className="break-words font-bold text-pul-deep">{selected.name}</h4><p className="mt-1 break-words text-sm leading-6">{selected.address}</p><p className="text-xs leading-5 text-pul-muted">구장 기준 직선거리 약 {selected.distanceMetres.toLocaleString()}m</p>
      <p className="mt-1 text-xs leading-5 text-pul-muted">{category === "주차장" ? "구장 이용 주차장으로 확인되지 않은 검색 결과입니다." : "영업·진료 여부와 이동 경로는 지도에서 확인해 주세요."}</p>
      <button type="button" aria-label="시설 정보 닫기" className={mapButton + " absolute right-1 top-1 border-transparent bg-transparent shadow-none"} onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </section> : null}
    {canLoad ? <Script id="pul-kakao-map-sdk" src={mapSdkSrc} strategy="afterInteractive" onReady={() => setSdkReady(true)} onLoad={() => setSdkReady(true)} onError={() => setStatus("failed")} /> : null}
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
