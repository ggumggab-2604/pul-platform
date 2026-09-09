import { Icon } from "@/components/ui/Icon";

type PublicSearchFormProps = {
  compact?: boolean;
  query?: string;
};

export function PublicSearchForm({ compact = false, query = "" }: PublicSearchFormProps) {
  return (
    <form action="/search" method="get" role="search" aria-label="PUL 통합 검색" className="relative w-full max-w-2xl">
      <input
        type="search"
        name="q"
        aria-label="골프장·공개 동호회·뉴스 검색어"
        placeholder="PUL 통합 검색"
        defaultValue={query}
        required
        maxLength={100}
        className={`w-full rounded-full border border-pul-border bg-[#f8faf9] pr-6 shadow-inner outline-none transition-shadow focus:border-pul-point focus:bg-white focus:ring-2 focus:ring-pul-point/20 ${compact ? "h-11 pl-12 text-base" : "h-14 pl-14 text-lg"}`}
      />
      <button
        type="submit"
        aria-label="검색"
        className={`absolute inset-y-0 left-0 flex items-center justify-center rounded-full text-pul-point hover:text-pul-deep focus-visible:outline-2 focus-visible:outline-pul-point ${compact ? "w-11" : "w-14"}`}
      >
        <Icon name="search" className="h-5 w-5" />
      </button>
    </form>
  );
}
