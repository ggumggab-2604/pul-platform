"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CertificationStudyBoardSection } from "./CertificationStudyBoardSection";
import {
  certificationSources as sources, hancheon, oralPractice, practicalDates, studyStages,
  trainingInstitutions, writtenSubjects,
} from "@/data/certificationSources";
import type { CertificationStudyPage } from "@/lib/certification/certificationStudyPosts";
import type { OralSubmission, PracticalMaterials } from "@/lib/certification/certificationPhaseOne";

const panel = "space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-6";
const link = "inline-flex min-h-11 items-center font-semibold text-pul-point underline underline-offset-2";
const field = "mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white px-2";
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-3 font-bold";

function StudyLink({ topic, returnPath, children }: { topic: string; returnPath: string; children: React.ReactNode }) {
  return <Link className={link} href={`/certification/study?${new URLSearchParams({ topic, returnTo: returnPath })}`}>{children}</Link>;
}

function OralExercises({ published, returnPath }: { published: OralSubmission[]; returnPath: string }) {
  const questions = [...oralPractice.map((entry) => ({ ...entry, kind: "학습용 연습 질문", answerLabel: "PUL 학습용 모범답변", source_url: "" })),
    ...published.map((entry) => ({ key: entry.id, question: entry.question, answer: entry.answer,
      kind: entry.kind === "official" ? "공식 공개자료" : "응시자 복원 질문", answerLabel: "회원 등록 답변", source_url: entry.source_url }))];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const question = questions[index % questions.length];

  return <>
    <h3 className="text-lg font-bold">구술 연습</h3>
    <p>2026년 파크골프 구술의 평가 범위는 협회 공고에서 확인할 수 있습니다. 실제 검정 문제지와 채점지는 비공개입니다.</p>
    <a className={link} href={sources.practical}>협회 구술 평가 범위</a>
    <a className={`${link} ml-4`} href={sources.oralDisclosure}>채점 열람·비공개 안내</a>
    <div className="space-y-3 rounded-xl bg-pul-light/40 p-4">
      <div aria-live="polite"><p className="text-sm font-bold text-pul-point">{question.kind}</p>
        <p className="mt-1 font-bold">{question.question}</p></div>
      {question.source_url && <a className={link} href={question.source_url}>확인한 출처</a>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => {
          setIndex((current) => (current + 1 + Math.floor(Math.random() * (questions.length - 1))) % questions.length);
          setRevealed(false);
        }}>문제 뽑기</button>
        <button type="button" className={button} aria-expanded={revealed} onClick={() => setRevealed(!revealed)}>{revealed ? "답변 접기" : "답변 펼치기"}</button>
      </div>
      {revealed && <div className="whitespace-pre-wrap break-words"><p className="font-bold">{question.answerLabel}</p><p>{question.answer || "등록된 답변이 없습니다."}</p></div>}
      <StudyLink topic={`oral-${question.key}`} returnPath={returnPath}>이 질문의 질문·답변</StudyLink>
    </div>
    <Link className={link} href="/certification/oral/submit">새 구술 자료 등록</Link>
  </>;
}

type Props = {
  studyPage: CertificationStudyPage;
  studyError: string | null;
  returnPath: string;
  courseKey?: string;
  courseMaterials?: PracticalMaterials;
  universityKeys: Record<string, string>;
  oral: OralSubmission[];
  oralError: boolean;
};

