import { ClubDetailActions } from "@/components/clubs/detail/ClubDetailActions";
import { ClubEventParticipationPanel } from "@/components/clubs/detail/ClubEventParticipationPanel";
import { Card } from "@/components/ui/Card";
import type { ClubEventParticipationSnapshot } from "@/lib/clubs/clubEventParticipation";
import {
  clubActivityTypeLabels,
  clubContentVerificationLabels,
  clubDetailRecruitStatusLabels,
  clubNoticeImportanceLabels,
  clubNoticeTypeLabels,
  clubOfficialEventReservationMethodLabels,
  clubOfficialEventStatusLabels,
  clubOfficialEventTypeLabels,
  clubPostRecruitmentStatusLabels,
  clubPostTypeLabels,
  getHomeCourseHref,
} from "@/data/clubData";
import { getCourseDetailPageData } from "@/data/courseDetailPageData";
import { courseMapItems, courseTypeLabels, operationLabels } from "@/data/courseMapData";
import { cn } from "@/lib/utils";
import type { ClubActivityPhoto, ClubDetailData, ClubDetailNotice, ClubDetailPost, ClubOfficialEvent } from "@/types";
import { CalendarDays, Camera, Flag, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

type ClubDetailSectionsProps = {
  detail: ClubDetailData;
};

type ClubOfficialEventsSectionProps = ClubDetailSectionsProps & {
  action?: ReactNode;
  onEdit?: (event: ClubOfficialEvent, trigger: HTMLButtonElement) => void;
  onCancel?: (event: ClubOfficialEvent, trigger: HTMLButtonElement) => void;
  participationSnapshot: ClubEventParticipationSnapshot;
  participationBusyEventId?: string;
  participationMessage?: string;
  participationError?: string;
  participationLoginHref: string;
  onJoinEvent: (eventId: string) => void;
  onLeaveEvent: (eventId: string) => void;
};

type ClubNoticesSectionProps = ClubDetailSectionsProps & {
  action?: ReactNode;
  onEdit?: (notice: ClubDetailNotice, trigger: HTMLButtonElement) => void;
  onDelete?: (notice: ClubDetailNotice, trigger: HTMLButtonElement) => void;
};

type ClubBoardSectionProps = ClubDetailSectionsProps & {
  action?: ReactNode;
  onEdit?: (post: ClubDetailPost, trigger: HTMLButtonElement) => void;
  onDelete?: (post: ClubDetailPost, trigger: HTMLButtonElement) => void;
};

type ClubPhotosSectionProps = ClubDetailSectionsProps & {
  action?: ReactNode;
  onDelete?: (photo: ClubActivityPhoto, trigger: HTMLButtonElement) => void;
};

function ContentManagementActions({
  canManage,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  canManage: boolean;
  editLabel: string;
  deleteLabel: string;
  onEdit?: (trigger: HTMLButtonElement) => void;
  onDelete?: (trigger: HTMLButtonElement) => void;
}) {
  if (!canManage) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {onEdit ? (
        <button type="button" onClick={(event) => onEdit(event.currentTarget)} className="min-h-11 rounded-lg border border-pul-border px-3 text-sm font-bold text-pul-deep hover:bg-pul-light">
          {editLabel}
        </button>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={(event) => onDelete(event.currentTarget)} className="min-h-11 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50">
          {deleteLabel}
        </button>
      ) : null}
    </div>
  );
}

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

export function ClubIntroSection({ detail }: ClubDetailSectionsProps) {
  const { club } = detail;
  return (
    <Card title="동호회 소개">
      <p className="text-base leading-7 text-foreground">{club.description}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-pul-light/35 p-4">
          <h3 className="font-bold text-pul-deep">주요 활동</h3>
          {club.mainActivities.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-[15px] text-pul-muted">
              {club.mainActivities.map((activity) => <li key={activity}>• {activity}</li>)}
            </ul>
          ) : <p className="mt-2 text-[15px] text-pul-muted">등록된 주요 활동이 없습니다.</p>}
        </div>
        <div className="rounded-lg bg-pul-light/35 p-4">
          <h3 className="font-bold text-pul-deep">활동 분위기</h3>
          {(club.activityAtmosphere ?? []).length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-[15px] text-pul-muted">
              {(club.activityAtmosphere ?? []).map((item) => <li key={item}>• {item}</li>)}
            </ul>
          ) : <p className="mt-2 text-[15px] text-pul-muted">등록된 활동 분위기 정보가 없습니다.</p>}
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

const postDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Seoul",
});

const postTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Seoul",
});

const activityDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "Asia/Seoul",
});

function formatKnownActivityDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : activityDateFormatter.format(date);
}

function formatPostPeriod(post: ClubDetailPost) {
  if (!post.startsAt) return undefined;
  const start = postDateFormatter.format(new Date(post.startsAt));
  return post.endsAt ? `${start} ~ ${postTimeFormatter.format(new Date(post.endsAt))}` : start;
}

function officialEventStatusTone(status: ClubOfficialEvent["officialEventStatus"]) {
  if (status === "registrationOpen") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "scheduled") return "border-sky-200 bg-sky-50 text-sky-800";
  if (status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-pul-border bg-pul-page text-pul-muted";
}

function OfficialEventBadges({ event }: { event: ClubOfficialEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-pul-light px-2.5 py-1 text-xs font-bold text-pul-deep">
        {clubOfficialEventTypeLabels[event.officialEventType]}
      </span>
      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", officialEventStatusTone(event.officialEventStatus))}>
        {clubOfficialEventStatusLabels[event.officialEventStatus]}
      </span>
    </div>
  );
}

function OfficialCourseLink({ event, label }: { event: ClubOfficialEvent; label?: string }) {
  const course = event.linkedCourseId
    ? courseMapItems.find((item) => item.id === event.linkedCourseId)
    : undefined;
  if (!course || !event.linkedCourseId) return <>골프장 정보 확인 중</>;

  return (
    <Link
      href={getHomeCourseHref(event.linkedCourseId)}
      className="font-bold text-pul-deep underline-offset-2 hover:underline"
      aria-label={`${course.name} ${label ?? "골프장 상세보기"}`}
    >
      {label ?? course.name}
    </Link>
  );
}

function CompactOfficialEventCard({ event, onEdit, onCancel }: { event: ClubOfficialEvent; onEdit?: ClubOfficialEventsSectionProps["onEdit"]; onCancel?: ClubOfficialEventsSectionProps["onCancel"] }) {
  return (
    <article className="rounded-lg border border-pul-border/70 p-4">
      <OfficialEventBadges event={event} />
      <h4 className="mt-3 break-words text-base font-bold leading-snug text-foreground">{event.title}</h4>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-pul-muted">이용 시기</dt>
          <dd className="mt-1 break-words">{event.scheduledForLabel}</dd>
        </div>
        <div>
          <dt className="font-semibold text-pul-muted">이용 골프장</dt>
          <dd className="mt-1 break-words"><OfficialCourseLink event={event} /></dd>
        </div>
      </dl>
      {event.organizerGuidance ? <p className="mt-3 text-sm leading-relaxed text-pul-muted">{event.organizerGuidance}</p> : null}
      <ContentManagementActions
        canManage={event.canManage === true}
        editLabel="일정 수정"
        deleteLabel="일정 취소"
        onEdit={onEdit ? (trigger) => onEdit(event, trigger) : undefined}
        onDelete={onCancel ? (trigger) => onCancel(event, trigger) : undefined}
      />
    </article>
  );
}

