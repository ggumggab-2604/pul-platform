"use client";

import { FilterChip } from "@/components/ui/FilterChip";
import { Icon } from "@/components/ui/Icon";
import {
  marketCategories,
  marketRegions,
  marketSaleStatuses,
  marketSellerTypes,
} from "@/data/marketData";
import { cn } from "@/lib/utils";
import type { MarketListing } from "@/types";

export type MarketFilters = {
  category: string;
  region: string;
  sellerType: string;
  saleStatus: string;
  keyword: string;
};

export function createDefaultMarketFilters(): MarketFilters {
  return {
    category: "all",
    region: "전체",
    sellerType: "all",
    saleStatus: "all",
    keyword: "",
  };
}

export function isStartupResaleMode(filters: MarketFilters) {
  return filters.sellerType === "startupResale";
}

export function isDefaultMarketFilters(filters: MarketFilters) {
  return (
    filters.category === "all" &&
    filters.region === "전체" &&
    filters.sellerType === "all" &&
    filters.saleStatus === "all" &&
    filters.keyword.trim() === ""
  );
}

export function filterMarketListings(items: MarketListing[], filters: MarketFilters) {
  if (isDefaultMarketFilters(filters)) {
    return items;
  }

  const keyword = filters.keyword.trim().toLowerCase();

  return items.filter((item) => {
    if (
      filters.category === "startupResale" ||
      filters.category === "facilityDevelopment"
    ) {
      return false;
    }
    if (filters.sellerType === "startupResale") {
      return false;
    }
    if (filters.category !== "all" && item.category !== filters.category) {
      return false;
    }
    if (filters.region !== "전체" && item.region !== filters.region) {
      return false;
    }
    if (filters.sellerType !== "all" && item.sellerType !== filters.sellerType) {
      return false;
    }
    if (filters.saleStatus !== "all" && item.saleStatus !== filters.saleStatus) {
      return false;
    }
    if (keyword) {
      const haystack =
        `${item.name} ${item.region} ${item.description}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

type MarketSearchFilterProps = {
  filters: MarketFilters;
  onChange: (filters: MarketFilters) => void;
  onReset: () => void;
  resultCount: number;
  showSearch?: boolean;
  hideSellerType?: boolean;
  onClose?: () => void;
};

const inputClass =
  "h-11 w-full rounded-lg border border-pul-border bg-white px-3 text-sm outline-none transition-shadow focus:border-pul-point focus:ring-2 focus:ring-pul-point/20";

function SellerTypeFilterSection({
  filters,
  update,
  horizontalScroll = false,
  hideLabel = false,
}: {
  filters: MarketFilters;
  update: (patch: Partial<MarketFilters>) => void;
  horizontalScroll?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && (
        <p className="mb-2 text-sm font-semibold text-foreground">판매자 유형</p>
      )}
      <div
        className={cn(
          "flex gap-2",
          horizontalScroll
            ? "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex-wrap",
        )}
      >
        {marketSellerTypes.map((type) => (
          <FilterChip
            key={type.value}
            label={type.label}
            size={horizontalScroll ? "smMarket" : "md"}
            active={filters.sellerType === type.value}
            onClick={() => update({ sellerType: type.value })}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryFilterSection({
  filters,
  update,
  horizontalScroll = false,
  hideLabel = false,
}: {
  filters: MarketFilters;
  update: (patch: Partial<MarketFilters>) => void;
  horizontalScroll?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && (
        <p className="mb-2 text-sm font-semibold text-foreground">카테고리</p>
      )}
      <div
        className={cn(
          "flex gap-2",
          horizontalScroll
            ? "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex-wrap",
        )}
      >
        {marketCategories.map((cat) => (
          <FilterChip
            key={cat.value}
            label={cat.label}
            size={horizontalScroll ? "smMarket" : "md"}
            active={filters.category === cat.value}
            onClick={() => update({ category: cat.value })}
          />
        ))}
      </div>
    </div>
  );
}

function RegionFilterSection({
  filters,
  update,
  horizontalScroll = false,
  hideLabel = false,
}: {
  filters: MarketFilters;
  update: (patch: Partial<MarketFilters>) => void;
  horizontalScroll?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && (
        <p className="mb-2 text-sm font-semibold text-foreground">지역</p>
      )}
      <div
        className={cn(
          "flex gap-2",
          horizontalScroll
            ? "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "flex-wrap",
        )}
      >
        {marketRegions.map((region) => (
          <FilterChip
            key={region}
            label={region}
            size={horizontalScroll ? "smMarket" : "md"}
            active={filters.region === region}
            onClick={() => update({ region })}
          />
        ))}
      </div>
    </div>
  );
}

function SaleStatusFilterSection({
  filters,
  update,
  horizontalScroll = false,
  hideLabel = false,
}: {
  filters: MarketFilters;
  update: (patch: Partial<MarketFilters>) => void;
  horizontalScroll?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div>
      {!hideLabel && <p className="mb-2 text-sm font-semibold text-foreground">판매 상태</p>}
      <div className={cn("flex gap-2", horizontalScroll ? "-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "flex-wrap")}>
        {marketSaleStatuses.map((status) => (
          <FilterChip
            key={status.value}
            label={status.label}
            size={horizontalScroll ? "smMarket" : "md"}
            active={filters.saleStatus === status.value}
            onClick={() => update({ saleStatus: status.value })}
          />
        ))}
      </div>
    </div>
  );
}

export function MarketSearchFilter({
  filters,
  onChange,
  onReset,
  resultCount,
  showSearch = true,
  hideSellerType = false,
  onClose,
}: MarketSearchFilterProps) {
  const update = (patch: Partial<MarketFilters>) => {
    onChange({ ...filters, ...patch });
  };

  return (
    <div className="rounded-xl border border-pul-border bg-white p-4 shadow-[0_2px_10px_rgba(6,78,59,0.06)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.18em] text-pul-point">
            MARKET FILTER
          </p>
          <h2 className="mt-1 text-xl font-bold text-foreground">검색 · 필터</h2>
          <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
            상품명, 카테고리, 지역, 판매 상태를 기준으로 실제 등록 상품을
            찾아볼 수 있습니다.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-pul-border px-3 py-1 text-xs font-bold text-pul-muted lg:hidden"
            >
              닫기
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            className="rounded-full bg-pul-light px-3 py-1 text-xs font-bold text-pul-deep"
          >
            초기화
          </button>
        </div>
      </div>

      {showSearch && (
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">검색어</span>
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
            />
            <input
              type="search"
              value={filters.keyword}
              onChange={(event) => update({ keyword: event.target.value })}
              placeholder="상품명, 지역 검색"
              className={cn(inputClass, "pl-10")}
            />
          </div>
        </label>
      )}

      <div className={cn("space-y-3", showSearch && "mt-3")}>
        {!hideSellerType && <SellerTypeFilterSection filters={filters} update={update} />}
        <CategoryFilterSection filters={filters} update={update} />
        <RegionFilterSection filters={filters} update={update} />
        <SaleStatusFilterSection filters={filters} update={update} />
      </div>

      <div className="mt-3 rounded-lg bg-pul-light px-3 py-2 text-sm text-pul-deep">
        검색 결과 <span className="font-bold">{resultCount}</span>개
      </div>
    </div>
  );
}

function MobileSearchToolbar({
  keyword,
  onKeywordChange,
  resultCount,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  resultCount: number;
}) {
  return (
    <div className="rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:hidden">
      <label className="relative block">
        <span className="sr-only">상품 검색</span>
        <Icon
          name="search"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pul-point"
        />
        <input
          type="search"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="상품명, 지역 검색"
          className="h-11 w-full rounded-lg border border-pul-border bg-[#fafbfa] pl-10 pr-3 text-sm outline-none focus:border-pul-point focus:ring-2 focus:ring-pul-point/20"
        />
      </label>
      <p className="mt-2 text-sm text-pul-muted">
        검색 결과 <span className="font-bold text-pul-deep">{resultCount}</span>개
      </p>
    </div>
  );
}

function MobileQuickFilterRow({
  title,
  filters,
  onChange,
  type,
}: {
  title: string;
  filters: MarketFilters;
  onChange: (filters: MarketFilters) => void;
  type: "sellerType" | "category" | "region" | "saleStatus";
}) {
  const update = (patch: Partial<MarketFilters>) => {
    onChange({ ...filters, ...patch });
  };

  const activeLabel =
    type === "sellerType"
      ? (marketSellerTypes.find((item) => item.value === filters.sellerType)?.label ??
        "전체")
      : type === "category"
        ? (marketCategories.find((item) => item.value === filters.category)?.label ??
          "전체")
        : type === "region"
          ? filters.region
          : (marketSaleStatuses.find((item) => item.value === filters.saleStatus)?.label ?? "전체");

  const isActive =
    type === "sellerType"
      ? filters.sellerType !== "all"
      : type === "category"
        ? filters.category !== "all"
        : type === "region"
          ? filters.region !== "전체"
          : filters.saleStatus !== "all";

  return (
    <div className="rounded-xl border border-pul-border bg-white px-3 py-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:hidden">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        {isActive ? (
          <span className="truncate text-[11px] text-pul-point">{activeLabel}</span>
        ) : null}
      </div>
      {type === "sellerType" && (
        <SellerTypeFilterSection
          filters={filters}
          update={update}
          horizontalScroll
          hideLabel
        />
      )}
      {type === "category" && (
        <CategoryFilterSection
          filters={filters}
          update={update}
          horizontalScroll
          hideLabel
        />
      )}
      {type === "region" && (
        <RegionFilterSection
          filters={filters}
          update={update}
          horizontalScroll
          hideLabel
        />
      )}
      {type === "saleStatus" && (
        <SaleStatusFilterSection
          filters={filters}
          update={update}
          horizontalScroll
          hideLabel
        />
      )}
    </div>
  );
}

export { MobileSearchToolbar, MobileQuickFilterRow };
