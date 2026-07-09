import { startupBoardGuideNotes } from "@/data/marketData";
import { Icon } from "@/components/ui/Icon";

type StartupBoardGuideBoxProps = {
  compact?: boolean;
};

export function StartupBoardGuideBox({ compact = false }: StartupBoardGuideBoxProps) {
  return (
    <section
      className={
        compact
          ? "rounded-lg border border-orange-200/80 bg-gradient-to-b from-orange-50/50 to-white p-3"
          : "rounded-xl border border-orange-200/80 bg-gradient-to-b from-orange-50/50 to-white p-4 lg:p-5"
      }
    >
      <div className="flex items-start gap-2 lg:gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700 lg:h-9 lg:w-9">
          <Icon name="doc" className="h-4 w-4 lg:h-5 lg:w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={
              compact
                ? "text-sm font-bold text-foreground"
                : "text-base font-bold text-foreground lg:text-lg"
            }
          >
            창업·매매 게시판 안내
          </h2>
          <p
            className={
              compact
                ? "mt-1 text-xs leading-relaxed text-pul-muted"
                : "mt-1.5 text-sm leading-relaxed text-pul-muted"
            }
          >
            스크린 파크골프 창업, 기존 매장 매매, 필드 구장 신설, 유휴지 활용,
            시설·시공 문의는 조건에 따라 비용과 절차가 크게 달라질 수 있습니다.
            PUL은 정보를 연결하는 공간이며, 실제 계약, 매매, 인허가, 수익성,
            공사 비용은 반드시 당사자와 전문가, 지자체, 관련 업체를 통해 직접
            확인해야 합니다.
          </p>
        </div>
      </div>

      <ul className={compact ? "mt-2 space-y-1.5" : "mt-3 space-y-2 lg:mt-4"}>
        {startupBoardGuideNotes.map((note) => (
          <li
            key={note}
            className={
              compact
                ? "flex items-start gap-2 text-xs leading-relaxed text-foreground"
                : "flex items-start gap-2 rounded-lg bg-white/80 px-3 py-2 text-sm leading-relaxed text-foreground"
            }
          >
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