export function ClubOfficialEventsSection({
  detail,
  action,
  onEdit,
  onCancel,
  participationSnapshot,
  participationBusyEventId,
  participationMessage,
  participationError,
  participationLoginHref,
  onJoinEvent,
  onLeaveEvent,
}: ClubOfficialEventsSectionProps) {
  const officialEvents = detail.officialEvents ?? [];
  const monthlyEvent = officialEvents.find(
    (event) =>
      event.officialEventType === "monthlyMeeting" &&
      event.officialEventStatus !== "completed" &&
      event.officialEventStatus !== "cancelled",
  );
  const additionalEvents = officialEvents
    .filter(
      (event) =>
        event.officialEventType !== "monthlyMeeting" &&
        event.officialEventStatus !== "completed" &&
        event.officialEventStatus !== "cancelled",
    )
    .slice(0, 2);
  const monthlyCourse = monthlyEvent?.linkedCourseId
    ? courseMapItems.find((item) => item.id === monthlyEvent.linkedCourseId)
    : undefined;
  const reservationSummary = monthlyCourse
    ? getCourseDetailPageData(monthlyCourse).reservationGuideSummary
    : "예약 정보 확인 중";
  const isRegistrationOpen =
    monthlyEvent?.participationStatus === "open" ||
    monthlyEvent?.officialEventStatus === "registrationOpen";

  return (
    <Card id="club-official-events" title="동호회 공식 일정" action={action} className="scroll-mt-28">
      {officialEvents.length === 0 ? (
        <EmptyState>
          예정된 공식 일정이 없습니다.
          <br />
          새로운 일정은 운영진 공지에서 안내합니다.
        </EmptyState>
      ) : (
        <div className="space-y-6" data-testid="club-official-event-groups">
          <section aria-labelledby="monthly-official-event-title">
            <h3 id="monthly-official-event-title" className="text-base font-bold text-pul-deep lg:text-lg">다음 정기 월례회</h3>
            <div className="mt-3">
              {monthlyEvent ? (
                <article className="rounded-lg border border-pul-point/25 bg-pul-light/20 p-4 lg:p-5">
                  <OfficialEventBadges event={monthlyEvent} />
                  <h4 className="mt-3 break-words text-lg font-bold leading-snug text-foreground lg:text-xl">{monthlyEvent.title}</h4>
                  <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2 lg:gap-x-5">
                    <div><dt className="font-semibold text-pul-muted">이용 시기</dt><dd className="mt-1 font-medium">{monthlyEvent.scheduledForLabel}</dd></div>
                    <div><dt className="font-semibold text-pul-muted">이용 시간</dt><dd className="mt-1 font-medium">{monthlyEvent.scheduleDetail}</dd></div>
                    <div><dt className="font-semibold text-pul-muted">이용 골프장</dt><dd className="mt-1 break-words"><OfficialCourseLink event={monthlyEvent} /></dd></div>
                    <div><dt className="font-semibold text-pul-muted">집결 장소</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.location ?? "집결 장소 확인 중"}</dd></div>
                    <div><dt className="font-semibold text-pul-muted">참가 대상</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.participantTarget ?? "동호회에 문의"}</dd></div>
                    {monthlyEvent.fee ? (
                      <div><dt className="font-semibold text-pul-muted">행사 참가비</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.fee}</dd></div>
                    ) : null}
                    <div><dt className="font-semibold text-pul-muted">참가 신청 마감</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.applicationDeadlineLabel ?? "일정 확정 후 안내"}</dd></div>
                  </dl>

                  <div className="mt-5 rounded-lg border border-pul-border/70 bg-white p-4">
                    <h5 className="font-bold text-pul-deep">월례회 예약 안내</h5>
                    <dl className="mt-3 space-y-3 text-[15px] leading-relaxed">
                      <div><dt className="font-semibold text-pul-muted">예약 방식</dt><dd className="mt-1 font-bold text-foreground">{clubOfficialEventReservationMethodLabels[monthlyEvent.reservationMethod]}</dd></div>
                      <div><dt className="font-semibold text-pul-muted">예약 오픈</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.reservationOpenLabel ?? "예약 정보 확인 중"}</dd></div>
                      <div><dt className="font-semibold text-pul-muted">회원 예약 안내</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.memberReservationGuidance ?? "운영진 공지에서 안내합니다."}</dd></div>
                      {isRegistrationOpen && monthlyEvent.postReservationGuidance ? (
                        <div><dt className="font-semibold text-pul-muted">예약 완료 후</dt><dd className="mt-1 break-words font-medium">{monthlyEvent.postReservationGuidance}</dd></div>
                      ) : null}
                      <div><dt className="font-semibold text-pul-muted">골프장 예약 정보</dt><dd className="mt-1 break-words text-pul-muted">{reservationSummary}</dd></div>
                    </dl>
                  </div>

                  {monthlyEvent.organizerGuidance ? (
                    <p className="mt-3 rounded-lg bg-white/80 p-3 text-[15px] leading-relaxed text-pul-muted">
                      <span className="font-bold text-pul-deep">운영진 안내 · </span>{monthlyEvent.organizerGuidance}
                    </p>
                  ) : null}
                  {monthlyEvent.linkedCourseId ? (
                    <div className="mt-4">
                      <OfficialCourseLink event={monthlyEvent} label="골프장 예약·이용 안내" />
                    </div>
                  ) : null}
                  <ClubEventParticipationPanel
                    event={monthlyEvent}
                    snapshot={participationSnapshot}
                    entry={participationSnapshot.events.find((entry) => entry.eventId === monthlyEvent.id)}
                    busy={participationBusyEventId === monthlyEvent.id}
                    message={participationMessage}
                    error={participationError}
                    loginHref={participationLoginHref}
                    onJoin={onJoinEvent}
                    onLeave={onLeaveEvent}
                  />
                  <ContentManagementActions
                    canManage={monthlyEvent.canManage === true}
                    editLabel="일정 수정"
                    deleteLabel="일정 취소"
                    onEdit={onEdit ? (trigger) => onEdit(monthlyEvent, trigger) : undefined}
                    onDelete={onCancel ? (trigger) => onCancel(monthlyEvent, trigger) : undefined}
                  />
                </article>
              ) : (
                <EmptyState compact>
                  예정된 정기 월례회가 없습니다.
                  <br />
                  새로운 일정은 운영진 공지에서 안내합니다.
                </EmptyState>
              )}
            </div>
          </section>

          <section aria-labelledby="additional-official-event-title">
            <h3 id="additional-official-event-title" className="text-base font-bold text-pul-deep lg:text-lg">예정된 공식 행사</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {additionalEvents.length > 0 ? (
                additionalEvents.map((event) => <CompactOfficialEventCard key={event.id} event={event} onEdit={onEdit} onCancel={onCancel} />)
              ) : (
                <div className="lg:col-span-2">
                  <EmptyState compact>
                    예정된 추가 공식 행사가 없습니다.
                    <br />
                    새로운 일정은 운영진 공지에서 안내합니다.
                  </EmptyState>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </Card>
  );
}

