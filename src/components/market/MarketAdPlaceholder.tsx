type Props = {
  onInquiry: (trigger: HTMLButtonElement) => void;
};

export function MarketAdPlaceholder({ onInquiry }: Props) {
  return (
    <aside
      data-ad-slot="market-brand-banner"
      className="flex items-center gap-3 rounded-xl border border-dashed border-pul-point/25 bg-gradient-to-r from-pul-light/80 via-white to-emerald-50 px-3 py-3 shadow-[0_2px_10px_rgba(6,78,59,0.04)] sm:px-4 lg:block lg:px-6 lg:py-5"
    >
      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pul-light text-[10px] font-bold tracking-wider text-pul-point sm:flex lg:hidden">
        AD
      </div>
      <div className="min-w-0 flex-1 lg:min-w-full">
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px] lg:tracking-[0.16em]">
          AD SLOT · PUL 추천 장비
        </p>
        <p className="mt-0.5 truncate text-sm font-bold text-pul-deep lg:mt-1 lg:text-lg">
          브랜드·업체 광고 영역 준비중
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 lg:mt-2">
          <p className="text-xs text-pul-muted lg:text-sm">
            입점·광고·제휴는 기본 제안만 안전하게 접수합니다.
          </p>
          <button
            type="button"
            onClick={(event) => onInquiry(event.currentTarget)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-pul-point/30 bg-white px-4 text-sm font-bold text-pul-deep hover:bg-pul-light"
          >
            입점·제휴 문의
          </button>
        </div>
      </div>
    </aside>
  );
}
