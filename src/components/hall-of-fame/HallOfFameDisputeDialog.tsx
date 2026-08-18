"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import { HallOfFameDialog } from "@/components/hall-of-fame/HallOfFameDialog";
import { submitHallOfFameDisputeAction } from "@/app/hall-of-fame/actions";
import {
  HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS,
  HALL_OF_FAME_DISPUTE_TYPE_LABELS,
  type HallOfFameDisputeType,
} from "@/lib/hall-of-fame/hallOfFameMemberUi";

export type HallOfFameDisputeTarget = {
  targetKind: "application_record" | "canonical_record";
  targetId: string;
  recordLabel: string;
  allowedDisputeTypes: HallOfFameDisputeType[];
};

export function HallOfFameDisputeDialog({
  target,
  returnFocus,
  onClose,
  onSuccess,
}: {
  target: HallOfFameDisputeTarget;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [disputeType, setDisputeType] = useState(target.allowedDisputeTypes[0]);
  const categories = useMemo(
    () => HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS[disputeType],
    [disputeType],
  );
  const [category, setCategory] = useState(categories[0]?.value);
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const statementRef = useRef<HTMLTextAreaElement>(null);
  const errorId = "hall-of-fame-dispute-form-error";

  const changeDisputeType = (value: HallOfFameDisputeType) => {
    setDisputeType(value);
    setCategory(HALL_OF_FAME_DISPUTE_CATEGORY_OPTIONS[value][0]?.value);
    setError(undefined);
  };

  const submit = () => {
    const normalizedStatement = statement.trim();
    if (!category || [...normalizedStatement].length < 2) {
      setError("요청 내용을 2자 이상 입력해 주세요.");
      return;
    }
    if ([...normalizedStatement].length > 2000) {
      setError("요청 내용은 2,000자 이하로 입력해 주세요.");
      return;
    }

    setError(undefined);
    startTransition(async () => {
      const result = await submitHallOfFameDisputeAction({
        disputeType,
        category,
        targetKind: target.targetKind,
        targetId: target.targetId,
        statement: normalizedStatement,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSuccess(result.message);
    });
  };

  return (
    <HallOfFameDialog
      title="정정·이의·신고 요청"
      description={`${target.recordLabel}에 필요한 요청만 선택할 수 있습니다.`}
      busy={pending}
      onClose={onClose}
      returnFocus={returnFocus}
      initialFocusRef={statementRef}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="hall-of-fame-dispute-type" className="text-base font-bold text-foreground">
            요청 종류
          </label>
          <select
            id="hall-of-fame-dispute-type"
            value={disputeType}
            disabled={pending || target.allowedDisputeTypes.length === 1}
            onChange={(event) =>
              changeDisputeType(event.target.value as HallOfFameDisputeType)
            }
            className="mt-2 min-h-12 w-full rounded-xl border border-pul-border bg-white px-3 text-base text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-pul-page"
          >
            {target.allowedDisputeTypes.map((type) => (
              <option key={type} value={type}>
                {HALL_OF_FAME_DISPUTE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="hall-of-fame-dispute-category" className="text-base font-bold text-foreground">
            요청 사유
          </label>
          <select
            id="hall-of-fame-dispute-category"
            value={category}
            disabled={pending}
            onChange={(event) => {
              setCategory(event.target.value as typeof category);
              setError(undefined);
            }}
            className="mt-2 min-h-12 w-full rounded-xl border border-pul-border bg-white px-3 text-base text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-pul-page"
          >
            {categories.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <label htmlFor="hall-of-fame-dispute-statement" className="text-base font-bold text-foreground">
              요청 내용
            </label>
            <span className="text-sm tabular-nums text-pul-muted">
              {statement.length}/2,000
            </span>
          </div>
          <textarea
            ref={statementRef}
            id="hall-of-fame-dispute-statement"
            value={statement}
            minLength={2}
            maxLength={2000}
            rows={7}
            required
            disabled={pending}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : "hall-of-fame-dispute-statement-help"}
            onChange={(event) => {
              setStatement(event.target.value);
              setError(undefined);
            }}
            className="mt-2 w-full resize-y rounded-xl border border-pul-border bg-white p-3 text-base leading-7 text-foreground outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20 disabled:bg-pul-page"
          />
          <p id="hall-of-fame-dispute-statement-help" className="mt-2 text-sm leading-6 text-pul-muted">
            사실 확인에 필요한 내용을 2자 이상 적어 주세요. 개인정보나 민감정보는 입력하지 마세요.
          </p>
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[15px] font-semibold leading-6 text-rose-800"
          >
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 border-t border-pul-border pt-4">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="min-h-12 rounded-xl border border-pul-border bg-white px-4 text-base font-bold text-pul-deep hover:bg-pul-light disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={pending || !category || statement.trim().length < 2}
            onClick={submit}
            className="min-h-12 rounded-xl bg-pul-point px-4 text-base font-bold text-white hover:bg-pul-deep disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "접수 중..." : "요청 접수"}
          </button>
        </div>
      </div>
    </HallOfFameDialog>
  );
}
