import type {
  ClubEventParticipationContext,
  ClubOfficialEvent,
  ClubOfficialEventParticipation,
} from "@/types";

type ClubEventParticipationPanelProps = {
  event: ClubOfficialEvent;
  context: ClubEventParticipationContext;
};

const applicationStatusLabels: Record<
  ClubOfficialEventParticipation["applicationStatus"],
  string
> = {
  applied: "참가 신청 완료",
  cancelled: "참가 신청 취소",
  waitlisted: "참가 대기 중",
  confirmed: "참가 확정",
  rejected: "참가 신청 반려",
};

const reservationStatusLabels: Record<
  ClubOfficialEventParticipation["reservationStatus"],
  string
> = {
  notRequired: "개별 예약 불필요",
  pending: "예약 전",
  completed: "예약 완료",
  failed: "예약 실패 또는 대기",
  needsReview: "운영진 확인 필요",
};

function formatApplicationDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function ParticipationCount({ event }: { event: ClubOfficialEvent }) {
  if (event.participantCount === undefined) return null;

  return (
    <p className="font-bold text-pul-deep">
      {event.participantCount}명 신청
      {event.capacity !== undefined ? ` / 정원 ${event.capacity}명` : ""}
    </p>
  );
}

function ParticipantPreview({
  event,
  context,
}: ClubEventParticipationPanelProps) {
  const canSeeMaskedNames =
    context.authenticationStatus === "authenticated" &&
    ["member", "manager", "admin"].includes(context.viewerRole) &&
    event.participantVisibility === "membersMasked";
  const previews = canSeeMaskedNames ? (context.participantPreviews ?? []).slice(0, 3) : [];

  if (previews.length === 0) return null;

  const names = previews.map((participant) => participant.publicNickname ?? participant.maskedName);
  const visibleNames = names.filter((name): name is string => Boolean(name));
  if (visibleNames.length === 0) return null;

  const remaining = Math.max((event.participantCount ?? visibleNames.length) - visibleNames.length, 0);

  return (
    <p className="text-sm leading-relaxed text-pul-muted">
      {visibleNames.join(", ")}
      {remaining > 0 ? ` 외 ${remaining}명` : ""}
    </p>
  );
}

function OpenParticipationState({
  event,
  context,
}: ClubEventParticipationPanelProps) {
  const application = context.myApplication;
  const hasActiveApplication =
    application &&
    ["applied", "waitlisted", "confirmed"].includes(application.applicationStatus);

  if (hasActiveApplication) {
    return (
      <div className="space-y-3">
        <p className="font-bold text-pul-deep">
          {applicationStatusLabels[application.applicationStatus]}
        </p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-pul-muted">신청 일시</dt>
            <dd className="mt-1 font-medium">{formatApplicationDate(application.appliedAt)}</dd>
          </div>
          {event.reservationMethod === "individualSynchronized" ? (
            <div>
              <dt className="font-semibold text-pul-muted">골프장 예약 상태</dt>
              <dd className="mt-1 font-medium">
                {reservationStatusLabels[application.reservationStatus]}
              </dd>
            </div>
          ) : null}
        </dl>
        <button
          type="button"
          disabled
          aria-describedby={`participation-unavailable-${event.id}`}
          className="min-h-11 w-full cursor-not-allowed rounded-lg border border-pul-border bg-gray-100 px-4 font-bold text-pul-muted sm:w-auto"
        >
          신청 취소 준비 중
        </button>
        <p id={`participation-unavailable-${event.id}`} className="text-sm text-pul-muted">
          안전한 신청 취소는 로그인·회원 권한과 저장 기능이 연결된 후 제공됩니다.
        </p>
      </div>
    );
  }

  let guidance = "참가 신청 기능은 준비 중입니다.";
  let buttonLabel = "참가 신청 준비 중";

  if (context.authenticationStatus === "anonymous") {
    guidance = "참가 신청은 로그인한 동호회 회원만 이용할 수 있습니다.";
    buttonLabel = "로그인 필요";
  } else if (context.viewerRole === "nonMember") {
    guidance = "동호회 회원만 참가 신청할 수 있습니다. 가입 문의를 이용해 주세요.";
    buttonLabel = "가입 문의 필요";
  } else if (context.featureAvailability === "preparing") {
    guidance = "로그인·동호회 회원 확인과 안전한 저장 기능을 준비 중입니다.";
  }

  return (
    <div className="space-y-3">
      <p id={`participation-guidance-${event.id}`} className="text-[15px] leading-relaxed text-pul-muted">
        {guidance}
      </p>
      <button
        type="button"
        disabled
        aria-describedby={`participation-guidance-${event.id}`}
        className="min-h-11 w-full cursor-not-allowed rounded-lg border border-pul-border bg-gray-100 px-4 font-bold text-pul-muted sm:w-auto"
      >
        {buttonLabel}
      </button>
    </div>
  );
}

export function ClubEventParticipationPanel({
  event,
  context,
}: ClubEventParticipationPanelProps) {
  if (event.participationStatus === "upcoming") {
    return (
      <section className="mt-5 rounded-lg border border-pul-border/70 bg-white/80 p-4" aria-label="월례회 참가 상태">
        <h5 className="font-bold text-pul-deep">참가 상태</h5>
        <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">
          참가 접수 시작 전입니다. 일정 확정 후 운영진이 안내합니다.
        </p>
      </section>
    );
  }

  if (event.participationStatus !== "open") {
    const message = {
      closed: "참가 접수가 마감되었습니다.",
      completed: "완료된 공식 일정입니다.",
      cancelled: "취소된 공식 일정입니다.",
    }[event.participationStatus];

    return (
      <section className="mt-5 rounded-lg border border-pul-border/70 bg-white/80 p-4" aria-label="월례회 참가 상태">
        <h5 className="font-bold text-pul-deep">참가 상태</h5>
        <p className="mt-2 text-[15px] leading-relaxed text-pul-muted">{message}</p>
      </section>
    );
  }

  return (
    <section className="mt-5 rounded-lg border border-pul-point/25 bg-white p-4" aria-label="월례회 참가 신청">
      <h5 className="font-bold text-pul-deep">월례회 참가</h5>
      <div className="mt-3 space-y-3">
        <ParticipationCount event={event} />
        <OpenParticipationState event={event} context={context} />
        <ParticipantPreview event={event} context={context} />
      </div>
    </section>
  );
}
