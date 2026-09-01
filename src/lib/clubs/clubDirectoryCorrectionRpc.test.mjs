import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260925000100_pul_club_directory_correction_requests.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const hardeningMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260926000100_pul_club_directory_correction_request_hardening.sql",
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
  return sql(
    `set request.jwt.claim.sub = '${actor}'; set request.jwt.claim.role = 'authenticated'; set role authenticated; ${text}`,
  );
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  reporter: randomUUID(),
  inactive: randomUUID(),
  clubAdmin: randomUUID(),
  platformAdmin: randomUUID(),
  deletableResolver: randomUUID(),
  outsider: randomUUID(),
  club: randomUUID(),
  otherClub: randomUUID(),
  adminMembership: randomUUID(),
  submitRequest: randomUUID(),
  secondSubmitRequest: randomUUID(),
  resolveRequest: randomUUID(),
  collisionRequest: randomUUID(),
  resolverSubmitRequest: randomUUID(),
  resolverResolveRequest: randomUUID(),
};

let container;
let database;
let firstRequestKey;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=supabase_db_",
    "--format",
    "{{.Names}}",
  ]).stdout
    .split(/\r?\n/)
    .filter((name) => name === "supabase_db_pul-platform");
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_club_correction_${process.pid}_${Date.now()}`;
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

  const exists = sql(
    "select to_regclass('public.club_directory_correction_requests') is not null;",
  );
  assert.equal(exists.status, 0, exists.stdout + exists.stderr);
  if (exists.stdout.trim() !== "t") {
    const applied = sql(`begin; ${migration}\ncommit;`, "postgres");
    assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  }
  const hardened = sql(`begin; ${hardeningMigration}\ncommit;`, "postgres");
  assert.equal(hardened.status, 0, hardened.stdout + hardened.stderr);

  const users = [
    ids.reporter,
    ids.inactive,
    ids.clubAdmin,
    ids.platformAdmin,
    ids.deletableResolver,
    ids.outsider,
  ]
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','club-correction-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",");
  const fixture = sql(
    `
      set session_replication_role = replica;
      insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
      ) values ${users};
      insert into public.user_accounts(id,platform_role,account_status) values
        ('${ids.reporter}','member','active'),
        ('${ids.inactive}','member','suspended'),
        ('${ids.clubAdmin}','member','active'),
        ('${ids.platformAdmin}','platform_admin','active'),
        ('${ids.deletableResolver}','platform_admin','active'),
        ('${ids.outsider}','member','active');
      insert into public.clubs(id,legacy_key,name,club_status) values
        ('${ids.club}','correction-club','TEST 정보 제보 동호회','active'),
        ('${ids.otherClub}','correction-other','TEST 다른 동호회','active');
      insert into public.club_memberships(id,club_id,user_id,membership_status)
      values ('${ids.adminMembership}','${ids.club}','${ids.clubAdmin}','active');
      insert into public.club_role_assignments(membership_id,role_code,assigned_by)
      values ('${ids.adminMembership}','club_admin','${ids.clubAdmin}');
      set session_replication_role = origin;
    `,
    "postgres",
  );
  assert.equal(fixture.status, 0, fixture.stdout + fixture.stderr);
});

after(() => {
  if (!container || !database) return;
  const dropped = docker([
    "exec",
    container,
    "dropdb",
    "--if-exists",
    "--force",
    "-U",
    "supabase_admin",
    database,
  ]);
  assert.equal(dropped.status, 0, dropped.stdout + dropped.stderr);
});

test("catalog keeps the table RPC-only and management functions authenticated", () => {
  assert.equal(
    sql(
      "select pg_catalog.has_table_privilege('authenticated','public.club_directory_correction_requests','INSERT,UPDATE,DELETE');",
    ).stdout.trim(),
    "f",
  );
  const functions = sql(`select count(*) from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'submit_club_directory_correction_request',
        'list_club_directory_correction_requests_for_management',
        'get_club_directory_correction_request_for_management',
        'resolve_club_directory_correction_request'
      )
      and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');`);
  assert.equal(functions.status, 0, functions.stdout + functions.stderr);
  assert.equal(functions.stdout.trim(), "4");
});

