"use client";

import { useEffect, useRef, useState, useId } from "react";
import { courseDirectionLinks, hasCourseCoordinates, hasVerifiedDestination, hasVehicleDestination, destinationKindLabels, nearbyCategories, nearbySearchQuery, type CourseDestination, type TravelMode } from "@/lib/courses/courseDirections";

function NearbyFacilities({course}:{course:CourseDestination}) {
  const [category,setCategory]=useState<typeof nearbyCategories[number]|null>(null);
  const [mobile,setMobile]=useState(false),[origin,setOrigin]=useState("");
  const modal=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLElement|null>(null),title=useRef<HTMLHeadingElement>(null);const id=useId();
  useEffect(()=>{if(category){modal.current?.showModal();title.current?.focus();}},[category]);
  function close(){modal.current?.close();setCategory(null);trigger.current?.focus();}
  const query=category?nearbySearchQuery(course,category):"";
  const naver=`nmap://search?query=${encodeURIComponent(query)}${hasCourseCoordinates(course)?`&lat=${course.latitude}&lng=${course.longitude}`:""}&appname=${encodeURIComponent(origin)}`;
  return <div className="mt-4 border-t border-pul-border pt-4"><h3 className="font-bold text-pul-deep">주변 시설 찾기</h3><p className="mt-1 text-sm text-pul-muted">이 구장의 주소 주변을 외부 지도에서 검색합니다.</p><div className="mt-3 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">{nearbyCategories.map(c=><button key={c} className="min-h-11 rounded-lg border border-pul-border bg-white px-3 text-sm font-bold text-pul-deep" onClick={e=>{trigger.current=e.currentTarget;setOrigin(location.origin);setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);setCategory(c);}}>{c}</button>)}</div><p className="mt-2 text-xs leading-5 text-pul-muted">정확한 반경·가까운 순서·진료 및 영업 여부는 보장하지 않습니다.</p>
    {category?<dialog ref={modal} aria-labelledby={id} onCancel={e=>{e.preventDefault();close();}} className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl backdrop:bg-black/40"><div className="flex items-center justify-between gap-3"><h2 id={id} ref={title} tabIndex={-1} className="text-xl font-bold">{category} 찾기</h2><button className={action} onClick={close}>닫기</button></div><p className="my-4 rounded-lg bg-pul-light p-3 text-sm">검색어: {query}</p><div className="grid gap-3"><a className={action} href={`https://map.kakao.com/link/search/${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer">카카오맵에서 검색</a>{mobile?<a className={action} href={naver}>네이버 지도 앱에서 검색</a>:null}</div><p className="mt-4 text-sm leading-6 text-pul-muted">사용자 현재 위치가 아닌 구장 주소 기준 검색입니다. 결과의 실제 위치·이용 가능 여부를 외부 지도에서 확인해 주세요. {mobile?"앱이 열리지 않으면 카카오맵 웹 검색을 이용하세요.":""}</p></dialog>:null}
  </div>;
}

const action = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 font-bold";

export function CourseAddressCopy({ address }: { address: string }) {
  const [notice, setNotice] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(address); setNotice("주소를 복사했습니다."); }
    catch { setNotice("복사하지 못했습니다. 아래 주소를 선택해 직접 복사해 주세요."); }
  }
  return <div><button type="button" onClick={() => void copy()} className={action}>주소 복사</button><p role="status" className="mt-1 text-sm text-pul-muted">{notice}</p>{notice.includes("못") ? <input aria-label="직접 복사할 주소" readOnly value={address} onFocus={e=>e.currentTarget.select()} className="mt-2 min-h-11 w-full rounded border border-pul-border p-2 text-sm"/> : null}</div>;
}

