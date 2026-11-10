"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";

import { registerTournament } from "@/app/events/register/actions";
import { listPublicCourses, type PublicCourse } from "@/lib/courses/courseDirectory";
import { tournamentDivisions } from "@/lib/events/tournamentSignup";
import { createClient } from "@/lib/supabase/client";

const regions = ["서울", "경기", "인천", "강원", "충청", "전라", "경상", "제주"];
const input = "mt-1 block min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 py-2 text-base";
const button = "inline-flex min-h-11 items-center rounded-lg bg-pul-point px-4 font-bold text-white disabled:opacity-60";

export function TournamentRegistrationForm({ scope, hostKey, courseName, viewerId, requestId }: { scope: "club" | "course" | "external"; hostKey: string; courseName?: string; viewerId: string; requestId: string }) {
  const [state, action, pending] = useActionState(async (previous: Awaited<ReturnType<typeof registerTournament>>, form: FormData) => {
    try {
      return await registerTournament(previous, form);
    } catch {
      return { error: "저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요." };
    }
  }, {});
  const [matchType, setMatchType] = useState<"field" | "screen">(scope === "course" ? "screen" : "field");
  const [venue, setVenue] = useState<PublicCourse>();
  const [keyword, setKeyword] = useState("");
  const [matches, setMatches] = useState<PublicCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  async function searchVenue() {
    setSearching(true);
    setSearchError("");
    try {
      const page = await listPublicCourses(createClient(), { keyword: keyword.trim(), courseType: matchType }, 10);
      setMatches(page.items);
      if (!page.items.length) setSearchError("일치하는 구장이 없습니다.");
    } catch {
      setSearchError("구장 검색에 실패했습니다.");
    } finally {
      setSearching(false);
    }
  }
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) {
      const form = new FormData(event.currentTarget);
      startTransition(() => action(form));
    }
  }
  if (state.key) return <section role="status" className="rounded-xl border border-pul-border bg-white p-5">
    <p className="font-bold">{state.published ? "공개 대회를 등록했습니다." : "개최 신청을 접수했습니다. PUL 승인 후 공개됩니다."}</p>
    {state.published && <Link href={`/events/${encodeURIComponent(state.key)}`} className="inline-flex min-h-11 items-center text-pul-point underline">등록한 대회 보기</Link>}
  </section>;

  return <form onSubmit={handleSubmit} className="rounded-xl border border-pul-border bg-white p-4 sm:p-6">
    <p className="mb-4 text-sm text-pul-muted">{scope === "external" ? "제출한 대회는 PUL 확인 후 공개됩니다." : "저장하면 같은 대회가 대회·이벤트 목록에 바로 공개됩니다."}</p>
    <fieldset disabled={pending} className="space-y-4">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="hostKey" value={hostKey} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="viewerId" value={viewerId} />
      {scope === "course" ? <><input type="hidden" name="matchType" value="screen" /><p>개최 매장 · {courseName ?? "매장 확인 필요"}</p></> :
        <label className="block">경기 종류<select name="matchType" className={input} value={matchType} disabled={searching} onChange={event => {
          setMatchType(event.target.value === "screen" ? "screen" : "field");
          setVenue(undefined);
          setMatches([]);
          setSearchError("");
        }}><option value="field">필드</option><option value="screen">스크린</option></select></label>}
      {scope !== "course" && <div>
        <label className="block">등록된 구장 검색<input className={input} value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
        <button type="button" className={`${button} mt-2`} onClick={() => void searchVenue()} disabled={searching}>구장 검색</button>
        {searchError && <p role="status" className="mt-2 text-sm">{searchError}</p>}
        <ul className="mt-2">{matches.map(course => <li key={course.courseKey}>
          <button type="button" className="min-h-11 text-left text-pul-point underline" onClick={() => { setVenue(course); setMatches([]); }}>{course.name} · {course.region} {course.city}</button>
        </li>)}</ul>
        <input type="hidden" name="venueKey" value={venue?.courseKey ?? ""} />
        {venue && <p className="my-3 text-sm">선택한 개최 구장 · {venue.name}</p>}
      </div>}
      <label className="block">대회명<input className={input} name="title" required minLength={2} maxLength={160} /></label>
      <label className="block">경기 날짜<input className={input} name="playedOn" type="date" required /></label>
      <label className="block">시작 시각·일정 메모 (선택)<input className={input} name="scheduleNote" maxLength={200} /></label>
      <fieldset>
        <legend>참가 부문</legend>
        <div className="flex flex-wrap gap-3">
          {tournamentDivisions.map(division => <label key={division} className="inline-flex min-h-11 items-center gap-2">
            <input type="checkbox" name="division" value={division} defaultChecked={division === "일반부"} />{division}
          </label>)}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>개인 참가비(1인, 원)<input className={input} name="individualFee" type="number" min="0" max="100000000" required defaultValue={0} /></label>
        <label>단체 참가비(1인, 원)<input className={input} name="groupFee" type="number" min="0" max="100000000" required /></label>
        <label>정원(명)<input className={input} name="capacity" type="number" min="1" max="1000" required /></label>
        <label>동호회별 인원 제한(선택)<input className={input} name="clubLimit" type="number" min="1" max="1000" placeholder="제한 없음" /></label>
        <label>동호회별 인원 집계 방식<select className={input} name="clubLimitScope" defaultValue="group">
          <option value="group">회장 단체 신청만</option>
          <option value="combined">단체와 같은 동호회 개인 신청 합산</option>
        </select></label>
      </div>
      <p className="text-sm">동호회별 인원 제한을 설정하면 모든 부문을 합산합니다.</p>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2">지역주민 요금(선택)</legend>
        <label>적용 지역<input className={input} name="residentArea" minLength={2} maxLength={80} placeholder="예: 구미시" /></label>
        <label>적용 접수 방식<select className={input} name="residentChannel" defaultValue="individual">
          <option value="individual">개인 신청</option>
          <option value="group">단체 신청</option>
          <option value="both">개인·단체 신청</option>
        </select></label>
        <label>지역주민 요금(1인, 원)<input className={input} name="residentFee" type="number" min="0" max="100000000" /></label>
      </fieldset>
      <label className="block">신청 마감일·시각(한국시간)<input className={input} name="deadline" type="datetime-local" required /></label>
      <label className="block">개최 지역<select className={input} name="region" required defaultValue="">
        <option value="" disabled>지역 선택</option>{regions.map(region => <option key={region}>{region}</option>)}
      </select></label>
      <label className="block">{matchType === "screen" ? "실제로 플레이할 스크린 코스명" : "실제로 플레이할 코스명"}
        <input className={input} name="playedCourseName" required maxLength={200} placeholder={matchType === "screen" ? "예: 한솔 코스" : "예: AB 코스"} />
      </label>
      {scope === "external" && <label className="block">주최자·단체명<input className={input} name="organizer" required minLength={2} maxLength={200} /></label>}
      <label className="block">대회 안내<textarea className={input} name="summary" required minLength={10} maxLength={3000} /></label>
      {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
      <button className={button} disabled={searching || (scope === "course" ? !courseName : !venue)}>{pending ? "저장 중…" : scope === "external" ? "개최 신청 제출" : "공개 대회 등록"}</button>
    </fieldset>
  </form>;
}