test("active account submits once and identical request replay is mutation-free", () => {
  const payload = JSON.stringify({
    target: "region",
    displayed_value: "서울",
    proposed_value: "서울 송파구",
    reason: "공개 정보 확인",
    note: "TEST 제보",
  });
  const statement = `select public.submit_club_directory_correction_request(
    '${ids.submitRequest}','correction-club',$payload$${payload}$payload$::jsonb
  );`;
  const first = json(authenticated(ids.reporter, statement));
  const replay = json(authenticated(ids.reporter, statement));
  firstRequestKey = first.request_key;
  assert.equal(first.request_status, "pending");
  assert.equal(first.version, 1);
  assert.equal(first.replayed, false);
  assert.equal(replay.request_key, firstRequestKey);
  assert.equal(replay.replayed, true);
  assert.deepEqual(
    json(
      sql(
        `select jsonb_build_object(
          'requests',(select count(*) from public.club_directory_correction_requests where requester_user_id='${ids.reporter}'),
          'audits',(select count(*) from public.audit_logs where request_id='${ids.submitRequest}'),
          'ledgers',(select count(*) from private.club_mutation_requests where actor_id='${ids.reporter}' and request_id='${ids.submitRequest}')
        );`,
        "postgres",
      ),
    ),
    { requests: 1, audits: 1, ledgers: 1 },
  );
});

test("submit rejects non-string JSON field values before any mutation", () => {
  const invalidPayloads = [
    { payload: { target: 7, proposed_value: "정상 값", reason: "정상 근거" }, error: /수정 대상.*문자열/ },
    { payload: { target: "club_name", displayed_value: true, proposed_value: "정상 값", reason: "정상 근거" }, error: /현재 표시된 내용.*문자열/ },
    { payload: { target: "club_name", proposed_value: ["잘못된 값"], reason: "정상 근거" }, error: /변경이 필요한 내용.*문자열/ },
    { payload: { target: "club_name", proposed_value: "정상 값", reason: { source: "잘못된 값" } }, error: /변경 사유.*문자열/ },
    { payload: { target: "club_name", proposed_value: "정상 값", reason: "정상 근거", note: 9 }, error: /참고사항.*문자열/ },
  ];
  for (const entry of invalidPayloads) {
    const result = authenticated(
      ids.reporter,
      `select public.submit_club_directory_correction_request(
        '${randomUUID()}','correction-club',$payload$${JSON.stringify(entry.payload)}$payload$::jsonb
      );`,
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, entry.error);
  }
  assert.equal(
    sql(
      `select count(*) from public.club_directory_correction_requests
       where requester_user_id='${ids.reporter}' and correction_target='club_name';`,
      "postgres",
    ).stdout.trim(),
    "0",
  );
});

test("canonical JSON fingerprint separates the legacy delimiter collision and keeps exact replay", () => {
  const separator = "\u001f";
  const firstPayload = {
    target: "home_course",
    displayed_value: `왼쪽${separator}오른쪽`,
    proposed_value: "다음 값",
    reason: "공개 확인 근거",
    note: "TEST",
  };
  const secondPayload = {
    target: "home_course",
    displayed_value: "왼쪽",
    proposed_value: `오른쪽${separator}다음 값`,
    reason: "공개 확인 근거",
    note: "TEST",
  };
  const legacyJoin = (payload) => [
    "club.directory_correction.submit",
    "correction-club",
    payload.target,
    payload.displayed_value,
    payload.proposed_value,
    payload.reason,
    payload.note,
  ].join(separator);
  assert.equal(legacyJoin(firstPayload), legacyJoin(secondPayload));

  const invoke = (payload) => authenticated(
    ids.reporter,
    `select public.submit_club_directory_correction_request(
      '${ids.collisionRequest}','correction-club',$payload$${JSON.stringify(payload)}$payload$::jsonb
    );`,
  );
  const first = json(invoke(firstPayload));
  const replay = json(invoke(firstPayload));
  const conflict = invoke(secondPayload);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /재사용/);
  const cleaned = sql(
    `delete from public.audit_logs where request_id='${ids.collisionRequest}';
     delete from private.club_mutation_requests
     where actor_id='${ids.reporter}' and request_id='${ids.collisionRequest}';
     delete from public.club_directory_correction_requests
     where request_key='${first.request_key}';`,
    "postgres",
  );
  assert.equal(cleaned.status, 0, cleaned.stdout + cleaned.stderr);
});

