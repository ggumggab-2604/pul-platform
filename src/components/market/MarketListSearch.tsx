"use client";
import { useState } from "react";
import {
  marketCategories,
  marketRegions,
  startupBoardCategoryLabels,
  categoryLabels,
} from "@/data/marketData";
import type { MarketQuery } from "@/lib/market/marketNavigation";

export function MarketListSearch({
  query,
  onApply,
}: {
  query: MarketQuery;
  onApply: (value: Omit<MarketQuery, "view">) => void;
}) {
  const [keyword, setKeyword] = useState(query.keyword);
  const [advanced, setAdvanced] = useState(query.status !== "all");
  const input =
    "mt-1 min-h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-base";
  const categoryName =
    (
      { ...categoryLabels, ...startupBoardCategoryLabels } as Record<
        string,
        string
      >
    )[query.category] ?? "전체 카테고리";
  const statuses =
    query.view === "sale"
      ? [
          ["selling", "판매중"],
          ["reserved", "예약중"],
          ["sold", "거래완료"],
        ]
      : [
          ["open", "구매 희망"],
          ["closed", "요청 종료"],
        ];
  return (
    <form
      className="space-y-3 rounded-xl border border-pul-border bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply({ ...query, keyword: keyword.trim() });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
        <label className="text-sm font-semibold">
          제목·내용 검색
          <input
            className={input}
            type="search"
            maxLength={100}
            placeholder={
              query.view === "startup" ? "제목·내용·희망 규모" : "제목·내용"
            }
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.nativeEvent.isComposing || event.keyCode === 229)
              )
                event.preventDefault();
            }}
          />
        </label>
        <label className="text-sm font-semibold">
          카테고리
          <select
            className={input}
            value={query.category}
            onChange={(event) =>
              onApply({ ...query, category: event.target.value })
            }
          >
            <option value="all">전체</option>
            {query.view === "startup"
              ? Object.entries(startupBoardCategoryLabels).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )
              : marketCategories
                  .filter(
                    (item) =>
                      !["all", "startupResale", "facilityDevelopment"].includes(
                        item.value,
                      ),
                  )
                  .map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          지역
          <select
            className={input}
            value={query.region}
            onChange={(event) =>
              onApply({ ...query, region: event.target.value })
            }
          >
            {marketRegions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          className="min-h-11 self-end rounded-lg bg-pul-point px-5 font-bold text-white"
          type="submit"
        >
          검색
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {query.view !== "startup" ? (
          <button
            type="button"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
            className="min-h-11 font-bold"
          >
            상세조건 {advanced ? "접기" : "펼치기"}
          </button>
        ) : null}
        <button
          type="button"
          className="min-h-11 underline"
          onClick={() => {
            setKeyword("");
            onApply({
              keyword: "",
              category: "all",
              region: "전체",
              status: "all",
            });
          }}
        >
          조건 초기화
        </button>
        <p className="text-pul-muted">
          적용: {query.keyword || "검색어 없음"} · {query.region} ·{" "}
          {categoryName} ·{" "}
          {statuses.find(([value]) => value === query.status)?.[1] ??
            "전체 상태"}
        </p>
      </div>
      {advanced && query.view !== "startup" ? (
        <label className="block max-w-xs text-sm font-semibold">
          {query.view === "sale" ? "판매 상태" : "구매요청 상태"}
          <select
            className={input}
            value={query.status}
            onChange={(event) =>
              onApply({ ...query, status: event.target.value })
            }
          >
            <option value="all">전체</option>
            {statuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </form>
  );
}
