"use client";
import { useState } from "react";
import type { ContactInput, MarketContact } from "@/lib/market/marketPhaseOne";
const field =
  "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base";
export function MarketContactFields({
  value,
  onChange,
  required = true,
}: {
  value: ContactInput;
  onChange: (value: ContactInput) => void;
  required?: boolean;
}) {
  return (
    <fieldset className="space-y-3 rounded-xl border border-pul-border p-3">
      <legend className="px-1 text-sm font-bold">
        거래 연락 방법{required ? " (필수)" : " (선택)"}
      </legend>
      <label className="block text-sm">
        연락 방법
        <select
          className={field}
          value={value.publicContactMethod}
          onChange={(event) =>
            onChange({
              ...value,
              publicContactMethod: event.target
                .value as ContactInput["publicContactMethod"],
              publicContactConsent: false,
            })
          }
        >
          <option value="phone">전화</option>
          <option value="sms">문자</option>
          <option value="external_url">HTTPS 외부 문의 링크</option>
        </select>
      </label>
      <label className="block text-sm">
        직접 입력한 거래 연락처
        <input
          className={field}
          required={required}
          type={value.publicContactMethod === "external_url" ? "url" : "tel"}
          autoComplete="off"
          value={value.publicContactValue}
          onChange={(event) =>
            onChange({
              ...value,
              publicContactValue: event.target.value,
              publicContactConsent: false,
            })
          }
        />
      </label>
      <label className="flex gap-3 text-sm leading-6">
        <input
          className="mt-1 size-5 shrink-0"
          type="checkbox"
          required={required || Boolean(value.publicContactValue.trim())}
          checked={value.publicContactConsent}
          onChange={(event) =>
            onChange({ ...value, publicContactConsent: event.target.checked })
          }
        />
        <span>
          입력한 연락처를 진행 중인 글의 상세에서 정상 활동 회원에게 공개하는 데
          동의합니다. 변경 시 다시 동의합니다.
        </span>
      </label>
      <p className="text-xs leading-5 text-pul-muted">
        계정 이메일을 자동으로 사용하지 않습니다. 전화·문자는 상대에게 번호가
        전달되는 방식입니다. 외부 문의는 새 창에서 열립니다. 본문에는 연락처를
        쓰지 마세요.
      </p>
    </fieldset>
  );
}
export function MarketContactPanel({
  contact,
  owner,
  ended,
  authenticated,
  onEdit,
}: {
  contact: MarketContact;
  owner: boolean;
  ended: boolean;
  authenticated: boolean;
  onEdit?: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState("");
  const { publicContactMethod: method, publicContactValue: value } = contact;
  const href =
    method === "phone"
      ? `tel:${value}`
      : method === "sms"
        ? `sms:${value}`
        : (value ?? undefined);
  return (
    <section
      className="mt-4 space-y-2 rounded-xl border border-pul-border bg-pul-light/30 p-4"
      aria-label={owner ? "내 연락 방법" : "연락하기"}
    >
      <h3 className="font-bold">{owner ? "내 연락 방법" : "연락하기"}</h3>
      {ended ? (
        <p className="text-sm">종료된 글의 연락처는 제공하지 않습니다.</p>
      ) : !authenticated ? (
        <p className="text-sm">
          로그인한 정상 활동 회원만 거래 연락처를 확인할 수 있습니다.
        </p>
      ) : !value || !method ? (
        <p className="text-sm">
          등록된 연락처가 없거나 현재 조회할 수 없습니다.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {method === "phone"
              ? "전화"
              : method === "sms"
                ? "문자"
                : "외부 문의 링크"}{" "}
            등록됨
          </p>
          <div className="flex flex-wrap gap-2">
            {!owner ? (
              <a
                className="inline-flex min-h-11 items-center rounded-lg bg-pul-point px-4 font-bold text-white"
                href={href}
                target={method === "external_url" ? "_blank" : undefined}
                rel={
                  method === "external_url"
                    ? "noopener noreferrer nofollow"
                    : undefined
                }
              >
                {method === "external_url"
                  ? "문의 열기 (새 창)"
                  : method === "phone"
                    ? "전화하기"
                    : "문자 보내기"}
              </a>
            ) : null}
            <button
              className="min-h-11 rounded-lg border border-pul-border bg-white px-3"
              onClick={() => setRevealed(!revealed)}
              type="button"
            >
              연락처 {revealed ? "접기" : "확인"}
            </button>
            <button
              className="min-h-11 rounded-lg border border-pul-border bg-white px-3"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  setMessage("연락처를 복사했습니다.");
                } catch {
                  setMessage(
                    "복사하지 못했습니다. 연락처 확인 후 직접 복사해 주세요.",
                  );
                }
              }}
              type="button"
            >
              복사
            </button>
          </div>
          {revealed ? (
            <p className="break-all select-all text-sm">{value}</p>
          ) : null}
          <p className="text-xs text-pul-muted">
            PC에서는 연락처 확인·복사를 사용할 수 있습니다. 전화·문자 이용 시
            상대에게 번호가 전달됩니다.
          </p>
        </>
      )}
      {owner && !ended && onEdit ? (
        <button
          type="button"
          className="min-h-11 font-bold underline"
          onClick={onEdit}
        >
          연락 방법 수정
        </button>
      ) : null}
      <p role="status" className="text-xs">
        {message}
      </p>
    </section>
  );
}
