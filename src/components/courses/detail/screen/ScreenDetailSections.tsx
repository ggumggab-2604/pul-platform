import { Card } from "@/components/ui/Card";
import type { ScreenCourseMapItem } from "@/data/courseMapData";
import {
  Accessibility,
  BadgeCheck,
  CalendarDays,
  Camera,
  Gamepad2,
  Monitor,
  ParkingCircle,
  Star,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

type ScreenSectionProps = {
  course: ScreenCourseMapItem;
  onAction: (title: string, message: string) => void;
};

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-4 text-[15px] font-bold text-pul-deep hover:bg-pul-light";

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-pul-border bg-pul-light/25 px-4 py-7 text-center text-[15px] leading-relaxed text-pul-muted">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-pul-border/60 py-3 last:border-0">
      <dt className="shrink-0 font-semibold text-pul-muted">{label}</dt>
      <dd className="text-right font-bold text-pul-deep">{value}</dd>
    </div>
  );
}

export function ScreenPricingSection({ course, onAction }: ScreenSectionProps) {
  const data = course.screenDetails;
  const rows = [
    ["평일 요금", data?.weekdayPricing ?? data?.pricing ?? "매장 문의"],
    ["주말·공휴일", data?.weekendPricing ?? "매장 문의"],
    ["회원 요금", data?.memberPricing ?? "매장 문의"],
    ["단체 요금", data?.groupPricing ?? "매장 문의"],
    ["장비 대여료", data?.rentalFee ?? "매장 문의"],
    ["레슨 비용", data?.lessonFee ?? "매장 문의"],
    ["예약 방식", data?.reservationMethod ?? "정보 확인 중"],
    ["취소 규정", data?.cancellationPolicy ?? "매장 문의"],
    ["결제 방식", data?.paymentMethods?.join(" · ") ?? "매장 문의"],
  ];

  return (
    <Card id="screen-pricing" title="요금·예약 안내">
      <dl className="grid gap-x-6 sm:grid-cols-2">
        {rows.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}
      </dl>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a href={`tel:${course.phone.replace(/-/g, "")}`} className={`${buttonClass} bg-pul-point text-white hover:bg-pul-deep`}>
          전화 예약 문의
        </a>
        <button
          type="button"
          onClick={() => onAction("예약·이용 안내", "예약 가능 시간과 취소 규정은 방문 전 매장에 확인해 주세요.")}
          className={buttonClass}
        >
          예약·이용 안내
        </button>
      </div>
    </Card>
  );
}

