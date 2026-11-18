"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CertificationStudyBoardSection } from "./CertificationStudyBoardSection";
import {
  allWrittenSubjects, certificationSources as sources, examQualifications, examSchedule,
  examTraining, examVenues, examYears, oralPractice, studyStages, trainingInstitutions,
} from "@/data/certificationSources";
import type { CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";
import type { OralSubmission, PracticalMaterials } from "@/lib/certification/certificationPhaseOne";
import { examPrepHref, readExamPrep } from "@/lib/certification/examPrepSelection";

const panel = "min-w-0 space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 py-2 text-center text-sm font-semibold text-pul-deep no-underline hover:bg-pul-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point";
const selected = "border-pul-point bg-pul-light font-bold";
const field = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point";
const title = "text-lg font-bold text-pul-deep";
const actions = "flex flex-wrap gap-2";
const columns = "grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]";

function StudyLink({ topic, returnPath, children }: { topic: string; returnPath: string; children: React.ReactNode }) {
  return <Link className={button} href={`/certification/study?${new URLSearchParams({ topic, returnTo: returnPath })}`}>{children}</Link>;
}

function Notice({ href, children = "공고 보기" }: { href: string; children?: React.ReactNode }) {
  return <a className={button} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
}

function OralExercises({ published, assessment, returnPath }: { published: OralSubmission[]; assessment?: string; returnPath: string }) {
  const questions = [...oralPractice.map((entry) => ({ ...entry, kind: "PUL 예상 질문", answerLabel: "PUL 학습용 모범답변", source_url: "" })),
    ...published.map((entry) => ({ key: entry.id, question: entry.question, answer: entry.answer,
      kind: entry.kind === "official" ? "공식 공개자료" : "응시자 복원 질문 · 회원 학습 자료",
      answerLabel: "회원 등록 답변", source_url: entry.source_url }))];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const question = questions[index % questions.length];
  return <div className={columns}>
    <section className={panel}>
      <h3 className={title}>예상 질문</h3>
      <div className="space-y-3 rounded-xl bg-pul-light/50 p-4">
        <div aria-live="polite"><p className="text-sm font-bold text-pul-point">{question.kind}</p><p className="mt-1 font-bold">{question.question}</p></div>
        {question.source_url && <Notice href={question.source_url}>확인한 출처</Notice>}
        <div className={actions}>
          <button type="button" className={button} onClick={() => {
            setIndex((current) => (current + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length);
            setRevealed(false);
          }}>문제 뽑기</button>
          <button type="button" className={button} aria-expanded={revealed} aria-controls="exam-oral-answer"
            onClick={() => setRevealed(!revealed)}>{revealed ? "답변 접기" : "답변 펼치기"}</button>
        </div>
        <div id="exam-oral-answer" hidden={!revealed} className="whitespace-pre-wrap break-words">
          <p className="font-bold">{question.answerLabel}</p><p>{question.answer || "등록된 답변이 없습니다."}</p>
        </div>
        <StudyLink topic={`oral-${question.key}`} returnPath={returnPath}>이 질문의 질문·답변</StudyLink>
      </div>
    </section>
    <section className={panel}>
      <h3 className={title}>공개 기출 자료</h3>
      {assessment && <div className={actions}><Notice href={assessment}>공식 평가·시험 안내</Notice></div>}
      {assessment === sources.practical && <Notice href={sources.oralDisclosure}>채점 열람·비공개 안내</Notice>}
      {published.length === 0 ? <p className="text-sm text-pul-muted">등록된 공개 기출·회원 학습 자료가 없습니다.</p> :
        <ul className="divide-y divide-pul-border">{published.map((entry) => <li key={entry.id} className="space-y-2 py-3">
          <p className="text-sm font-bold text-pul-point">{entry.kind === "official" ? "공식 공개자료" : "회원 학습 자료"}</p>
          <p className="break-words font-semibold">{entry.question}</p>
          <div className={actions}>
            {entry.source_url && <Notice href={entry.source_url}>확인한 출처</Notice>}
            <StudyLink topic={`oral-${entry.id}`} returnPath={returnPath}>질문·답변과 의견 나누기</StudyLink>
          </div>
        </li>)}</ul>}
      <Link className={button} href="/certification/oral/submit">새 구술 자료 등록</Link>
    </section>
  </div>;
}

type Props = {
  studyPage: CertificationStudyPage;
  studyError: string | null;
  courseKey?: string;
  courseHasMap?: boolean;
  courseMaterials?: PracticalMaterials;
  materialsError: boolean;
  universityKeys: Record<string, string>;
  oral: OralSubmission[];
  oralError: boolean;
};

export function CertificationExamPrepTab({ studyPage, studyError, courseKey, courseHasMap, courseMaterials, materialsError, universityKeys, oral, oralError }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const state = readExamPrep(params);
  const { qualification, grade, year, stage, written, subject, question, practical, date, venue, course } = state;
  const href = (changes: Record<string, string>) => examPrepHref(state, changes);
  const current = href({});
  const update = (changes: Record<string, string>) => router.replace(href(changes), { scroll: false });
  const yearSelect = <label className="block max-w-48 text-sm font-semibold">연도
    <select aria-label="연도" className={field} value={year} onChange={(event) => update({ year: event.target.value })}>
      {examYears.map((value) => <option key={value} value={value}>{value}년</option>)}
    </select>
  </label>;
  const subjectOptions = [...written.required, ...written.optional];
  const writtenTopic = `written-2026-${subject}-${question}`;
  const training = examTraining[year]?.[state.key];
  const courseRoot = courseKey && `/courses/${encodeURIComponent(courseKey)}`;
  const courseReturn = new URLSearchParams({ returnTo: current });
  const materialRoot = courseRoot && `${courseRoot}/resources`;

  return <div className="space-y-4">
    <section className={panel} aria-label="시험 준비 선택">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-pul-deep sm:text-2xl">파크골프 국가자격 시험 준비</h2>
        <Notice href={examSchedule(state.key)}>공식 일정·접수</Notice>
      </div>
      <nav aria-label="자격" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {Object.entries(examQualifications).map(([key, label]) => <Link key={key} scroll={false}
          href={href({ qualification: key, grade: key === qualification ? grade : "2" })}
          aria-current={key === qualification ? "true" : undefined}
          className={`${button} break-keep ${key === qualification ? selected : ""}`}>{label}</Link>)}
      </nav>
      {grade && <nav aria-label="급수" className={actions}>
        {["2", "1"].map((key) => <Link key={key} scroll={false} href={href({ grade: key })}
          aria-current={key === grade ? "true" : undefined} className={`${button} min-w-16 ${key === grade ? selected : ""}`}>{key}급</Link>)}
      </nav>}
      <nav aria-label="시험 단계" className="grid grid-cols-4 gap-1 rounded-xl bg-pul-page p-1">
        {studyStages.map(([key, label]) => <Link key={key} scroll={false} href={href({ stage: key })}
          aria-current={key === stage ? "true" : undefined}
          className={`${button} px-1 ${key === stage ? "border-pul-point !bg-pul-point !font-bold !text-white" : "border-transparent"}`}>{label}</Link>)}
      </nav>
    </section>

    {stage === "written" && <div className={columns}>
      <section className={panel}>
        <h3 className={title}>기출문제</h3>
        <p className="text-sm text-pul-muted">{grade && `${grade}급 `}{examQualifications[qualification]} · {written.required.length ? `필수 ${written.required.length}과목` : ""}
          {written.choose ? `${written.required.length ? " · " : ""}${written.optional.length}과목 중 ${written.choose}과목 선택` : ""}</p>
        {year !== "2026" && yearSelect}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(4.5rem,0.38fr)] gap-3">
          <label className="text-sm font-semibold">과목<select aria-label="과목" className={field} value={subject} onChange={(e) => update({ subject: e.target.value, question: "1" })}>
            {subjectOptions.map((key) => <option key={key} value={key}>{allWrittenSubjects.find(([value]) => value === key)?.[1]}{written.required.includes(key) ? " (필수)" : ""}</option>)}
          </select></label>
          <label className="text-sm font-semibold">문항<select aria-label="문항" className={field} value={question} onChange={(e) => update({ question: e.target.value })}>
            {Array.from({ length: 20 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
          </select></label>
        </div>
        {year === "2026" ? <>
          <p className="text-sm text-pul-muted">2026년 4월 18일 시행 · 공단에서 응시한 시험의 문제와 정답을 확인할 수 있습니다.</p>
          <div className={actions}><Notice href={sources.writtenProblem}>공식 문제지</Notice>
            <Notice href={sources.writtenAnswer}>공식 최종정답</Notice><Notice href={sources.writtenNotice} /></div>
          <p className="rounded-lg bg-pul-light/40 p-3 text-sm leading-6">문항 원문은 응시자 열람 자료입니다. 원문을 옮겨 적지 말고 문항 번호와 풀이·요지만 나눠 주세요.</p>
        </> : <p className="text-sm text-pul-muted">{year}년 필기 자료가 공지되면 표시됩니다.</p>}
      </section>
      <section className={panel}>
        <h3 className={title}>오답·기출 등록과 의견 나누기</h3>
        <p className="text-sm text-pul-muted">틀린 문제의 풀이와 공유 가능한 기출 자료를 문항별로 나눌 수 있습니다.</p>
        <StudyLink topic={writtenTopic} returnPath={current}>{year === "2026" ? "이 문항의 질문·답변" : "2026년 이 문항의 질문·답변"}</StudyLink>
      </section>
    </div>}

    {stage === "practical" && <div className={columns}>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={title}>시험 구장과 일정</h3>
          {practical && <Notice href={practical.notice} />}</div>
        {yearSelect}
        {practical && date && venue ? <>
          <p className="text-sm text-pul-muted">{year}년 하계 · {practical.issuer}</p>
          <h4 className="font-bold">{examVenues[venue].name}</h4>
          <p className="text-sm text-pul-muted">{examVenues[venue].address}</p>
          <label className="block max-w-60 text-sm font-semibold">시험일<select aria-label="시험일" className={field} value={date.date}
            onChange={(e) => update({ examDate: e.target.value })}>
            {practical.dates.map(({ date }) => <option key={date}>{date}</option>)}
          </select></label>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-pul-page p-3 text-sm">
            <div><dt className="text-pul-muted">시험 코스</dt><dd className="font-bold">{practical.courses.length ? `${practical.courses.join("·")}코스` : "공고 확인"}</dd></div>
            <div><dt className="text-pul-muted">합격 기준</dt><dd className="font-bold">{practical.score}</dd></div>
            <div className="col-span-2"><dt className="text-pul-muted">연습 가능일</dt><dd className="font-bold">{date.practice}{date.extra && ` · 추가 ${date.extra}`}</dd></div>
          </dl>
          <p className="text-sm text-pul-muted">개인별 시험일·시간·코스 배정은 수험표와 공고에서 확인하세요.</p>
          <div className={actions}>
            {venue === "hancheon" && <><Notice href={sources.practice}>2차 연습 공고 보기</Notice>
              <Notice href={sources.extraPractice}>3차 연습 공고 보기</Notice></>}
            <StudyLink topic={`practical-${venue}`} returnPath={current}>구장 질문·후기</StudyLink>
          </div>
        </> : <p className="text-sm text-pul-muted">{year}년 실기 일정이 공지되면 표시됩니다.</p>}
      </section>
      {practical && venue && <section className={panel}>
        <h3 className={title}>코스 자료</h3>
        {practical.courses.length > 0 && <label className="block max-w-48 text-sm font-semibold">자료 볼 코스
          <select aria-label="자료 볼 코스" className={field} value={course} onChange={(e) => update({ course: e.target.value })}>
            {practical.courses.map((value) => <option key={value} value={value}>{value}코스</option>)}
          </select>
        </label>}
        {courseRoot && materialRoot ? <>
          <div className={actions}>
            <Link className={button} href={`${courseRoot}?${courseReturn}`}>구장 상세 보기</Link>
            {courseHasMap && <Link className={button} href={`${courseRoot}?${new URLSearchParams({ returnTo: current, map: "1" })}#course-map`}>구장 위치 지도</Link>}
            {practical.mapNotice && <Notice href={practical.mapNotice}>협회 코스 안내도</Notice>}
            <Link className={button} href={`${materialRoot}?${courseReturn}`}>코스 자료 전체 보기</Link>
            <Link className={button} href={`${materialRoot}/new?${courseReturn}`}>코스 자료 올리기</Link>
          </div>
          <div className={actions}>{([["video", "홀별 공략·영상"], ["yardage", "야디지북"]] as const).map(([kind, label]) =>
            <Link key={kind} className={button} href={`${materialRoot}?${new URLSearchParams({ returnTo: current, kind })}`}>{label} 목록</Link>)}</div>
          {materialsError ? <p role="alert" className="text-sm text-pul-muted">코스 자료를 불러오지 못했습니다.</p> :
            courseMaterials?.length ? <ul className="divide-y divide-pul-border rounded-lg border border-pul-border px-3">
              {courseMaterials.map((item) => <li key={item.id}>
                <Link prefetch={false} className="block min-h-11 break-words py-2 text-sm font-semibold text-pul-deep no-underline focus-visible:outline-2 focus-visible:outline-pul-point"
                  href={`${materialRoot}/${encodeURIComponent(item.id)}?${new URLSearchParams({ returnTo: current, materialsReturn: `${materialRoot}?${new URLSearchParams({ returnTo: current, kind: item.kind })}` })}`}>
                  <span className="block text-xs font-normal text-pul-muted">{item.kind === "video" ? "영상" : "야디지북"} · {item.scope}</span>
                  {item.title}
                </Link>
              </li>)}
            </ul> : <p className="text-sm text-pul-muted">표시할 공개 코스 자료가 없습니다.</p>}
        </> : <div className={actions}>
          <Notice href={practical.mapNotice ?? practical.notice}>{practical.mapNotice ? "협회 코스 안내도" : "공고 보기"}</Notice>
          <Link className={button} href={`/courses?${new URLSearchParams({ type: "field", q: examVenues[venue].keyword })}`}>PUL 구장 검색</Link>
        </div>}
      </section>}
    </div>}

    {stage === "oral" && <>
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={title}>구술 시험장과 일정</h3>
          {practical?.oral && <Notice href={practical.oral.notice} />}</div>
        {yearSelect}
        {practical?.oral ? <p className="text-sm">{practical.oral.place} · {practical.oral.schedule}</p> :
          <p className="text-sm text-pul-muted">{year}년 구술 일정이 공지되면 표시됩니다.</p>}
        {oralError && <p role="alert">회원 구술 자료를 불러오지 못했습니다.</p>}
      </section>
      <OralExercises published={oral} assessment={practical?.notice} returnPath={current} />
    </>}

    {stage === "training" && <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className={title}>연수 일정</h3>
        {training && <Notice href={training.url} />}</div>
      {yearSelect}
      {training ? <dl className="grid gap-3 rounded-lg bg-pul-page p-3 text-sm sm:grid-cols-2">
        {([["연수기관", training.name], ["장소", training.place], ["등록 기간", training.registration], ["일정", training.dates]]).map(([label, info]) =>
          <div key={label}><dt className="text-pul-muted">{label}</dt><dd className="font-semibold">{info}</dd></div>)}
      </dl> : <p className="text-sm text-pul-muted">{year}년 연수 일정이 공지되면 표시됩니다.</p>}
      {year === "2026" && state.key === "life2" && <div className={actions}>
        {trainingInstitutions.map((institution) => <div key={institution.key} className={actions}>
          <StudyLink topic={`training-${institution.key}`} returnPath={current}>{institution.name} 질문·후기</StudyLink>
          {universityKeys[institution.key] && <Link className={button}
            href={`/lessons/university-departments/${encodeURIComponent(universityKeys[institution.key])}`}>{institution.name} 대학 정보</Link>}
          <Notice href={institution.url}>{institution.name} 공고 보기</Notice>
        </div>)}
      </div>}
    </section>}

    <CertificationStudyBoardSection page={studyPage} error={studyError} returnPath={current} />
  </div>;
}
