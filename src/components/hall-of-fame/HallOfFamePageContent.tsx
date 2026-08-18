"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  BadgeCheck,
  CircleAlert,
  ClipboardList,
  FileCheck2,
  Medal,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  HallOfFameDisputeDialog,
  type HallOfFameDisputeTarget,
} from "@/components/hall-of-fame/HallOfFameDisputeDialog";
import { HallOfFameRequestDetailDialog } from "@/components/hall-of-fame/HallOfFameRequestDetailDialog";
import { Container } from "@/components/ui/Container";
import { SoftBadge, type SoftBadgeTone } from "@/components/ui/SoftBadge";
import {
  getHallOfFamePrivateIdentityState,
  HALL_OF_FAME_APPLICATION_TYPE_LABELS,
  HALL_OF_FAME_BATCH_STATUS_LABELS,
  HALL_OF_FAME_DISPUTE_STATUS_LABELS,
  HALL_OF_FAME_DISPUTE_TYPE_LABELS,
  HALL_OF_FAME_PUBLICATION_STATUS_LABELS,
  HALL_OF_FAME_RECORD_STATUS_LABELS,
  HALL_OF_FAME_VALIDITY_STATUS_LABELS,
  type HallOfFamePublicRecord,
  type MyHallOfFameApplication,
  type MyHallOfFameDispute,
  type MyHallOfFameRecord,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type MemberTab = "records" | "applications" | "requests";

const memberTabs: ReadonlyArray<{
  value: MemberTab;
  label: string;
  description: string;
}> = [
  { value: "records", label: "내 기록", description: "승인된 기록과 공개 상태" },
  { value: "applications", label: "내 신청", description: "신청 진행 상태" },
  { value: "requests", label: "내 요청", description: "정정·이의·신고 처리" },
];

function formatDate(value?: string) {
  if (!value) return "날짜 비공개";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function formatTimestamp(value?: string) {
  if (!value) return undefined;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function statusTone(status: string): SoftBadgeTone {
  if (["approved", "active", "published", "resolved"].includes(status)) {
    return "point";
  }
  if (
    [
      "additional_info_required",
      "partially_approved",
      "corrected",
      "revoked",
      "suppressed",
      "rejected",
    ].includes(status)
  ) {
    return "warn";
  }
  return "muted";
}

function courseDescription(record: {
  courseName?: string;
  courseRegion?: string;
  courseLayout?: string;
  courseSegment?: string;
}) {
  return [
    record.courseName,
    record.courseRegion,
    record.courseLayout,
    record.courseSegment,
  ]
    .filter(Boolean)
    .join(" · ");
}

function scoreDescription(record: {
  holeNumber?: number;
  holePar?: number;
  strokes?: number;
}) {
  const details = [
    record.holeNumber ? `${record.holeNumber}번 홀` : undefined,
    record.holePar ? `파 ${record.holePar}` : undefined,
    record.strokes ? `${record.strokes}타` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? details.join(" · ") : "기록 세부 정보 비공개";
}

function SectionError({ message }: { message: string }) {
  const router = useRouter();
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-center">
      <CircleAlert className="mx-auto h-8 w-8 text-rose-700" aria-hidden="true" />
      <p className="mt-2 text-base font-bold text-rose-900">{message}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="mt-4 min-h-11 rounded-xl border border-rose-300 bg-white px-5 font-bold text-rose-800 hover:bg-rose-100"
      >
        다시 불러오기
      </button>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-pul-border bg-pul-page/45 px-5 py-10 text-center">
      <p className="text-lg font-bold text-foreground">{title}</p>
      <p className="mt-2 text-base leading-7 text-pul-muted">{description}</p>
    </div>
  );
}

function PublicHallOfFame({
  records,
  failed,
}: {
  records: HallOfFamePublicRecord[];
  failed: boolean;
}) {
  return (
    <section aria-labelledby="public-hall-of-fame-title" className="mt-7">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-pul-point">공개 명예 기록</p>
          <h2 id="public-hall-of-fame-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
            명예의 전당
          </h2>
        </div>
        <p className="max-w-xl text-[15px] leading-7 text-pul-muted sm:text-right">
          공개에 동의한 파크골프 기록만 보여 드립니다.
        </p>
      </div>

      <div className="mt-5">
        {failed ? (
          <SectionError message="공개 명예 기록을 불러오지 못했습니다." />
        ) : records.length === 0 ? (
          <EmptyState
            title="아직 공개된 명예 기록이 없습니다."
            description="승인과 공개 동의가 완료된 기록이 이곳에 표시됩니다."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {records.map((record, index) => (
              <li
                key={`${record.recordTypeCode}-${record.playedOn ?? "private"}-${record.displayName ?? "member"}-${index}`}
                className="flex min-w-0 flex-col rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_16px_rgba(6,78,59,0.07)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-sm">
                      <Trophy className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-foreground">
                        {record.displayName === "PUL member"
                          ? "PUL 회원"
                          : record.displayName ?? "PUL 회원"}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-pul-point">
                        {record.recordTypeName}
                      </p>
                    </div>
                  </div>
                  <SoftBadge tone="point" className="shrink-0 text-xs">
                    공식 기록
                  </SoftBadge>
                </div>

                <div className="mt-4 flex-1 rounded-xl bg-pul-light/30 p-4">
                  <p className="text-base font-bold text-pul-deep">
                    {scoreDescription(record)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-pul-muted">
                    {courseDescription(record) || "골프장 정보 비공개"}
                  </p>
                  <p className="mt-2 text-sm text-pul-muted">
                    {formatDate(record.playedOn)}
                    {record.clubName ? ` · ${record.clubName}` : ""}
                  </p>
                </div>

                {record.badges.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2" aria-label="획득 배지">
                    {record.badges.map((badge) => (
                      <span
                        key={badge.code}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-sm font-bold text-amber-900 ring-1 ring-amber-200"
                      >
                        <Award className="h-4 w-4" aria-hidden="true" />
                        {badge.name}
                        {badge.sourceCount > 1 ? ` ${badge.sourceCount}회` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DisputeActionButton({
  label,
  target,
  onOpen,
}: {
  label: string;
  target: HallOfFameDisputeTarget;
  onOpen: (target: HallOfFameDisputeTarget, trigger: HTMLButtonElement) => void;
}) {
  if (target.allowedDisputeTypes.length === 0) return null;
  return (
    <button
      type="button"
      onClick={(event) => onOpen(target, event.currentTarget)}
      className="mt-4 min-h-12 w-full rounded-xl border border-pul-point bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light"
    >
      {label}
    </button>
  );
}

function MyRecords({
  records,
  failed,
  onOpenDispute,
}: {
  records: MyHallOfFameRecord[];
  failed: boolean;
  onOpenDispute: (
    target: HallOfFameDisputeTarget,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  if (failed) return <SectionError message="내 명예 기록을 불러오지 못했습니다." />;
  if (records.length === 0) {
    return (
      <EmptyState
        title="아직 승인된 내 기록이 없습니다."
        description="승인이 완료된 기록은 공개 여부와 함께 이곳에서 확인할 수 있습니다."
      />
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {records.map((record) => (
        <li key={record.canonicalRecordId} className="rounded-2xl border border-pul-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-foreground">{record.recordTypeName}</p>
              <p className="mt-1 text-[15px] text-pul-muted">
                {formatDate(record.playedOn)} · {record.courseName}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <SoftBadge tone={statusTone(record.validityStatus)} className="text-xs">
                {HALL_OF_FAME_VALIDITY_STATUS_LABELS[record.validityStatus]}
              </SoftBadge>
              <SoftBadge tone={statusTone(record.publicationStatus)} className="text-xs">
                {HALL_OF_FAME_PUBLICATION_STATUS_LABELS[record.publicationStatus]}
              </SoftBadge>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-pul-light/30 p-4">
            <p className="font-bold text-pul-deep">{scoreDescription(record)}</p>
            <p className="mt-1 break-words text-[15px] leading-6 text-pul-muted">
              {courseDescription(record)}
              {record.clubName ? ` · ${record.clubName}` : ""}
            </p>
          </div>
          {record.badges.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {record.badges.map((badge) => (
                <span
                  key={`${record.canonicalRecordId}-${badge.code}`}
                  className={cn(
                    "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-bold ring-1",
                    badge.status === "active"
                      ? "bg-amber-50 text-amber-900 ring-amber-200"
                      : "bg-slate-100 text-slate-600 ring-slate-200",
                  )}
                >
                  <Medal className="h-4 w-4" aria-hidden="true" />
                  {badge.name}
                  {badge.status === "inactive" ? " · 비활성" : ""}
                </span>
              ))}
            </div>
          ) : null}
          {record.canSubmitDispute ? (
            <DisputeActionButton
              label="정정·이의·신고"
              target={{
                targetKind: "canonical_record",
                targetId: record.canonicalRecordId,
                recordLabel: record.recordTypeName,
                allowedDisputeTypes: record.allowedDisputeTypes,
              }}
              onOpen={onOpenDispute}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MyApplications({
  applications,
  failed,
  onOpenDispute,
}: {
  applications: MyHallOfFameApplication[];
  failed: boolean;
  onOpenDispute: (
    target: HallOfFameDisputeTarget,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  if (failed) return <SectionError message="내 명예의 전당 신청을 불러오지 못했습니다." />;
  if (applications.length === 0) {
    return (
      <EmptyState
        title="내 신청 내역이 없습니다."
        description="내가 신청했거나 내 기록으로 추천된 내역을 확인할 수 있습니다."
      />
    );
  }
  return (
    <ul className="grid gap-4 lg:grid-cols-2">
      {applications.map((application) => (
        <li key={application.applicationRecordId} className="rounded-2xl border border-pul-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xl font-bold text-foreground">{application.recordTypeName}</p>
              <p className="mt-1 text-[15px] text-pul-muted">
                {HALL_OF_FAME_APPLICATION_TYPE_LABELS[application.applicationType]}
                {application.submittedAt
                  ? ` · ${formatTimestamp(application.submittedAt)} 접수`
                  : ""}
              </p>
            </div>
            <SoftBadge tone={statusTone(application.recordStatus)} className="text-xs">
              {HALL_OF_FAME_RECORD_STATUS_LABELS[application.recordStatus]}
            </SoftBadge>
          </div>
          <div className="mt-4 rounded-xl bg-pul-light/30 p-4">
            <p className="font-bold text-pul-deep">
              {formatDate(application.playedOn)} · {scoreDescription(application)}
            </p>
            <p className="mt-1 break-words text-[15px] leading-6 text-pul-muted">
              {courseDescription(application)}
              {application.clubName ? ` · ${application.clubName}` : ""}
            </p>
          </div>
          {application.batchStatus !== application.recordStatus ? (
            <p className="mt-3 text-sm text-pul-muted">
              전체 신청 상태: {HALL_OF_FAME_BATCH_STATUS_LABELS[application.batchStatus]}
            </p>
          ) : null}
          {application.canSubmitDispute ? (
            <DisputeActionButton
              label="처리 결과 이의 신청"
              target={{
                targetKind: "application_record",
                targetId: application.applicationRecordId,
                recordLabel: application.recordTypeName,
                allowedDisputeTypes: application.allowedDisputeTypes,
              }}
              onOpen={onOpenDispute}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MyRequests({
  disputes,
  failed,
  onOpenDetail,
}: {
  disputes: MyHallOfFameDispute[];
  failed: boolean;
  onOpenDetail: (request: MyHallOfFameDispute, trigger: HTMLButtonElement) => void;
}) {
  if (failed) return <SectionError message="내 정정·이의·신고 요청을 불러오지 못했습니다." />;
  if (disputes.length === 0) {
    return (
      <EmptyState
        title="접수한 요청이 없습니다."
        description="내 기록이나 신청에서 접수한 정정·이의·신고 요청이 이곳에 표시됩니다."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {disputes.map((dispute) => (
        <li key={dispute.disputeId} className="rounded-2xl border border-pul-border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-bold text-foreground">
                  {HALL_OF_FAME_DISPUTE_TYPE_LABELS[dispute.disputeType]}
                </p>
                <SoftBadge tone={statusTone(dispute.status)} className="text-xs">
                  {HALL_OF_FAME_DISPUTE_STATUS_LABELS[dispute.status]}
                </SoftBadge>
              </div>
              <p className="mt-2 line-clamp-2 break-words text-[15px] leading-6 text-pul-muted">
                {dispute.statement}
              </p>
              <p className="mt-2 text-sm text-pul-muted">
                {formatTimestamp(dispute.createdAt)} 접수
              </p>
            </div>
            <button
              type="button"
              onClick={(event) => onOpenDetail(dispute, event.currentTarget)}
              className="min-h-12 shrink-0 rounded-xl border border-pul-border bg-white px-5 text-base font-bold text-pul-deep hover:bg-pul-light"
            >
              상세 보기
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HallOfFamePageContent({
  publicRecords,
  publicLoadFailed,
  authenticatedUserId,
  applications,
  applicationsLoadFailed,
  records,
  recordsLoadFailed,
  disputes,
  disputesLoadFailed,
}: {
  publicRecords: HallOfFamePublicRecord[];
  publicLoadFailed: boolean;
  authenticatedUserId?: string;
  applications: MyHallOfFameApplication[];
  applicationsLoadFailed: boolean;
  records: MyHallOfFameRecord[];
  recordsLoadFailed: boolean;
  disputes: MyHallOfFameDispute[];
  disputesLoadFailed: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [browserUserId, setBrowserUserId] = useState<
    string | null | undefined
  >(undefined);
  const [activeTab, setActiveTab] = useState<MemberTab>("records");
  const [disputeTarget, setDisputeTarget] = useState<HallOfFameDisputeTarget>();
  const [disputeReturnFocus, setDisputeReturnFocus] = useState<HTMLElement | null>(null);
  const [requestDetail, setRequestDetail] = useState<MyHallOfFameDispute>();
  const [requestReturnFocus, setRequestReturnFocus] = useState<HTMLElement | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>();
  const refreshedIdentityMismatch = useRef<string | undefined>(undefined);
  const successRef = useRef<HTMLDivElement>(null);
  const memberTabRefs = useRef<Partial<Record<MemberTab, HTMLButtonElement>>>({});

  useEffect(() => {
    let active = true;
    const setSessionUser = (sessionUserId?: string) => {
      if (!active) return;
      const nextBrowserUserId = sessionUserId ?? null;
      setBrowserUserId(nextBrowserUserId);

      const { refreshRequired } = getHallOfFamePrivateIdentityState(
        authenticatedUserId,
        nextBrowserUserId,
      );
      if (!refreshRequired) {
        refreshedIdentityMismatch.current = undefined;
        return;
      }

      setDisputeTarget(undefined);
      setDisputeReturnFocus(null);
      setRequestDetail(undefined);
      setRequestReturnFocus(null);
      setSuccessMessage(undefined);

      const mismatchKey = `${authenticatedUserId ?? "signed-out"}->${nextBrowserUserId ?? "signed-out"}`;
      if (refreshedIdentityMismatch.current === mismatchKey) return;
      refreshedIdentityMismatch.current = mismatchKey;
      router.refresh();
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => setSessionUser(data.session?.user.id))
      .catch(() => setSessionUser(undefined));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user.id);
    });
    const handleServerSignOut = () => setSessionUser(undefined);
    window.addEventListener("pul-auth-signed-out", handleServerSignOut);

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("pul-auth-signed-out", handleServerSignOut);
    };
  }, [authenticatedUserId, router, supabase]);

  const { showPrivate } =
    getHallOfFamePrivateIdentityState(authenticatedUserId, browserUserId);

  const announceSuccess = (message: string) => {
    setDisputeTarget(undefined);
    setRequestDetail(undefined);
    setSuccessMessage(message);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        successRef.current?.focus({ preventScroll: true });
      });
    });
  };

  const moveMemberTabFocus = (current: MemberTab, key: string) => {
    const currentIndex = memberTabs.findIndex((tab) => tab.value === current);
    let nextIndex: number | undefined;
    if (key === "ArrowRight") nextIndex = (currentIndex + 1) % memberTabs.length;
    if (key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + memberTabs.length) % memberTabs.length;
    }
    if (key === "Home") nextIndex = 0;
    if (key === "End") nextIndex = memberTabs.length - 1;
    if (nextIndex === undefined) return false;
    const nextTab = memberTabs[nextIndex].value;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      memberTabRefs.current[nextTab]?.focus({ preventScroll: true });
    });
    return true;
  };

  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-6xl px-3 py-6 pb-20 sm:py-9 lg:py-12">
        <main>
          <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-pul-deep via-emerald-800 to-pul-point px-5 py-8 text-white shadow-[0_10px_34px_rgba(6,78,59,0.2)] sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-bold text-emerald-100">PUL 파크골프 명예 기록</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">명예의 전당</h1>
                <p className="mt-4 text-base leading-7 text-white/90 sm:text-lg">
                  뜻깊은 기록을 함께 축하하고, 내 기록과 신청 처리 현황을 한곳에서 확인하세요.
                </p>
              </div>
              <span className="flex h-24 w-24 shrink-0 items-center justify-center self-center rounded-full bg-white/15 ring-1 ring-white/25 sm:h-28 sm:w-28">
                <Trophy className="h-12 w-12 text-amber-300 sm:h-14 sm:w-14" aria-hidden="true" />
              </span>
            </div>
          </header>

          {successMessage ? (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base font-bold text-emerald-900 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {successMessage}
            </div>
          ) : null}

          <PublicHallOfFame records={publicRecords} failed={publicLoadFailed} />

          <section id="my-hall-of-fame" aria-labelledby="my-hall-of-fame-title" className="mt-10 scroll-mt-24">
            <div className="rounded-2xl border border-pul-border bg-white p-5 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-7">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-pul-light text-pul-deep">
                  <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-pul-point">회원 전용</p>
                  <h2 id="my-hall-of-fame-title" className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
                    내 명예의 전당
                  </h2>
                  <p className="mt-2 text-base leading-7 text-pul-muted">
                    내 기록과 신청, 접수한 정정·이의·신고 요청을 확인합니다.
                  </p>
                </div>
              </div>

              {!showPrivate ? (
                <div className="mt-6 rounded-xl border border-pul-border bg-pul-page/45 p-6 text-center">
                  <p className="text-lg font-bold text-foreground">로그인 후 내 기록을 확인할 수 있습니다.</p>
                  <p className="mt-2 text-base leading-7 text-pul-muted">
                    공개 명예 기록은 로그인하지 않아도 계속 볼 수 있습니다.
                  </p>
                  <Link
                    href="/login?next=/hall-of-fame"
                    className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-pul-point px-6 text-base font-bold text-white hover:bg-pul-deep"
                  >
                    로그인
                  </Link>
                </div>
              ) : (
                <>
                  <div
                    role="tablist"
                    aria-label="내 명예의 전당 메뉴"
                    className="mt-6 grid grid-cols-3 gap-2 rounded-xl bg-pul-page p-1.5"
                  >
                    {memberTabs.map((tab) => {
                      const selected = activeTab === tab.value;
                      return (
                        <button
                          ref={(element) => {
                            memberTabRefs.current[tab.value] = element ?? undefined;
                          }}
                          key={tab.value}
                          type="button"
                          role="tab"
                          id={`my-hall-of-fame-tab-${tab.value}`}
                          aria-selected={selected}
                          aria-controls={`my-hall-of-fame-panel-${tab.value}`}
                          tabIndex={selected ? 0 : -1}
                          onClick={() => setActiveTab(tab.value)}
                          onKeyDown={(event) => {
                            if (moveMemberTabFocus(tab.value, event.key)) {
                              event.preventDefault();
                            }
                          }}
                          className={cn(
                            "min-h-14 rounded-lg px-2 py-2 text-sm font-bold transition-colors sm:text-base",
                            selected
                              ? "bg-white text-pul-deep shadow-sm ring-1 ring-pul-border"
                              : "text-pul-muted hover:bg-white/70 hover:text-pul-deep",
                          )}
                        >
                          {tab.label}
                          <span className="mt-0.5 hidden text-xs font-medium text-pul-muted md:block">
                            {tab.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    role="tabpanel"
                    id={`my-hall-of-fame-panel-${activeTab}`}
                    aria-labelledby={`my-hall-of-fame-tab-${activeTab}`}
                    className="mt-5"
                  >
                    {activeTab === "records" ? (
                      <MyRecords records={records} failed={recordsLoadFailed} onOpenDispute={(target, trigger) => {
                        setSuccessMessage(undefined);
                        setDisputeReturnFocus(trigger);
                        setDisputeTarget(target);
                      }} />
                    ) : null}
                    {activeTab === "applications" ? (
                      <MyApplications applications={applications} failed={applicationsLoadFailed} onOpenDispute={(target, trigger) => {
                        setSuccessMessage(undefined);
                        setDisputeReturnFocus(trigger);
                        setDisputeTarget(target);
                      }} />
                    ) : null}
                    {activeTab === "requests" ? (
                      <MyRequests disputes={disputes} failed={disputesLoadFailed} onOpenDetail={(request, trigger) => {
                        setSuccessMessage(undefined);
                        setRequestReturnFocus(trigger);
                        setRequestDetail(request);
                      }} />
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="명예의 전당 이용 안내">
            {[
              { icon: BadgeCheck, title: "승인 기록", text: "공식 승인과 공개 동의가 완료된 기록만 공개됩니다." },
              { icon: ClipboardList, title: "간단한 요청", text: "허용된 기록에서만 정정·이의·신고를 접수할 수 있습니다." },
              { icon: FileCheck2, title: "처리 결과", text: "운영자가 확인한 결과는 내 요청 상세에서 안내합니다." },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-pul-border bg-white p-4">
                <item.icon className="h-6 w-6 text-pul-point" aria-hidden="true" />
                <p className="mt-2 font-bold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-pul-muted">{item.text}</p>
              </div>
            ))}
          </section>
        </main>
      </Container>

      {showPrivate && disputeTarget ? (
        <HallOfFameDisputeDialog
          key={`${disputeTarget.targetKind}-${disputeTarget.targetId}`}
          target={disputeTarget}
          returnFocus={disputeReturnFocus}
          onClose={() => setDisputeTarget(undefined)}
          onSuccess={announceSuccess}
        />
      ) : null}

      {showPrivate && requestDetail ? (
        <HallOfFameRequestDetailDialog
          key={requestDetail.disputeId}
          request={requestDetail}
          returnFocus={requestReturnFocus}
          onClose={() => setRequestDetail(undefined)}
          onSuccess={announceSuccess}
        />
      ) : null}
    </div>
  );
}