export function ScreenVenueFacilitiesSection({ course }: ScreenSectionProps) {
  const data = course.screenDetails;
  const roomLabel = data?.roomCount
    ? `${data.roomCount}개 룸`
    : data?.bayCount
      ? `${data.bayCount}개 타석`
      : "룸·타석 수 확인 중";
  const badges = [
    roomLabel,
    data?.privateRoomCount ? `독립룸 ${data.privateRoomCount}개` : null,
    data?.leftHandedAvailable === true ? "좌타석 가능" : null,
    course.parking ? "주차 가능" : "주차 불가",
    data?.equipmentRental === true ? "장비 대여" : null,
    data?.practiceModeAvailable === true ? "연습 모드" : null,
    data?.tournamentModeAvailable === true ? "대회 모드" : null,
  ].filter((item): item is string => Boolean(item));

  const facilities = [
    ["기기 브랜드", data?.equipmentBrand ?? "정보 확인 중", <Monitor key="brand" />],
    ["스크린 시스템", data?.screenSystem ?? "정보 확인 중", <Gamepad2 key="system" />],
    ["휴게 공간", course.amenities.restArea.description, <Users key="rest" />],
    ["화장실", course.amenities.restroom.description, <BadgeCheck key="restroom" />],
    ["주차", course.amenities.parking.description, <ParkingCircle key="parking" />],
    ["장애인 접근성", data?.accessibility ?? "정보 확인 중", <Accessibility key="access" />],
  ] as const;

  return (
    <Card title="매장 시설·기기">
      <div className="flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span key={badge} className="rounded-full bg-pul-light px-3 py-1.5 text-sm font-bold text-pul-deep ring-1 ring-emerald-200/70">
            {badge}
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {facilities.map(([label, value, icon]) => (
          <div key={label} className="flex gap-3 rounded-lg border border-pul-border/70 p-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pul-light text-pul-point [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
            <div>
              <p className="text-sm font-semibold text-pul-muted">{label}</p>
              <p className="mt-1 font-bold leading-snug text-pul-deep">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function ScreenLessonGroupSection({ course, onAction }: ScreenSectionProps) {
  const data = course.screenDetails;
  const lessonLabel = data?.lessonAvailable === true ? "레슨 가능" : data?.lessonAvailable === false ? "레슨 없음" : "레슨 정보 확인 중";
  const groupLabel = data?.groupAvailable === true ? "단체 예약 가능" : "단체 이용은 매장에 문의해 주세요.";

  return (
    <Card title="레슨·단체 이용">
      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border border-pul-border/70 p-4">
          <p className="font-bold text-pul-deep">초보자 레슨</p>
          <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">{lessonLabel}</p>
          <p className="mt-1 text-[15px] text-pul-muted">
            {data?.lessonTargets?.join(" · ") ?? "대상 확인 중"} · {data?.lessonType ?? "형태 확인 중"}
          </p>
          <button type="button" onClick={() => onAction("레슨 문의", "레슨 일정과 비용은 전화로 문의해 주세요.")} className={`${buttonClass} mt-3`}>
            레슨 문의
          </button>
        </article>
        <article className="rounded-lg border border-pul-border/70 p-4">
          <p className="font-bold text-pul-deep">단체·동호회 이용</p>
          <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">{groupLabel}</p>
          <p className="mt-1 text-[15px] text-pul-muted">
            {data?.maxGroupSize ? `최대 ${data.maxGroupSize}명` : "수용 인원 확인 중"} · 대관 시간 매장 문의
          </p>
          <button type="button" onClick={() => onAction("단체 이용 문의", "동호회·기관 행사·대회 대관은 매장에 문의해 주세요.")} className={`${buttonClass} mt-3`}>
            대관 문의
          </button>
        </article>
      </div>
    </Card>
  );
}

export function ScreenLeagueSection({ course, onAction }: ScreenSectionProps) {
  const events = course.events.slice(0, 3);
  return (
    <Card title="리그·스크린 대회">
      {events.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-pul-border/70 p-4">
              <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">{event.status}</span>
              <p className="mt-3 font-bold leading-snug text-foreground">{event.title}</p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-pul-muted"><CalendarDays className="h-4 w-4" />{event.date}</p>
              <p className="mt-2 text-sm text-pul-muted">참가 대상·참가비는 매장 문의</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>등록된 리그·대회가 없습니다.<br />이 매장의 첫 리그를 등록해보세요.</EmptyState>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("리그·대회 등록 문의", "매장 리그와 스크린 대회 등록 기능은 준비 중입니다.")} className={buttonClass}>리그·대회 등록 문의</button>
        <button type="button" onClick={() => onAction("전체 일정", "전체 리그·대회 일정 기능은 준비 중입니다.")} className={buttonClass}>전체 일정 보기</button>
      </div>
    </Card>
  );
}

export function ScreenReviewsSection({ course, onAction }: ScreenSectionProps) {
  const reviews = course.screenDetails?.reviews?.slice(0, 3) ?? [];
  return (
    <Card title="매장 후기">
      {reviews.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-lg border border-pul-border/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground">{review.author}</span>
                {review.rating ? <span className="inline-flex items-center gap-1 font-bold text-amber-600"><Star className="h-4 w-4 fill-current" />{review.rating}</span> : null}
              </div>
              <p className="mt-1 text-sm text-pul-muted">방문 {review.visitedAt}</p>
              <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-pul-muted">{review.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>등록된 매장 후기가 없습니다.<br />첫 후기를 남겨보세요.</EmptyState>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("후기 쓰기", "후기 작성 기능은 추후 로그인 기반으로 제공될 예정입니다.")} className={buttonClass}>후기 쓰기</button>
        <button type="button" onClick={() => onAction("전체 후기", "전체 후기 보기 기능은 준비 중입니다.")} className={buttonClass}>전체 후기 보기</button>
      </div>
    </Card>
  );
}

export function ScreenClubsSection({ course, onAction }: ScreenSectionProps) {
  const clubs = course.homeClubs.slice(0, 3);
  return (
    <Card id="screen-clubs" title="이용 동호회">
      {clubs.length > 0 ? (
        <ul className="grid gap-3 lg:grid-cols-3">
          {clubs.map((club) => (
            <li key={club.id} className="rounded-lg border border-pul-border/70 p-4">
              <p className="font-bold leading-snug text-foreground">{club.name}</p>
              <p className="mt-2 text-sm text-pul-muted">{club.schedule} · 회원 {club.memberCount}명</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">{club.recruitStatus}</span>
                {club.beginnerFriendly ? <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">초보 가입 가능</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>등록된 이용 동호회가 없습니다.<br />이 매장을 이용하는 동호회를 등록해보세요.</EmptyState>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onAction("동호회 등록", "이 매장을 이용하는 동호회 등록 기능은 준비 중입니다.")} className={buttonClass}>동호회 등록</button>
        <a href="/clubs" className={buttonClass}>전체 동호회 보기</a>
      </div>
    </Card>
  );
}

export function ScreenNearbySection({ course, onAction }: ScreenSectionProps) {
  const places = course.nearbyPlaces.slice(0, 6);
  const gridClass = places.length === 1 ? "lg:max-w-md" : places.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-3";
  return (
    <Card id="screen-nearby" title="주변 이용정보">
      {places.length > 0 ? (
        <ul className={`grid gap-3 ${gridClass}`}>
          {places.map((place) => (
            <li key={place.id} className="rounded-lg border border-pul-border/70 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">{place.category}</span>
                <span className="text-sm font-semibold text-pul-muted">{place.distance}</span>
              </div>
              <p className="mt-3 font-bold text-foreground">{place.name}</p>
              <p className="mt-1 text-sm font-semibold text-pul-point">{place.purpose}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">{place.description}</p>
              <button type="button" onClick={() => onAction("주변 장소 안내", `${place.name} 길찾기 연결은 준비 중입니다.`)} className={`${buttonClass} mt-3 w-full`}>{place.ctaText}</button>
            </li>
          ))}
        </ul>
      ) : <EmptyState>등록된 주변 이용정보가 없습니다.</EmptyState>}
    </Card>
  );
}

export function ScreenParticipationSection({ onAction }: Omit<ScreenSectionProps, "course">) {
  const actions = [
    ["매장사진 올리기", "매장 내부와 타석 사진 업로드 기능은 준비 중입니다.", Camera],
    ["후기 쓰기", "후기 작성 기능은 추후 로그인 기반으로 제공될 예정입니다.", Star],
    ["리그·대회 등록 문의", "매장 리그와 스크린 대회 등록 기능은 준비 중입니다.", Gamepad2],
    ["동호회 등록", "이 매장을 이용하는 동호회 등록 기능은 준비 중입니다.", Users],
    ["정보 수정 제보", "매장 운영 정보 변경 제보는 PUL 운영팀 확인 후 반영됩니다.", BadgeCheck],
  ] as const;
  return (
    <Card title="매장 정보에 참여하기">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map(([label, message, Icon]) => (
          <button key={label} type="button" onClick={() => onAction(label, message)} className={`${buttonClass} gap-2 px-3`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>
    </Card>
  );
}
