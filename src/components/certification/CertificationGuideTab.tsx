"use client";

import { CertificationExamScheduleSection } from "@/components/certification/CertificationExamScheduleSection";
import { RefereeSourceButton, refereePrimaryButton, refereeSecondaryButton } from "@/components/certification/RefereeGuideButton";
import { certificationSources as sources, refereeGrades } from "@/data/certificationSources";
import type { CertificationPage, PublicExamSchedule } from "@/lib/certification/certificationDirectory";
import { refereeBoardHref } from "@/lib/certification/refereeGuide";
import { cn } from "@/lib/utils";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

const situations = [
  {
    label: "심판을 처음 준비해요",
    heading: "처음 준비하는 분을 위한 3급 안내",
    nextAction: "자격증 취득일과 회원등록일을 적어 두고, 응시 기준일에 필요한 기간을 채우는지 확인하세요.",
    steps: [
      "인정되는 자격이 없다면 대한파크골프협회 1급 지도자 또는 파크골프 종목 생활·노인·유소년 스포츠지도사 자격부터 준비해요.",
      "회차 공고에서 접수 일정과 제출 서류를 확인해요.",
      "회차 공고의 평가표에서 검정 항목과 합격 기준을 확인해요.",
      "합격자 공고에서 연수 일정과 신청 방법을 확인해요.",
    ],
  },
  {
    label: "지도자 자격이 있어요",
    heading: "내 지도자 자격으로 3급을 준비하려면",
    nextAction: "자격증의 발급기관과 종목을 인정 자격과 대조하세요. 해당 회차 기준일에 취득 후 2년이 지났는지 계산하고, 협회 1급 지도자는 보수교육 대상과 이수 여부를 소속 협회에 확인하세요.",
    steps: [
      "발급기관·종목·취득일을 확인하고 회원 이력과 보수교육 대상 여부를 살펴봐요.",
      "회차 공고의 기준일과 취득일을 비교하고, 소속 협회에 필요한 서류를 확인해요.",
      "체력과 실기뿐 아니라 경기 규칙과 판정 상황에 대한 평가도 준비해요.",
      "합격하면 공고에 나온 방법으로 연수를 신청하고 이수해요.",
    ],
  },
  {
    label: "이미 심판 자격이 있어요",
    heading: "다음 심판 등급을 준비하려면",
    nextAction: "경력이나 활동 횟수가 부족하면 활동 기록을 정리하고 앞으로 맡을 대회·검정 업무가 실적으로 인정되는지 먼저 확인하세요.",
    steps: [
      "현재 등급과 취득일, 대회·검정에서 심판으로 활동한 기록을 모아요.",
      "목표 등급의 공고에서 인정 실적과 증빙을 확인해요. 1급·국제심판의 세부 지원 조건은 협회 확인이 필요해요.",
      "2급은 이론·구술을 준비해요. 1급·국제심판은 서류 심사와 구술 항목을 확인해요.",
      "합격 후 연수 대상과 일정을 해당 등급 공고나 소속 협회에서 확인해요.",
    ],
  },
];

const stepLabels = ["응시 자격 확인", "접수하기", "검정 준비하기", "합격 후 연수"];
const panel = "rounded-xl border border-pul-border bg-white p-4 shadow-sm sm:p-5 lg:p-6";
const sectionHeading = "text-xl font-extrabold text-pul-deep sm:text-2xl";

function Eligibility({ qualified, nextAction }: { qualified: boolean; nextAction: string }) {
  return (
    <div id="referee-eligibility" className="space-y-4 rounded-xl border border-pul-border bg-pul-page p-4 text-sm leading-6 sm:p-5">
      <h4 className="text-base font-bold text-pul-deep">협회 규정 공통 조건</h4>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-pul-border bg-white p-3">
          <h5 className="font-bold">모두 충족해야 하는 조건</h5>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>응시하는 해에 대한파크골프협회 회원이어야 해요.</li>
            <li>회원등록 이력이 1년 이상이어야 해요.</li>
            {qualified ? <>
              <li>2급 응시는 3급 취득 후 3년 이상 지나야 해요.</li>
              <li>
                아래 인정 활동에서 심판 활동이 총 4회 이상이어야 해요.
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>전국대회 또는 전국규모대회</li>
                  <li>대한파크골프협회 또는 시·도협회가 주관·주최하는 1급 지도자 자격검정, 심판 자격검정, 강사 관련 검정, 국가 체육지도자 실기 자격검정 등</li>
                </ul>
              </li>
            </> : <li>아래 두 가지 3급 응시 경로 중 하나를 충족해야 해요.</li>}
          </ul>
        </div>
        <div className="rounded-lg border border-pul-border bg-white p-3">
          {qualified ? <>
            <h5 className="font-bold">1급·국제심판 지원 조건은 협회 확인 필요</h5>
            <p className="mt-1">공개 규정에서 두 등급의 별도 지원 조건을 확인하기 어려워요. 인정되는 경력과 실적, 제출할 자료를 협회에 확인하세요.</p>
          </> : <>
            <h5 className="font-bold">둘 중 하나면 되는 조건</h5>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>대한파크골프협회 1급 지도자(종전 3급 지도자) 취득 후 2년 이상. 보수교육 대상이라면 교육도 이수해야 해요.</li>
              <li>파크골프 종목 국가 체육지도사(1·2급 생활, 노인, 유소년) 취득 후 2년 이상.</li>
            </ol>
          </>}
        </div>
      </div>
      <p className="font-medium">{nextAction}</p>
      {!qualified && (
        <div className="space-y-2 border-t border-pul-border pt-3">
          <h5 className="font-bold">지난 공고 · 2026년 3급 심판 검정</h5>
          <p>2026년 회차에서 두 경로의 인정 자격은 2024년까지 취득한 것이었어요. 공고에는 2022년에 협회 1급 지도자(종전 3급 지도자)를 취득하고 2026년 보수교육을 이수한 사례가 있어요.</p>
          <RefereeSourceButton href={sources.refereeNotice}>2026년 3급 검정 정정 공고</RefereeSourceButton>
        </div>
      )}
      <p className="text-pul-muted">다음 검정에 지원할 때는 해당 회차 공고에서 기준일·증빙·접수 방법을 확인하세요.</p>
    </div>
  );
}

