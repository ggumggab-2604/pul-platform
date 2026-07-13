import { ClubDetailActions } from "@/components/clubs/detail/ClubDetailActions";
import { Card } from "@/components/ui/Card";
import {
  clubDetailRecruitStatusLabels,
  clubEventRecruitmentLabels,
  clubEventTypeLabels,
  getHomeCourseHref,
  memberStyleLabels,
} from "@/data/clubData";
import { courseMapItems, courseTypeLabels, operationLabels } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import type { ClubDetailData } from "@/types";
import { CalendarDays, Camera, Flag, MapPin, Megaphone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type ClubDetailSectionsProps = {
  detail: ClubDetailData;
};

function EmptyState({
  children,
  compact = false,
}: {
  children: ReactNode;
  /** 모바일에서만 패딩을 살짝 줄인 빈 상태 (게시판·활동사진) */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-pul-border bg-pul-light/25 text-center text-[15px] leading-relaxed text-pul-muted",
        compact ? "px-3 py-4 lg:px-4 lg:py-7" : "px-4 py-7",
      )}
    >
      {children}
    </div>
  );
}

export function ClubSummarySection({ detail }: ClubDetailSectionsProps) {
  const { club } = detail;
  const target = (club.memberStyles ?? []).map((style) => memberStyleLabels[style]).join(" · ");
  const items = [
    ["활동 지역", club.regionLabel],
    ["주 활동 골프장", club.homeCourse],
    ["정기 모임", `${club.scheduleLabel} · ${club.time}`],
    ["회원 모집", clubDetailRecruitStatusLabels[club.recruitStatus]],
    ["가입 대상", target || "동호회에 문의"],
    ["회비·참가비", club.feeInfo || "동호회에 문의"],
    ["문의 방식", club.contactMethod || "동호회에 문의"],
  ];

  return (
    <Card title="동호회 핵심정보">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {items.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border border-pul-border/70 bg-pul-light/25 p-3">
            <dt className="text-sm font-semibold text-pul-muted">{label}</dt>
            <dd className="mt-1 break-words text-[15px] font-bold leading-snug text-pul-deep lg:text-base">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function ClubIntroSection({ detail }: ClubDetailSectionsProps) {
  const { club } = detail;
  return (
    <Card title="동호회 소개">
      <p className="text-base leading-7 text-foreground">{club.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-pul-light/35 p-4">
          <h3 className="font-bold text-pul-deep">주요 활동</h3>
          <ul className="mt-2 space-y-1.5 text-[15px] text-pul-muted">
            {(club.mainActivities ?? []).map((activity) => (
              <li key={activity}>• {activity}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-pul-light/35 p-4">
          <h3 className="font-bold text-pul-deep">가입 대상·분위기</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">
            {club.joinConditions || "가입 대상은 동호회에 문의해 주세요."}
          </p>
          <p className="mt-2 font-semibold text-pul-deep">
            {club.beginnerFriendly ? "초보자 가입 가능" : club.beginnerGuide || "초보자 가입 여부 확인 중"}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function ClubJoinSection({ detail }: ClubDetailSectionsProps) {
  const { club } = detail;
  const rows = [
    ["모집 상태", clubDetailRecruitStatusLabels[club.recruitStatus]],
    ["가입 조건", club.joinConditions || "동호회에 문의"],
    ["회비·활동비", club.feeInfo || "동호회에 문의"],
    ["초보자 안내", club.beginnerGuide || "정보 확인 중"],
    ["신청·문의", club.contactMethod || "동호회에 문의"],
  ];
  return (
    <Card title="회원 모집·가입 안내">
      {/* PC만 행 높이·줄간격 보강 — 모바일(기본 py-3 스택) 유지 */}
      <dl className="divide-y divide-pul-border/70">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid gap-1 py-3 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4 lg:min-h-[3.5rem] lg:items-start lg:gap-x-5 lg:py-4"
          >
            <dt className="font-semibold leading-snug text-pul-muted lg:pt-0.5">{label}</dt>
            <dd className="break-words font-medium leading-relaxed text-foreground lg:leading-7">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function ClubNextMeetingSection({ detail }: ClubDetailSectionsProps) {
  const event = detail.nextMeeting;
  return (
    <Card id="club-next-meeting" title="다음 모임·월례회" className="scroll-mt-28">
      {event ? (
        <article className="rounded-lg border border-pul-border/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">
              {clubEventTypeLabels[event.eventType]}
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
              {clubEventRecruitmentLabels[event.recruitmentStatus]}
            </span>
          </div>
          <h3 className="mt-3 break-words text-lg font-bold leading-snug text-foreground">{event.title}</h3>
          {/* 고정 높이 금지 — 일정/장소 전체 표시 (모바일 1열 / sm+ 2열 유지) */}
          <dl className="mt-3 grid gap-3 text-[15px] sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="font-semibold text-pul-muted">일정</dt>
              <dd className="mt-0.5 break-words font-medium leading-relaxed">{event.dateText}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-pul-muted">장소</dt>
              <dd className="mt-0.5 break-words font-medium leading-relaxed">{event.courseName}</dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="font-semibold text-pul-muted">참가 대상</dt>
              <dd className="mt-0.5 break-words font-medium leading-relaxed">{event.participationCondition}</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-pul-muted">참가비</dt>
              <dd className="mt-0.5 break-words font-medium leading-relaxed">동호회에 문의</dd>
            </div>
            <div className="min-w-0">
              <dt className="font-semibold text-pul-muted">안내</dt>
              <dd className="mt-0.5 break-words font-medium leading-relaxed">세부 일정은 공지사항을 확인해 주세요.</dd>
            </div>
          </dl>
          <p className="mt-3 text-[15px] leading-relaxed text-pul-muted">{event.summary}</p>
        </article>
      ) : (
        <EmptyState>
          예정된 정기 모임이 없습니다.
          <br />
          새로운 일정은 동호회 공지에서 확인할 수 있습니다.
        </EmptyState>
      )}
    </Card>
  );
}

export function ClubNoticesSection({ detail }: ClubDetailSectionsProps) {
  const notices = (detail.notices ?? []).slice(0, 3);

  return (
    <Card id="club-notices" title="공지사항" className="scroll-mt-28">
      {/* 이 Card 안에는 공지 목록(또는 공지 empty)만 — 활동사진/게시판 empty 금지 */}
      {notices.length > 0 ? (
        <ul className="divide-y divide-pul-border/70" data-testid="club-notice-list">
          {notices.map((notice) => (
            <li key={notice.id} className="flex items-start gap-3 py-3 lg:py-3.5">
              {notice.important ? (
                <span className="shrink-0 rounded-md bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">중요</span>
              ) : (
                <Megaphone className="mt-1 h-4 w-4 shrink-0 text-pul-point" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="break-words font-bold leading-snug text-foreground lg:leading-7">{notice.title}</p>
                <p className="mt-1 text-sm text-pul-muted">{notice.date ?? "작성일 확인 중"}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>등록된 공지사항이 없습니다.</EmptyState>
      )}
    </Card>
  );
}

export function ClubBoardSection({ detail }: ClubDetailSectionsProps) {
  const posts = (detail.posts ?? []).slice(0, 3);
  return (
    <Card id="club-board" title="동호회 게시판" className="scroll-mt-28">
      {posts.length > 0 ? (
        <ul className="divide-y divide-pul-border/70">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center gap-3 py-3">
              <span className="rounded-md bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">{post.category}</span>
              <div className="min-w-0">
                <p className="break-words font-bold text-foreground">{post.title}</p>
                <p className="mt-1 text-sm text-pul-muted">{post.date ?? "작성일 확인 중"}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact>
          등록된 게시글이 없습니다.
          <br />
          게시글 작성 기능은 준비 중입니다.
        </EmptyState>
      )}
    </Card>
  );
}

export function ClubPhotosSection({ detail }: ClubDetailSectionsProps) {
  const photos = detail.photos ?? [];
  return (
    <Card id="club-photos" title="활동사진">
      {/* 카메라 empty 는 여기만 — 공지/게시판 Card에 넣지 않음 */}
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.slice(0, 6).map((photo, index) => (
            <li
              key={photo.id}
              className={cn(
                "relative aspect-[4/3] overflow-hidden rounded-lg bg-pul-light",
                index >= 4 ? "hidden sm:block" : "",
              )}
            >
              <Image src={photo.src} alt={photo.alt} fill className="object-cover" sizes="(max-width: 640px) 50vw, 280px" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact>
          <Camera className="mx-auto mb-2 h-8 w-8 text-pul-muted/50" aria-hidden="true" />
          등록된 활동사진이 없습니다.
          <br />
          동호회의 활동 모습을 준비 중입니다.
        </EmptyState>
      )}
    </Card>
  );
}

export function ClubHomeCourseSection({ detail }: ClubDetailSectionsProps) {
  const { club } = detail;
  const course = courseMapItems.find((item) => item.id === club.homeCourseId);
  return (
    <Card id="club-home-course" title="주 활동 골프장" className="scroll-mt-28">
      <article className="rounded-lg border border-pul-border/70 p-4 pb-5">
        <div className="flex flex-wrap items-center gap-2">
          {course ? (
            <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">
              {courseTypeLabels[course.type]}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-pul-muted">
            <MapPin className="h-4 w-4" />
            {course ? `${course.region} ${course.city}` : club.regionLabel}
          </span>
        </div>
        <h3 className="mt-3 break-words text-lg font-bold leading-snug text-foreground">{club.homeCourse}</h3>
        {course ? (
          <p className="mt-2 break-words text-[15px] leading-relaxed text-pul-muted">
            {course.holes}홀 · {operationLabels[course.operation]} · {course.hours}
          </p>
        ) : (
          <p className="mt-2 text-[15px] text-pul-muted">이용 정보 확인 중</p>
        )}
        <div className="mt-4 pb-0.5">
          <Link
            href={getHomeCourseHref(club.homeCourseId)}
            className="inline-flex h-11 min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-pul-point px-4 py-2.5 text-[15px] font-bold leading-none text-white hover:bg-pul-deep"
          >
            <Flag className="h-4 w-4 shrink-0" aria-hidden="true" />
            골프장 상세보기
          </Link>
        </div>
      </article>
    </Card>
  );
}

export function ClubRecentActivitySection({ detail }: ClubDetailSectionsProps) {
  const activities = detail.recentActivities ?? [];
  return (
    <Card title="최근 활동·기록">
      {activities.length > 0 ? (
        <ul className="space-y-3">
          {activities.map((activity) => (
            <li key={activity.id} className="flex gap-3 rounded-lg border border-pul-border/70 p-4">
              <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-pul-point" />
              <div className="min-w-0">
                <p className="font-bold text-foreground">{activity.title}</p>
                {activity.date ? <p className="mt-1 text-sm font-semibold text-pul-point">{activity.date}</p> : null}
                {activity.summary ? <p className="mt-1 text-[15px] text-pul-muted">{activity.summary}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>등록된 최근 활동·기록이 없습니다.</EmptyState>
      )}
    </Card>
  );
}

export function ClubContactSection({ detail }: ClubDetailSectionsProps) {
  const { contact } = detail;
  return (
    <Card title="운영진·문의">
      <dl className="grid gap-3 sm:grid-cols-2">
        {contact?.role ? (
          <div className="rounded-lg bg-pul-light/30 p-3">
            <dt className="text-sm font-semibold text-pul-muted">역할</dt>
            <dd className="mt-1 font-bold text-pul-deep">{contact.role}</dd>
          </div>
        ) : null}
        {contact?.name ? (
          <div className="rounded-lg bg-pul-light/30 p-3">
            <dt className="text-sm font-semibold text-pul-muted">운영진</dt>
            <dd className="mt-1 font-bold text-pul-deep">{contact.name}</dd>
          </div>
        ) : null}
        <div className="rounded-lg bg-pul-light/30 p-3">
          <dt className="text-sm font-semibold text-pul-muted">문의 가능 시간</dt>
          <dd className="mt-1 font-bold text-pul-deep">{contact?.availableTime ?? "동호회에 문의"}</dd>
        </div>
        <div className="rounded-lg bg-pul-light/30 p-3">
          <dt className="text-sm font-semibold text-pul-muted">문의 방식</dt>
          <dd className="mt-1 break-words font-bold text-pul-deep">{contact?.method ?? "동호회에 문의"}</dd>
        </div>
        <div className="rounded-lg bg-pul-light/30 p-3">
          <dt className="text-sm font-semibold text-pul-muted">운영 지역</dt>
          <dd className="mt-1 font-bold text-pul-deep">{contact?.region ?? detail.club.regionLabel}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function ClubParticipationSection({ detail }: ClubDetailSectionsProps) {
  return (
    <Card title="동호회 정보 참여" className="lg:mb-2">
      <ClubDetailActions club={detail.club} variant="participation" />
    </Card>
  );
}
