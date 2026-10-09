"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Bus, Car, Copy, X } from "lucide-react";
import { CourseKakaoMap, CourseKakaoNavi } from "./CourseKakao";
import {
  courseDirectionLinks, courseDirectionsNote, courseSearchAddress,
  nearbyCategories, nearbySearchHref, naverWebSearch,
  type CourseDestination, type NearbyCategory, type TravelMode,
} from "@/lib/courses/courseDirections";

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

export function CourseAddressCopy({ address, name }: { address: string; name?: string }) {
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
      <button type="button" onClick={() => void copy()} className={action + " shrink-0 text-sm"} aria-label="구장 주소 복사"><Copy size={16} aria-hidden="true" />{name ? "복사" : "주소 복사"}</button>
    </div>
    <p role="status" className="mt-1 break-words text-sm text-pul-muted">{notice}</p>
    {failed ? <input aria-label="직접 복사할 주소" readOnly value={address} onFocus={e => e.currentTarget.select()} className="mt-2 min-h-11 w-full rounded border border-pul-border p-2 text-sm" /> : null}
  </div>;
}

export function CourseDirections({ course }: { course: CourseDestination }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const closingBack = useRef(false);
  const reopen = useRef<{ mode: TravelMode; button: HTMLButtonElement } | null>(null);
  const [mode, setMode] = useState<TravelMode | null>(null);
  const [origin, setOrigin] = useState("");
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [naviNotice, setNaviNotice] = useState("");
  const mobile = useSyncExternalStore(subscribeMobile, mobileSnapshot, desktopSnapshot);
  const id = useId();
  const links = courseDirectionLinks(course, mode ?? "car", origin);
  const mapLinks = courseDirectionLinks(course, "car");
  const naverWeb = naverWebSearch(courseSearchAddress(course), mobile);

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

  const naverHref = links.naverApp ?? links.naverPlace ?? links.naverSearch ?? naverWeb;
  const naverHint = links.naverApp ? mode === "car" ? "목적지 전달" : "대중교통 경로"
    : links.naverPlace ? "위치 확인" : "구장 검색";

  return <section className="min-w-0 rounded-xl border border-pul-border bg-white p-4 sm:p-6" aria-label="오시는 길">
    <h2 className="text-xl font-bold text-pul-deep">오시는 길</h2>
    <CourseKakaoMap course={course} href={mapLinks.kakaoWeb.replace("/link/to/", "/link/map/")} />
    <div className="mt-4"><CourseAddressCopy address={course.address} name={course.name} /></div>
    <p className="mt-2 break-words text-sm leading-6 text-pul-muted">{courseDirectionsNote(course)}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button type="button" className={action + " bg-white text-pul-deep"} onClick={e => open("transit", e.currentTarget)} aria-haspopup="dialog"><Bus size={20} aria-hidden="true" />대중교통</button>
      <button type="button" className={action + " whitespace-nowrap max-[390px]:px-2 bg-pul-point text-white"} onClick={e => open("car", e.currentTarget)} aria-haspopup="dialog"><Car size={20} aria-hidden="true" />내비게이션</button>
    </div>
    <div className="mt-4 border-t border-pul-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-pul-deep">구장 주변 시설</h3><span className="text-xs text-pul-muted">네이버 웹 ↗</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 min-[701px]:grid-cols-6">
        {nearbyCategories.map(value => <a key={value} href={nearbySearchHref(course, value, mobile)} target="_blank" rel="noopener noreferrer" aria-current={category === value ? "true" : undefined} onClick={() => setCategory(value)} className={action + " min-w-0 whitespace-nowrap px-2 text-sm text-pul-deep"}>{value}</a>)}
      </div>
      <p className="mt-2 text-xs leading-5 text-pul-muted">구장 지역 검색 · 구장 기준 반경·거리순 및 영업·진료 여부는 보장하지 않습니다.</p>
    </div>
    <dialog ref={dialog} aria-labelledby={id + "-title"} aria-describedby={id + "-note"} onCancel={e => { e.preventDefault(); close(); }} onClick={e => {
      if (e.target !== e.currentTarget) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) close();
    }} className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)_+_5.5rem)] top-auto m-0 mx-auto max-h-[calc(100dvh_-_7rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-4 text-foreground shadow-xl backdrop:bg-black/40 min-[701px]:inset-0 min-[701px]:m-auto min-[701px]:max-h-[85dvh]">
      <div className="flex items-center justify-between gap-3"><h2 ref={title} tabIndex={-1} id={id + "-title"} className="min-w-0 text-xl font-bold">{mode === "transit" ? "대중교통" : "내비게이션"}</h2><button type="button" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-pul-border" aria-label="앱 선택 닫기" onClick={close}><X size={20} aria-hidden="true" /></button></div>
      <p className="mt-3 break-words font-bold">{course.name}</p>
      <p id={id + "-note"} className="mt-2 break-words text-sm leading-6 text-pul-muted">{courseDirectionsNote(course, mode ?? "car")}</p>
      <div className={"mt-4 grid gap-2 " + (mobile && mode === "car" ? "grid-cols-3" : "grid-cols-2")}>
        {mobile && mode === "car" ? <>
          <button type="button" disabled className={provider + " text-pul-muted"}><span className="whitespace-nowrap">티맵</span><span className="text-xs font-normal">준비 중</span></button>
          <CourseKakaoNavi course={course} className={provider} onNotice={setNaviNotice} />
        </> : null}
        <a className={provider} href={mobile ? naverHref : naverWeb} target={mobile && naverHref.startsWith("nmap:") ? undefined : "_blank"} rel="noopener noreferrer"><span className="whitespace-nowrap">네이버지도</span><span className="text-xs font-normal">{mobile ? naverHint : "웹 검색"}</span></a>
        {mobile && mode === "car" ? null : <a className={provider} href={mobile ? links.kakaoApp ?? links.kakaoWeb : links.kakaoWeb} target={mobile && links.kakaoApp ? undefined : "_blank"} rel="noopener noreferrer"><span className="whitespace-nowrap">카카오맵</span><span className="text-xs font-normal">{mobile && links.kakaoApp ? "위치 확인" : "웹 보기"}</span></a>}
      </div>
      {mobile && mode === "car" && naviNotice ? <p role="status" className="mt-3 text-sm leading-6 text-pul-muted">{naviNotice}</p> : null}
      <p className="mt-3 text-sm leading-6 text-pul-muted">{mobile && mode === "transit" ? "카카오맵은 위치 확인 후 대중교통을 선택해 주세요." : "앱에서 경로를 확인하고 안내를 시작해 주세요."}</p>
      <div className="mt-4 flex flex-wrap items-start gap-2"><a href={links.kakaoWeb} target="_blank" rel="noopener noreferrer" className={action + " text-sm"}>웹 보기<ArrowUpRight size={16} aria-hidden="true" /></a><CourseAddressCopy address={course.address} /></div>
      <p className="mt-2 text-xs leading-5 text-pul-muted">앱이 열리지 않으면 웹 보기나 주소 복사를 이용하세요. 웹에서는 출발지와 이동수단을 선택해 주세요.</p>
    </dialog>
  </section>;
}
