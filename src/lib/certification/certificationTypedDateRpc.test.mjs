import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260923000100_pul_certification_typed_date_foundation.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

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
      "exec", "-i", container, "psql", "-U", user, "-d", database,
      "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
    ],
    text,
  );
}

function authenticated(actor, text) {
  return sql(`set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`);
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
}

function coursePayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST typed-date 심판 과정",
    category: "referee",
    provider_type: "association",
    provider_name: "TEST 공식 교육기관",
    region: "서울",
    course_method: "theory_practice",
    target_text: "심판 활동 준비자",
    schedule_text: "기관 일정에 따라 변경",
    starts_on: null,
    ends_on: null,
    price_text: "기관 문의",
    recruit_status: "recruiting",
    description: "TEST typed-date 계약을 검증하는 공개 교육과정 설명입니다.",
    official_url: "https://example.invalid/typed-course",
    application_url: null,
    is_featured: false,
    ...overrides,
  });
}

function examPayload(overrides = {}) {
  return JSON.stringify({
    exam_name: "TEST typed-date 심판 시험",
    exam_type: "park_referee",
    organization_name: "TEST 공식 시험기관",
    application_period: "2026년 하반기 예정",
    application_starts_on: null,
    application_ends_on: null,
    exam_date_text: "추후 공지",
    exam_on: null,
    venue_announcement: "공식 시험장 공지 확인",
    result_date_text: "기관 일정에 따라 변경",
    result_on: null,
    required_items: "신분증과 응시표",
    official_url: "https://example.invalid/typed-exam",
    schedule_status: "application_planned",
    ...overrides,
  });
}

function jobPayload(overrides = {}) {
  return JSON.stringify({
    title: "TEST typed-date 대회 심판 모집",
    role_type: "referee",
    region: "경기",
    schedule_text: "상시 모집",
    application_starts_on: null,
    application_ends_on: null,
    role_description: "대회 경기 진행과 심판 업무",
    condition_text: "공고에 기재된 자격 조건 확인",
    pay_text: "모집 주체 문의",
    organizer_name: "TEST 대회 운영기관",
    organizer_type: "대회 운영자",
    recruit_status: "recruiting",
    official_url: "https://example.invalid/typed-job",
    application_url: null,
    ...overrides,
  });
}

const ids = {
  admin: randomUUID(),
  member: randomUUID(),
  suspendedAdmin: randomUUID(),
  moderator: randomUUID(),
};
let container;
let database;

