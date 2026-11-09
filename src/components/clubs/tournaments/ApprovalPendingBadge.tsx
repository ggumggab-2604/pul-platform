export function ApprovalPendingBadge({ affiliation = false }: { affiliation?: boolean }) {
  return <span className="ml-2 inline-block rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{affiliation ? "승인 대기(동호회 확인)" : "승인 대기"}</span>;
}
