create or replace function public.register_club(
  p_request_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_name text;
  v_region text;
  v_district text;
  v_summary text;
  v_recruitment_status text;
  v_fingerprint text;
  v_public_key text;
  v_club_id uuid;
  v_membership_id uuid;
  v_admin_assignment_id uuid;
  v_audit_id uuid;
  v_created_at timestamptz;
  v_result jsonb;
  v_ledger_action text;
  v_ledger_target_user_id uuid;
  v_ledger_role_code text;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_completed_count integer;
  v_previous_context_request_id text := pg_catalog.current_setting('pul.club_admin_mutation_request_id', true);
  v_previous_context_action_code text := pg_catalog.current_setting('pul.club_admin_mutation_action_code', true);
  v_previous_context_actor_id text := pg_catalog.current_setting('pul.club_admin_mutation_actor_id', true);
  v_previous_context_club_id text := pg_catalog.current_setting('pul.club_admin_mutation_club_id', true);
  v_previous_context_target_user_id text := pg_catalog.current_setting('pul.club_admin_mutation_target_user_id', true);
  v_context_set boolean := false;
begin
  if auth.role() is distinct from 'authenticated' or v_actor_id is null then
    raise exception '로그인한 회원만 동호회를 등록할 수 있습니다.'
      using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception '동호회 등록 request ID가 필요합니다.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '동호회 등록 내용을 확인해 주세요.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as key(value)
    where key.value not in (
      'name', 'region', 'district', 'summary', 'recruitment_status'
    )
  ) then
    raise exception '지원하지 않는 동호회 등록 항목입니다.';
  end if;

  v_name := nullif(pg_catalog.btrim(p_payload ->> 'name'), '');
  v_region := nullif(pg_catalog.btrim(p_payload ->> 'region'), '');
  v_district := nullif(pg_catalog.btrim(p_payload ->> 'district'), '');
  v_summary := nullif(pg_catalog.btrim(p_payload ->> 'summary'), '');
  v_recruitment_status := nullif(
    pg_catalog.btrim(p_payload ->> 'recruitment_status'),
    ''
  );

  if v_name is null
     or pg_catalog.char_length(v_name) < 2
     or pg_catalog.char_length(v_name) > 80 then
    raise exception '동호회명은 2자 이상 80자 이하로 입력해 주세요.';
  end if;
  if v_region is null or v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주', '세종'
  ) then
    raise exception '활동 지역을 확인해 주세요.';
  end if;
  if v_district is null or pg_catalog.char_length(v_district) > 80 then
    raise exception '시·군·구 또는 활동 지역을 80자 이하로 입력해 주세요.';
  end if;
  if v_summary is null
     or pg_catalog.char_length(v_summary) < 10
     or pg_catalog.char_length(v_summary) > 500 then
    raise exception '동호회 소개는 10자 이상 500자 이하로 입력해 주세요.';
  end if;
  if v_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if not found or v_account_status <> 'active' then
    raise exception '활성 계정인 회원만 동호회를 등록할 수 있습니다.'
      using errcode = '42501';
  end if;

  v_fingerprint := pg_catalog.md5(
    pg_catalog.concat_ws(
      E'\x1f',
      'club.register',
      v_name,
      v_region,
      v_district,
      v_summary,
      v_recruitment_status
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id::text || ':' || p_request_id::text, 0)
  );

  select
    ledger.action_code,
    ledger.target_user_id,
    ledger.role_code,
    ledger.input_fingerprint,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action,
    v_ledger_target_user_id,
    v_ledger_role_code,
    v_ledger_fingerprint,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  if found then
    if v_ledger_action is distinct from 'club.register'
       or v_ledger_target_user_id is distinct from v_actor_id
       or v_ledger_role_code is distinct from 'club_admin'
       or v_ledger_fingerprint is distinct from v_fingerprint then
      raise exception '동일한 request ID를 다른 동호회 등록 요청에 재사용할 수 없습니다.';
    end if;
    if v_ledger_completed_at is null or v_ledger_result is null then
      raise exception '동일한 동호회 등록 요청이 처리 중입니다.';
    end if;
    return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  v_public_key := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.clubs (
    legacy_key,
    name,
    club_status,
    membership_recruitment_status,
    region,
    district,
    summary
  ) values (
    v_public_key,
    v_name,
    'active',
    v_recruitment_status,
    v_region,
    v_district,
    v_summary
  )
  returning id, created_at into v_club_id, v_created_at;

  insert into public.club_memberships (
    club_id,
    user_id,
    membership_status
  ) values (
    v_club_id,
    v_actor_id,
    'active'
  )
  returning id into v_membership_id;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  ) values (
    v_membership_id,
    'club_member',
    v_actor_id
  );

  insert into private.club_mutation_requests (
    actor_id,
    request_id,
    action_code,
    club_id,
    target_user_id,
    role_code,
    input_fingerprint
  ) values (
    v_actor_id,
    p_request_id,
    'club.register',
    v_club_id,
    v_actor_id,
    'club_admin',
    v_fingerprint
  );

  perform pg_catalog.set_config('pul.club_admin_mutation_request_id', p_request_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_action_code', 'club.register', true);
  perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', v_actor_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_club_id', v_club_id::text, true);
  perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', v_actor_id::text, true);
  v_context_set := true;

  insert into public.club_role_assignments (
    membership_id,
    role_code,
    assigned_by
  ) values (
    v_membership_id,
    'club_admin',
    v_actor_id
  )
  returning id into v_admin_assignment_id;

  if not exists (
    select 1
    from public.club_memberships as membership
    where membership.id = v_membership_id
      and membership.club_id = v_club_id
      and membership.user_id = v_actor_id
      and membership.membership_status = 'active'
  )
  or (
    select pg_catalog.count(*)
    from public.club_role_assignments as assignment
    join public.club_memberships as membership
      on membership.id = assignment.membership_id
    where membership.club_id = v_club_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
  ) <> 1
  or not exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.id = v_admin_assignment_id
      and assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_admin'
      and assignment.revoked_at is null
  )
  or not exists (
    select 1
    from public.club_role_assignments as assignment
    where assignment.membership_id = v_membership_id
      and assignment.role_code = 'club_member'
      and assignment.revoked_at is null
  ) then
    raise exception '동호회 생성자의 최초 회원·회장 역할 연결을 확인할 수 없습니다.';
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_type,
    actor_role,
    action,
    target_type,
    target_id,
    club_id,
    before_summary,
    after_summary,
    reason,
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_id,
    'user',
    'club_admin',
    'club.register',
    'club',
    v_club_id::text,
    v_club_id::text,
    null,
    pg_catalog.jsonb_build_object(
      'club_status', 'active',
      'membership_status', 'active',
      'roles', pg_catalog.jsonb_build_array('club_member', 'club_admin')
    ),
    '회원 동호회 등록',
    pg_catalog.jsonb_build_object(
      'public_key', v_public_key,
      'region', v_region,
      'district', v_district,
      'recruitment_status', v_recruitment_status
    ),
    p_request_id,
    'success'
  )
  returning id into v_audit_id;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'public_key', v_public_key,
    'name', v_name,
    'region', v_region,
    'district', v_district,
    'region_label', pg_catalog.concat_ws(' ', v_region, v_district),
    'summary', v_summary,
    'recruitment_status', v_recruitment_status,
    'created_at', v_created_at,
    'replayed', false
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.action_code = 'club.register'
    and ledger.club_id = v_club_id
    and ledger.target_user_id = v_actor_id
    and ledger.role_code = 'club_admin'
    and ledger.input_fingerprint = v_fingerprint
    and ledger.outcome is null
    and ledger.result_data is null
    and ledger.completed_at is null;

  get diagnostics v_completed_count = row_count;
  if v_completed_count <> 1 then
    raise exception '동호회 등록 요청 완료 상태를 기록할 수 없습니다.';
  end if;

  perform pg_catalog.set_config('pul.club_admin_mutation_request_id', coalesce(v_previous_context_request_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_action_code', coalesce(v_previous_context_action_code, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', coalesce(v_previous_context_actor_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_club_id', coalesce(v_previous_context_club_id, ''), true);
  perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', coalesce(v_previous_context_target_user_id, ''), true);
  v_context_set := false;

  return v_result;
exception
  when others then
    if v_context_set then
      perform pg_catalog.set_config('pul.club_admin_mutation_request_id', coalesce(v_previous_context_request_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_action_code', coalesce(v_previous_context_action_code, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_actor_id', coalesce(v_previous_context_actor_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_club_id', coalesce(v_previous_context_club_id, ''), true);
      perform pg_catalog.set_config('pul.club_admin_mutation_target_user_id', coalesce(v_previous_context_target_user_id, ''), true);
    end if;
    raise;
end;
$$;

comment on function public.register_club(uuid, jsonb) is
  'Authenticated active-member registration that atomically creates one active club, creator membership, base role, and initial club_admin role with replay protection.';
revoke all on function public.register_club(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.register_club(uuid, jsonb)
  to authenticated;

-- Phase 1: private club settings, atomic extended registration/update and bounded course links.
-- Existing registration, role assignment, request replay and public directory contracts are retained.
alter table public.clubs drop constraint clubs_region_check;
alter table public.clubs add constraint clubs_region_check check(region is null or region in ('서울','경기','인천','충북','충남','강원','전북','전남','경북','경남','부산','대구','광주','대전','울산','제주','세종'));

create table private.club_profiles(
 club_id uuid primary key references public.clubs(id) on delete cascade,
 profile jsonb not null default '{}'::jsonb,
 contacts jsonb not null default '[]'::jsonb,
 version bigint not null default 1 check(version>0),
 registration_request uuid,
 registration_fingerprint text,
 updated_at timestamptz not null default now()
);
alter table private.club_profiles enable row level security;
revoke all on private.club_profiles from public,anon,authenticated,service_role;
create table private.club_profile_requests(
 actor_id uuid not null references public.user_accounts(id),
 request_id uuid not null,
 club_id uuid not null references public.clubs(id),
 fingerprint text not null,
 before_data jsonb not null,
 after_data jsonb not null,
 result_data jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
create index club_profile_requests_club_idx on private.club_profile_requests(club_id,created_at);
alter table private.club_profile_requests enable row level security;
revoke all on private.club_profile_requests from public,anon,authenticated,service_role;

-- Preserve every legacy link. Conflicted legacy groups are marked, never reduced to an arbitrary representative.
alter table public.course_club_links add column course_kind text;
alter table public.course_club_links add column legacy_conflict boolean not null default false;
update public.course_club_links l set course_kind=c.course_type from public.courses c where c.id=l.course_id;
alter table public.course_club_links alter column course_kind set not null;
alter table public.course_club_links add constraint course_club_links_kind_check check(course_kind in('field','screen'));
update public.course_club_links l set legacy_conflict=true
where (l.club_id,l.course_kind) in(select club_id,course_kind from public.course_club_links group by club_id,course_kind having count(*)>1);
create unique index club_course_kind_unique on public.course_club_links(club_id,course_kind) where not legacy_conflict;

create function private.enforce_club_course_kind() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;
begin
 perform pg_advisory_xact_lock(hashtextextended('club-course:'||new.club_id::text,0));
 select course_type into kind from public.courses where id=new.course_id for share;
 if tg_op='INSERT' and not exists(select 1 from public.courses where id=new.course_id and course_status='active') then
  raise exception '운영 중인 공개 구장을 선택해 주세요.';
 end if;
 new.course_kind:=kind;
 if exists(select 1 from public.course_club_links l where l.club_id=new.club_id and l.course_kind=kind and l.course_id<>new.course_id) then
  raise exception '동호회 활동 구장은 야외와 스크린 각각 최대 1곳입니다. 기존 복수 연결은 별도 확인 후 변경해 주세요.' using errcode='23505';
 end if;
 new.legacy_conflict:=false;
 return new;
end $$;
revoke all on function private.enforce_club_course_kind() from public,anon,authenticated,service_role;
create trigger enforce_club_course_kind before insert or update of course_id,club_id,course_kind on public.course_club_links for each row execute function private.enforce_club_course_kind();
create function private.refresh_link_course_kind() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.course_type is distinct from old.course_type then
  update public.course_club_links set course_kind=new.course_type where course_id=new.id;
 end if;
 return new;
end $$;
revoke all on function private.refresh_link_course_kind() from public,anon,authenticated,service_role;
create trigger refresh_link_course_kind after update of course_type on public.courses for each row execute function private.refresh_link_course_kind();

create function private.validate_club_profile(p jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare c jsonb; v jsonb; k text; pr jsonb:=p->'profile';
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) x where x not in('name','region','district','summary','recruitment_status','profile','contacts','field_course_key','screen_course_key','confirm_link_conflict')) then raise exception '지원하지 않는 동호회 입력입니다.'; end if;
 if jsonb_typeof(p->'name') is distinct from 'string' or char_length(btrim(p->>'name')) not between 2 and 80 or jsonb_typeof(p->'summary') is distinct from 'string' or char_length(btrim(p->>'summary')) not between 10 and 500 then raise exception '동호회명과 짧은 소개를 확인해 주세요.'; end if;
 if jsonb_typeof(p->'district') is distinct from 'string' or char_length(p->>'district')>80 or coalesce(p->>'region','') not in('서울','경기','인천','충북','충남','강원','전북','전남','경북','경남','부산','대구','광주','대전','울산','제주','세종') or coalesce(p->>'recruitment_status','') not in('recruiting','waiting','closed') then raise exception '지역과 모집 상태를 확인해 주세요.'; end if;
 if jsonb_typeof(pr) is distinct from 'object' then raise exception '동호회 상세 입력을 확인해 주세요.';end if;
 for k,v in select key,value from jsonb_each(pr) loop
  if k in('purposes','weekdays') then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>7 then raise exception '활동 목적과 요일을 확인해 주세요.';end if;
   if exists(select 1 from jsonb_array_elements_text(v) x where (k='purposes' and x not in('친목','건강','정기 라운딩','대회','초보 연습','강습')) or (k='weekdays' and x not in('월','화','수','목','금','토','일'))) or (select count(*)<>count(distinct x) from jsonb_array_elements_text(v) x) then raise exception '활동 목적과 요일을 확인해 주세요.';end if;
  elsif k in('offlineSize','capacity') then
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v::text)!~'^[1-9][0-9]{0,5}$' or (v::text)::numeric>100000) then raise exception '회원 규모와 정원을 확인해 주세요.';end if;
  elsif k in('description','activityType','meetingRule','meetingTime','beginnerGuide','lesson','lessonFee','ageGroup','conditionKind','conditionDetail','recruitmentWindow','windowDetail','windowStart','windowEnd','joiningFee','monthlyFee','annualFee','eventFee','rules','preparations','participationGuide') then
   if jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>(case when k in('description','rules') then 4000 else 1000 end) then raise exception '상세 입력 길이와 형식을 확인해 주세요.';end if;
  else raise exception '지원하지 않는 상세 입력입니다.';
  end if;
 end loop;
 if coalesce(pr->>'activityType','') not in('field','screen','both') or coalesce(pr->>'lesson','') not in('none','available','inquiry') or coalesce(pr->>'lessonFee','') not in('free','paid','inquiry') or coalesce(pr->>'conditionKind','') not in('none','region','age','gender','other') or coalesce(pr->>'recruitmentWindow','') not in('always','monthly','dates') then raise exception '선택 항목을 확인해 주세요.';end if;
 if pr->>'conditionKind'<>'none' and coalesce(btrim(pr->>'conditionDetail'),'')='' then raise exception '가입 조건 세부 안내를 입력해 주세요.';end if;
 if pr->>'recruitmentWindow'='monthly' and coalesce(btrim(pr->>'windowDetail'),'')='' then raise exception '매월 모집 기간을 입력해 주세요.';end if;
 if pr->>'recruitmentWindow'='dates' then
  if coalesce(pr->>'windowStart','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(pr->>'windowEnd','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (pr->>'windowStart')::date>(pr->>'windowEnd')::date then raise exception '모집 기간을 확인해 주세요.';end if;
 end if;
 if jsonb_typeof(p->'contacts') is distinct from 'array' or jsonb_array_length(p->'contacts')>2 then raise exception '연락 담당자는 최대 2명입니다.';end if;
 for c in select value from jsonb_array_elements(p->'contacts') loop
  if jsonb_typeof(c)<>'object' or exists(select 1 from jsonb_object_keys(c) x where x not in('name','role','phone','visibility','consent')) or jsonb_typeof(c->'name') is distinct from 'string' or char_length(btrim(c->>'name')) not between 1 and 60 or jsonb_typeof(c->'role') is distinct from 'string' or char_length(btrim(c->>'role')) not between 1 and 30 or jsonb_typeof(c->'phone') is distinct from 'string' or ((c->>'phone')<>'' and (c->>'phone')!~'^[0-9+() -]{7,30}$') or coalesce(c->>'visibility','') not in('private','members','public') or jsonb_typeof(c->'consent') is distinct from 'boolean' or (c->>'visibility'<>'private' and c->>'consent'<>'true') then raise exception '연락 담당자 정보와 공개 동의를 확인해 주세요.';end if;
 end loop;
 if jsonb_typeof(p->'confirm_link_conflict') is distinct from 'boolean' then raise exception '기존 연결 확인이 필요합니다.';end if;
 foreach k in array array['field_course_key','screen_course_key'] loop
  if p->k is distinct from 'null'::jsonb and (jsonb_typeof(p->k) is distinct from 'string' or (p->>k)!~'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$') then raise exception '활동 구장을 다시 선택해 주세요.';end if;
 end loop;
 if (pr->>'activityType'='field' and p->>'screen_course_key' is not null) or (pr->>'activityType'='screen' and p->>'field_course_key' is not null) then raise exception '활동 형태에 맞는 구장을 선택해 주세요.';end if;
end $$;
revoke all on function private.validate_club_profile(jsonb) from public,anon,authenticated,service_role;

create function public.get_club_profile(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs; s private.club_profiles; manage boolean; member boolean; visible_contacts jsonb; links jsonb;
begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' and directory_is_public;
 if not found then raise exception '동호회를 찾을 수 없습니다.' using errcode='P0002';end if;
 manage:=private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage');
 member:=private.club_user_has_permission(auth.uid(),c.id,'club.posts.read');
 select * into s from private.club_profiles where club_id=c.id;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into visible_contacts from jsonb_array_elements(coalesce(s.contacts,'[]')) x
 where x->>'consent'='true' and (x->>'visibility'='public' or (x->>'visibility'='members' and member));
 select coalesce(jsonb_agg(jsonb_build_object('course_key',x.course_key,'name',x.name,'course_type',x.course_type,'region',coalesce(private.course_address_region(x.address)->>'province',x.region),'city',x.city,'course_status',x.course_status) order by x.course_type,x.course_key),'[]'::jsonb) into links
 from public.course_club_links l join public.courses x on x.id=l.course_id where l.club_id=c.id and (x.course_status='active' or manage);
 return jsonb_build_object('viewer_authenticated',auth.uid() is not null,'viewer_membership',(select membership_status from public.club_memberships where club_id=c.id and user_id=auth.uid()),'viewer_application_status',(select status from public.club_membership_applications where club_id=c.id and applicant_id=auth.uid() order by submitted_at desc limit 1),'can_manage_inquiries',coalesce(private.club_user_has_permission(auth.uid(),c.id,'club.join_inquiries.read'),false),'public_key',c.legacy_key,'profile',coalesce(s.profile,'{}'),'contacts',visible_contacts,'courses',links,'pul_member_count',(select count(*) from public.club_memberships where club_id=c.id and membership_status='active'),'can_manage',coalesce(manage,false),'version',case when manage then coalesce(s.version,1) else null end,'link_conflict',exists(select 1 from public.course_club_links where club_id=c.id group by course_kind having count(*)>1));
end $$;
revoke all on function public.get_club_profile(text) from public,anon,authenticated,service_role;
grant execute on function public.get_club_profile(text) to anon,authenticated;

create function public.get_club_settings(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs; s private.club_profiles; fk text; sk text; conflict boolean;
begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active';
 if not found or auth.uid() is null or private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage') is not true then raise exception '동호회 정보 설정 권한이 없습니다.' using errcode='42501';end if;
 select * into s from private.club_profiles where club_id=c.id;
 conflict:=exists(select 1 from public.course_club_links where club_id=c.id group by course_kind having count(*)>1);
 select case when count(*)=1 then min(x.course_key) else null end into fk from public.course_club_links l join public.courses x on x.id=l.course_id where l.club_id=c.id and l.course_kind='field';
 select case when count(*)=1 then min(x.course_key) else null end into sk from public.course_club_links l join public.courses x on x.id=l.course_id where l.club_id=c.id and l.course_kind='screen';
 return jsonb_build_object('version',coalesce(s.version,1),'payload',jsonb_build_object('name',c.name,'region',coalesce(c.region,''),'district',coalesce(c.district,''),'summary',coalesce(c.summary,''),'recruitment_status',c.membership_recruitment_status,'profile',coalesce(s.profile,'{}'),'contacts',coalesce(s.contacts,'[]'),'field_course_key',fk,'screen_course_key',sk,'confirm_link_conflict',false),'link_conflict',conflict);
end $$;
revoke all on function public.get_club_settings(text) from public,anon,authenticated,service_role;
grant execute on function public.get_club_settings(text) to authenticated;

create function private.replace_club_profile_courses(cid uuid,p jsonb) returns text language plpgsql security invoker set search_path='' as $$
declare fk text:=p->>'field_course_key';sk text:=p->>'screen_course_key'; f public.courses; s public.courses; region text;
begin
 perform pg_advisory_xact_lock(hashtextextended('club-course:'||cid::text,0));
 -- Stable course lock order prevents two full replacements from choosing opposite order.
 perform 1 from public.courses where course_key in(fk,sk) order by id for share;
 if fk is not null then select * into f from public.courses where course_key=fk and course_type='field' and course_status='active';if not found then raise exception '야외 구장의 유형과 운영 상태를 확인해 주세요.';end if;end if;
 if sk is not null then select * into s from public.courses where course_key=sk and course_type='screen' and course_status='active';if not found then raise exception '스크린 구장의 유형과 운영 상태를 확인해 주세요.';end if;end if;
 if fk is not null then region:=private.course_address_region(f.address)->>'province';elsif sk is not null then region:=private.course_address_region(s.address)->>'province';else region:=p->>'region';end if;
 if region is null then raise exception '선택 구장의 시·도를 확인할 수 없습니다. 구장 주소 확인이 필요합니다.';end if;
 if exists(select 1 from public.course_club_links where club_id=cid group by course_kind having count(*)>1) and (p->>'confirm_link_conflict') is distinct from 'true' then raise exception '기존 복수 구장을 보존했습니다. 전체 연결을 확인하고 교체를 명시적으로 선택해 주세요.';end if;
 delete from public.course_club_links where club_id=cid and course_id not in(select id from public.courses where course_key in(fk,sk));
 if fk is not null then insert into public.course_club_links(course_id,club_id,created_by) values(f.id,cid,auth.uid()) on conflict do nothing;end if;
 if sk is not null then insert into public.course_club_links(course_id,club_id,created_by) values(s.id,cid,auth.uid()) on conflict do nothing;end if;
 return region;
end $$;
revoke all on function private.replace_club_profile_courses(uuid,jsonb) from public,anon,authenticated,service_role;

create function public.register_club_profile(p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare r jsonb; c public.clubs; region text; fingerprint text:=md5(p_payload::text); s private.club_profiles;
begin
 perform private.validate_club_profile(p_payload);
 if auth.uid() is null or not exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active') then raise exception '활성 계정으로 로그인해 주세요.' using errcode='42501';end if;
 select cp.* into s from private.club_profiles cp join private.club_mutation_requests lr on lr.club_id=cp.club_id and lr.request_id=cp.registration_request where lr.actor_id=auth.uid() and lr.request_id=p_request_id and lr.action_code='club.register';
 if found then if s.registration_fingerprint is distinct from fingerprint then raise exception '동일한 요청 번호를 다른 등록에 재사용할 수 없습니다.';end if;select * into c from public.clubs where id=s.club_id;return jsonb_build_object('public_key',c.legacy_key,'version',s.version,'replayed',true);end if;
 -- Read canonical course location before creating the club. All subsequent writes are in this RPC transaction.
 if p_payload->>'field_course_key' is not null then
  select private.course_address_region(address)->>'province' into region from public.courses where course_key=p_payload->>'field_course_key' and course_type='field' and course_status='active' for share;
 elsif p_payload->>'screen_course_key' is not null then
  select private.course_address_region(address)->>'province' into region from public.courses where course_key=p_payload->>'screen_course_key' and course_type='screen' and course_status='active' for share;
 else region:=p_payload->>'region';end if;
 if region is null then raise exception '활동 구장의 지역·유형·운영 상태를 확인해 주세요.';end if;
 r:=public.register_club(p_request_id,jsonb_build_object('name',p_payload->>'name','region',region,'district',coalesce(nullif(btrim(p_payload->>'district'),''),region),'summary',p_payload->>'summary','recruitment_status',p_payload->>'recruitment_status'));
 select * into c from public.clubs where legacy_key=r->>'public_key';
 select * into s from private.club_profiles where club_id=c.id for update;
 if (r->>'replayed')::boolean then
  if s.registration_request is distinct from p_request_id or s.registration_fingerprint is distinct from fingerprint then raise exception '동일한 등록 요청을 다른 상세 정보에 재사용할 수 없습니다.';end if;
  return jsonb_build_object('public_key',c.legacy_key,'version',s.version,'replayed',true);
 end if;
 insert into private.club_profiles(club_id,profile,contacts,registration_request,registration_fingerprint) values(c.id,p_payload->'profile',p_payload->'contacts',p_request_id,fingerprint);
 perform private.replace_club_profile_courses(c.id,p_payload);
 return jsonb_build_object('public_key',c.legacy_key,'version',1,'replayed',false);
end $$;
revoke all on function public.register_club_profile(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_club_profile(uuid,jsonb) to authenticated;

create function public.update_club_profile(p_club_key text,p_expected_version bigint,p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.clubs; s private.club_profiles; ledger private.club_profile_requests; result jsonb; fp text:=md5(jsonb_build_object('club',p_club_key,'version',p_expected_version,'payload',p_payload)::text);
begin
 perform private.validate_club_profile(p_payload);
 if auth.uid() is null or p_request_id is null then raise exception '로그인과 요청 번호를 확인해 주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':profile:'||p_request_id::text,0));
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' for share;
 if not found or private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage') is not true then raise exception '현재 동호회 정보 설정 권한이 없습니다.' using errcode='42501';end if;
 perform 1 from public.club_memberships where club_id=c.id and user_id=auth.uid() and membership_status='active' for share;
 perform 1 from public.club_role_assignments where membership_id in(select id from public.club_memberships where club_id=c.id and user_id=auth.uid()) and revoked_at is null for share;
 if private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage') is not true then raise exception '현재 정보 설정 권한이 없습니다.' using errcode='42501';end if;
 select * into ledger from private.club_profile_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if ledger.fingerprint<>fp then raise exception '동일한 요청 번호를 다른 수정에 재사용할 수 없습니다.';end if;return ledger.result_data||'{"replayed":true}'::jsonb;end if;
 insert into private.club_profiles(club_id) values(c.id) on conflict do nothing;
 select * into s from private.club_profiles where club_id=c.id for update;
 if s.version<>p_expected_version then raise exception '다른 관리자가 먼저 수정했습니다. 최신 정보를 다시 확인해 주세요.' using errcode='P0001';end if;
 if c.region is not null and p_payload->>'region' is distinct from c.region then raise exception '기존 동호회의 소속 지역 이전은 별도 확인이 필요합니다.';end if;
 perform private.replace_club_profile_courses(c.id,p_payload);
 update public.clubs set region=coalesce(region,p_payload->>'region'),name=btrim(p_payload->>'name'),summary=btrim(p_payload->>'summary'),district=coalesce(nullif(btrim(p_payload->>'district'),''),region),membership_recruitment_status=p_payload->>'recruitment_status' where id=c.id;
 update private.club_profiles set profile=p_payload->'profile',contacts=p_payload->'contacts',version=version+1,updated_at=now() where club_id=c.id;
 result:=jsonb_build_object('public_key',c.legacy_key,'version',s.version+1,'replayed',false);
 insert into private.club_profile_requests(actor_id,request_id,club_id,fingerprint,before_data,after_data,result_data) values(auth.uid(),p_request_id,c.id,fp,jsonb_build_object('profile',s.profile,'contacts',s.contacts,'name',c.name,'summary',c.summary),p_payload,result);
 return result;
end $$;
revoke all on function public.update_club_profile(text,bigint,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.update_club_profile(text,bigint,uuid,jsonb) to authenticated;