export function CertificationExamPrepTab({ studyPage, studyError, returnPath, courseKey, courseMaterials, universityKeys, oral, oralError }: Props) {
  const params = useSearchParams();
  const router = useRouter();
  const stage = studyStages.find(([key]) => key === params.get("stage"))?.[0] ?? "written";
  const subject = writtenSubjects.find(([key]) => key === params.get("subject"))?.[0] ?? writtenSubjects[0][0];
  const number = Array.from({ length: 20 }, (_, i) => String(i + 1)).find((n) => n === params.get("question")) ?? "1";
  const examDate = practicalDates.find((entry) => entry.date === params.get("examDate")) ?? practicalDates[0];
  const course = params.get("course") === "B" ? "B" : "A";
  function href(changes: Record<string, string>) {
    const query = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ tab: "exam-prep", ...changes })) query.set(key, value);
    return `/certification?${query}`;
  }
  const practicalReturn = href({ stage: "practical", examDate: examDate.date, venue: hancheon.key, course });
  const courseHref = courseKey && `/courses/${encodeURIComponent(courseKey)}`;
  const courseQuery = new URLSearchParams({ returnTo: practicalReturn });
  const materialLinks = [["video", "홀별 공략 영상"], ["yardage", "야디지북"]] as const;
  return (
    <div className="space-y-4">
      <section className={panel}>
        <h2 className="text-xl font-bold text-pul-deep">2급 생활스포츠지도사 · 파크골프</h2>
        <div className="flex flex-wrap gap-x-4 text-sm">
          <a className={link} href={sources.national}>2급 자격 안내</a>
          <a className={link} href={sources.schedule}>연간 일정</a>
          <a className={link} href={sources.firstLevel}>1급 생활</a>
          <a className={link} href={sources.disabled}>2급 장애인</a>
          <a className={link} href={sources.notices}>다른 등급·유형의 공고</a>
        </div>
        <nav aria-label="시험 단계" className="grid grid-cols-4 gap-1">
          {studyStages.map(([key, label]) => <Link key={key} href={href({ stage: key })} scroll={false}
            aria-current={key === stage ? "page" : undefined}
            className={`${button} ${key === stage ? "bg-pul-point text-white" : "text-pul-deep"}`}>{label}</Link>)}
        </nav>
      </section>
      <section className={panel} aria-label={studyStages.find(([key]) => key === stage)?.[1]}>
        {stage === "written" && <>
          <h3 className="text-lg font-bold">필기 · 공식 문제지와 최종정답</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <p className="py-2">연도 <strong>2026년</strong></p><p className="py-2">회차 <strong>4월 18일 시행</strong></p>
            <label>과목<select className={field} value={subject} onChange={(e) => router.replace(href({ subject: e.target.value, question: "1" }), { scroll: false })}>
              {writtenSubjects.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>문항<select className={field} value={number} onChange={(e) => router.replace(href({ question: e.target.value }), { scroll: false })}>
              {Array.from({ length: 20 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
            </select></label>
          </div>
          <div className="flex flex-wrap gap-x-4">
            <a className={link} href={sources.writtenProblem}>공식 문제지 (공단 76번)</a>
            <a className={link} href={sources.writtenAnswer}>공식 최종정답 (공단 78번)</a>
            <a className={link} href={sources.writtenNotice}>필기 시행 공고</a>
          </div>
          <p className="rounded-lg bg-pul-light/40 p-3 text-sm leading-6">문항 원문은 응시자 열람 자료입니다. 선택한 문항과 최종정답을 대조할 수 없어 정답과 풀이 게시는 보류했습니다.</p>
          <StudyLink topic={`written-2026-${subject}-${number}`} returnPath={href({ stage: "written", subject, question: number })}>이 문항의 질문·답변</StudyLink>
        </>}
        {stage === "practical" && <>
          <h3 className="text-lg font-bold">실기 · 본시험일별 지정 구장과 연습일</h3>
          <p className="text-sm text-pul-muted">2026년 하계 종료 회차입니다. 수험표에서 실제 배정과 접수 시각을 확인하세요.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label>본시험일<select className={field} value={examDate.date} onChange={(e) => router.replace(href({ examDate: e.target.value, venue: hancheon.key, course }), { scroll: false })}>
              {practicalDates.map((entry) => <option key={entry.date}>{entry.date}</option>)}
            </select></label>
            <label className="order-first col-span-2 sm:order-none sm:col-span-1">지정 구장
              <select className={field} defaultValue={hancheon.key}><option value={hancheon.key}>{hancheon.name}</option></select>
            </label>
            <label>둘러볼 코스<select className={field} value={course} onChange={(e) => router.replace(href({ examDate: examDate.date, venue: hancheon.key, course: e.target.value }), { scroll: false })}>
              {hancheon.courses.map((key) => <option key={key} value={key}>{key}코스</option>)}
            </select></label>
          </div>
          <p><strong>지정 코스</strong> A·B코스</p>
          <p><strong>연습 가능일</strong> {examDate.practice} · 추가 {examDate.extra}</p>
          <div className="flex flex-wrap gap-x-4">
            <a className={link} href={sources.practical}>실기검정 공고</a>
            <a className={link} href={sources.practice}>2차 연습 공고</a>
            <a className={link} href={sources.extraPractice}>3차 연습 공고</a>
          </div>
          {courseHref ? <div className="flex flex-wrap gap-x-4">
            <Link className={link} href={`${courseHref}?${courseQuery}#course-map`}>구장 공용 코스 지도</Link>
            {materialLinks.map(([kind, label]) => {
              const id = courseMaterials?.[kind];
              const list = `${courseHref}/resources?${courseQuery}&kind=${kind}`;
              const detail = id && `${courseHref}/resources/${encodeURIComponent(id)}?${new URLSearchParams({
                returnTo: practicalReturn, materialsReturn: list,
              })}`;
              return <Link key={kind} className={link} href={detail || list}>
                {id ? `${course}코스 ${label}` : `구장 전체 ${label}`}
              </Link>;
            })}
          </div> : <div className="flex flex-wrap gap-x-4">
            <a className={link} href={sources.practice}>협회 코스 안내도</a>
            <Link className={link} href="/courses?type=field&q=%ED%95%9C%EC%B2%9C">PUL 구장 검색</Link>
          </div>}
          <StudyLink topic="practical-hancheon" returnPath={practicalReturn}>한천파크골프장 질문·답변·후기</StudyLink>
        </>}
        {stage === "oral" && <>
          {oralError && <p role="alert">회원 구술 자료를 불러오지 못했습니다.</p>}
          <OralExercises published={oral} returnPath={href({ stage: "oral" })} />
        </>}
        {stage === "training" && <>
          <h3 className="text-lg font-bold">연수 · 기관별 공지와 후기</h3>
          <p>2026년 일반과정 연수 등록 안내일은 7월 27일입니다. 기관별 교육일·강의실·시설은 해당 공고에서 확인하세요.</p>
          <div className="flex flex-wrap gap-x-4"><a className={link} href={sources.schedule}>연수 등록 일정</a><a className={link} href={sources.trainingProviders}>공식 지정 연수기관</a><a className={link} href={sources.training}>다른 기관 공고</a></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {trainingInstitutions.map((institution) => <article key={institution.key} className="rounded-lg border border-pul-border p-3">
              <h4 className="font-bold">{institution.name}</h4><p className="text-sm">{institution.notice} · {institution.location}</p>
              <div className="flex flex-wrap gap-x-4"><a className={link} href={institution.url}>기관별 연수 공고</a>
                {universityKeys[institution.key] && <Link className={link} href={`/lessons/university-departments/${encodeURIComponent(universityKeys[institution.key])}`}>PUL 대학 정보</Link>}
                <StudyLink topic={`training-${institution.key}`} returnPath={href({ stage: "training" })}>연수 질문·후기</StudyLink>
              </div>
            </article>)}
          </div>
        </>}
      </section>
      <CertificationStudyBoardSection page={studyPage} error={studyError} returnPath={returnPath} />
    </div>
  );
}
