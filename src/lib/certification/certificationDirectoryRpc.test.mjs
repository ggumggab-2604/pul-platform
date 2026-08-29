import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";

function docker(args, input) {
  return spawnSync("docker", args, {
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function sql(text, user = "supabase_admin") {
  return docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-X",
      "-q",
      "-t",
      "-A",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

function coursePayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST 심판 자격 과정",
    category: "referee",
    provider_type: "association",
    provider_name: "TEST 공식 교육기관",
    region: "서울",
    course_method: "theory_practice",
    target_text: "심판 활동 준비자",
    schedule_text: "공식 일정 확인",
    price_text: "기관 문의",
    recruit_status: "recruiting",
    description: "TEST 심판 자격 취득을 준비하는 공개 교육과정 설명입니다.",
    official_url: "https://example.invalid/course",
    application_url: "https://example.invalid/course/apply",
    is_featured: false,
    ...overrides,
  });
}

function examPayload(overrides = {}) {
  return JSON.stringify({
    exam_name: "TEST 심판 과정 평가",
    exam_type: "park_referee",
    organization_name: "TEST 공식 시험기관",
    application_period: "공식 접수 기간 확인",
    exam_date_text: "공식 시험일 확인",
    venue_announcement: "공식 시험장 공지 확인",
    result_date_text: "공식 합격 발표 확인",
    required_items: "신분증과 응시표",
    official_url: "https://example.invalid/exam",
    schedule_status: "application_planned",
    ...overrides,
  });
}

function jobPayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST 대회 심판 모집",
    role_type: "referee",
    region: "경기",
    schedule_text: "공식 일정 확인",
    role_description: "대회 경기 진행과 심판 업무",
    condition_text: "공고에 기재된 자격 조건 확인",
    pay_text: "모집 주체 문의",
    organizer_name: "TEST 대회 운영기관",
    organizer_type: "대회 운영자",
    recruit_status: "recruiting",
    official_url: "https://example.invalid/job",
    application_url: "https://example.invalid/job/apply",
    ...overrides,
  });
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  suspendedAdmin: randomUUID(),
};
let container;
let database;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=^supabase_db_pul-platform$",
    "--format",
    "{{.Names}}",
  ]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_certification_${process.pid}_${Date.now()}`;
  const clone = docker([
    "exec",
    container,
    "sh",
    "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
  const authRows = Object.entries(ids)
    .map(
      ([alias, id]) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cert-${alias}@example.invalid','',now(),now(),now())`,
    )
    .join(",");
  const fixture = sql(
    `set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.member}','active','member'),
      ('${ids.suspendedAdmin}','suspended','platform_admin');
    set session_replication_role=origin;
    insert into public.certification_courses(
      course_key,title,category,provider_type,provider_name,region,course_method,
      target_text,schedule_text,price_text,recruit_status,description,official_url,
      application_url,is_featured,publication_status,created_by,updated_by
    ) values
      ('course-featured','TEST 추천 심판 과정','referee','association','TEST 협회','서울','theory_practice','심판 준비자','9월 주말','기관 문의','recruiting','TEST 추천 심판 과정의 공개 상세 설명입니다.','https://example.invalid/course-featured','https://example.invalid/course-featured/apply',true,'published','${ids.admin}','${ids.admin}'),
      ('course-life','TEST 생활스포츠지도사 과정','life_sports','national_exam','TEST 기관','경기','hybrid','지도사 준비자','상시','30만원','accepting','TEST 생활스포츠지도사 과정의 공개 상세 설명입니다.','https://example.invalid/course-life',null,false,'published','${ids.admin}','${ids.admin}'),
      ('course-hidden','TEST 숨김 과정','referee','association','TEST 기관','서울','offline','심판 준비자','미정','문의','closed','TEST 숨김 과정의 비공개 상세 설명입니다.','https://example.invalid/course-hidden',null,false,'hidden','${ids.admin}','${ids.admin}'),
      ('course-removed','TEST 제거 과정','referee','association','TEST 기관','서울','offline','심판 준비자','미정','문의','closed','TEST 제거 과정의 비공개 상세 설명입니다.','https://example.invalid/course-removed',null,false,'removed','${ids.admin}','${ids.admin}');
    insert into public.certification_exam_schedules(
      schedule_key,exam_name,exam_type,organization_name,application_period,
      exam_date_text,venue_announcement,result_date_text,required_items,
      official_url,schedule_status,publication_status,created_by,updated_by
    ) values
      ('exam-referee','TEST 심판 시험','park_referee','TEST 시험기관','접수 기간 확인','시험일 확인','시험장 공지 확인','발표일 확인','신분증','https://example.invalid/exam-referee','application_open','published','${ids.admin}','${ids.admin}'),
      ('exam-life','TEST 생활스포츠 시험','life_sports','TEST 국가기관','접수 예정','시험 예정','장소 예정','결과 예정','응시표','https://example.invalid/exam-life','exam_planned','published','${ids.admin}','${ids.admin}'),
      ('exam-hidden','TEST 숨김 시험','park_referee','TEST 기관','미정','미정','미정','미정','신분증','https://example.invalid/exam-hidden','venue_planned','hidden','${ids.admin}','${ids.admin}');
    insert into public.certification_jobs(
      job_key,title,role_type,region,schedule_text,role_description,condition_text,
      pay_text,organizer_name,organizer_type,recruit_status,official_url,
      application_url,publication_status,created_by,updated_by
    ) values
      ('job-referee','TEST 경기 심판 모집','referee','경기','대회 일정 확인','경기 진행과 심판','공고 자격 조건 확인','기관 문의','TEST 대회기관','대회 운영자','recruiting','https://example.invalid/job-referee','https://example.invalid/job-referee/apply','published','${ids.admin}','${ids.admin}'),
      ('job-staff','TEST 서울 운영요원 모집','staff','서울','행사 일정 확인','현장 운영 보조','공고 조건 확인','활동비 문의','TEST 운영기관','행사 운영자','planned','https://example.invalid/job-staff',null,'published','${ids.admin}','${ids.admin}'),
      ('job-hidden','TEST 숨김 모집','referee','서울','미정','심판','조건 확인','문의','TEST 기관','운영자','closed','https://example.invalid/job-hidden',null,'hidden','${ids.admin}','${ids.admin}');`,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (container && database) {
    assert.equal(
      docker([
        "exec",
        container,
        "dropdb",
        "--if-exists",
        "--force",
        "-U",
        "supabase_admin",
        database,
      ]).status,
      0,
    );
  }
});

