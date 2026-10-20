"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Bus, Car, Copy, X } from "lucide-react";
import styles from "./detail/CourseFieldDetail.module.css";
import { CourseKakaoMap, CourseKakaoNavi, resolveCourseAddressDestination } from "./CourseKakao";
import {
  courseDirectionLinks, courseDirectionsNote,
  hasCourseCoordinates, hasVehicleDestination, hasTransitDestination, nearbyCategories, supportsMobileNavigationApps, tmapCourseNavigationHref,
  type CourseDestination, type NearbyCategory, type TravelMode,
} from "@/lib/courses/courseDirections";
import { nearbyCourseCenter, type NearbyPlace, type NearbyState } from "@/lib/courses/courseNearby";

const action = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border px-4 py-2 font-bold";
const provider = "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-pul-border px-2 py-3 text-center text-sm font-bold";
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 700px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function mobileSnapshot() { return window.matchMedia("(max-width: 700px)").matches; }
function desktopSnapshot() { return false; }
type SheetHistory = { id: string; mode: TravelMode };
function sheetHistory(): SheetHistory | null {
  const value = window.history.state?.pulCourseDirections;
  return value && typeof value.id === "string" && (value.mode === "car" || value.mode === "transit") ? value : null;
}

export function CourseAddressCopy({ address, name, buttonClassName }: { address: string; name?: string; buttonClassName?: string }) {
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setFailed(false); setNotice("주소를 복사했습니다.");
    } catch {
      setFailed(true); setNotice("주소를 선택해 직접 복사해 주세요.");
    }
  }
  return <div className="min-w-0">
    <div className={name ? "flex items-start justify-between gap-3" : ""}>
      {name ? <div className="min-w-0"><h3 className="break-words text-lg font-bold leading-7 text-pul-deep">{name}</h3><p className="mt-1 select-all break-words text-sm leading-6">{address}</p></div> : null}
      <button type="button" onClick={() => void copy()} className={buttonClassName ?? action + " shrink-0 text-sm"} aria-label="구장 주소 복사"><Copy size={16} aria-hidden="true" />{name ? "복사" : "주소 복사"}</button>
    </div>
    <p role="status" className="mt-1 break-words text-sm text-pul-muted">{notice}</p>
    {failed ? <input aria-label="직접 복사할 주소" readOnly value={address} onFocus={e => e.currentTarget.select()} className="mt-2 min-h-11 w-full rounded border border-pul-border p-2 text-sm" /> : null}
  </div>;
}

type IntegratedDirections = { expanded: boolean; hasOpened: boolean; onExpanded(value: boolean): void };

export function CourseDirections({ course, integrated }: { course: CourseDestination; integrated?: IntegratedDirections }) {
  // A changed course disposes its map, overlays, requests and sheet state together.
  return <CourseDirectionsContent key={JSON.stringify([course.name, course.address, course.latitude, course.longitude, course.destinationKind])} course={course} integrated={integrated} />;
}

