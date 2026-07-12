import { CalendarDays, Heart, MapPin, MapPinned, Phone, Share2, Users } from "lucide-react";
import Link from "next/link";

type ScreenQuickActionsProps = {
  mapsUrl: string;
  phoneHref: string;
  onUsageGuide: () => void;
  onNearby: () => void;
  onFavorite: () => void;
  onShare: () => void;
  onReport: () => void;
  variant?: "desktop" | "mobile";
};

const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-pul-border bg-white px-3 text-[15px] font-bold text-pul-deep hover:bg-pul-light";
const desktopActionClass =
  "inline-flex h-[50px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-pul-border bg-white px-2 text-[15px] font-bold text-pul-deep hover:bg-pul-light";

export function ScreenQuickActions({
  mapsUrl,
  phoneHref,
  onUsageGuide,
  onNearby,
  onFavorite,
  onShare,
  onReport,
  variant = "desktop",
}: ScreenQuickActionsProps) {
  const buttonClass = variant === "desktop" ? desktopActionClass : actionClass;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <button
        type="button"
        onClick={onUsageGuide}
        className={buttonClass}
        aria-label="예약·이용 안내"
        title="예약·이용 안내"
      >
        <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
        {variant === "desktop" ? "예약안내" : "예약·이용 안내"}
      </button>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
        aria-label="길찾기"
        title="길찾기"
      >
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        길찾기
      </a>
      <a
        href={phoneHref}
        className={buttonClass}
        aria-label="전화 문의"
        title="전화 문의"
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
        {variant === "desktop" ? "전화" : "전화 문의"}
      </a>
      <Link
        href="#screen-clubs"
        className={buttonClass}
        aria-label="이용 동호회 보기"
        title="이용 동호회 보기"
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
        {variant === "desktop" ? "동호회" : "이용 동호회"}
      </Link>
      {variant === "desktop" ? (
        <>
          <button
            type="button"
            onClick={onNearby}
            className={buttonClass}
            aria-label="주변정보 보기"
            title="주변정보 보기"
          >
            <MapPinned className="h-4 w-4 shrink-0" aria-hidden="true" />
            주변정보
          </button>
          <button
            type="button"
            onClick={onFavorite}
            className={buttonClass}
            aria-label="즐겨찾기"
            title="즐겨찾기"
          >
            <Heart className="h-4 w-4 shrink-0" aria-hidden="true" />
            즐겨찾기
          </button>
          <button
            type="button"
            onClick={onShare}
            className={buttonClass}
            aria-label="공유"
            title="공유"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            공유
          </button>
          <button
            type="button"
            onClick={onReport}
            className={buttonClass}
            aria-label="정보 수정 제보"
            title="정보 수정 제보"
          >
            수정 제보
          </button>
        </>
      ) : null}
    </div>
  );
}
