"use client";

import { AlertCircle, Inbox } from "lucide-react";

import { useHallOfFameOperatorManagement } from "@/components/hall-of-fame/manage/HallOfFameOperatorProvider";
import {
  HALL_OF_FAME_OPERATOR_STATUS_LABELS,
  type HallOfFameDisputeQueueItem,
} from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import {
  HALL_OF_FAME_DISPUTE_TYPE_LABELS,
  type HallOfFameDisputeStatus,
  type HallOfFameDisputeType,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";

const statusOptions: ReadonlyArray<{ value: HallOfFameDisputeStatus | null; label: string }> = [
  { value: null, label: "전체 상태" },
  { value: "open", label: "접수됨" },
  { value: "under_review", label: "검토 중" },
  { value: "resolved", label: "처리 완료" },
  { value: "withdrawn", label: "회원 취소" },
];

const typeOptions: ReadonlyArray<{ value: HallOfFameDisputeType | null; label: string }> = [
  { value: null, label: "전체 유형" },
  { value: "correction_request", label: "기록 정정 요청" },
  { value: "decision_appeal", label: "처리 결과 이의" },
  { value: "subject_objection", label: "내 기록 이의" },
  { value: "fraud_report", label: "잘못된 기록 신고" },
];

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function QueueCard({ item, selected, onSelect }: {
  item: HallOfFameDisputeQueueItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={`w-full rounded-xl border p-4 text-left transition-colors ${
          selected
            ? "border-pul-point bg-pul-light ring-2 ring-pul-point/20"
            : "border-pul-border bg-white hover:border-pul-point hover:bg-pul-page/40"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-foreground">
            {HALL_OF_FAME_DISPUTE_TYPE_LABELS[item.disputeType]}
          </span>
          <span className="rounded-full bg-pul-page px-2.5 py-1 text-xs font-bold text-pul-deep">
            {HALL_OF_FAME_OPERATOR_STATUS_LABELS[item.status]}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-pul-muted">
          {item.statement}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-pul-muted">
          <span>요청 회원</span>
          <span>{formatTimestamp(item.createdAt)} 접수</span>
        </div>
      </button>
    </li>
  );
}

export function HallOfFameOperatorQueue() {
  const {
    statusFilter,
    typeFilter,
    setStatusFilter,
    setTypeFilter,
    items,
    listLoading,
    listLoadingMore,
    listError,
    hasMore,
    loadMore,
    selectedDisputeId,
    selectDispute,
  } = useHallOfFameOperatorManagement();

  return (
    <section
      aria-labelledby="hall-of-fame-operator-queue-title"
      className="min-w-0 rounded-2xl border border-pul-border bg-white p-4 shadow-[0_3px_18px_rgba(6,78,59,0.07)] sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-pul-point">운영 요청함</p>
          <h2 id="hall-of-fame-operator-queue-title" className="mt-1 text-xl font-bold text-foreground">
            정정·이의·신고 목록
          </h2>
        </div>
        <span className="rounded-full bg-pul-light px-3 py-1 text-sm font-bold text-pul-deep">
          {items.length}건
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <label className="text-sm font-bold text-foreground">
          상태
          <select
            value={statusFilter ?? ""}
            onChange={(event) =>
              setStatusFilter((event.target.value || null) as HallOfFameDisputeStatus | null)
            }
            className="mt-1 min-h-12 w-full rounded-xl border border-pul-border bg-white px-3 text-base font-medium outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          >
            {statusOptions.map((option) => (
              <option key={option.value ?? "all"} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-foreground">
          요청 유형
          <select
            value={typeFilter ?? ""}
            onChange={(event) =>
              setTypeFilter((event.target.value || null) as HallOfFameDisputeType | null)
            }
            className="mt-1 min-h-12 w-full rounded-xl border border-pul-border bg-white px-3 text-base font-medium outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
          >
            {typeOptions.map((option) => (
              <option key={option.value ?? "all"} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listLoading ? (
        <div role="status" className="mt-5 rounded-xl bg-pul-page p-6 text-center text-pul-muted">
          운영 요청 목록을 불러오는 중입니다.
        </div>
      ) : listError ? (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">
          <AlertCircle className="mx-auto h-7 w-7" aria-hidden="true" />
          <p className="mt-2 text-center font-bold">{listError}</p>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-5 rounded-xl bg-pul-page p-6 text-center">
          <Inbox className="mx-auto h-8 w-8 text-pul-muted" aria-hidden="true" />
          <p className="mt-2 font-bold text-foreground">조건에 맞는 요청이 없습니다.</p>
        </div>
      ) : (
        <>
          <ul className="mt-5 space-y-3">
            {items.map((item) => (
              <QueueCard
                key={item.disputeId}
                item={item}
                selected={selectedDisputeId === item.disputeId}
                onSelect={() => selectDispute(item.disputeId)}
              />
            ))}
          </ul>
          {hasMore ? (
            <button
              type="button"
              disabled={listLoadingMore}
              onClick={() => void loadMore()}
              className="mt-4 min-h-12 w-full rounded-xl border border-pul-border bg-white px-4 font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50"
            >
              {listLoadingMore ? "더 불러오는 중…" : "요청 더 보기"}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