test("course public list is published-only, filtered, paginated, and privacy-safe", () => {
  const page = json(
    sql("set role anon; select public.list_public_certification_courses(null,null,null,null,null,null,24,0);"),
  );
  assert.equal(page.total, 2);
  assert.equal(page.items[0].course_key, "course-featured");
  assert.equal(
    json(
      sql("set role anon; select public.list_public_certification_courses('생활스포츠',null,'national_exam','경기','hybrid','accepting',24,0);"),
    ).items[0].course_key,
    "course-life",
  );
  const first = json(
    sql("set role anon; select public.list_public_certification_courses(null,null,null,null,null,null,1,0);"),
  );
  assert.equal(first.items.length, 1);
  assert.equal(first.total, 2);
  assert.equal(first.has_more, true);
  for (const item of page.items) {
    for (const key of ["id", "created_by", "updated_by", "version", "publication_status"]) {
      assert.equal(key in item, false);
    }
  }
});

test("course stable detail hides absent, hidden, and removed rows", () => {
  assert.equal(
    json(sql("set role anon; select public.get_public_certification_course('course-life');")).course_key,
    "course-life",
  );
  for (const key of ["course-hidden", "course-removed", "missing"]) {
    const result = sql(
      `set role anon; select public.get_public_certification_course('${key}');`,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /찾을 수 없습니다/);
  }
});

test("exam schedule list is published-only and filters type and status", () => {
  const page = json(
    sql("set role anon; select public.list_public_certification_exam_schedules(null,null,24,0);"),
  );
  assert.equal(page.total, 2);
  assert.equal(
    json(
      sql("set role anon; select public.list_public_certification_exam_schedules('park_referee','application_open',24,0);"),
    ).items[0].schedule_key,
    "exam-referee",
  );
  assert.equal(page.items.some((item) => item.schedule_key === "exam-hidden"), false);
});