test("duplicate pending target, request reuse, inactive, and anon submit are blocked", () => {
  const duplicate = authenticated(
    ids.reporter,
    `select public.submit_club_directory_correction_request(
      '${randomUUID()}','correction-club','{"target":"region","proposed_value":"경기","reason":"TEST"}'::jsonb
    );`,
  );
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /처리 대기/);
  const reused = authenticated(
    ids.reporter,
    `select public.submit_club_directory_correction_request(
      '${ids.submitRequest}','correction-club','{"target":"schedule","proposed_value":"매주 토요일","reason":"TEST"}'::jsonb
    );`,
  );
  assert.notEqual(reused.status, 0);
  assert.match(reused.stderr, /재사용/);
  const inactive = authenticated(
    ids.inactive,
    `select public.submit_club_directory_correction_request(
      '${randomUUID()}','correction-club','{"target":"schedule","proposed_value":"매주 토요일","reason":"TEST"}'::jsonb
    );`,
  );
  assert.notEqual(inactive.status, 0);
  assert.match(inactive.stderr, /정상 활동 계정/);
  const invalidClub = authenticated(
    ids.reporter,
    `select public.submit_club_directory_correction_request(
      '${randomUUID()}','missing-club','{"target":"schedule","proposed_value":"매주 토요일","reason":"TEST"}'::jsonb
    );`,
  );
  assert.notEqual(invalidClub.status, 0);
  assert.match(invalidClub.stderr, /찾을 수 없/);
  const anon = sql(
    `set role anon; select public.submit_club_directory_correction_request(
      '${randomUUID()}','correction-club','{"target":"schedule","proposed_value":"매주 토요일","reason":"TEST"}'::jsonb
    );`,
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
});

test("club admin sees only the exact club and platform admin sees the global Inbox", () => {
  const clubPage = json(
    authenticated(
      ids.clubAdmin,
      "select public.list_club_directory_correction_requests_for_management('correction-club',null,30,0);",
    ),
  );
  assert.equal(clubPage.total, 1);
  assert.equal(clubPage.items[0].request_key, firstRequestKey);
  assert.equal("requester_user_id" in clubPage.items[0], false);
  const detail = json(
    authenticated(
      ids.clubAdmin,
      `select public.get_club_directory_correction_request_for_management('${firstRequestKey}');`,
    ),
  );
  assert.equal(detail.requester_label, "로그인 회원");
  assert.equal("resolved_by" in detail, false);
  const global = json(
    authenticated(
      ids.platformAdmin,
      "select public.list_club_directory_correction_requests_for_management(null,null,30,0);",
    ),
  );
  assert.equal(global.total, 1);
  const otherClub = authenticated(
    ids.clubAdmin,
    "select public.list_club_directory_correction_requests_for_management('correction-other',null,30,0);",
  );
  assert.notEqual(otherClub.status, 0);
  assert.match(otherClub.stderr, /권한/);
  const outsider = authenticated(
    ids.outsider,
    "select public.list_club_directory_correction_requests_for_management(null,null,30,0);",
  );
  assert.notEqual(outsider.status, 0);
  assert.match(outsider.stderr, /권한/);
});

