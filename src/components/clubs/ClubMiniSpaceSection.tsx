import { clubMiniSpaceItems, CLUB_MINI_SPACE_NOTICE } from "@/data/clubData";
import { Icon } from "@/components/ui/Icon";

/**
 * TODO: 승인 회원 전용 미니게시판 UI 연결
 * - 공지사항 / 자유게시판 / 월례회 / 회원 전용 탭 라우팅
 */
export function ClubMiniSpaceSection() {
  return (
    <section className="rounded-xl border border-dashed border-pul-point/30 bg-gradient-to-br from-pul-light/40 to-white p-3 lg:p-4">
      <div className="mb-2.5 lg:mb-3">
        <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
          CLUB SPACE
        </p>
        <h3 className="mt-1 text-sm font-bold text-foreground lg:text-base">
          동호회 미니공간
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-pul-muted lg:text-sm">
          {CLUB_MINI_SPACE_NOTICE}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {clubMiniSpaceItems.map((item) => (
          <div
            key={item.id}
            data-club-space-slot={item.id}
            className="flex min-w-0 flex-col items-center rounded-lg border border-pul-border/80 bg-white/90 px-1.5 py-2.5 text-center opacity-75 lg:px-2 lg:py-3"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pul-light text-pul-deep lg:h-9 lg:w-9">
              <Icon name={item.icon} className="h-4 w-4" />
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-pul-deep lg:mt-2 lg:text-xs">
              {item.label}
            </p>
            <p className="mt-0.5 text-[10px] text-pul-muted">준비중</p>
          </div>
        ))}
      </div>
    </section>
  );
}
