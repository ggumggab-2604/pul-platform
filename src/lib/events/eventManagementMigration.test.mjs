import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260922000100_pul_event_operations_management.sql", import.meta.url)), "utf8");
function docker(args, input) { return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 }); }
function sql(text, user = "supabase_admin") { return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text); }

let container;
let database;
const actor = randomUUID();
const member = randomUUID();
const suspendedAdmin = randomUUID();
const moderator = randomUUID();

before(() => {
  const found = docker(["ps", "--filter", "name=^supabase_db_pul-platform$", "--format", "{{.Names}}"]).stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(found, ["supabase_db_pul-platform"]);
  container = found[0];
  database = `pul_event_management_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);
});

after(() => {
  if (container && database) assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
});

test("the complete forward migration applies to a clone of the exact 75-migration local baseline", () => {
  const applied = sql(`begin; ${migration}\ncommit;`, "postgres");
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  const catalog = sql(`select concat_ws(',',
    (select count(*) from pg_proc where oid in (
      'public.list_events_for_management(text,text,text,text,timestamptz,integer,integer)'::regprocedure,
      'public.get_event_for_management(text,timestamptz)'::regprocedure,
      'private.event_actor_has_management_permission(uuid)'::regprocedure,
      'private.event_management_freshness(public.events,timestamptz)'::regprocedure,
      'private.management_event_json(public.events,timestamptz)'::regprocedure
    )),
    (select provolatile from pg_proc where oid='public.list_events_for_management(text,text,text,text,timestamptz,integer,integer)'::regprocedure),
    (select proconfig @> array['search_path=""'] from pg_proc where oid='public.get_event_for_management(text,timestamptz)'::regprocedure),
    (select proconfig @> array['TimeZone=Asia/Seoul'] from pg_proc where oid='public.get_operations_dashboard(timestamptz,integer)'::regprocedure)
  );`, "postgres");
  assert.equal(catalog.status, 0, catalog.stdout + catalog.stderr);
  assert.equal(catalog.stdout.trim(), "5,s,t,t");
});

test("effective ACL is authenticated-only and direct event table privileges remain closed", () => {
  const acl = sql(`select concat_ws(',',
    has_function_privilege('authenticated','public.list_events_for_management(text,text,text,text,timestamptz,integer,integer)','execute'),
    has_function_privilege('anon','public.list_events_for_management(text,text,text,text,timestamptz,integer,integer)','execute'),
    has_function_privilege('service_role','public.list_events_for_management(text,text,text,text,timestamptz,integer,integer)','execute'),
    has_function_privilege('authenticated','public.get_event_for_management(text,timestamptz)','execute'),
    has_function_privilege('anon','public.get_event_for_management(text,timestamptz)','execute'),
    has_table_privilege('authenticated','public.events','update')
  );`, "postgres");
  assert.equal(acl.status, 0, acl.stdout + acl.stderr);
  assert.equal(acl.stdout.trim(), "t,f,f,t,f,f");
});

test("KST boundary, nullable schedule exclusion, filters and dashboard counts converge without mutation", () => {
  const fixture = sql(`set session_replication_role=replica;
    insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
    values
      ('${actor}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-${actor}@example.invalid','',now(),now(),now()),
      ('${member}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-${member}@example.invalid','',now(),now(),now()),
      ('${suspendedAdmin}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-${suspendedAdmin}@example.invalid','',now(),now(),now()),
      ('${moderator}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','event-${moderator}@example.invalid','',now(),now(),now());
    insert into public.user_accounts(id,account_status,platform_role) values
      ('${actor}','active','platform_admin'),
      ('${member}','active','member'),
      ('${suspendedAdmin}','suspended','platform_admin'),
      ('${moderator}','active','platform_moderator');
    insert into public.events(event_key,title,match_type,event_scale,region,venue_name,venue_type,start_date,end_date,schedule_note,registration_status,target_audience,organizer,summary,benefits,recruitment_status,is_featured,publication_status,created_by,updated_by)
    values
      ('test-kst-today','TEST KST 오늘 대회','field','city','서울','TEST 장소','field','2026-09-22','2026-09-22',null,'open',array['TEST 회원'],'TEST 운영진','TEST KST 오늘 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-kst-seven','TEST KST 7일 대회','field','city','서울','TEST 장소','field','2026-09-29','2026-09-29',null,'scheduled',array['TEST 회원'],'TEST 운영진','TEST KST 7일 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-status-mismatch','TEST 상태 확인 대회','field','city','서울','TEST 장소','field','2026-09-19','2026-09-21',null,'open',array['TEST 회원'],'TEST 운영진','TEST 종료 뒤 접수 상태 확인 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-status-scheduled','TEST 예정 상태 확인 대회','field','city','서울','TEST 장소','field','2026-09-19','2026-09-21',null,'scheduled',array['TEST 회원'],'TEST 운영진','TEST 종료 뒤 접수 예정 상태 확인 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-status-ended','TEST 정상 종료 대회','field','city','서울','TEST 장소','field','2026-09-19','2026-09-21',null,'ended',array['TEST 회원'],'TEST 운영진','TEST 정상 종료 상태 대회 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-today-end','TEST 오늘 종료 대회','field','city','서울','TEST 장소','field','2026-09-21','2026-09-22',null,'open',array['TEST 회원'],'TEST 운영진','TEST 오늘 종료 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-future-end','TEST 미래 종료 대회','field','city','서울','TEST 장소','field','2026-09-01','2026-09-23',null,'open',array['TEST 회원'],'TEST 운영진','TEST 미래 종료 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-null-end','TEST 종료일 없는 대회','field','city','서울','TEST 장소','field','2026-09-01',null,null,'open',array['TEST 회원'],'TEST 운영진','TEST 종료일 없는 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-schedule-note','TEST 일정 미정 대회','field','city','서울','TEST 장소','undecided',null,null,'일정 추후 공지','open',array['TEST 회원'],'TEST 운영진','TEST 일정 미정 대회 상세 설명입니다.',array[]::text[],'none',false,'published','${actor}','${actor}'),
      ('test-hidden-upcoming','TEST 숨김 예정 대회','field','city','서울','TEST 장소','field','2026-09-25','2026-09-25',null,'open',array['TEST 회원'],'TEST 운영진','TEST 숨김 예정 대회 상세 설명입니다.',array[]::text[],'none',false,'hidden','${actor}','${actor}'),
      ('test-removed-mismatch','TEST 제거 상태 대회','field','city','서울','TEST 장소','field','2026-09-19','2026-09-21',null,'open',array['TEST 회원'],'TEST 운영진','TEST 제거 상태 대회 상세 설명입니다.',array[]::text[],'none',false,'removed','${actor}','${actor}');
    set session_replication_role=origin;`, "postgres");
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);

  const result = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    with values_at_boundary as (
      select
        public.list_events_for_management(null,null,null,'starting-soon','2026-09-22T14:59:59Z',50,0) as before_midnight,
        public.list_events_for_management(null,null,null,'starting-soon','2026-09-22T15:00:00Z',50,0) as after_midnight,
        public.list_events_for_management(null,null,null,'status-mismatch','2026-09-22T14:59:59Z',50,0) as mismatch,
        public.get_operations_dashboard('2026-09-22T14:59:59Z',1) as dashboard
    )
    select concat_ws(',',
      before_midnight->>'total',
      after_midnight->>'total',
      mismatch->>'total',
      (select item->>'count' from pg_catalog.jsonb_array_elements(dashboard->'upcoming') as item where item->>'item_key'='events_starting_soon'),
      (select item->>'count' from pg_catalog.jsonb_array_elements(dashboard->'upcoming') as item where item->>'item_key'='events_status_mismatch')
    ) from values_at_boundary;`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.trim(), "2,1,2,2,2");
  const filters = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select concat_ws(',',
      public.list_events_for_management('TEST KST','published',null,null,'2026-09-22T14:59:59Z',1,0)->>'total',
      public.list_events_for_management('TEST KST','published',null,null,'2026-09-22T14:59:59Z',1,0)->>'has_more',
      public.list_events_for_management('TEST KST','published',null,null,'2026-09-22T14:59:59Z',1,1)->>'has_more',
      public.list_events_for_management('TEST 숨김','hidden',null,null,'2026-09-22T14:59:59Z',50,0)->>'total',
      public.list_events_for_management('TEST 제거','removed',null,null,'2026-09-22T14:59:59Z',50,0)->>'total',
      public.list_events_for_management('TEST 정상 종료',null,'ended',null,'2026-09-22T14:59:59Z',50,0)->>'total'
    );`);
  assert.equal(filters.status, 0, filters.stdout + filters.stderr);
  assert.equal(filters.stdout.trim(), "2,true,false,1,1,1");
  const unchanged = sql("select count(*) from public.events where event_key like 'test-%';", "postgres");
  assert.equal(unchanged.status, 0, unchanged.stdout + unchanged.stderr);
  assert.equal(unchanged.stdout.trim(), "11");
});

test("existing mutate_event covers create, update, publish, hide, end, invalid date and stale-version flows", () => {
  const create = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select public.mutate_event('create','test-ui-mutation',null,jsonb_build_object(
      'title','TEST UI 신규 대회','match_type','field','event_scale','city','region','서울',
      'venue_name','TEST UI 장소','venue_type','field','start_date','2026-10-01','end_date','2026-10-02',
      'schedule_note',null,'registration_status','scheduled','target_audience',jsonb_build_array('TEST 회원'),
      'organizer','TEST 운영진','summary','TEST UI 대회 상세 설명입니다.','benefits','[]'::jsonb,
      'recruitment_status','none','related_course_key',null,'official_url',null,'registration_url',null,
      'registration_note',null,'is_featured',false
    ));`);
  assert.equal(create.status, 0, create.stdout + create.stderr);
  assert.deepEqual(JSON.parse(create.stdout.trim()), { event_key: "test-ui-mutation", publication_status: "hidden", registration_status: "scheduled", version: 1 });

  const update = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select public.mutate_event('update','test-ui-mutation',1,jsonb_build_object(
      'title','TEST UI 수정 대회','match_type','field','event_scale','city','region','서울',
      'venue_name','TEST UI 장소','venue_type','field','start_date','2026-10-01','end_date','2026-10-02',
      'schedule_note',null,'registration_status','open','target_audience',jsonb_build_array('TEST 회원'),
      'organizer','TEST 운영진','summary','TEST UI 수정 대회 상세 설명입니다.','benefits','[]'::jsonb,
      'recruitment_status','none','related_course_key',null,'official_url',null,'registration_url',null,
      'registration_note',null,'is_featured',false
    ));
    select public.mutate_event('publish','test-ui-mutation',2,'{}'::jsonb);
    select public.mutate_event('hide','test-ui-mutation',3,'{}'::jsonb);
    select public.mutate_event('publish','test-ui-mutation',4,'{}'::jsonb);
    select public.mutate_event('end','test-ui-mutation',5,'{}'::jsonb);`);
  assert.equal(update.status, 0, update.stdout + update.stderr);
  const results = update.stdout.trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(results.map((item) => [item.publication_status, item.registration_status, item.version]), [
    ["hidden", "open", 2], ["published", "open", 3], ["hidden", "open", 4], ["published", "open", 5], ["published", "ended", 6],
  ]);

  const stale = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select public.mutate_event('hide','test-ui-mutation',5,'{}'::jsonb);`);
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /변경되었습니다/);
  const invalidDate = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated;
    select public.mutate_event('update','test-ui-mutation',6,jsonb_build_object(
      'title','TEST UI 날짜 오류','match_type','field','event_scale','city','region','서울',
      'venue_name','TEST UI 장소','venue_type','field','start_date','2026-10-03','end_date','2026-10-02',
      'schedule_note',null,'registration_status','ended','target_audience',jsonb_build_array('TEST 회원'),
      'organizer','TEST 운영진','summary','TEST UI 날짜 오류 상세 설명입니다.','benefits','[]'::jsonb,
      'recruitment_status','none','related_course_key',null,'official_url',null,'registration_url',null,
      'registration_note',null,'is_featured',false
    ));`);
  assert.notEqual(invalidDate.status, 0);
  const finalState = sql("select concat_ws(',',publication_status,registration_status,version) from public.events where event_key='test-ui-mutation';", "postgres");
  assert.equal(finalState.stdout.trim(), "published,ended,6");
});

test("read RPC works inside a read-only transaction and unauthorized actor is blocked", () => {
  const readOnly = sql(`set request.jwt.claim.sub='${actor}'; set role authenticated; begin read only;
    select public.get_event_for_management('test-kst-today','2026-09-22T14:59:59Z')->>'event_key'; rollback;`);
  assert.equal(readOnly.status, 0, readOnly.stdout + readOnly.stderr);
  assert.equal(readOnly.stdout.trim(), "test-kst-today");
  const denied = sql(`reset request.jwt.claim.sub; set role anon;
    select public.list_events_for_management(null,null,null,null,'2026-09-22T14:59:59Z',1,0);`);
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /permission denied for function|운영 권한/);
  for (const deniedActor of [member, suspendedAdmin, moderator]) {
    const actorDenied = sql(`set request.jwt.claim.sub='${deniedActor}'; set role authenticated;
      select public.list_events_for_management(null,null,null,null,'2026-09-22T14:59:59Z',1,0);`);
    assert.notEqual(actorDenied.status, 0);
    assert.match(actorDenied.stderr, /운영 권한/);
  }
});
