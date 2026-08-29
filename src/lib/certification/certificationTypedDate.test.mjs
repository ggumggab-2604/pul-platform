import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CertificationDirectoryError,
  isCertificationDateOnly,
  mutateCertificationCourse,
  mutateCertificationExamSchedule,
  mutateCertificationJob,
  parseManagedCertificationCourse,
  parseManagedCertificationExamSchedule,
  parseManagedCertificationJob,
  parsePublicCertificationCourse,
  parsePublicCertificationExamSchedule,
  parsePublicCertificationJob,
} from "./certificationDirectory.ts";

const course = (overrides = {}) => ({
  course_key: "typed-course",
  title: "TEST 심판 과정",
  category: "referee",
  provider_type: "association",
  provider_name: "TEST 기관",
  region: "서울",
  course_method: "theory_practice",
  target_text: "심판 준비자",
  schedule_text: "기관 일정에 따라 변경",
  starts_on: "2028-02-29",
  ends_on: null,
  price_text: "기관 문의",
  recruit_status: "recruiting",
  description: "TEST typed-date 과정의 충분히 긴 공개 설명입니다.",
  official_url: "https://example.invalid/course",
  application_url: null,
  is_featured: false,
  ...overrides,
});

const exam = (overrides = {}) => ({
  schedule_key: "typed-exam",
  exam_name: "TEST 심판 시험",
  exam_type: "park_referee",
  organization_name: "TEST 기관",
  application_period: "2026년 하반기",
  application_starts_on: null,
  application_ends_on: "2026-10-01",
  exam_date_text: "추후 공지",
  exam_on: "2026-10-10",
  venue_announcement: "기관 공지",
  result_date_text: "기관 일정에 따라 변경",
  result_on: null,
  required_items: "신분증",
  official_url: "https://example.invalid/exam",
  schedule_status: "application_planned",
  ...overrides,
});

const job = (overrides = {}) => ({
  job_key: "typed-job",
  title: "TEST 심판 모집",
  role_type: "referee",
  region: "경기",
  schedule_text: "상시 모집",
  application_starts_on: null,
  application_ends_on: null,
  role_description: "대회 심판 업무",
  condition_text: "공고 조건 확인",
  pay_text: "기관 문의",
  organizer_name: "TEST 기관",
  organizer_type: "운영자",
  recruit_status: "recruiting",
  official_url: "https://example.invalid/job",
  application_url: null,
  ...overrides,
});

const management = (value, overrides = {}) => ({
  ...value,
  publication_status: "hidden",
  version: 1,
  updated_at: "2026-08-28T00:00:00.000Z",
  ...overrides,
});

test("date-only validator accepts real ISO calendar dates and rejects malformed or impossible values", () => {
  for (const value of ["2026-01-01", "2028-02-29", "9999-12-31"]) {
    assert.equal(isCertificationDateOnly(value), true);
  }
  for (const value of [null, "2026/01/01", "2026-2-01", "2026-02-30", "2027-02-29", "0000-01-01", "2026-01-01T00:00:00Z", "추후 공지"]) {
    assert.equal(isCertificationDateOnly(value), false);
  }
});

test("public strict parsers retain schedule text and expose all, partial, or null typed dates", () => {
  const parsedCourse = parsePublicCertificationCourse(course());
  const parsedExam = parsePublicCertificationExamSchedule(exam());
  const parsedJob = parsePublicCertificationJob(job());
  assert.deepEqual([parsedCourse.schedule, parsedCourse.startsOn, parsedCourse.endsOn], ["기관 일정에 따라 변경", "2028-02-29", null]);
  assert.deepEqual([parsedExam.applicationStartsOn, parsedExam.applicationEndsOn, parsedExam.examOn, parsedExam.resultOn], [null, "2026-10-01", "2026-10-10", null]);
  assert.deepEqual([parsedJob.schedule, parsedJob.applicationStartsOn, parsedJob.applicationEndsOn], ["상시 모집", null, null]);
  for (const invalid of [
    course({ starts_on: "2026-02-30" }),
    exam({ exam_on: "2026/10/10" }),
    job({ application_ends_on: "10월 중" }),
    { ...course(), internal_id: "private" },
  ]) {
    assert.throws(
      () => invalid.course_key ? parsePublicCertificationCourse(invalid) : invalid.schedule_key ? parsePublicCertificationExamSchedule(invalid) : parsePublicCertificationJob(invalid),
      CertificationDirectoryError,
    );
  }
});

