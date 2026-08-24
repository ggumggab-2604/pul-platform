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
  return sql(
    `set request.jwt.claim.sub = '${actor}'; set role authenticated; ${text}`,
  );
}

function json(result) {
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return JSON.parse(result.stdout.trim());
}

const ids = {
  active: randomUUID(),
  other: randomUUID(),
  inactive: randomUUID(),
  club: randomUUID(),
  inactiveClub: randomUUID(),
  request: randomUUID(),
  secondRequest: randomUUID(),
  inactiveRequest: randomUUID(),
};

let container;
let database;
let inquiryId;

before(() => {
  const found = docker([
    "ps",
    "--filter",
    "name=supabase_db_",
    "--format",
    "{{.Names}}",
  ]).stdout
    .split(/\r?\n/)
    .filter(Boolean);
  assert.equal(found.length, 1, "one local Supabase database container is required");
  container = found[0];
  database = `pul_join_inquiry_${process.pid}_${Date.now()}`;
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

  const authRows = [ids.active, ids.other, ids.inactive]
    .map(
      (id) =>
        `('${id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','join-inquiry-${id}@example.invalid','',now(),now(),now())`,
    )
    .join(",");
  const fixture = sql(
    `
      set session_replication_role = replica;
      insert into auth.users(
        id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at
      ) values ${authRows};
      insert into public.user_accounts(id,platform_role,account_status) values
        ('${ids.active}','member','active'),
        ('${ids.other}','member','active'),
        ('${ids.inactive}','member','suspended');
      insert into public.clubs(id,legacy_key,name,club_status) values
        ('${ids.club}','join-inquiry-${process.pid}','TEST 가입 문의 동호회','active'),
        ('${ids.inactiveClub}','join-inactive-${process.pid}','TEST 비활성 동호회','suspended');
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

test("catalog keeps inquiry tables RPC-only and applicant functions authenticated", () => {
  const tableAcl = sql(
    "select pg_catalog.has_table_privilege('authenticated','public.club_join_inquiries','INSERT,UPDATE,DELETE');",
  );
  assert.equal(tableAcl.status, 0, tableAcl.stdout + tableAcl.stderr);
  assert.equal(tableAcl.stdout.trim(), "f");
  const functionAcl = sql(
    `select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname in (
          'submit_club_join_inquiry','withdraw_club_join_inquiry',
          'list_my_club_join_inquiries','get_my_club_join_inquiry',
          'list_my_club_join_inquiry_history'
        )
        and pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
        and not pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');`,
  );
  assert.equal(functionAcl.status, 0, functionAcl.stdout + functionAcl.stderr);
  assert.equal(functionAcl.stdout.trim(), "5");
});

test("active applicant submits once and identical request replay is mutation-free", () => {
  const statement = `select row_to_json(result)::text from public.submit_club_join_inquiry(
    '${ids.club}','beginner','weekend',array['regularRound','clubEvent'],
    'TEST 가입 절차 문의','${ids.request}'
  ) as result;`;
  const first = json(authenticated(ids.active, statement));
  const replay = json(authenticated(ids.active, statement));
  inquiryId = first.inquiry_id;
  assert.equal(first.inquiry_status, "received");
  assert.equal(first.changed, true);
  assert.equal(first.replayed, false);
  assert.equal(replay.inquiry_id, inquiryId);
  assert.equal(replay.replayed, true);
  const counts = json(
    sql(
      `select json_build_object(
        'inquiries',(select count(*) from public.club_join_inquiries where applicant_id='${ids.active}' and club_id='${ids.club}'),
        'history',(select count(*) from public.club_join_inquiry_status_history where inquiry_id='${inquiryId}'),
        'audit',(select count(*) from public.audit_logs where request_id='${ids.request}'),
        'ledger',(select count(*) from private.club_mutation_requests where actor_id='${ids.active}' and request_id='${ids.request}')
      );`,
      "postgres",
    ),
  );
  assert.deepEqual(counts, { inquiries: 1, history: 1, audit: 1, ledger: 1 });
});