before(() => {
  const found = docker([
    "ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}",
  ]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"], "the PUL local Supabase database is required");
  container = found[0];
  database = `pul_cert_typed_${process.pid}_${Date.now()}`;
  const clone = docker([
    "exec", container, "sh", "-lc",
    [
      `createdb -U supabase_admin -O postgres ${database}`,
      `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
      `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    ].join(" && "),
  ]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const authRows = Object.entries(ids).map(
    ([alias, id]) =>
      `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','typed-${alias}@example.invalid','',now(),now(),now())`,
  ).join(",");
  const fixture = sql(
    `set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values ${authRows};
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${ids.admin}','active','platform_admin'),
      ('${ids.member}','active','member'),
      ('${ids.suspendedAdmin}','suspended','platform_admin'),
      ('${ids.moderator}','active','platform_moderator');
    set session_replication_role=origin;
    insert into public.certification_courses(
      course_key,title,category,provider_type,provider_name,region,course_method,
      target_text,schedule_text,price_text,recruit_status,description,official_url,
      application_url,is_featured,publication_status,created_by,updated_by
    ) values ('typed-baseline-course','TEST 기존 과정','referee','association','TEST 기관','서울','offline',
      '심판 준비자','추후 공지','기관 문의','waiting','TEST 기존 문자열 일정 보존 확인 과정입니다.',
      'https://example.invalid/baseline-course',null,false,'hidden','${ids.admin}','${ids.admin}');
    insert into public.certification_exam_schedules(
      schedule_key,exam_name,exam_type,organization_name,application_period,exam_date_text,
      venue_announcement,result_date_text,required_items,official_url,schedule_status,
      publication_status,created_by,updated_by
    ) values ('typed-baseline-exam','TEST 기존 시험','park_referee','TEST 기관','2026년 하반기',
      '추후 공지','기관 공지','기관 일정에 따라 변경','신분증','https://example.invalid/baseline-exam',
      'application_planned','hidden','${ids.admin}','${ids.admin}');
    insert into public.certification_jobs(
      job_key,title,role_type,region,schedule_text,role_description,condition_text,pay_text,
      organizer_name,organizer_type,recruit_status,official_url,application_url,
      publication_status,created_by,updated_by
    ) values ('typed-baseline-job','TEST 기존 모집','referee','경기','상시 모집','심판 업무',
      '공고 조건 확인','기관 문의','TEST 기관','운영자','recruiting',
      'https://example.invalid/baseline-job',null,'removed','${ids.admin}','${ids.admin}');`,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);

  const hasTypedDate = sql(
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='certification_courses' and column_name='starts_on');",
    "postgres",
  );
  assert.equal(hasTypedDate.status, 0, hasTypedDate.stdout + hasTypedDate.stderr);
  if (hasTypedDate.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration} commit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
});

after(() => {
  if (container && database) {
    assert.equal(
      docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status,
      0,
    );
  }
});

test("catalog exposes exactly eight nullable date columns without defaults and three checks", () => {
  const result = json(sql(`select pg_catalog.jsonb_build_object(
    'columns', (
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'table', table_name, 'column', column_name, 'type', data_type,
        'nullable', is_nullable, 'default', column_default
      ) order by table_name, ordinal_position)
      from information_schema.columns
      where table_schema='public'
        and table_name in ('certification_courses','certification_exam_schedules','certification_jobs')
        and column_name in ('starts_on','ends_on','application_starts_on','application_ends_on','exam_on','result_on')
    ),
    'checks', (
      select pg_catalog.jsonb_agg(conname order by conname)
      from pg_catalog.pg_constraint
      where conname in (
        'certification_courses_typed_date_order_check',
        'certification_exam_schedules_application_date_order_check',
        'certification_jobs_application_date_order_check'
      )
    )
  );`, "postgres"));
  assert.equal(result.columns.length, 8);
  for (const column of result.columns) {
    assert.equal(column.type, "date");
    assert.equal(column.nullable, "YES");
    assert.equal(column.default, null);
  }
  assert.equal(result.checks.length, 3);
});

test("existing schedule text remains and no typed date is synthesized", () => {
  const result = json(sql(`select pg_catalog.jsonb_build_object(
    'course', (select pg_catalog.jsonb_build_object('text',schedule_text,'start',starts_on,'end',ends_on) from public.certification_courses where course_key='typed-baseline-course'),
    'exam', (select pg_catalog.jsonb_build_object('period',application_period,'exam_text',exam_date_text,'result_text',result_date_text,'start',application_starts_on,'end',application_ends_on,'exam',exam_on,'result',result_on) from public.certification_exam_schedules where schedule_key='typed-baseline-exam'),
    'job', (select pg_catalog.jsonb_build_object('text',schedule_text,'start',application_starts_on,'end',application_ends_on) from public.certification_jobs where job_key='typed-baseline-job')
  );`, "postgres"));
  assert.deepEqual([result.course.text, result.exam.period, result.exam.exam_text, result.exam.result_text, result.job.text], [
    "추후 공지", "2026년 하반기", "추후 공지", "기관 일정에 따라 변경", "상시 모집",
  ]);
  assert.equal([result.course.start, result.course.end, result.exam.start, result.exam.end, result.exam.exam, result.exam.result, result.job.start, result.job.end].every((value) => value === null), true);
});

test("all three mutations accept less, equal, partial, and null ranges but reject reversed ranges", () => {
  const variants = [
    ["less", "2026-10-01", "2026-10-02"],
    ["equal", "2026-10-02", "2026-10-02"],
    ["start-null", null, "2026-10-02"],
    ["end-null", "2026-10-01", null],
    ["null", null, null],
  ];
  for (const [suffix, start, end] of variants) {
    const course = authenticated(ids.admin, `select public.mutate_certification_course('create','typed-course-${suffix}',null,$p$${coursePayload({ starts_on: start, ends_on: end })}$p$::jsonb);`);
    assert.equal(course.status, 0, course.stdout + course.stderr);
    const exam = authenticated(ids.admin, `select public.mutate_certification_exam_schedule('create','typed-exam-${suffix}',null,$p$${examPayload({ application_starts_on: start, application_ends_on: end })}$p$::jsonb);`);
    assert.equal(exam.status, 0, exam.stdout + exam.stderr);
    const job = authenticated(ids.admin, `select public.mutate_certification_job('create','typed-job-${suffix}',null,$p$${jobPayload({ application_starts_on: start, application_ends_on: end })}$p$::jsonb);`);
    assert.equal(job.status, 0, job.stdout + job.stderr);
  }
  for (const [name, call] of [
    ["course", `select public.mutate_certification_course('create','typed-course-reversed',null,$p$${coursePayload({ starts_on: "2026-10-03", ends_on: "2026-10-02" })}$p$::jsonb);`],
    ["exam", `select public.mutate_certification_exam_schedule('create','typed-exam-reversed',null,$p$${examPayload({ application_starts_on: "2026-10-03", application_ends_on: "2026-10-02" })}$p$::jsonb);`],
    ["job", `select public.mutate_certification_job('create','typed-job-reversed',null,$p$${jobPayload({ application_starts_on: "2026-10-03", application_ends_on: "2026-10-02" })}$p$::jsonb);`],
  ]) {
    const result = authenticated(ids.admin, call);
    assert.notEqual(result.status, 0, `${name} reversed range must fail`);
    assert.match(result.stderr, /date_order_check|check constraint/i);
  }
});

test("strict mutation date input rejects malformed and impossible calendar dates in every domain", () => {
  const cases = [
    `select public.mutate_certification_course('create','typed-course-malformed',null,$p$${coursePayload({ starts_on: "2026/10/01" })}$p$::jsonb);`,
    `select public.mutate_certification_course('create','typed-course-impossible',null,$p$${coursePayload({ starts_on: "2026-02-30" })}$p$::jsonb);`,
    `select public.mutate_certification_exam_schedule('create','typed-exam-malformed',null,$p$${examPayload({ exam_on: "10월 중" })}$p$::jsonb);`,
    `select public.mutate_certification_exam_schedule('create','typed-exam-impossible',null,$p$${examPayload({ result_on: "2026-02-30" })}$p$::jsonb);`,
    `select public.mutate_certification_job('create','typed-job-malformed',null,$p$${jobPayload({ application_ends_on: "2026/10/01" })}$p$::jsonb);`,
    `select public.mutate_certification_job('create','typed-job-impossible',null,$p$${jobPayload({ application_ends_on: "2026-02-30" })}$p$::jsonb);`,
  ];
  for (const statement of cases) {
    const result = authenticated(ids.admin, statement);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /날짜/);
  }
});