test("management parsers add only publication metadata and reject internal identifier leakage", () => {
  assert.equal(parseManagedCertificationCourse(management(course())).publicationStatus, "hidden");
  assert.equal(parseManagedCertificationExamSchedule(management(exam(), { publication_status: "published" })).publicationStatus, "published");
  assert.equal(parseManagedCertificationJob(management(job(), { publication_status: "removed", version: 2 })).version, 2);
  assert.throws(() => parseManagedCertificationCourse({ ...management(course()), id: "private" }), CertificationDirectoryError);
  assert.throws(() => parseManagedCertificationExamSchedule(management(exam(), { updated_at: "not-a-time" })), CertificationDirectoryError);
});

test("mutation helpers send exact snake-case date strings and explicit null clears", async () => {
  const calls = [];
  const client = {
    async rpc(name, payload) {
      calls.push({ name, payload });
      const key = name.includes("course") ? ["course_key", payload.p_course_key]
        : name.includes("exam") ? ["schedule_key", payload.p_schedule_key]
          : ["job_key", payload.p_job_key];
      return { data: { [key[0]]: key[1], publication_status: "hidden", version: 1 }, error: null };
    },
  };
  await mutateCertificationCourse(client, "create", "typed-course", null, {
    title: "TEST 과정", category: "referee", providerType: "association", providerName: "TEST 기관",
    region: "서울", method: "offline", target: "심판 준비자", schedule: "추후 공지", price: "문의",
    status: "recruiting", description: "TEST typed-date 과정의 충분히 긴 설명입니다.",
    officialUrl: "https://example.invalid/course", applicationUrl: null, featured: false,
    startsOn: "2026-10-01", endsOn: null,
  });
  await mutateCertificationExamSchedule(client, "create", "typed-exam", null, {
    examName: "TEST 시험", examType: "park_referee", organizationName: "TEST 기관",
    applicationPeriod: "추후 공지", examDate: "추후 공지", venueAnnouncement: "기관 공지",
    resultDate: "추후 공지", requiredItems: "신분증", officialUrl: "https://example.invalid/exam",
    status: "application_planned", applicationStartsOn: null, applicationEndsOn: null,
    examOn: "2026-10-10", resultOn: null,
  });
  await mutateCertificationJob(client, "create", "typed-job", null, {
    title: "TEST 모집", roleType: "referee", region: "경기", schedule: "상시 모집",
    roleDescription: "심판 업무", condition: "공고 조건 확인", payInfo: "기관 문의",
    organizerName: "TEST 기관", organizerType: "운영자", status: "recruiting",
    officialUrl: "https://example.invalid/job", applicationUrl: null,
    applicationStartsOn: null, applicationEndsOn: null,
  });
  assert.deepEqual(
    [calls[0].payload.p_payload.starts_on, calls[0].payload.p_payload.ends_on],
    ["2026-10-01", null],
  );
  assert.deepEqual(
    [calls[1].payload.p_payload.application_starts_on, calls[1].payload.p_payload.exam_on],
    [null, "2026-10-10"],
  );
  assert.deepEqual(
    [calls[2].payload.p_payload.application_starts_on, calls[2].payload.p_payload.application_ends_on],
    [null, null],
  );
});

test("mutation helpers reject invalid calendar dates and reversed explicit ranges before RPC", async () => {
  let calls = 0;
  const client = { async rpc() { calls += 1; return { data: null, error: null }; } };
  const base = {
    title: "TEST 과정", category: "referee", providerType: "association", providerName: "TEST 기관",
    region: "서울", method: "offline", target: "심판 준비자", schedule: "추후 공지", price: "문의",
    status: "recruiting", description: "TEST typed-date 과정의 충분히 긴 설명입니다.",
    officialUrl: "https://example.invalid/course", applicationUrl: null, featured: false,
  };
  await assert.rejects(
    mutateCertificationCourse(client, "create", "bad-date", null, { ...base, startsOn: "2026-02-30", endsOn: null }),
    CertificationDirectoryError,
  );
  await assert.rejects(
    mutateCertificationCourse(client, "create", "bad-range", null, { ...base, startsOn: "2026-10-02", endsOn: "2026-10-01" }),
    CertificationDirectoryError,
  );
  assert.equal(calls, 0);
});
