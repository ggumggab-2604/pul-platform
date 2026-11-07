import { ApprovalPendingBadge } from "@/components/clubs/tournaments/ApprovalPendingBadge";
import type { CompanionStatus } from "@/lib/hall-of-fame/hallSpecialRecords";

export function SpecialPending({ status }: { status?: CompanionStatus | null }) {
  if (!status || status.approved >= status.required) return null;
  return (
    <>
      <ApprovalPendingBadge />
      <span className="ml-2 inline-block text-xs font-medium text-pul-muted">
        동반 확인 {status.approved}/{status.required}
      </span>
    </>
  );
}

export function ConfirmedCompanions({ status }: { status?: CompanionStatus | null }) {
  if (!status?.names.length) return null;
  return <p className="mt-1 break-words text-sm text-pul-muted">🎉 동반 확인 · {status.names.join(", ")}</p>;
}