test("exam and result dates remain independent from the application range", () => {
  const result = authenticated(
    ids.admin,
    `select public.mutate_certification_exam_schedule('create','typed-exam-cross-order',null,$p$${examPayload({
      application_starts_on: "2026-11-01",
      application_ends_on: "2026-11-02",
      exam_on: "2026-10-20",
      result_on: "2026-10-10",
    })}$p$::jsonb);`,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("typed dates update, clear, preserve omitted keys, and retain optimistic version checks", () => {
  const updatedCourse = json(authenticated(ids.admin, `select public.mutate_certification_course('update','typed-course-equal',1,$p$${coursePayload({ starts_on: null, ends_on: null })}$p$::jsonb);`));
  const updatedExam = json(authenticated(ids.admin, `select public.mutate_certification_exam_schedule('update','typed-exam-equal',1,$p$${examPayload({ application_starts_on: null, application_ends_on: null, exam_on: "2026-12-01", result_on: null })}$p$::jsonb);`));
  const updatedJob = json(authenticated(ids.admin, `select public.mutate_certification_job('update','typed-job-equal',1,$p$${jobPayload({ application_starts_on: null, application_ends_on: null })}$p$::jsonb);`));
  assert.deepEqual([updatedCourse.version, updatedExam.version, updatedJob.version], [2, 2, 2]);
  const cleared = json(sql(`select pg_catalog.jsonb_build_object(
    'course', (select pg_catalog.jsonb_build_array(starts_on,ends_on) from public.certification_courses where course_key='typed-course-equal'),
    'exam', (select pg_catalog.jsonb_build_array(application_starts_on,application_ends_on,exam_on,result_on) from public.certification_exam_schedules where schedule_key='typed-exam-equal'),
    'job', (select pg_catalog.jsonb_build_array(application_starts_on,application_ends_on) from public.certification_jobs where job_key='typed-job-equal')
  );`, "postgres"));
  assert.deepEqual(cleared.course, [null, null]);
  assert.deepEqual(cleared.exam, [null, null, "2026-12-01", null]);
  assert.deepEqual(cleared.job, [null, null]);

  const oldShape = JSON.parse(coursePayload());
  delete oldShape.starts_on;
  delete oldShape.ends_on;
  const preserved = json(authenticated(ids.admin, `select public.mutate_certification_course('update','typed-course-less',1,$p$${JSON.stringify(oldShape)}$p$::jsonb);`));
  assert.equal(preserved.version, 2);
  const dates = json(sql("select pg_catalog.jsonb_build_array(starts_on,ends_on) from public.certification_courses where course_key='typed-course-less';", "postgres"));
  assert.deepEqual(dates, ["2026-10-01", "2026-10-02"]);

  const stale = authenticated(ids.admin, `select public.mutate_certification_job('update','typed-job-equal',1,$p$${jobPayload()}$p$::jsonb);`);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
});

test("public DTOs expose date strings or null and continue hiding non-published rows", () => {
  for (const [name, key] of [
    ["mutate_certification_course", "typed-course-less"],
    ["mutate_certification_course", "typed-course-start-null"],
    ["mutate_certification_course", "typed-course-null"],
    ["mutate_certification_exam_schedule", "typed-exam-less"],
    ["mutate_certification_exam_schedule", "typed-exam-start-null"],
    ["mutate_certification_exam_schedule", "typed-exam-null"],
    ["mutate_certification_job", "typed-job-less"],
    ["mutate_certification_job", "typed-job-start-null"],
    ["mutate_certification_job", "typed-job-null"],
  ]) {
    const keyArgument = name.includes("course") ? "course" : name.includes("exam") ? "schedule" : "job";
    const current = Number(sql(`select version from public.certification_${keyArgument === "course" ? "courses" : keyArgument === "schedule" ? "exam_schedules" : "jobs"} where ${keyArgument}_key='${key}';`, "postgres").stdout.trim());
    const published = authenticated(ids.admin, `select public.${name}('publish','${key}',${current},'{}'::jsonb);`);
    assert.equal(published.status, 0, published.stdout + published.stderr);
  }
  const courses = json(sql("set role anon; select public.list_public_certification_courses(null,null,null,null,null,null,50,0);"));
  const exams = json(sql("set role anon; select public.list_public_certification_exam_schedules(null,null,50,0);"));
  const jobs = json(sql("set role anon; select public.list_public_certification_jobs(null,null,null,50,0);"));
  assert.deepEqual(courses.items.find((item) => item.course_key === "typed-course-less").starts_on, "2026-10-01");
  assert.equal(courses.items.find((item) => item.course_key === "typed-course-start-null").starts_on, null);
  assert.deepEqual(exams.items.find((item) => item.schedule_key === "typed-exam-null").exam_on, null);
  assert.deepEqual(jobs.items.find((item) => item.job_key === "typed-job-less").application_ends_on, "2026-10-02");
  assert.equal(courses.items.some((item) => item.course_key === "typed-baseline-course"), false);
  assert.equal(exams.items.some((item) => item.schedule_key === "typed-baseline-exam"), false);
  assert.equal(jobs.items.some((item) => item.job_key === "typed-baseline-job"), false);
});

test("management reads include hidden and removed rows, leak no internal identifiers, and work read-only", () => {
  const pages = [
    json(authenticated(ids.admin, "begin read only; select public.list_certification_courses_for_management(null,null,50,0); rollback;")),
    json(authenticated(ids.admin, "begin read only; select public.list_certification_exam_schedules_for_management(null,null,50,0); rollback;")),
    json(authenticated(ids.admin, "begin read only; select public.list_certification_jobs_for_management(null,null,50,0); rollback;")),
  ];
  assert.equal(pages[0].items.some((item) => item.course_key === "typed-baseline-course"), true);
  assert.equal(pages[1].items.some((item) => item.schedule_key === "typed-baseline-exam"), true);
  assert.equal(pages[2].items.find((item) => item.job_key === "typed-baseline-job").publication_status, "removed");
  for (const page of pages) {
    for (const item of page.items) {
      for (const key of ["id", "created_by", "updated_by", "actor_id", "user_id"]) {
        assert.equal(key in item, false);
      }
    }
  }
  assert.equal(json(authenticated(ids.admin, "begin read only; select public.get_certification_course_for_management('typed-baseline-course'); rollback;")).publication_status, "hidden");
  assert.equal(json(authenticated(ids.admin, "begin read only; select public.get_certification_exam_schedule_for_management('typed-baseline-exam'); rollback;")).application_starts_on, null);
  assert.equal(json(authenticated(ids.admin, "begin read only; select public.get_certification_job_for_management('typed-baseline-job'); rollback;")).publication_status, "removed");
});

test("member, inactive admin, HOF moderator, and anon cannot use management reads or mutations", () => {
  for (const actor of [ids.member, ids.suspendedAdmin, ids.moderator]) {
    const read = authenticated(actor, "select public.list_certification_courses_for_management(null,null,30,0);");
    assert.notEqual(read.status, 0);
    assert.match(read.stderr, /권한/);
  }
  const anonRead = sql("set role anon; select public.list_certification_jobs_for_management(null,null,30,0);");
  assert.notEqual(anonRead.status, 0);
  assert.match(anonRead.stderr, /permission denied/i);
  const memberMutation = authenticated(ids.member, `select public.mutate_certification_course('create','typed-member-denied',null,$p$${coursePayload()}$p$::jsonb);`);
  const inactiveMutation = authenticated(ids.suspendedAdmin, `select public.mutate_certification_exam_schedule('create','typed-inactive-denied',null,$p$${examPayload()}$p$::jsonb);`);
  const moderatorMutation = authenticated(ids.moderator, `select public.mutate_certification_job('create','typed-moderator-denied',null,$p$${jobPayload()}$p$::jsonb);`);
  for (const result of [memberMutation, inactiveMutation, moderatorMutation]) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /권한/);
  }
});

test("authenticated raw table DML remains closed", () => {
  for (const statement of [
    "update public.certification_courses set starts_on='2026-10-01' where course_key='typed-baseline-course';",
    "update public.certification_exam_schedules set exam_on='2026-10-01' where schedule_key='typed-baseline-exam';",
    "update public.certification_jobs set application_ends_on='2026-10-01' where job_key='typed-baseline-job';",
  ]) {
    const result = authenticated(ids.admin, statement);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /permission denied|row-level security/i);
  }
});
