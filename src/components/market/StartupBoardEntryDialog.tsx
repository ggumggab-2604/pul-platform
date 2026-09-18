"use client";
import { useState } from "react";
import {
  marketRegions,
  startupBoardCategoryLabels,
  startupBoardConsultationLabels,
} from "@/data/marketData";
import {
  emptyResaleDetails,
  type ContactInput,
  type ResaleDetails,
  type StartupContextV2,
  type StartupInputV2,
} from "@/lib/market/marketPhaseOne";
import type {
  StartupBoardCategory,
  StartupBoardConsultationType,
} from "@/types";
import { MarketDialog } from "./MarketDialog";
import { MarketContactFields } from "./MarketContact";
import { MarketPhotoPicker } from "./MarketPhotos";
const combinations: Record<
  StartupBoardCategory,
  StartupBoardConsultationType[]
> = {
  screenStartup: ["startupInquiry"],
  screenResale: ["transfer", "resaleInquiry"],
  fieldCourseDevelopment: ["courseDevelopment"],
  idleLandUse: ["idleLandUse"],
  constructionFacility: ["facilityConsulting"],
};
const field =
  "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base";
const numericFields = [
  ["areaSqm", "면적 (㎡)"],
  ["bayCount", "타석 수 (개)"],
  ["deposit", "보증금 (원)"],
  ["monthlyRent", "월세 (원/월)"],
  ["maintenance", "관리비 (원/월)"],
  ["askingPrice", "희망 양도가 (원)"],
  ["monthlyRevenue", "월매출 (원, 작성자 제공)"],
] as const;
export function StartupBoardEntryDialog({
  item,
  initialCategory,
  initialConsultation,
  busy,
  saved,
  error,
  onClose,
  onSubmit,
}: {
  item?: StartupContextV2;
  initialCategory: StartupBoardCategory;
  initialConsultation: StartupBoardConsultationType;
  busy: boolean;
  saved?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (input: StartupInputV2, files: File[]) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? ""),
    [body, setBody] = useState(item?.body ?? ""),
    [region, setRegion] = useState(item?.region ?? "서울"),
    [desiredScale, setDesiredScale] = useState(item?.desiredScale ?? "");
  const [category, setCategory] = useState<StartupBoardCategory>(
      item?.category ?? initialCategory,
    ),
    [consultationType, setConsultation] =
      useState<StartupBoardConsultationType>(
        item?.consultationType ?? initialConsultation,
      );
  const [resale, setResale] = useState<ResaleDetails>(
    item?.resale ?? emptyResaleDetails(),
  );
  const [contact, setContact] = useState<ContactInput>({
    publicContactMethod: item?.publicContactMethod ?? "phone",
    publicContactValue: item?.publicContactValue ?? "",
    publicContactConsent: false,
  });
  const [files, setFiles] = useState<File[]>([]);
  return (
    <MarketDialog
      title={item ? "창업·매매 글 수정" : "창업·매매 글쓰기"}
      busy={busy}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          onSubmit(
            {
              title,
              body,
              region,
              category,
              desiredScale,
              consultationType,
              resale: category === "screenResale" ? resale : null,
              contact:
                category === "screenResale" &&
                (consultationType === "transfer" ||
                  contact.publicContactValue.trim())
                  ? contact
                  : null,
            },
            category === "screenResale" ? files : [],
          );
        }}
      >
        <fieldset
          disabled={busy || saved}
          className="space-y-4 disabled:opacity-70"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-bold">
              제목 (필수)
              <input
                required
                minLength={2}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={field}
              />
            </label>
            <label className="text-sm font-bold">
              카테고리
              <select
                className={field}
                value={category}
                onChange={(e) => {
                  const next = e.target.value as StartupBoardCategory;
                  setCategory(next);
                  setConsultation(combinations[next][0]);
                }}
              >
                {Object.entries(startupBoardCategoryLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-sm font-bold">
              거래·상담 유형
              <select
                className={field}
                value={consultationType}
                onChange={(e) =>
                  setConsultation(
                    e.target.value as StartupBoardConsultationType,
                  )
                }
              >
                {combinations[category].map((value) => (
                  <option key={value} value={value}>
                    {value === "resaleInquiry"
                      ? "매장 구입 문의"
                      : startupBoardConsultationLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              지역 (필수)
              <select
                className={field}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                {marketRegions
                  .filter((v) => v !== "전체")
                  .map((v) => (
                    <option key={v}>{v}</option>
                  ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              희망 규모 (선택)
              <input
                maxLength={100}
                value={desiredScale}
                onChange={(e) => setDesiredScale(e.target.value)}
                placeholder="예: 3타석 규모"
                className={field}
              />
            </label>
            <label className="sm:col-span-2 text-sm font-bold">
              내용 (필수)
              <textarea
                required
                minLength={10}
                maxLength={5000}
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={`${field} py-3`}
              />
            </label>
          </div>
          {category === "screenResale" ? (
            <>
              <fieldset className="rounded-xl border border-pul-border p-3">
                <legend className="px-1 text-sm font-bold">
                  매장 정보 (모두 선택)
                </legend>
                <p className="mb-3 text-xs text-pul-muted">
                  빈칸은 미기재입니다. 실제 0원과 구분해 주세요. 매출은 작성자
                  제공 정보로 표시됩니다.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {numericFields.map(([key, label]) => (
                    <label key={key} className="text-sm">
                      {label}
                      <input
                        type="number"
                        min={0}
                        max={
                          key === "areaSqm"
                            ? 100000
                            : key === "bayCount"
                              ? 1000
                              : 100000000000
                        }
                        step={key === "areaSqm" ? "0.01" : "1"}
                        value={resale[key] ?? ""}
                        onChange={(e) =>
                          setResale({
                            ...resale,
                            [key]:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        className={field}
                      />
                    </label>
                  ))}
                  <label className="text-sm">
                    양도가 협의
                    <select
                      value={
                        resale.negotiable === null
                          ? ""
                          : String(resale.negotiable)
                      }
                      onChange={(e) =>
                        setResale({
                          ...resale,
                          negotiable:
                            e.target.value === ""
                              ? null
                              : e.target.value === "true",
                        })
                      }
                      className={field}
                    >
                      <option value="">미기재</option>
                      <option value="true">협의 가능</option>
                      <option value="false">협의 불가</option>
                    </select>
                  </label>
                  <label className="sm:col-span-2 text-sm">
                    임대조건
                    <textarea
                      maxLength={500}
                      rows={3}
                      value={resale.rentTerms ?? ""}
                      onChange={(e) =>
                        setResale({
                          ...resale,
                          rentTerms: e.target.value || null,
                        })
                      }
                      className={`${field} py-2`}
                    />
                  </label>
                </div>
              </fieldset>
              <MarketContactFields
                value={contact}
                onChange={setContact}
                required={consultationType === "transfer"}
              />
              <MarketPhotoPicker
                files={files}
                onChange={setFiles}
                storedCount={item?.images.length ?? 0}
              />
            </>
          ) : null}
        </fieldset>
        {saved ? (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
            글은 저장되었습니다. 남은 사진만 재시도합니다. 내용 변경은 저장된
            글을 다시 열어 주세요.
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-6 text-pul-muted">
          본문에 연락처·상세 주소 등 개인정보를 쓰지 마세요. 실제
          비용·계약·인허가는 당사자와 전문가에게 확인해야 합니다.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-lg border"
          >
            {saved ? "닫기" : "취소"}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-pul-point font-bold text-white disabled:opacity-50"
          >
            {busy ? "저장·사진 처리 중…" : saved ? "남은 사진 재시도" : "저장"}
          </button>
        </div>
      </form>
    </MarketDialog>
  );
}
