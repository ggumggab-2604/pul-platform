import { courseStatusLabels, refereeRoleTypeLabels, type CourseStatus, type RefereeJobRoleType } from "@/data/certificationData";
import { formatCertificationPublicDateOnly } from "./certificationDateDisplay";

export type CertificationJobStatus = CourseStatus | "planned";
export type CertificationJobActivity = {
  key: string;
  title: string;
  role: RefereeJobRoleType;
  region: string;
  organizer: string;
  status: CertificationJobStatus;
  activityDate: string | null;
  venue: string | null;
  qualification: string | null;
};
export type CertificationActivityFilters = {
  keyword?: string;
  roleType?: RefereeJobRoleType;
  region?: string;
  status?: CertificationJobStatus;
};

export const certificationActivityPath = "/certification?tab=activity";
export const certificationActivityFilterKeys = ["jobKeyword", "jobRoleType", "jobRegion", "jobStatus"] as const;

export function certificationActivityPage(value: string | null | undefined, max = 100000) {
  return /^\d{1,6}$/.test(value ?? "") ? Math.max(1, Math.min(max, Number(value))) : 1;
}

type ReadParam = (key: string) => string | null | undefined;

export function readCertificationActivityFilters(get: ReadParam): CertificationActivityFilters {
  const text = (key: string, limit: number) => {
    const raw = get(key);
    if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return undefined;
    const value = raw.trim();
    return value && value.length <= limit ? value : undefined;
  };
  const roleType = (get("jobRoleType") ?? get("jobRole")) as RefereeJobRoleType;
  const status = get("jobStatus") as CertificationJobStatus;
  const region = text("jobRegion", 80);
  return {
    keyword: text("jobKeyword", 100),
    roleType: Object.hasOwn(refereeRoleTypeLabels, roleType) ? roleType : undefined,
    region: region === "전체" ? undefined : region,
    status: Object.hasOwn(courseStatusLabels, status) ? status : undefined,
  };
}

export function certificationActivityListHref(get: ReadParam, jobPage = certificationActivityPage(get("jobPage")), talentPage = certificationActivityPage(get("talentPage"), 1000)) {
  const { keyword, roleType, region, status } = readCertificationActivityFilters(get);
  const query = new URLSearchParams({ tab: "activity" });
  if (keyword) query.set("jobKeyword", keyword);
  if (roleType) query.set("jobRoleType", roleType);
  if (region) query.set("jobRegion", region);
  if (status) query.set("jobStatus", status);
  if (jobPage > 1) query.set("jobPage", String(jobPage));
  if (talentPage > 1) query.set("talentPage", String(talentPage));
  return "/certification?" + query;
}

export function safeCertificationActivityReturn(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/certification?") || value.includes("#") || value.length > 2600) {
    return certificationActivityPath;
  }
  const query = new URLSearchParams(value.slice("/certification?".length));
  if (query.get("tab") !== "activity" || new Set(query.keys()).size !== Array.from(query.keys()).length) {
    return certificationActivityPath;
  }
  return certificationActivityListHref(key => query.get(key));
}

export function certificationActivityDetailHref(kind: "job" | "talent", key: string, returnTo?: string, inquiry = false) {
  const path = `/certification/${kind === "job" ? "jobs" : "talent"}/${encodeURIComponent(key)}`;
  const query = new URLSearchParams();
  if (returnTo && returnTo !== certificationActivityPath) query.set("returnTo", returnTo);
  if (inquiry) query.set("inquiry", "1");
  return query.size ? path + "?" + query : path;
}

export function certificationInquiryHref(kind: "job" | "talent", key: string, returnTo: string, signedIn: boolean) {
  if (!signedIn) {
    return "/login?" + new URLSearchParams({ next: certificationActivityDetailHref(kind, key, returnTo, true) });
  }
  const query = new URLSearchParams({ certificationKind: kind, certificationKey: key });
  if (returnTo !== certificationActivityPath) query.set("certificationReturn", returnTo);
  return "/messages/new?" + query;
}

export function certificationJobFacts(job: CertificationJobActivity) {
  return [
    ["활동일", formatCertificationPublicDateOnly(job.activityDate) ?? "미정"],
    ["구장", job.venue ?? "미정"],
    ["필요 자격", job.qualification ?? "공고 확인"],
  ] as const;
}