export function CourseDirections({ course }: { course: CourseDestination }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TravelMode | null>(null);
  const [mobile, setMobile] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => { if (open) dialog.current?.showModal(); }, [open]);
  useEffect(() => { if (open) title.current?.focus(); }, [open, mode]);
  function close() { dialog.current?.close(); setOpen(false); setMode(null); trigger.current?.focus(); }
  const links = courseDirectionLinks(course, mode ?? "transit", origin);
  return <section className="rounded-xl border border-pul-border bg-white p-4 sm:p-6" aria-label="오시는 길">
    <h2 className="text-xl font-bold text-pul-deep">오시는 길</h2>
    <div className="mt-3 rounded-lg border border-dashed border-pul-border bg-pul-page p-3 text-sm"><strong>{hasVerifiedDestination(course) ? `${destinationKindLabels[course.destinationKind!]} 확인` : "구장 위치 미확인"}</strong><p className="mt-1 text-pul-muted">{hasVerifiedDestination(course) ? course.destinationKind === "parking" ? "이용 주차장까지 안내합니다. 주차 후 구장까지 별도 이동이 필요합니다." : hasVehicleDestination(course) ? "외부 지도에서 목적지와 접근 경로를 확인해 주세요." : "차량 진입점은 미확인입니다. 입구·주차장은 외부 지도에서 확인해 주세요." : "주소는 있으나 목적지 좌표가 없어 검색 결과에서 구장을 선택해야 합니다."}</p></div>
    <p className="mt-4 text-sm leading-6"><strong>{course.name}</strong><br/>{course.address}</p>
    <div className="mt-3 flex flex-wrap items-start gap-2">{(["transit","car"] as const).map(value=><button key={value} type="button" className={`${action} ${value === "transit" ? "bg-pul-point text-white" : "bg-white text-pul-deep"}`} onClick={e=>{trigger.current=e.currentTarget;setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);setOrigin(location.origin);setMode(value);setOpen(true);}}>{value === "transit" ? "대중교통" : "내비게이션"}</button>)}<CourseAddressCopy address={course.address}/></div>
    <p className="mt-3 text-xs leading-5 text-pul-muted">출발지는 외부 지도에서 확인·선택합니다. PUL은 현재 위치를 요청하지 않습니다.</p>
    <NearbyFacilities course={course}/>
    {open ? <dialog ref={dialog} aria-labelledby="course-directions-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-foreground shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-3"><h2 ref={title} tabIndex={-1} id="course-directions-title" className="text-xl font-bold">{mode ? mode === "transit" ? "대중교통 · 지도 선택" : "내비게이션 · 지도 선택" : "길찾기"}</h2><button className={action} onClick={close}>닫기</button></div>
      <p className="mt-4 font-bold">{course.name}</p><p className="mt-1 select-all break-words text-sm leading-6">{course.address}</p>
      {!mode ? <div className="mt-5 grid gap-3"><button className={action} onClick={() => setMode("transit")}>대중교통</button><button className={action} onClick={() => setMode("car")}>내비게이션</button><CourseAddressCopy address={course.address} /></div> : <div className="mt-5 space-y-3">
        <p className="text-sm leading-6 text-pul-muted">출발지는 외부 지도에서 확인해 주세요. PUL은 위치 권한을 요청하지 않습니다.</p>
        {!hasVerifiedDestination(course) ? <p className="rounded-lg bg-pul-light p-3 text-sm">구장 위치가 미확인입니다. 지도에서 주소와 구장을 검색·선택한 뒤 {mode === "transit" ? "대중교통" : "자동차"} 경로를 선택해 주세요.</p> : null}
        {course.destinationKind === "parking" ? <p className="rounded-lg bg-pul-light p-3 text-sm">전달할 목적지는 구장 이용 주차장입니다. 주차 후 구장까지 이동 방법을 확인해 주세요.</p> : null}
        {mode === "car" && hasVerifiedDestination(course) && !hasVehicleDestination(course) ? <p className="rounded-lg bg-pul-light p-3 text-sm">차량 진입점이 확인되지 않아 위치만 전달합니다. 지도에서 입구·주차장을 선택한 뒤 자동차 경로를 확인해 주세요.</p> : null}
        {mobile && links.kakaoApp ? <a href={links.kakaoApp} className={`${action} w-full`}>카카오맵 앱 · 목적지 확인 후 경로 선택</a> : null}
        {mobile && links.naverApp ? <a href={links.naverApp} className={`${action} w-full`}>네이버 지도 앱 · {mode === "transit" ? "대중교통" : "내비게이션"}</a> : null}
        {mobile && !links.naverApp && links.naverPlace ? <a href={links.naverPlace} className={`${action} w-full`}>네이버 지도 앱 · 위치 확인 후 입구 선택</a> : null}
        <a href={links.kakaoWeb} target="_blank" rel="noopener noreferrer" className={`${action} w-full`}>카카오맵 웹 · {hasVerifiedDestination(course) ? "목적지 열기" : "목적지 검색"}</a>
        {mobile && !links.naverApp && !links.naverPlace && links.naverSearch ? <a href={links.naverSearch} className={`${action} w-full`}>네이버 지도 앱 · 목적지 검색</a> : null}
        <p className="text-sm leading-6 text-pul-muted">{mobile ? "앱이 열리지 않으면 웹 지도나 주소 복사를 이용하세요. " : "PC 웹은 경로 조회이며 주행 내비게이션 실행과 다릅니다. "}웹에서는 출발지와 이동수단을 다시 선택해야 합니다. 구장 입구·주차장 위치는 외부 지도에서 확인해 주세요.</p>
        {mobile && links.naverApp ? <p className="text-sm text-pul-muted">외부 앱은 현재 위치를 기본 출발지로 제안할 수 있습니다. 앱에서 확인·변경해 주세요.</p> : null}<CourseAddressCopy address={course.address} />
      </div>}
    </dialog> : null}
  </section>;
}
