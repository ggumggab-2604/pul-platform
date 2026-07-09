import {
  courseStatusLabels,
  refereeRoleTypeLabels,
  type RefereeJobPost,
} from "@/data/certificationData";

type CertificationJobCardProps = {
  job: RefereeJobPost;
  onInquiry: (job: RefereeJobPost) => void;
};

export function CertificationJobCard({ job, onInquiry }: CertificationJobCardProps) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)]">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep">
          {refereeRoleTypeLabels[job.roleType]}
        </span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {courseStatusLabels[job.status]}
        </span>
      </div>

      <h3 className="text-sm font-bold leading-snug text-foreground">{job.title}</h3>

      <dl className="mt-2 space-y-1 text-[11px] text-foreground lg:text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">지역</dt>
          <dd className="font-medium">{job.region}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">일정</dt>
          <dd className="font-medium">{job.schedule}</dd>
        </div>
        <div>
          <dt className="text-pul-muted">모집 역할</dt>
          <dd className="mt-0.5 font-medium">{job.role}</dd>
        </div>
        <div>
          <dt className="text-pul-muted">조건</dt>
          <dd className="mt-0.5 font-medium">{job.condition}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">보수/활동비</dt>
          <dd className="font-medium">{job.payInfo}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-pul-muted">등록 주체</dt>
          <dd className="font-medium">{job.organizerType}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onInquiry(job)}
        className="mt-auto inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-pul-point pt-3 text-xs font-bold text-white hover:bg-pul-deep"
      >
        문의하기
      </button>
    </article>
  );
}
