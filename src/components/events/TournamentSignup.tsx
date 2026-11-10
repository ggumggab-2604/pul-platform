"use client";

import Link from "next/link";
import { useActionState, useRef, useState, startTransition, type FormEvent, type ReactNode } from "react";

import { mutateTournamentSignup } from "@/app/events/signupActions";
import { comparisonBases } from "@/lib/clubs/personalBests";
import { listPublicCourses, type PublicCourse } from "@/lib/courses/courseDirectory";
import { createClient } from "@/lib/supabase/client";
import type { SignupParticipant, SignupPoll, TournamentSignup } from "@/lib/events/tournamentSignup";

const panel = "mt-4 space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-6";
const field = "mt-1 block min-h-11 w-full rounded-lg border border-pul-border px-3 py-2";
const button = "min-h-11 rounded-lg border border-pul-border px-3 py-2 font-semibold text-pul-deep hover:bg-pul-light disabled:opacity-60";
const status = { received: "접수 완료", confirmed: "참가 확정", cancelled: "취소" };
const votes = { yes: "참가", no: "불참", maybe: "미정" };
const channels = { individual: "개인", group: "단체", both: "양쪽" };

type Viewer = { eventKey: string; viewerId: string };
type FormProps = Viewer & {
  operation: string;
  values?: Record<string, string | number>;
  children?: ReactNode;
  label?: string;
};