export function CertificationGuideTab({ examPage, examError, today, refereeBoard, onPageChange }: {
  examPage: CertificationPage<PublicExamSchedule>;
  examError: string | null;
  today: string;
  refereeBoard: ReactNode;
  onPageChange: (page: number) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [showEligibility, setShowEligibility] = useState(false);
  const situation = situations[selected];

  return (
    <div className="space-y-4 break-keep [overflow-wrap:anywhere]">
      <section aria-labelledby="referee-guide-title" className={panel}>
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-linear-to-br from-amber-600 to-pul-point text-white sm:size-14">
            <CircleCheck aria-hidden="true" className="size-6" />
          </span>
          <h2 id="referee-guide-title" className="text-2xl font-extrabold tracking-tight text-pul-deep sm:text-3xl">파크골프 심판이 되려면</h2>
        </div>
        <p className="mt-2 text-sm text-pul-muted sm:text-base">내 상황을 선택하고 다음에 할 일을 확인하세요.</p>
        <div role="group" aria-label="내 상황 선택" className="mt-4 grid gap-2 md:grid-cols-3">
          {situations.map(({ label }, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={selected === index}
              aria-controls="referee-situation"
              onClick={() => setSelected(index)}
              className={cn("min-h-12 rounded-lg border px-3 py-2 text-left text-base font-bold md:min-h-16 md:text-center",
                selected === index ? "border-pul-point bg-pul-light text-pul-deep ring-1 ring-inset ring-pul-point" : "border-pul-border bg-white hover:bg-pul-page")}
            >
              {label}
            </button>
          ))}
        </div>
        <div id="referee-situation" className="mt-6">
          <h3 className={sectionHeading} aria-live="polite">{situation.heading}</h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {situation.steps.map((step, index) => (
              <li key={stepLabels[index]} className="grid grid-cols-[auto_1fr] items-center gap-x-2 rounded-xl border border-pul-border bg-white p-3 sm:block sm:p-4">
                <span aria-hidden="true" className="inline-grid size-8 place-items-center rounded-full bg-pul-light font-bold text-pul-deep">{index + 1}</span>
                <h4 className="font-extrabold text-pul-deep sm:mt-1.5">{stepLabels[index]}</h4>
                <div className="col-start-2 min-w-0 sm:mt-1">
                  <p className="text-sm leading-6 text-pul-muted">{step}</p>
                  {selected === 0 && index === 0 && (
                    <Link href="/certification?tab=exam-prep" className={cn(refereeSecondaryButton, "mt-2")}>
                      국가자격 시험 준비 보기
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button type="button" aria-expanded={showEligibility} aria-controls="referee-eligibility"
              onClick={() => setShowEligibility(!showEligibility)} className={refereePrimaryButton}>
              {showEligibility ? "응시 조건 닫기" : "응시 조건 자세히 보기"}
            </button>
            <Link href={refereeBoardHref("referee-eligibility")} className={refereeSecondaryButton}>응시 자격 질문하기</Link>
          </div>
          <div className="mt-3" hidden={!showEligibility}><Eligibility qualified={selected === 2} nextAction={situation.nextAction} /></div>
        </div>
      </section>

      <CertificationExamScheduleSection examPage={examPage} error={examError} today={today} onPageChange={onPageChange} />
      {refereeBoard}

      <section aria-labelledby="referee-grades" className={panel}>
        <h2 id="referee-grades" className={sectionHeading}>심판 등급 비교</h2>
        <p className="mt-2 text-sm text-pul-muted">대한파크골프협회심판 · 등록민간자격 2019-000364</p>
        <p className="mt-1 text-sm text-pul-muted">공통 지원 조건으로 해당 연도 회원 자격과 1년 이상의 회원등록 이력을 확인하세요.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {refereeGrades.map(({ grade, eligibility, assessment, duties }) => (
            <article key={grade} className="min-w-0 rounded-lg border border-pul-border">
              <h3 className="rounded-t-lg bg-pul-light/60 px-3 py-2.5 text-center text-lg font-extrabold text-pul-deep">{grade}</h3>
              <dl className="space-y-2 p-3 text-sm leading-6">
                <div><dt className="font-bold">지원 조건</dt><dd>{eligibility}</dd></div>
                <div><dt className="font-bold">평가</dt><dd>{assessment}</dd></div>
                <div><dt className="font-bold">활동 범위</dt><dd>{duties}</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <RefereeSourceButton href={sources.association}>협회 자격 안내</RefereeSourceButton>
          <RefereeSourceButton href={sources.refereeRegulations}>심판 규정</RefereeSourceButton>
          <RefereeSourceButton href={sources.refereeRegistry}>민간자격 등록정보</RefereeSourceButton>
        </div>
      </section>
    </div>
  );
}