test("job list and detail filter public rows without member-private fields", () => {
  const page = json(
    sql("set role anon; select public.list_public_certification_jobs(null,null,null,24,0);"),
  );
  assert.equal(page.total, 2);
  assert.equal(
    json(
      sql("set role anon; select public.list_public_certification_jobs('referee','경기','recruiting',24,0);"),
    ).items[0].job_key,
    "job-referee",
  );
  assert.equal(
    json(sql("set role anon; select public.get_public_certification_job('job-referee');")).job_key,
    "job-referee",
  );
  for (const item of page.items) {
    for (const key of ["user_id", "email", "phone", "created_by", "updated_by", "version"]) {
      assert.equal(key in item, false);
    }
  }
});

test("active platform admin manages all resources while member, inactive admin, and anon fail", () => {
  const denied = authenticated(
    ids.member,
    `select public.mutate_certification_course('create','denied-course',null,$payload$${coursePayload()}$payload$::jsonb);`,
  );
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /권한/);
  const inactive = authenticated(
    ids.suspendedAdmin,
    `select public.mutate_certification_job('create','inactive-job',null,$payload$${jobPayload()}$payload$::jsonb);`,
  );
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /권한/);

  assert.equal(
    json(
      authenticated(
        ids.admin,
        `select public.mutate_certification_course('create','new-course',null,$payload$${coursePayload()}$payload$::jsonb);`,
      ),
    ).publication_status,
    "hidden",
  );
  assert.equal(
    json(
      authenticated(
        ids.admin,
        "select public.mutate_certification_course('publish','new-course',1,'{}'::jsonb);",
      ),
    ).version,
    2,
  );
  assert.equal(
    json(
      authenticated(
        ids.admin,
        `select public.mutate_certification_exam_schedule('create','new-exam',null,$payload$${examPayload()}$payload$::jsonb);`,
      ),
    ).publication_status,
    "hidden",
  );
  assert.equal(
    json(
      authenticated(
        ids.admin,
        `select public.mutate_certification_job('create','new-job',null,$payload$${jobPayload()}$payload$::jsonb);`,
      ),
    ).publication_status,
    "hidden",
  );
  const anon = sql(
    "set role anon; select public.mutate_certification_job('hide','job-referee',1,'{}'::jsonb);",
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
});

test("invalid enums, unsafe URLs, stale versions, and direct authenticated DML fail closed", () => {
  const invalidCategory = authenticated(
    ids.admin,
    `select public.mutate_certification_course('create','bad-category',null,$payload$${coursePayload({ category: "unknown" })}$payload$::jsonb);`,
  );
  assert.notEqual(invalidCategory.status, 0);
  assert.match(invalidCategory.stderr, /category_check|check constraint/i);
  const unsafeCourse = authenticated(
    ids.admin,
    `select public.mutate_certification_course('create','bad-course',null,$payload$${coursePayload({ official_url: "javascript:alert(1)" })}$payload$::jsonb);`,
  );
  assert.notEqual(unsafeCourse.status, 0);
  assert.match(unsafeCourse.stderr, /official_url_check|check constraint/i);
  const unsafeJob = authenticated(
    ids.admin,
    `select public.mutate_certification_job('create','bad-job',null,$payload$${jobPayload({ official_url: "http://example.invalid/job" })}$payload$::jsonb);`,
  );
  assert.notEqual(unsafeJob.status, 0);
  assert.match(unsafeJob.stderr, /official_url_check|check constraint/i);
  const stale = authenticated(
    ids.admin,
    "select public.mutate_certification_course('hide','course-life',999,'{}'::jsonb);",
  );
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
  for (const statement of [
    "update public.certification_courses set title='직접 변경' where course_key='course-life';",
    "delete from public.certification_exam_schedules where schedule_key='exam-life';",
    "update public.certification_jobs set pay_text='직접 변경' where job_key='job-referee';",
  ]) {
    const result = authenticated(ids.admin, statement);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permission denied|row-level security/i);
  }
});
