import {
  refereeTalentActivityLabels,
  refereeTalentStatusLabels,
  type RefereeTalentProfile,
} from "@/data/certificationData";

type CertificationTalentProfileCardProps = {
  profile: RefereeTalentProfile;
  onInquiry: (profile: RefereeTalentProfile) => void;
};

export function CertificationTalentProfileCard({
  profile,
  onInquiry,
}: CertificationTalentProfileCardProps) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {profile.activityTypes.map((type) => (
          <span
            key={type}
            className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep"
          >
            {refereeTalentActivityLabels[type]}
          </span>
        ))}
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800">
          {refereeTalentStatusLabels[profile.status]}
        </span>
      </div>

      <h3 className="text-sm font-bold text-foreground">{profile.nickname}</h3>

      <dl className="mt-2 space-y-1 text-[11px] text-foreground lg:text-xs">
        <div>
          <dt className="text-pul-muted">보유 자격</dt>
          <dd className="mt-0.5 font-medium">{profile.licenses.join(" · ")}</dd>
        </div>
        <div>
          <dt className="text-pul-muted">활동 가능 지역</dt>
          <dd className="mt-0.5 font-medium">{profile.regions.join(" / ")}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">PUL 활동 점수</dt>
          <dd className="font-bold text-pul-deep">{profile.pulActivityScore}점</dd>
        </div>
        <div>
          <dt className="text-pul-muted">PUL 활동</dt>
          <dd className="mt-0.5 font-medium">{profile.activityHighlights.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-pul-muted">인증 상태</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {profile.verificationStatus.map((status) => (
              <span
                key={status}
                className="rounded border border-amber-200/70 bg-amber-50/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
              >
                {status}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onInquiry(profile)}
        className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border pt-3 text-xs font-bold text-pul-deep hover:bg-pul-light"
      >
        문의하기
      </button>
    </article>
  );
}