function CourseDirectionsContent({ course, integrated }: { course: CourseDestination; integrated?: IntegratedDirections }) {
  const detailsTrigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const closingBack = useRef(false);
  const reopen = useRef<{ mode: TravelMode; button: HTMLButtonElement } | null>(null);
  const [mode, setMode] = useState<TravelMode | null>(null);
  const [origin, setOrigin] = useState("");
  const [resolved, setResolved] = useState<CourseDestination | null>(null);
  const [addressError, setAddressError] = useState("");
  const [addressAttempt, setAddressAttempt] = useState(0);
  const addressRequest = useRef<Promise<CourseDestination> | null>(null);
  const storedDestination: CourseDestination = hasCourseCoordinates(course)
    ? { ...course, destinationKind: course.destinationKind ?? "facility" } : course;
  const needsAddress = mode === "transit" ? !hasTransitDestination(storedDestination) : !hasVehicleDestination(storedDestination);
  const needsMapAddress = !hasVehicleDestination(storedDestination);
  const mapDestination = needsMapAddress ? resolved ?? storedDestination : storedDestination;
  const destination = needsAddress ? resolved ?? { ...course, latitude: null, longitude: null, destinationKind: null } : storedDestination;
  function retryAddress() { addressRequest.current = null; setAddressError(""); setAddressAttempt(value => value + 1); }
  useEffect(() => {
    if (!needsAddress || resolved) return;
    let active = true;
    // Start on detail entry for address-only courses. Map and routes share one result
    // across Strict Mode setup and mode changes; only an explicit retry resets it.
    const request = addressRequest.current ??= resolveCourseAddressDestination(course);
    void request.then(value => { if (active) setResolved(value); }, error => {
      if (active) setAddressError(error instanceof Error ? error.message : "주소 좌표를 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [mode, needsAddress, resolved, course, addressAttempt]);
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [mapExpanded, setExpanded] = useState(false);
  const expanded = integrated?.expanded ?? mapExpanded;
  const [attempt, setAttempt] = useState(0);
  const [nearbyState, setNearbyState] = useState<NearbyState>({ status: "idle", places: [] });
  const [selected, setSelected] = useState<NearbyPlace | null>(null);
  const facilityTrigger = useRef<HTMLButtonElement | null>(null);
  const categoryButtons = useRef(new Map<NearbyCategory, HTMLButtonElement>());
  const nearbyGeneration = useRef(0);
  const [nearbyRevision, setNearbyRevision] = useState(0);
  const receiveNearby = useCallback((state: NearbyState) => {
    if (nearbyGeneration.current === nearbyRevision) setNearbyState(state);
  }, [nearbyRevision]);
  const selectPlace = useCallback((place: NearbyPlace, button: HTMLButtonElement) => {
    facilityTrigger.current = button; setSelected(place);
  }, []);
  const closePlace = useCallback(() => { setSelected(null); facilityTrigger.current?.focus({ preventScroll: true }); }, []);
  function invalidateNearbyRequest() {
    // Reject an old reply immediately, even before passive effect cleanup.
    nearbyGeneration.current += 1;
    setNearbyRevision(nearbyGeneration.current);
  }
  function clearNearby(restoreFocus = false) {
    const button = category ? categoryButtons.current.get(category) : null;
    invalidateNearbyRequest();
    setCategory(null); setAttempt(0); setNearbyState({ status: "idle", places: [] }); setSelected(null);
    facilityTrigger.current = null;
    if (restoreFocus) button?.focus({ preventScroll: true });
  }
  function changeExpanded(value: boolean) {
    if (!value) clearNearby();
    if (integrated) {
      integrated.onExpanded(value);
      if (!value) requestAnimationFrame(() => detailsTrigger.current?.focus({ preventScroll: true }));
    } else setExpanded(value);
  }
  const center = nearbyCourseCenter(mapDestination);
  const [naviNotice, setNaviNotice] = useState("");
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, desktopSnapshot);
  const mobileApps = mobile && supportsMobileNavigationApps(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  const id = useId();
  const links = courseDirectionLinks(destination, mode ?? "car", origin);
  const mapLinks = courseDirectionLinks(mapDestination, "car");

  useEffect(() => {
    function pop() {
      if (closingBack.current) {
        closingBack.current = false;
        const requested = reopen.current;
        reopen.current = null;
        if (requested) {
          trigger.current = requested.button;
          setOrigin(window.location.origin);
          setNaviNotice("");
          window.history.pushState({ ...window.history.state, pulCourseDirections: { id, mode: requested.mode } }, "", window.location.href);
          setMode(requested.mode);
          return;
        }
      }
      const entry = sheetHistory();
      if (entry?.id === id) setNaviNotice("");
      setMode(entry?.id === id ? entry.mode : null);
    }
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [id]);

  useEffect(() => {
    if (!mode) {
      dialog.current?.close();
      trigger.current?.focus({ preventScroll: true });
      return;
    }
    dialog.current?.showModal();
    title.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mode]);

  useEffect(() => {
    if (dialog.current?.open && !dialog.current.contains(document.activeElement)) title.current?.focus({ preventScroll: true });
  }, [mobile]);

  function open(value: TravelMode, button: HTMLButtonElement) {
    setNaviNotice("");
    // Finish the old close traversal before creating the next sheet entry.
    if (closingBack.current) { reopen.current = { mode: value, button }; return; }
    trigger.current = button;
    setOrigin(window.location.origin);
    const entry = { ...window.history.state, pulCourseDirections: { id, mode: value } };
    if (sheetHistory()?.id === id) window.history.replaceState(entry, "", window.location.href);
    else window.history.pushState(entry, "", window.location.href);
    setMode(value);
  }
  function close() {
    reopen.current = null;
    setMode(null);
    if (!closingBack.current && sheetHistory()?.id === id) {
      closingBack.current = true;
      window.history.back();
    }
  }

  const vehicleDestination = hasVehicleDestination(destination);
  const routeReady = mode === "transit" ? hasTransitDestination(destination) : vehicleDestination;
  const tmapConfigured = mobileApps && mode === "car" && !!process.env.NEXT_PUBLIC_TMAP_APP_KEY?.trim();
  const tmapHref = tmapConfigured
    ? tmapCourseNavigationHref(destination, process.env.NEXT_PUBLIC_TMAP_APP_KEY) : null;

  const routeActions = (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" className={action + " bg-white text-pul-deep"} onClick={e => open("transit", e.currentTarget)} aria-haspopup="dialog"><Bus size={20} aria-hidden="true" />대중교통</button>
      <button type="button" className={action + " whitespace-nowrap max-[390px]:px-2 bg-pul-point text-white"} onClick={e => open("car", e.currentTarget)} aria-haspopup="dialog"><Car size={20} aria-hidden="true" />내비게이션</button>
    </div>
  );
  const mapAndNearby = <>
    {(!integrated || integrated.hasOpened) ? <CourseKakaoMap addressState={needsMapAddress && !resolved ? { status: addressError ? "failed" : "loading", message: addressError, onRetry: retryAddress } : undefined} sdkAvailable={!!resolved && needsMapAddress} course={mapDestination} href={mapLinks.kakaoWeb.replace("/link/to/", "/link/map/")} mobile={mobile} expanded={expanded} onExpanded={changeExpanded}
      nearby={{ category, attempt, state: nearbyState, selected, onState: receiveNearby, onSelect: selectPlace, onClose: closePlace }} /> : null}
    {!integrated ? <div className="mt-4"><CourseAddressCopy address={course.address} name={course.name} /></div> : null}
    <p className="mt-2 break-words text-sm leading-6 text-pul-muted">{needsMapAddress && !resolved ? "" : courseDirectionsNote(mapDestination)}</p>
    {!integrated ? routeActions : null}
    <div className="mt-4 border-t border-pul-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-pul-deep">구장 주변 시설</h3><span className="text-xs text-pul-muted">같은 지도에서 보기</span>
        {category ? <button type="button" className={action + " px-3 text-sm text-pul-deep"} onClick={() => clearNearby(true)}>주변 시설 닫기</button> : null}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 min-[701px]:grid-cols-6">
        {nearbyCategories.map(value => <button type="button" key={value} ref={button => { if (button) categoryButtons.current.set(value, button); else categoryButtons.current.delete(value); }} aria-pressed={category === value} onClick={() => {
          if (category === value) { clearNearby(); return; }
          invalidateNearbyRequest();
          changeExpanded(true); setSelected(null); facilityTrigger.current = null;
          setCategory(value); setAttempt(0); setNearbyState({ status: "loading", places: [] });
        }} className={action + " min-w-0 whitespace-nowrap px-2 text-sm text-pul-deep " + (category === value ? "border-pul-point bg-pul-light" : "bg-white")}>{value}</button>)}
      </div>
      <p className="mt-2 text-xs leading-5 text-pul-muted">{needsMapAddress && !resolved ? "" : center ? "구장 기준 반경 3km · 가까운 순 최대 15곳 · 직선거리" : course.destinationKind === "parking" ? "주차장 위치만 확인되어 구장 주변 검색은 제공하지 않습니다." : "구장 위치 미확인 · 주소 검색이나 주소 복사를 이용해 주세요."}</p>
      <div className="mt-3" aria-live="polite" aria-busy={nearbyState.status === "loading"}>
        {nearbyState.status === "loading" ? <p role="status" className="text-sm text-pul-muted">{category}을(를) 불러오는 중입니다.</p> : null}
        {nearbyState.status === "empty" ? <p role="status" className="text-sm text-pul-muted">반경 3km에서 표시할 {category}이(가) 없습니다. 다른 종류를 선택해 주세요.</p> : null}
        {nearbyState.status === "failed" ? <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">주변 시설을 불러오지 못했습니다.<button type="button" className={action + " text-sm text-pul-deep"} onClick={() => { invalidateNearbyRequest(); setSelected(null); setAttempt(value => value + 1); }}>다시 시도</button></div> : null}
        {nearbyState.status === "unavailable" ? <p role="status" className="text-sm text-pul-muted">주변 검색에 사용할 구장 위치가 없습니다. 주소 검색이나 주소 복사를 이용해 주세요.</p> : null}
        {nearbyState.status === "ready" ? <div className="grid gap-2 min-[701px]:grid-cols-2">
          {nearbyState.places.map((place, index) => <button type="button" key={place.id} aria-pressed={selected?.id === place.id} data-place-id={place.id}
            className={"flex min-h-11 min-w-0 items-start gap-2 rounded-lg border p-3 text-left text-sm " + (selected?.id === place.id ? "border-pul-point bg-pul-light" : "border-pul-border bg-white")} onClick={event => selectPlace(place, event.currentTarget)}>
            <span className="shrink-0 rounded-full bg-pul-gold px-2 text-xs font-bold text-pul-deep">{index + 1}</span><span className="min-w-0"><span className="block break-words font-bold">{place.name}</span><span className="block break-words text-pul-muted">{place.address}</span><span className="block text-xs text-pul-muted">직선거리 약 {place.distanceMetres.toLocaleString()}m</span></span>
          </button>)}
        </div> : null}
      </div>
    </div>
  </>;
  return <section id={integrated ? "course-directions" : undefined} tabIndex={integrated ? -1 : undefined} className={integrated ? styles.integratedDirections : "min-w-0 rounded-xl border border-pul-border bg-white p-4 sm:p-6"} aria-label={integrated ? "위치·길찾기" : "오시는 길"}>
    <h2 className={integrated ? styles.directionsHeading : "text-xl font-bold text-pul-deep"}>{integrated ? "위치·길찾기" : "오시는 길"}</h2>
    {integrated ? <><div>{routeActions}</div><button type="button" ref={detailsTrigger} className={styles.directionsToggle} aria-expanded={expanded} aria-controls="course-directions-details" onClick={() => changeExpanded(!expanded)}>상세 지도·구장 주변 시설 <span aria-hidden="true">{expanded ? "접기 ↑" : "펼쳐보기 ↓"}</span></button></> : null}
    {integrated ? <div id="course-directions-details" className={styles.directionsDetails} hidden={!expanded}>{mapAndNearby}</div> : mapAndNearby}
    <dialog ref={dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-note"} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
      if (e.target !== e.currentTarget) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close();
    }} className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)_+_5.5rem)] top-auto m-0 mx-auto max-h-[calc(100dvh_-_7rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 text-foreground shadow-xl backdrop:bg-black/40 min-[701px]:inset-0 min-[701px]:m-auto min-[701px]:max-h-[85dvh]">
      <div className="flex items-center justify-between gap-3"><h2 ref={title} tabIndex={-1} id={id + "-title"} className="min-w-0 text-xl font-bold">{mode === "transit" ? "대중교통" : "내비게이션"}</h2><button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-pul-border" aria-label="앱 선택 닫기" onClick={close}><X size={20} aria-hidden="true" /></button></div>
      <p className="mt-3 break-words font-bold">{course.name}</p>
      <p id={id + "-note"} className="mt-2 break-words text-sm leading-6 text-pul-muted">{needsAddress && !resolved ? addressError || "구장 주소의 목적지 좌표를 확인하고 있습니다." : courseDirectionsNote(destination, mode ?? "car")}</p>
      {mode === "car" || mobileApps ? <div className={"mt-4 grid gap-2 " + (tmapConfigured ? "grid-cols-3" : "grid-cols-2")}>
        {mode === "car" ? <>
          {tmapConfigured ? tmapHref ? <a className={provider} href={tmapHref} rel="noreferrer"><span className="whitespace-nowrap">티맵</span><span className="text-xs font-normal">경로 확인</span></a>
            : <button type="button" disabled className={provider + " text-pul-muted"}><span className="whitespace-nowrap">티맵</span><span className="text-xs font-normal">좌표 확인 필요</span></button> : null}
          {mobileApps ? <CourseKakaoNavi course={destination} className={provider} onNotice={setNaviNotice} />
            : <button type="button" disabled className={provider + " text-pul-muted"}><span className="whitespace-nowrap">카카오내비</span><span className="text-xs font-normal">모바일에서 이용</span></button>}
          {mobileApps && links.naverApp ? <a className={provider} href={links.naverApp} rel="noreferrer"><span className="whitespace-nowrap">네이버지도</span><span className="text-xs font-normal">목적지 전달</span></a>
            : <button type="button" disabled className={provider + " text-pul-muted"}><span className="whitespace-nowrap">네이버지도</span><span className="text-xs font-normal">{mobileApps ? "좌표 확인 필요" : "모바일에서 이용"}</span></button>}
        </> : <>
        {mobileApps && links.naverApp ? <a className={provider} href={links.naverApp} rel="noreferrer"><span>네이버지도</span><span className="text-xs font-normal">대중교통 경로</span></a> : null}
        {mobileApps && links.kakaoApp ? <a className={provider} href={links.kakaoApp} rel="noreferrer"><span>카카오맵</span><span className="text-xs font-normal">대중교통 경로</span></a> : null}
        </>}
      </div> : null}
      {mobileApps && mode === "car" && naviNotice ? <p role="status" className="mt-3 text-sm leading-6 text-pul-muted">{naviNotice}</p> : null}
      {needsAddress && !resolved ? <div role="status" className="mt-3 text-sm text-pul-muted">
        {addressError ? <button type="button" className={action} onClick={retryAddress}>주소 좌표 다시 확인</button> : "주소 변환 중"}
      </div> : null}
      {routeReady ? <>
        <a href={links.kakaoWeb} target="_blank" rel="noopener noreferrer" className={action + " mt-3 text-sm text-pul-deep"}>카카오맵 웹 길찾기<ArrowUpRight size={14} aria-hidden="true" /></a>
        <p className="mt-3 text-sm leading-6 text-pul-muted">{mode === "transit" ? "구장을 목적지로 전달합니다. 앱의 현재 위치나 원하는 출발지를 선택해 주세요. 웹에서는 대중교통을 선택해 주세요." : mobileApps ? "앱에서 차량 경로를 확인하고 안내를 시작해 주세요." : "웹 지도에 구장을 목적지로 전달합니다. 출발지를 선택해 차량 경로를 확인해 주세요."}</p>
        {mobileApps ? <p className="mt-3 text-xs leading-5 text-pul-muted">앱이 열리지 않으면 웹 길찾기를 이용해 주세요.</p> : null}
      </> : null}
      <div className="mt-4"><CourseAddressCopy address={course.address} /></div>
    </dialog>
  </section>;
}
