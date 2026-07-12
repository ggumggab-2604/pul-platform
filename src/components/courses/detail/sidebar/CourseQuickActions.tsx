"use client";

import { cn } from "@/lib/utils";
import {
  CalendarDays,
  ChevronDown,
  Heart,
  Map,
  MapPin,
  MapPinned,
  Phone,
  Share2,
  Users,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CourseQuickActionsProps = {
  mapsUrl: string;
  phoneHref: string;
  reservationUrl?: string;
  reservationGuideSummary: string;
  /** 「예약·이용 안내」 or 「이용 안내」 */
  usageGuideLabel: string;
  onUsageGuide: () => void;
  onReport: () => void;
  onMoreNearby: () => void;
  onViewMap?: () => void;
  onFavorite?: () => void;
  onShare?: () => void;
};

/** PC 헤더 아래 sticky offset — DetailPage sidebar 과 동일 */
const STICKY_TOP_PX = 112;
/** IO rootMargin 버퍼 — sticky top 직후 깜빡임 완화 */
const STICKY_HYSTERESIS_PX = 12;

function QuickActionContent({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <>
      <span className="quick-action-icon">{icon}</span>
      <span className="quick-action-label">{label}</span>
    </>
  );
}

const iconCls = "h-5 w-5";
const compactIconCls = "h-4 w-4 shrink-0";

const softCard =
  "box-border w-full rounded-xl border border-pul-border/60 bg-white p-4 shadow-[0_1px_4px_rgba(6,78,59,0.04)]";

export function CourseQuickActions({
  mapsUrl,
  phoneHref,
  reservationUrl,
  reservationGuideSummary,
  usageGuideLabel,
  onUsageGuide,
  onReport,
  onMoreNearby,
  onViewMap,
  onFavorite,
  onShare,
}: CourseQuickActionsProps) {
  const [compact, setCompact] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuId = useId();

  const scrollToMap = () => {
    if (onViewMap) {
      onViewMap();
      return;
    }
    document.getElementById("course-map")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  /* 센티널: 원위치 위로 스크롤되면 compact (lg 이상만) */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const mq = window.matchMedia("(min-width: 1024px)");
    let io: IntersectionObserver | null = null;

    const applyCompact = (next: boolean) => {
      setCompact((prev) => (prev === next ? prev : next));
    };

    const setup = () => {
      io?.disconnect();
      io = null;
      if (!mq.matches) {
        applyCompact(false);
        setMoreOpen(false);
        return;
      }
      io = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          applyCompact(!entry.isIntersecting);
        },
        {
          root: null,
          rootMargin: `-${STICKY_TOP_PX + STICKY_HYSTERESIS_PX}px 0px 0px 0px`,
          threshold: 0,
        },
      );
      io.observe(sentinel);
    };

    setup();
    mq.addEventListener("change", setup);
    return () => {
      io?.disconnect();
      mq.removeEventListener("change", setup);
    };
  }, []);

  useEffect(() => {
    if (!compact) setMoreOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!moreOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  const closeMoreThen = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

  /*
   * sticky 부모는 짧은 래퍼가 아니라 aside 전체 높이의 sidebar content.
   * fragment 로 반환해 sticky containing block = CourseDetailSidebar(h-full).
   * 센티널은 sidebar 의 relative 기준으로 원위치(상단)에 고정.
   * align-self:start + width:100% — sticky 높이 fit-content 유지하면서 우측 정렬 일치.
   */
  return (
    <>
      <div
        ref={sentinelRef}
        className="pointer-events-none absolute top-0 left-0 h-px w-full"
        aria-hidden="true"
      />
      <div
        className="box-border w-full lg:sticky lg:top-[112px] lg:z-20 lg:h-fit lg:w-full lg:justify-self-stretch lg:self-start"
        data-quick-actions-compact={compact ? "true" : "false"}
      >
        <section
          className={cn(
            softCard,
            "motion-safe:transition-[box-shadow] motion-safe:duration-200 motion-reduce:transition-none",
            compact && "shadow-[0_2px_10px_rgba(6,78,59,0.08)]",
          )}
          aria-label="빠른 이용"
        >
          <h2
            className={cn(
              "font-bold text-pul-deep motion-safe:transition-all motion-safe:duration-200",
              compact ? "mb-2 text-base" : "mb-3 text-base lg:text-lg",
            )}
          >
            빠른 이용
          </h2>

          <div
            className={cn(
              "motion-safe:transition-[max-height,opacity] motion-safe:duration-[220ms] motion-safe:ease-out motion-reduce:transition-none",
              compact
                ? "max-h-0 overflow-hidden opacity-0 pointer-events-none"
                : "max-h-[40rem] overflow-hidden opacity-100",
            )}
            aria-hidden={compact}
            inert={compact ? true : undefined}
          >
            <ExpandedActions
              mapsUrl={mapsUrl}
              phoneHref={phoneHref}
              reservationUrl={reservationUrl}
              reservationGuideSummary={reservationGuideSummary}
              usageGuideLabel={usageGuideLabel}
              onUsageGuide={onUsageGuide}
              onReport={onReport}
              onFavorite={onFavorite}
              onShare={onShare}
              scrollToMap={scrollToMap}
            />
          </div>

          <div
            className={cn(
              "motion-safe:transition-[max-height,opacity] motion-safe:duration-[220ms] motion-safe:ease-out motion-reduce:transition-none",
              compact
                ? "max-h-[48rem] overflow-hidden opacity-100"
                : "max-h-0 overflow-hidden opacity-0 pointer-events-none",
            )}
            aria-hidden={!compact}
            inert={!compact ? true : undefined}
          >
            <CompactActions
              mapsUrl={mapsUrl}
              phoneHref={phoneHref}
              reservationUrl={reservationUrl}
              reservationGuideSummary={reservationGuideSummary}
              usageGuideLabel={usageGuideLabel}
              moreOpen={moreOpen}
              moreMenuId={moreMenuId}
              moreButtonRef={moreButtonRef}
              onToggleMore={() => setMoreOpen((open) => !open)}
              onMoreNearby={onMoreNearby}
              onUsageGuide={() => closeMoreThen(onUsageGuide)}
              onReport={() => closeMoreThen(onReport)}
              onFavorite={
                onFavorite ? () => closeMoreThen(onFavorite) : undefined
              }
              onShare={onShare ? () => closeMoreThen(onShare) : undefined}
              scrollToMap={() => closeMoreThen(scrollToMap)}
            />
          </div>
        </section>
      </div>
    </>
  );
}

function ExpandedActions({
  mapsUrl,
  phoneHref,
  reservationUrl,
  reservationGuideSummary,
  usageGuideLabel,
  onUsageGuide,
  onReport,
  onFavorite,
  onShare,
  scrollToMap,
}: {
  mapsUrl: string;
  phoneHref: string;
  reservationUrl?: string;
  reservationGuideSummary: string;
  usageGuideLabel: string;
  onUsageGuide: () => void;
  onReport: () => void;
  onFavorite?: () => void;
  onShare?: () => void;
  scrollToMap: () => void;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onUsageGuide}
        className="quick-action-button quick-action-button--primary"
        title={reservationGuideSummary}
      >
        <QuickActionContent
          icon={<CalendarDays className={iconCls} aria-hidden="true" />}
          label={usageGuideLabel}
        />
      </button>
      {reservationUrl ? (
        <a
          href={reservationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="quick-action-button quick-action-button--primary"
          title={reservationGuideSummary}
        >
          <QuickActionContent
            icon={<CalendarDays className={iconCls} aria-hidden="true" />}
            label="예약하기"
          />
        </a>
      ) : (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="quick-action-button quick-action-button--primary"
        >
          <QuickActionContent
            icon={<MapPin className={iconCls} aria-hidden="true" />}
            label="길찾기"
          />
        </a>
      )}

      <a href={phoneHref} className="quick-action-button quick-action-button--secondary">
        <QuickActionContent
          icon={<Phone className={iconCls} aria-hidden="true" />}
          label="전화 문의"
        />
      </a>
      <Link href="#using-clubs" className="quick-action-button quick-action-button--secondary">
        <QuickActionContent
          icon={<Users className={iconCls} aria-hidden="true" />}
          label="동호회 보기"
        />
      </Link>

      {onFavorite ? (
        <button
          type="button"
          onClick={onFavorite}
          className="quick-action-button quick-action-button--simple"
        >
          <QuickActionContent
            icon={<Heart className={iconCls} aria-hidden="true" />}
            label="즐겨찾기"
          />
        </button>
      ) : null}
      {onShare ? (
        <button
          type="button"
          onClick={onShare}
          className="quick-action-button quick-action-button--simple"
        >
          <QuickActionContent
            icon={<Share2 className={iconCls} aria-hidden="true" />}
            label="공유"
          />
        </button>
      ) : null}

      {!reservationUrl ? (
        <button
          type="button"
          onClick={scrollToMap}
          className="quick-action-button quick-action-button--simple"
        >
          <QuickActionContent
            icon={<Map className={iconCls} aria-hidden="true" />}
            label="지도 보기"
          />
        </button>
      ) : (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="quick-action-button quick-action-button--simple"
        >
          <QuickActionContent
            icon={<MapPin className={iconCls} aria-hidden="true" />}
            label="길찾기"
          />
        </a>
      )}

      <button
        type="button"
        onClick={onReport}
        className="quick-action-button quick-action-button--simple"
      >
        <QuickActionContent
          icon={<span className="text-base font-bold">!</span>}
          label="정보 수정 제보"
        />
      </button>
    </div>
  );
}

function CompactActions({
  mapsUrl,
  phoneHref,
  reservationUrl,
  reservationGuideSummary,
  usageGuideLabel,
  moreOpen,
  moreMenuId,
  moreButtonRef,
  onToggleMore,
  onMoreNearby,
  onUsageGuide,
  onReport,
  onFavorite,
  onShare,
  scrollToMap,
}: {
  mapsUrl: string;
  phoneHref: string;
  reservationUrl?: string;
  reservationGuideSummary: string;
  usageGuideLabel: string;
  moreOpen: boolean;
  moreMenuId: string;
  moreButtonRef: React.RefObject<HTMLButtonElement | null>;
  onToggleMore: () => void;
  onMoreNearby: () => void;
  onUsageGuide: () => void;
  onReport: () => void;
  onFavorite?: () => void;
  onShare?: () => void;
  scrollToMap: () => void;
}) {
  return (
    <div className="box-border w-full">
      <div className="grid grid-cols-2 gap-2">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="quick-action-compact-btn"
          aria-label="길찾기"
        >
          <MapPin className={compactIconCls} aria-hidden="true" />
          <span>길찾기</span>
        </a>
        <a
          href={phoneHref}
          className="quick-action-compact-btn"
          aria-label="전화 문의"
        >
          <Phone className={compactIconCls} aria-hidden="true" />
          <span>전화</span>
        </a>
        <Link
          href="#using-clubs"
          className="quick-action-compact-btn"
          aria-label="동호회 보기"
        >
          <Users className={compactIconCls} aria-hidden="true" />
          <span>동호회</span>
        </Link>
        <button
          type="button"
          className="quick-action-compact-btn"
          aria-label="주변 이용정보 보기"
          onClick={onMoreNearby}
        >
          <MapPinned className={compactIconCls} aria-hidden="true" />
          <span>주변정보</span>
        </button>
      </div>

      <button
        ref={moreButtonRef}
        type="button"
        className="quick-action-compact-btn mt-2 w-full"
        aria-expanded={moreOpen}
        aria-controls={moreMenuId}
        onClick={onToggleMore}
      >
        <ChevronDown
          className={cn(
            compactIconCls,
            "motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none",
            moreOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
        <span>{moreOpen ? "더보기 접기" : "더보기 펼치기"}</span>
      </button>

      <div
        id={moreMenuId}
        role="region"
        aria-label="추가 빠른 이용"
        hidden={!moreOpen}
        className="quick-action-accordion"
      >
        <button
          type="button"
          className="quick-action-more-item"
          onClick={onUsageGuide}
          title={reservationGuideSummary}
        >
          <CalendarDays className={compactIconCls} aria-hidden="true" />
          {usageGuideLabel}
        </button>
        {reservationUrl ? (
          <a
            href={reservationUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={reservationGuideSummary}
            className="quick-action-more-item"
          >
            <CalendarDays className={compactIconCls} aria-hidden="true" />
            예약하기
          </a>
        ) : null}
        {onFavorite ? (
          <button
            type="button"
            className="quick-action-more-item"
            onClick={onFavorite}
          >
            <Heart className={compactIconCls} aria-hidden="true" />
            즐겨찾기
          </button>
        ) : null}
        {onShare ? (
          <button
            type="button"
            className="quick-action-more-item"
            onClick={onShare}
          >
            <Share2 className={compactIconCls} aria-hidden="true" />
            공유
          </button>
        ) : null}
        <button
          type="button"
          className="quick-action-more-item"
          onClick={scrollToMap}
        >
          <Map className={compactIconCls} aria-hidden="true" />
          지도 보기
        </button>
        <button
          type="button"
          className="quick-action-more-item"
          onClick={onReport}
        >
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center text-sm font-bold"
            aria-hidden="true"
          >
            !
          </span>
          정보 수정 제보
        </button>
      </div>
    </div>
  );
}