test("request reuse with another payload and a second active inquiry are blocked", () => {
  const reused = authenticated(
    ids.active,
    `select * from public.submit_club_join_inquiry(
      '${ids.club}','beginner','weekday',array['regularRound'],null,'${ids.request}'
    );`,
  );
  assert.notEqual(reused.status, 0);
  assert.match(reused.stderr, /재사용|요청 식별자/);
  const duplicate = authenticated(
    ids.active,
    `select * from public.submit_club_join_inquiry(
      '${ids.club}','beginner','weekday',array['regularRound'],null,'${ids.secondRequest}'
    );`,
  );
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /이미 처리 중/);
});

test("own reads return applicant-safe history while another applicant sees nothing", () => {
  const own = json(
    authenticated(
      ids.active,
      `select row_to_json(result)::text from public.get_my_club_join_inquiry('${inquiryId}') as result;`,
    ),
  );
  assert.equal(own.inquiry_id, inquiryId);
  assert.equal(own.message, "TEST 가입 절차 문의");
  assert.equal("internal_note" in own, false);
  assert.equal("assigned_operator_id" in own, false);
  const other = authenticated(
    ids.other,
    `select count(*) from public.get_my_club_join_inquiry('${inquiryId}');`,
  );
  assert.equal(other.status, 0, other.stdout + other.stderr);
  assert.equal(other.stdout.trim(), "0");
});

test("inactive accounts, inactive clubs, and anon callers cannot submit", () => {
  const inactiveAccount = authenticated(
    ids.inactive,
    `select * from public.submit_club_join_inquiry(
      '${ids.club}','beginner','weekday',array['regularRound'],null,'${ids.inactiveRequest}'
    );`,
  );
  assert.notEqual(inactiveAccount.status, 0);
  assert.match(inactiveAccount.stderr, /활성 계정/);
  const inactiveClub = authenticated(
    ids.other,
    `select * from public.submit_club_join_inquiry(
      '${ids.inactiveClub}','beginner','weekday',array['regularRound'],null,'${randomUUID()}'
    );`,
  );
  assert.notEqual(inactiveClub.status, 0);
  assert.match(inactiveClub.stderr, /활성 동호회|운영 중/);
  const anon = sql(
    `set role anon; select * from public.submit_club_join_inquiry(
      '${ids.club}','beginner','weekday',array['regularRound'],null,'${randomUUID()}'
    );`,
  );
  assert.notEqual(anon.status, 0);
  assert.match(anon.stderr, /permission denied/i);
});

test("authenticated raw inquiry DML remains blocked", () => {
  const direct = authenticated(
    ids.active,
    `insert into public.club_join_inquiries(
      club_id,applicant_id,experience_code,available_day_code,interest_codes
    ) values ('${ids.club}','${ids.active}','beginner','weekday',array['regularRound']);`,
  );
  assert.notEqual(direct.status, 0);
  assert.match(direct.stderr, /permission denied|row-level security/i);
});

test("withdraw and identical replay create one transition, audit, and ledger", () => {
  const withdrawRequest = randomUUID();
  const statement = `select row_to_json(result)::text from public.withdraw_club_join_inquiry(
    '${inquiryId}','${withdrawRequest}'
  ) as result;`;
  const first = json(authenticated(ids.active, statement));
  const replay = json(authenticated(ids.active, statement));
  assert.equal(first.current_status, "withdrawn");
  assert.equal(first.replayed, false);
  assert.equal(replay.current_status, "withdrawn");
  assert.equal(replay.replayed, true);
  const counts = json(
    sql(
      `select json_build_object(
        'status',(select inquiry_status from public.club_join_inquiries where id='${inquiryId}'),
        'history',(select count(*) from public.club_join_inquiry_status_history where inquiry_id='${inquiryId}'),
        'audit',(select count(*) from public.audit_logs where request_id='${withdrawRequest}'),
        'ledger',(select count(*) from private.club_mutation_requests where actor_id='${ids.active}' and request_id='${withdrawRequest}')
      );`,
      "postgres",
    ),
  );
  assert.deepEqual(counts, {
    status: "withdrawn",
    history: 2,
    audit: 1,
    ledger: 1,
  });
});

test("inquiry mutations do not create memberships or membership applications", () => {
  const counts = json(
    sql(
      `select json_build_object(
        'memberships',(select count(*) from public.club_memberships where user_id='${ids.active}' and club_id='${ids.club}'),
        'applications',(select count(*) from public.club_membership_applications where applicant_id='${ids.active}' and club_id='${ids.club}')
      );`,
      "postgres",
    ),
  );
  assert.deepEqual(counts, { memberships: 0, applications: 0 });
});