test("resolution and replay change only request status with one audit and ledger", () => {
  const beforeName = sql(
    `select name from public.clubs where id='${ids.club}';`,
  ).stdout.trim();
  const statement = `select public.resolve_club_directory_correction_request(
    '${firstRequestKey}',1,'completed','TEST 내용 확인 완료','${ids.resolveRequest}'
  );`;
  const first = json(authenticated(ids.clubAdmin, statement));
  const replay = json(authenticated(ids.clubAdmin, statement));
  assert.equal(first.request_status, "completed");
  assert.equal(first.version, 2);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(
    sql(`select name from public.clubs where id='${ids.club}';`).stdout.trim(),
    beforeName,
  );
  assert.deepEqual(
    json(
      sql(
        `select jsonb_build_object(
          'request_version',(select version from public.club_directory_correction_requests where request_key='${firstRequestKey}'),
          'audits',(select count(*) from public.audit_logs where request_id='${ids.resolveRequest}'),
          'ledgers',(select count(*) from private.club_mutation_requests where actor_id='${ids.clubAdmin}' and request_id='${ids.resolveRequest}'),
          'memberships',(select count(*) from public.club_memberships where club_id='${ids.club}'),
          'roles',(select count(*) from public.club_role_assignments where membership_id='${ids.adminMembership}' and revoked_at is null),
          'media',(select count(*) from public.club_media where club_id='${ids.club}')
        );`,
        "postgres",
      ),
    ),
    {
      request_version: 2,
      audits: 1,
      ledgers: 1,
      memberships: 1,
      roles: 1,
      media: 0,
    },
  );
});

test("closed resolution works while stale version and raw DML remain blocked", () => {
  const second = json(
    authenticated(
      ids.reporter,
      `select public.submit_club_directory_correction_request(
        '${ids.secondSubmitRequest}','correction-club','{"target":"schedule","proposed_value":"매주 토요일","reason":"TEST 확인"}'::jsonb
      );`,
    ),
  );
  const stale = authenticated(
    ids.clubAdmin,
    `select public.resolve_club_directory_correction_request(
      '${second.request_key}',2,'closed','TEST 종료','${randomUUID()}'
    );`,
  );
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /상태가 변경/);
  const closed = json(
    authenticated(
      ids.platformAdmin,
      `select public.resolve_club_directory_correction_request(
        '${second.request_key}',1,'closed','TEST 종료','${randomUUID()}'
      );`,
    ),
  );
  assert.equal(closed.request_status, "closed");
  const direct = authenticated(
    ids.reporter,
    `update public.club_directory_correction_requests set request_status='closed' where request_key='${second.request_key}';`,
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("terminal history survives resolver account deletion while pending invariants stay strict", () => {
  const submitted = json(
    authenticated(
      ids.reporter,
      `select public.submit_club_directory_correction_request(
        '${ids.resolverSubmitRequest}','correction-club',
        '{"target":"introduction","proposed_value":"새 소개 내용","reason":"TEST 확인"}'::jsonb
      );`,
    ),
  );
  const resolved = json(
    authenticated(
      ids.deletableResolver,
      `select public.resolve_club_directory_correction_request(
        '${submitted.request_key}',1,'completed','TEST 확인 완료','${ids.resolverResolveRequest}'
      );`,
    ),
  );
  assert.equal(resolved.request_status, "completed");
  assert.equal(
    sql(
      `select resolved_by='${ids.deletableResolver}'
       from public.club_directory_correction_requests
       where request_key='${submitted.request_key}';`,
      "postgres",
    ).stdout.trim(),
    "t",
  );

  const removed = sql(
    `delete from public.user_accounts where id='${ids.deletableResolver}';`,
    "postgres",
  );
  assert.equal(removed.status, 0, removed.stdout + removed.stderr);
  assert.deepEqual(
    json(
      sql(
        `select jsonb_build_object(
          'status',request_status,
          'version',version,
          'resolver_removed',resolved_by is null,
          'resolved_at_kept',resolved_at is not null,
          'resolution_note_kept',resolution_note is not null
        ) from public.club_directory_correction_requests
        where request_key='${submitted.request_key}';`,
        "postgres",
      ),
    ),
    {
      status: "completed",
      version: 2,
      resolver_removed: true,
      resolved_at_kept: true,
      resolution_note_kept: true,
    },
  );

  const pendingRequest = json(
    authenticated(
      ids.reporter,
      `select public.submit_club_directory_correction_request(
        '${randomUUID()}','correction-club',
        '{"target":"contact","proposed_value":"새 문의 정보","reason":"TEST 확인"}'::jsonb
      );`,
    ),
  );
  const pending = sql(
    `update public.club_directory_correction_requests
     set resolved_by='${ids.reporter}'
     where request_key='${pendingRequest.request_key}' and request_status='pending';`,
    "postgres",
  );
  assert.notEqual(pending.status, 0);
  assert.match(pending.stderr, /club_directory_correction_requests_resolution_check/);
});
