import Link from "next/link";
import { courseStatusLabels, refereeRoleTypeLabels } from "@/data/certificationData";
import { certificationActivityDetailHref, certificationJobFacts, type CertificationJobActivity, type CertificationJobStatus } from "@/lib/certification/certificationJobActivity";

export function CertificationJobStatusBadge({ status }: { status: CertificationJobStatus }) {
  const colors = status === "closed" ? "bg-gray-100 text-gray-700"
    : status === "waiting" || status === "planned" ? "bg-amber-50 text-amber-900"
    : "bg-emerald-50 text-emerald-800";
  return <span className={"inline-block rounded-full px-2 py-1 text-xs font-bold " + colors}>{courseStatusLabels[status]}</span>;
}

export function CertificationJobCard({ job, returnTo }: { job: CertificationJobActivity; returnTo: string }) {
  return <article className="rounded-xl border border-pul-border bg-white px-3 pb-3">
    <h3>
      <Link prefetch={false} href={certificationActivityDetailHref("job", job.key, returnTo)} className="flex min-h-11 items-center justify-between gap-2 border-b border-pul-border py-2 text-sm font-bold text-pul-deep hover:underline">
        <span className="min-w-0 break-words">{job.title}</span><span aria-hidden="true">›</span>
      </Link>
    </h3>
    <dl className="mt-2 space-y-1.5 text-sm">
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-2">
        <dt className="font-medium text-pul-muted">모집 역할</dt><dd>{refereeRoleTypeLabels[job.role]}</dd>
      </div>
      {certificationJobFacts(job).map(([label, value]) => <div className="grid grid-cols-[4.6rem_minmax(0,1fr)] gap-2" key={label}>
        <dt className="font-medium text-pul-muted">{label}</dt><dd className="break-words">{value}{label === "구장" && <span className="block text-xs text-pul-muted">{job.region}</span>}</dd>
      </div>)}
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)] items-center gap-2">
        <dt className="font-medium text-pul-muted">모집 상태</dt><dd><CertificationJobStatusBadge status={job.status} /></dd>
      </div>
    </dl>
  </article>;
}