function SignupForm({ eventKey, viewerId, operation, values, children, label }: FormProps) {
  const last = useRef<{ input: string; id: string } | null>(null);
  const [state, submit, pending] = useActionState(async (_previous: Awaited<ReturnType<typeof mutateTournamentSignup>>, form: FormData) => {
    try {
      const result = await mutateTournamentSignup(form);
      if (result.done) last.current = null;
      return result;
    } catch {
      return { error: "처리 결과를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요." };
    }
  }, {});
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget, submitter);
    const input = JSON.stringify([...form.entries()]);
    if (last.current?.input !== input) last.current = { input, id: crypto.randomUUID() };
    form.set("requestId", last.current.id);
    startTransition(() => submit(form));
  }
  return <form onSubmit={handleSubmit} className="space-y-2">
    <input type="hidden" name="eventKey" value={eventKey} />
    <input type="hidden" name="viewerId" value={viewerId} />
    <input type="hidden" name="operation" value={operation} />
    {Object.entries(values ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <fieldset disabled={pending} className="space-y-2">
      {children}
      {label && <button className={button}>{pending ? "처리 중…" : label}</button>}
    </fieldset>
    {state.error && <p role="alert" className="text-sm text-rose-700">{state.error}</p>}
    {state.done && <p role="status" className="text-sm font-semibold text-pul-point">
      {state.sent === undefined ? "저장했습니다." : state.sent > 0 ? `처리 완료 · ${state.sent}건 전달` : "처리 완료 · 새로 전달된 쪽지 0건"}
    </p>}
  </form>;
}

function Division({ divisions, value }: { divisions: string[]; value?: string | null }) {
  if (divisions.length === 1) return <p>참가 부문 · {divisions[0]}<input type="hidden" name="division" value={divisions[0]} /></p>;
  return <label className="block">참가 부문
    <select name="division" className={field} defaultValue={value ?? ""}>
      <option value="">부문 선택</option>
      {divisions.map(division => <option key={division}>{division}</option>)}
    </select>
  </label>;
}

function ClubPoll({ viewer, poll, signup }: { viewer: Viewer; poll: SignupPoll; signup: TournamentSignup }) {
  return <section className={panel} id={`poll-${poll.clubId}`}>
    <h3 className="font-bold">{poll.club} · 회원 참가 의견</h3>
    {poll.own && <p className="text-sm">내 응답 · {votes[poll.own.response]}{poll.own.submitted ? ` · 단체 접수 ${poll.own.submitted}` : ""}</p>}
    {signup.open && <SignupForm {...viewer} operation="respond" values={{ club: poll.clubId }}>
      <Division divisions={signup.divisions} value={poll.own?.division} />
      <div className="flex flex-wrap gap-2">
        {Object.entries(votes).map(([value, label]) => <button key={value} className={button} name="state" value={value}>{label}</button>)}
      </div>
    </SignupForm>}
    {poll.manager && !signup.attendanceClosed && !signup.attendanceReopened && !signup.cancelled && <SignupForm {...viewer} operation="group"
      values={{ club: poll.clubId, version: poll.version }} label="단체 참가 신청·명단 수정">
      <p className="text-sm text-pul-muted">제출할 참가 희망자를 선택하세요. 이미 제출한 회원을 해제하면 단체 접수가 취소됩니다.</p>
      <ul key={poll.version} className="divide-y divide-pul-border">
        {poll.rows?.map(row => <li key={row.id} className="py-2">
          <label className="flex min-h-11 flex-wrap items-center gap-2">
            {row.response === "yes" && (signup.open || row.submitted) &&
              <input name="member" type="checkbox" value={row.id} defaultChecked={!!row.submitted} disabled={row.status === "cancelled" && !!row.submitted} />}
            {row.name} · {votes[row.response]} {row.division && `· ${row.division}`}
            {row.submitted ? ` · ${row.status ? status[row.status] : "접수 완료"} (${row.submitted})` : row.response === "yes" ? " · 참가 희망" : ""}
          </label>
        </li>)}
      </ul>
    </SignupForm>}
  </section>;
}

function ResultForm({ viewer, row, finalized, host }: { viewer: Viewer; row: SignupParticipant; finalized: boolean; host: boolean }) {
  return <SignupForm {...viewer} operation="result" values={{ participant: row.id, version: row.version }}
    label={finalized ? "공식 성적 대조·정정 요청" : host ? "공식 타수·순위 확인" : "성적 제출"}>
    <div className="grid gap-2 sm:grid-cols-2">
      <label>타수<input className={field} name="score" type="number" min="1" max="1000" defaultValue={row.score ?? ""} required /></label>
      <label>순위<input className={field} name="place" type="number" min="1" max="1000" defaultValue={row.place ?? ""} required /></label>
    </div>
    <label className="inline-flex min-h-11 items-center gap-2"><input name="tied" type="checkbox" defaultChecked={row.tied} />공동 순위</label>
    {finalized && <label className="block">공식 결과와 다른 경우 정정 사유
      <textarea className={field} name="reason" minLength={5} maxLength={500} />
    </label>}
  </SignupForm>;
}

function Participant({ viewer, signup, row }: { viewer: Viewer; signup: TournamentSignup; row: SignupParticipant }) {
  const values = { participant: row.id, version: row.version };
  return <li className="space-y-2 py-3">
    <p className="font-semibold">{row.name} · {row.club ?? "무소속"} · {row.division ?? "부문 미지정"} · {status[row.status]} · {channels[row.channel]}</p>
    {row.score !== null && row.place !== null && <p className="text-sm">{row.official ? signup.finalized ? "공식 성적" : "개최자 확인" : "제출 성적"} · {row.tied ? "공동 " : ""}{row.place}위 · {row.score}타</p>}
    {row.attendance && <p className="text-sm">{row.attendance === "attended" ? "실제 참가" : "미출전"}</p>}
    {row.phone && <p className="text-sm text-pul-muted">{row.phone}{row.nickname && ` · ${row.nickname}`}</p>}
    {row.conflict && <p role="status" className="text-sm text-amber-900">개인·단체 접수의 소속 또는 참가 부문을 확인해 주세요.</p>}
    {signup.host && !signup.attendanceClosed && !signup.cancelled && <>
      {!signup.attendanceReopened && row.conflict && <SignupForm {...viewer} operation="resolve" values={values} label="선택한 참가 정보 사용">
        <label>접수 경로
          <select name="state" className={field} required defaultValue="">
            <option value="" disabled>소속·부문 선택</option>
            {row.sources.map(source => <option key={source.id} value={source.id}>
              {source.id === "individual" ? "개인" : "단체"} · {source.club ?? "무소속"} · {source.division}
            </option>)}
          </select>
        </label>
      </SignupForm>}
      {!signup.attendanceReopened && !!row.candidates?.length && <SignupForm {...viewer} operation="duplicate" values={values} label="중복으로 확인해 현재 접수 제외">
        <label>유지할 동일 이름·휴대전화 접수
          <select name="state" className={field} required defaultValue="">
            <option value="" disabled>유지할 접수 선택</option>
            {signup.roster.filter(other => row.candidates?.includes(other.id)).map(other =>
              <option key={other.id} value={other.id}>{other.name} · {other.guest ? "비회원" : "PUL 회원"} · {other.division} · {other.id.slice(0, 8)}</option>)}
          </select>
        </label>
      </SignupForm>}
      {!row.duplicate && (!signup.attendanceReopened || row.status !== "cancelled") && <SignupForm {...viewer} operation="roster_state" values={values} label="참가 상태 저장">
        <label>참가 상태
          <select name="state" className={field} defaultValue={row.attendance ?? row.status}>
            {!signup.attendanceReopened && <><option value="received">접수 완료</option><option value="confirmed">참가 확정</option></>}
            <option value="attended">실제 참가</option><option value="absent">미출전</option>
            {!signup.attendanceReopened && <option value="cancelled">취소</option>}
          </select>
        </label>
      </SignupForm>}
    </>}
    {signup.attendanceClosed && !signup.cancelled && row.attendance === "attended" && (signup.host || row.canEnter) &&
      <ResultForm key={row.version} viewer={viewer} row={row} finalized={signup.finalized} host={signup.host} />}
    {signup.finalized && row.own && row.attendance === "attended" && !row.clubId && signup.clubs.length > 0 &&
      <SignupForm {...viewer} operation="affiliation" values={{ participant: row.id }} label="이번 대회 소속 연결">
        <ClubSelect clubs={signup.clubs} />
      </SignupForm>}
  </li>;
}

function ClubSelect({ clubs, value, optional = false }: { clubs: { id: string; name: string }[]; value?: string | null; optional?: boolean }) {
  return <label className="block">이번 대회 참가 동호회
    <select name="club" className={field} defaultValue={value ?? ""} required={!optional}>
      <option value="">{optional ? "무소속" : "동호회 선택"}</option>
      {clubs.map(club => <option key={club.id} value={club.id}>{club.name}</option>)}
    </select>
  </label>;
}

function ChangeNotice({ viewer, signup, matchType }: { viewer: Viewer; signup: TournamentSignup; matchType: "field" | "screen" }) {
  const [kind, setKind] = useState("message");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<PublicCourse>();
  const [matches, setMatches] = useState<PublicCourse[]>([]);
  const [searchState, setSearchState] = useState("");
  async function search() {
    setSearchState("검색 중…");
    try {
      const results = await listPublicCourses(createClient(), { keyword, courseType: matchType }, 10);
      setMatches(results.items);
      setSearchState(results.items.length ? "" : "일치하는 구장이 없습니다.");
    } catch {
      setSearchState("구장을 검색하지 못했습니다.");
    }
  }
  return <SignupForm {...viewer} operation="change" values={{ version: signup.version }} label="참가 신청자에게 쪽지 보내기">
    <label className="block">안내 종류
      <select className={field} name="state" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="message">집결 시간·조 편성 등 안내</option>
        {!signup.attendanceClosed && !signup.attendanceReopened && <><option value="schedule">일정·구장 변경</option><option value="cancel">대회 취소</option></>}
      </select>
    </label>
    {kind === "schedule" && <>
      <label className="block">경기 날짜<input className={field} name="playedOn" type="date" defaultValue={signup.playedOn} required /></label>
      <label className="block">시작 시각·일정 메모 (선택)<input name="scheduleNote" className={field} defaultValue={signup.scheduleNote ?? ""} maxLength={200} /></label>
      <label className="block">등록 구장 검색<input className={field} value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      <button className={button} type="button" onClick={() => void search()}>구장 검색</button>
      {searchState && <p role="status">{searchState}</p>}
      <ul>{matches.map(course => <li key={course.courseKey}><button className={button} type="button" onClick={() => { setSelected(course); setMatches([]); }}>
        {course.name} · {course.region} {course.city}
      </button></li>)}</ul>
      <p>개최 구장 · {selected?.name ?? signup.venue}</p>
      <input type="hidden" name="venueKey" value={selected?.courseKey ?? ""} />
      <label className="block">실제 플레이 코스<input name="playedCourse" className={field} defaultValue={signup.playedCourse} maxLength={200} required /></label>
    </>}
    {kind === "cancel" && <label className="flex min-h-11 items-center gap-2"><input type="checkbox" required />대회를 취소하고 신청자에게 알립니다.</label>}
    <label className="block">안내 내용<textarea name="body" className={field} required maxLength={1000} /></label>
  </SignupForm>;
}

export function TournamentSignupPanel({ eventKey, viewerId, signup, matchType, deadlineLabel }: Viewer & {
  signup: TournamentSignup;
  matchType: "field" | "screen";
  deadlineLabel: string;
}) {
  const viewer = { eventKey, viewerId };
  const own = signup.roster.find(row => row.own);
  const total = signup.roster.filter(row => row.status !== "cancelled").length;
  const attended = signup.roster.filter(row => row.attendance === "attended").length;
  return <div id="tournament-signup">
    <section className={panel}>
      <h2 className="text-xl font-bold text-pul-deep">대회 참가 신청</h2>
      <p>{signup.divisions.join(" · ")} · {signup.fee ? `${signup.fee.toLocaleString("ko-KR")}원` : "무료"} · 정원 {signup.capacity}명</p>
      <p>신청 마감 · {deadlineLabel} (한국시간)</p>
      {own && <p role="status">내 신청 · {status[own.status]} · {channels[own.channel]}</p>}
      {!signup.open && <p>{signup.cancelled ? "취소된 대회입니다." : "신청이 마감됐습니다."}</p>}
      {signup.open && !viewerId && <Link href={`/login?next=${encodeURIComponent(`/events/${eventKey}#tournament-signup`)}`}
        className="inline-flex min-h-11 items-center text-pul-point underline">로그인하고 신청</Link>}
      {signup.open && viewerId && <SignupForm {...viewer} operation="individual" label={own?.individualDivision ? "개인 신청 수정" : "개인 참가 신청"}>
        <label className="block">이름<input name="name" className={field} defaultValue={own?.name ?? signup.profile?.name ?? ""} required maxLength={100} /></label>
        <label className="block">휴대전화<input name="phone" className={field} type="tel" autoComplete="tel-national"
          defaultValue={own?.phone ?? signup.profile?.phone ?? ""} required maxLength={20} /></label>
        <ClubSelect clubs={signup.clubs} value={own?.individualClub} optional />
        <Division divisions={signup.divisions} value={own?.individualDivision} />
      </SignupForm>}
      {own?.individualDivision && own.status !== "cancelled" && !signup.cancelled && !signup.attendanceClosed && !signup.attendanceReopened &&
        <SignupForm {...viewer} operation="individual" values={{ state: "cancel" }} label="개인 접수 취소" />}
      {signup.open && signup.clubs.filter(club => club.president && (club.home || club.invited)
        && !signup.polls.some(poll => poll.clubId === club.id)).map(club =>
        <SignupForm key={club.id} {...viewer} operation="poll" values={{ club: club.id }} label={`${club.name} · 회원 참가 의견 받기`} />)}
    </section>
    {signup.polls.map(poll => <ClubPoll key={poll.clubId} viewer={viewer} poll={poll} signup={signup} />)}
    {signup.host && <section className={panel}>
      <h2 className="text-xl font-bold text-pul-deep">개최자 운영</h2>
      <p>신청 {total}명 · 실제 참가 {attended}명</p>
      {signup.finalized && <p className="font-semibold text-pul-point">공식 결과 확정 완료</p>}
      {!signup.cancelled && <>
        {signup.generalSent ? <p>일반 개최 안내 발송 완료</p> :
          <SignupForm {...viewer} operation="general" label="관심 회원·주 구장 동호회에 개최 안내 보내기" />}
        {signup.open && !!signup.inviteClubs?.length && <details>
          <summary className="cursor-pointer py-2 font-semibold">동호회 회장 초청</summary>
          <SignupForm {...viewer} operation="invite" label="선택한 회장에게 초청 보내기">
            <ClubSelect clubs={signup.inviteClubs} />
            <label className="block">초청 내용<textarea name="body" className={field} required maxLength={650} /></label>
            <label className="block">단체 혜택 (선택)<input name="benefit" className={field} maxLength={300} /></label>
            <label className="block">혜택 적용 인원·조건<input name="terms" className={field} maxLength={300} /></label>
            <label className="block">혜택 마감일<input name="expires" className={field} type="date" /></label>
          </SignupForm>
        </details>}
        <details>
          <summary className="cursor-pointer py-2 font-semibold">참가자 안내 및 대회 변경</summary>
          <ChangeNotice viewer={viewer} signup={signup} matchType={matchType} />
        </details>
        {!signup.open && <SignupForm {...viewer} operation="roster" label="동호회별 신청 명단 보내기" />}
        {signup.attendanceClosed ? <SignupForm {...viewer} operation="actual" label="동호회별 실제 참가 명단 보내기" /> :
          !signup.open && <SignupForm {...viewer} operation="attendance_close" label="출전 확인 마치기" />}
        {signup.attendanceReopened && <p role="status">출전 확인을 다시 열었습니다. 명단을 수정한 뒤 출전 확인을 마쳐 주세요.</p>}
        {signup.attendanceClosed && !signup.finalized && <>
          <SignupForm {...viewer} operation="attendance_reopen" values={{ reviewToken: signup.reviewToken ?? "" }} label="출전 확인 다시 열기" />
          <SignupForm {...viewer} operation="finalize" values={{ reviewToken: signup.reviewToken ?? "" }} label="대회 공식 결과 확정">
            {matchType === "field" && <label className="block">최저타 비교 경기 기준
              <select className={field} name="comparisonBasis" defaultValue="unconfirmed">
                {Object.entries(comparisonBases).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <span className="text-sm text-pul-muted">실제 야외 18홀 단일 라운드로 확인한 성적만 전국 타수 순위에 반영됩니다.</span>
            </label>}
          </SignupForm>
        </>}
      </>}
    </section>}
    {signup.roster.length > 0 && <section className={panel}>
      <h2 className="text-xl font-bold text-pul-deep">{signup.host ? "통합 참가자 명단" : "확인 가능한 참가 정보"}</h2>
      <ul className="divide-y divide-pul-border">{signup.roster.map(row =>
        <Participant key={row.id} viewer={viewer} signup={signup} row={row} />)}</ul>
    </section>}
    {signup.affiliations.length > 0 && <section className={panel}>
      <h2 className="text-xl font-bold text-pul-deep">승인 대기(동호회 확인)</h2>
      {signup.affiliations.map(row => <SignupForm key={`${row.id}-${row.clubId}`} {...viewer} operation="affiliation"
        values={{ participant: row.id, club: row.clubId }} label={`${row.club} 소속 연결`}>
        <p>{row.name} · {row.division} · {row.place}위 · {row.score}타</p>
      </SignupForm>)}
    </section>}
  </div>;
}
