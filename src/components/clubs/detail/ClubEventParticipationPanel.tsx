import type {
  ClubEventParticipationEntry,
  ClubEventParticipationSnapshot,
} from "@/lib/clubs/clubEventParticipation";
import type { ClubOfficialEvent } from "@/types";
import Link from "next/link";

type ClubEventParticipationPanelProps = {
  event: ClubOfficialEvent;
  snapshot: ClubEventParticipationSnapshot;
  entry?: ClubEventParticipationEntry;
  busy: boolean;
  message?: string;
  error?: string;
  loginHref: string;
  onJoin: (eventId: string) => void;
  onLeave: (eventId: string) => void;
};

function formatJoinedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function ParticipationCount({ event, count }: { event: ClubOfficialEvent; count?: number }) {
  if (count === undefined) return null;
  return (
    <p className="font-bold text-pul-deep">
      {count}명 참가
      {event.capacity !== undefined ? ` / 정원 ${event.capacity}명` : ""}
    </p>
  );
}

function OpenParticipationState({
  event,
  snapshot,
  entry,
  busy,
  loginHref,
  onJoin,
  onLeave,
}: ClubEventParticipationPanelProps) {
  if (snapshot.availability !== "available") {
    return <p className="text-[15px] leading-relaxed text-pul-muted">참가 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>;
  }

  if (entry?.isParticipating) {
    return (
      <div className="space-y-3">
        <p className="font-bold text-pul-deep">참가 신청 완료</p>
        {entry.joinedAt ? <p className="text-sm text-pul-muted">신청 일시 · {formatJoinedAt(entry.joinedAt)}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => onLeave(event.id)}
          className="min-h-11 w-full rounded-lg border border-rose-200 bg-white px-4 font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
        >
          {busy ? "처리 중…" : "참가 신청 취소"}
        </button>
      </div>
    );
  }

  if (snapshot.authenticationStatus === "anonymous") {
    return (
      <div className="space-y-3">
        <p id={`participation-guidance-${event.id}`} className="text-[15px] leading-relaxed text-pul-muted">참가 신청은 로그인한 동호회 회원만 이용할 수 있습니다.</p>
        <Link
          href={loginHref}
          aria-describedby={`participation-guidance-${event.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point px-4 font-bold text-white hover:bg-pul-deep sm:w-auto"
        >
          로그인 후 참가 신청
        </Link>
      </div>
    );
  }

  if (!snapshot.canJoin) {
    return (
      <div className="space-y-3">
        <p id={`participation-guidance-${event.id}`} className="text-[15px] leading-relaxed text-pul-muted">활동 중인 동호회 회원만 참가 신청할 수 있습니다. 가입 안내를 확인해 주세요.</p>
        <button
          type="button"
          disabled
          aria-describedby={`participation-guidance-${event.id}`}
          className="min-h-11 w-full cursor-not-allowed rounded-lg border border-pul-border bg-gray-100 px-4 font-bold text-pul-muted sm:w-auto"
        >
          동호회 회원 전용
        </button>
      </div>
    );
  }

  const capacityReached = event.capacity !== undefined && (entry?.participantCount ?? 0) >= event.capacity;
  return (
    <div className="space-y-3">
      <p id={`participation-guidance-${event.id}`} className="text-[15px] leading-relaxed text-pul-muted">
        {capacityReached ? "참가 정원이 모두 찼습니다." : "참가를 신청하면 즉시 본인 참가 상태와 현재 참가 인원이 반영됩니다."}
      </p>
      <button
        type="button"
        disabled={busy || capacityReached}
        aria-describedby={`participation-guidance-${event.id}`}
        onClick={() => onJoin(event.id)}
        className="min-h-11 w-full rounded-lg bg-pul-point px-4 font-bold text-white hover:bg-pul-deep disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"
      >
        {busy ? "처리 중…" : capacityReached ? "참가 마감" : "참가 신청"}
      </button>
    </div>
  );
}

export function ClubEventParticipationPanel(props: ClubEventParticipationPanelProps) {
  const { event, entry, message, error } = props;
  const statusMessage = {
    open: "",
    upcoming: "참가 접수 시작 전입니다. 일정 확정 후 운영진이 안내합니다.",
    closed: "참가 접수가 마감되었습니다.",
    completed: "완료된 공식 일정입니다.",
    cancelled: "취소된 공식 일정입니다.",
  }[event.participationStatus];

  return (
    <section className="mt-5 rounded-lg border border-pul-point/25 bg-white p-4" aria-label="월례회 참가 신청">
      <h5 className="font-bold text-pul-deep">월례회 참가</h5>
      <div className="mt-3 space-y-3">
        <ParticipationCount event={event} count={entry?.participantCount} />
        {event.participationStatus === "open" ? (
          <OpenParticipationState {...props} />
        ) : (
          <div className="space-y-2">
            <p className="text-[15px] leading-relaxed text-pul-muted">{statusMessage}</p>
            {entry?.isParticipating ? <p className="font-bold text-pul-deep">내 참가 상태 · 참가 신청 완료</p> : null}
          </div>
        )}
        {message ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{message}</p> : null}
        {error ? <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p> : null}
      </div>
    </section>
  );
}