export function ClubNoticesSection({ detail, action, onEdit, onDelete }: ClubNoticesSectionProps) {
  const notices = (detail.notices ?? []).slice(0, 3);

  return (
    <Card id="club-notices" title="공지사항" action={action} className="scroll-mt-28">
      {/* 이 Card 안에는 공지 목록(또는 공지 empty)만 — 활동사진/게시판 empty 금지 */}
      {notices.length > 0 ? (
        <ul className="divide-y divide-pul-border/70" data-testid="club-notice-list">
          {notices.map((notice) => (
            <li key={notice.id} className="py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {notice.importance !== "normal" ? (
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-bold",
                      notice.importance === "urgent"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-50 text-amber-800",
                    )}
                  >
                    {clubNoticeImportanceLabels[notice.importance]}
                  </span>
                ) : null}
                <span className="rounded-md bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">
                  {clubNoticeTypeLabels[notice.noticeType]}
                </span>
                {notice.visibility === "clubMembers" ? (
                  <span className="rounded-md border border-pul-border bg-pul-page px-2 py-1 text-xs font-bold text-pul-muted">
                    회원 공개
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 break-words text-base font-bold leading-snug text-foreground lg:leading-7">
                {notice.title}
              </h3>
              <p className="mt-1 text-sm text-pul-muted">
                {notice.publishedAt
                  ? postDateFormatter.format(new Date(notice.publishedAt))
                  : "게시일 확인 중"}
              </p>
              {notice.contentSummary ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pul-muted">{notice.contentSummary}</p> : null}
              <ContentManagementActions
                canManage={notice.canManage === true}
                editLabel="공지 수정"
                deleteLabel="공지 내리기"
                onEdit={onEdit ? (trigger) => onEdit(notice, trigger) : undefined}
                onDelete={onDelete ? (trigger) => onDelete(notice, trigger) : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          등록된 공지사항이 없습니다.
          <br />
          새로운 안내는 운영진이 등록하면 이곳에 표시됩니다.
        </EmptyState>
      )}
    </Card>
  );
}

export function ClubBoardSection({ detail, action, onEdit, onDelete }: ClubBoardSectionProps) {
  const posts = (detail.posts ?? [])
    .filter(
      (post) =>
        post.moderationStatus === "visible" &&
        (post.postStatus === "published" || post.postStatus === "edited"),
    )
    .slice(0, 3);
  return (
    <Card id="club-board" title="동호회 게시판" action={action} className="scroll-mt-28">
      {posts.length > 0 ? (
        <ul className="divide-y divide-pul-border/70" data-testid="club-board-list">
          {posts.map((post) => {
            const course = post.linkedCourseId
              ? courseMapItems.find((item) => item.id === post.linkedCourseId)
              : undefined;
            const schedule = formatPostPeriod(post);
            const publishedAt = post.publishedAt ?? post.createdAt;
            return (
              <li key={post.id} className="py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">
                    {clubPostTypeLabels[post.postType]}
                  </span>
                  {post.recruitmentStatus ? (
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-bold",
                        post.recruitmentStatus === "recruiting"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : post.recruitmentStatus === "cancelled"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : "border-pul-border bg-pul-page text-pul-muted",
                      )}
                    >
                      {clubPostRecruitmentStatusLabels[post.recruitmentStatus]}
                    </span>
                  ) : null}
                  {post.visibility === "clubMembers" ? (
                    <span className="rounded-md border border-pul-border bg-white px-2 py-1 text-xs font-bold text-pul-muted">
                      회원 공개
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 break-words font-bold leading-snug text-foreground">{post.title}</h3>
                <p className="mt-1 text-sm text-pul-muted">
                  {publishedAt
                    ? postDateFormatter.format(new Date(publishedAt))
                    : "게시일 확인 중"}
                </p>
                {schedule || course || post.location ? (
                  <p className="mt-2 break-words text-sm leading-relaxed text-pul-muted">
                    {schedule ?? "방문 일정 확인 중"}
                    {course ? ` · ${course.name}` : post.courseName ? ` · ${post.courseName}` : ""}
                    {post.location ? ` · ${post.location}` : ""}
                  </p>
                ) : null}
                {post.capacity !== undefined || post.participantTarget ? (
                  <p className="mt-1 break-words text-sm text-pul-muted">
                    {post.capacity !== undefined
                      ? `${post.participantCount ?? 0}/${post.capacity}명`
                      : ""}
                    {post.capacity !== undefined && post.participantTarget ? " · " : ""}
                    {post.participantTarget ?? ""}
                  </p>
                ) : null}
                {post.contentSummary ? <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pul-muted">{post.contentSummary}</p> : null}
                <ContentManagementActions
                  canManage={post.canEdit === true || post.canDelete === true}
                  editLabel="게시글 수정"
                  deleteLabel="게시글 삭제"
                  onEdit={post.canEdit && onEdit ? (trigger) => onEdit(post, trigger) : undefined}
                  onDelete={post.canDelete && onDelete ? (trigger) => onDelete(post, trigger) : undefined}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact>
          아직 등록된 게시글이 없습니다.
          <br />
          활동 회원이라면 첫 번째 이야기를 남겨보세요.
        </EmptyState>
      )}
    </Card>
  );
}

export function ClubPhotosSection({ detail, action, onDelete }: ClubPhotosSectionProps) {
  const photos = (detail.photos ?? [])
    .filter(
      (photo) =>
        photo.moderationStatus === "visible" &&
        photo.verificationStatus !== "rejected",
    )
    .slice(0, 6);
  return (
    <Card id="club-photos" title="활동사진" action={action}>
      {/* 카메라 empty 는 여기만 — 공지/게시판 Card에 넣지 않음 */}
      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="club-activity-photo-list">
          {photos.map((photo, index) => {
            const activityDate = formatKnownActivityDate(photo.activityDate);
            const verificationLabel =
              photo.verificationStatus === "operatorVerified" ||
              photo.verificationStatus === "adminVerified"
                ? clubContentVerificationLabels[photo.verificationStatus]
                : photo.uploaderRole === "member"
                  ? "회원 등록"
                  : "확인 중";

            return (
              <li
                key={photo.id}
                className={cn(
                  "overflow-hidden rounded-lg border border-pul-border/70 bg-white",
                  index >= 4 ? "hidden sm:block" : "",
                )}
              >
                <figure>
                  <div className="relative aspect-[4/3] overflow-hidden bg-pul-light">
                    <Image
                      src={photo.thumbnailUrl ?? photo.src}
                      alt={photo.alt ?? photo.caption ?? ""}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 280px"
                    />
                  </div>
                  <figcaption className="space-y-1.5 p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">
                        {clubActivityTypeLabels[photo.activityType]}
                      </span>
                      <span className="rounded-md border border-pul-border bg-white px-2 py-1 text-xs font-bold text-pul-muted">
                        {verificationLabel}
                      </span>
                    </div>
                    {activityDate ? (
                      <p className="text-xs font-semibold text-pul-muted">{activityDate}</p>
                    ) : null}
                    {photo.caption ? (
                      <p className="line-clamp-2 break-words text-sm leading-relaxed text-pul-muted">{photo.caption}</p>
                    ) : null}
                    {photo.canDelete && onDelete ? (
                      <button
                        type="button"
                        onClick={(event) => onDelete(photo, event.currentTarget)}
                        className="min-h-11 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"
                      >
                        사진 삭제
                      </button>
                    ) : null}
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact>
          <Camera className="mx-auto mb-2 h-8 w-8 text-pul-muted/50" aria-hidden="true" />
          등록된 활동사진이 없습니다.
          <br />
          동호회 운영진이 활동사진을 등록할 수 있습니다.
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
  const activities = (detail.recentActivities ?? [])
    .filter(
      (activity) =>
        activity.moderationStatus === "visible" &&
        activity.verificationStatus !== "rejected",
    )
    .slice(0, 3);
  return (
    <Card title="최근 활동·기록">
      {activities.length > 0 ? (
        <ul className="space-y-3" data-testid="club-recent-activity-list">
          {activities.map((activity) => {
            const activityDate =
              formatKnownActivityDate(activity.occurredAt) ?? activity.occurredAtLabel;
            const linkedCourse = activity.linkedCourseId
              ? courseMapItems.find((item) => item.id === activity.linkedCourseId)
              : undefined;
            const linkedOfficialEvent = activity.linkedOfficialEventId
              ? detail.officialEvents.find((event) => event.id === activity.linkedOfficialEventId)
              : undefined;

            return (
              <li key={activity.id} className="flex gap-3 rounded-lg border border-pul-border/70 p-4">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-pul-point" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-pul-light px-2 py-1 text-xs font-bold text-pul-deep">
                      {clubActivityTypeLabels[activity.activityType]}
                    </span>
                    <span className="rounded-md border border-pul-border bg-white px-2 py-1 text-xs font-bold text-pul-muted">
                      {clubContentVerificationLabels[activity.verificationStatus]}
                    </span>
                  </div>
                  <h3 className="mt-2 break-words font-bold leading-snug text-foreground">{activity.title}</h3>
                  {activityDate ? (
                    <p className="mt-1 text-sm font-semibold text-pul-point">{activityDate}</p>
                  ) : null}
                  {activity.summary ? (
                    <p className="mt-1 line-clamp-3 break-words text-[15px] leading-relaxed text-pul-muted">
                      {activity.summary}
                    </p>
                  ) : null}
                  {activity.resultSummary ? (
                    <p className="mt-1 line-clamp-2 break-words text-sm text-pul-muted">{activity.resultSummary}</p>
                  ) : null}
                  {linkedCourse || linkedOfficialEvent ? (
                    <p className="mt-2 break-words text-sm text-pul-muted">
                      {linkedCourse ? `관련 골프장 · ${linkedCourse.name}` : ""}
                      {linkedCourse && linkedOfficialEvent ? " / " : ""}
                      {linkedOfficialEvent ? `관련 공식 일정 · ${linkedOfficialEvent.title}` : ""}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          등록된 최근 활동이 없습니다.
          <br />
          새로운 동호회 활동은 운영진 확인 후 표시됩니다.
        </EmptyState>
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
