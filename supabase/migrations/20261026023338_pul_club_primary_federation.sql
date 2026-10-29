create or replace function private.club_stored_permission(
  p_user_id uuid,
  p_club_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_club_id is not null
    and p_permission_code is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.club_memberships as membership
        on membership.user_id = account.id
       and membership.club_id = p_club_id
       and membership.membership_status = 'active'
      join public.clubs as club
        on club.id = membership.club_id
       and club.club_status = 'active'
      join public.club_role_assignments as assignment
        on assignment.membership_id = membership.id
       and assignment.revoked_at is null
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
       and role_definition.is_active
      join public.club_role_permissions as role_permission
        on role_permission.role_code = role_definition.role_code
      join public.club_permission_definitions as permission_definition
        on permission_definition.permission_code = role_permission.permission_code
       and permission_definition.is_active
      where account.id = p_user_id
        and account.account_status = 'active'
        and role_permission.permission_code = p_permission_code
        and permission_definition.permission_code = p_permission_code
    );
$$;
revoke all on function private.club_stored_permission(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Explicit primary selection; automatic federation rights do not create club memberships or roles.
create table private.club_federations (
 region text primary key check(region in ('서울','경기','인천','충북','충남','강원','전북','전남','경북','경남','부산','대구','광주','대전','울산','제주','세종')),
 club_id uuid not null unique references public.clubs(id) on delete restrict
);
create table private.club_primary_memberships (
 user_id uuid primary key references public.user_accounts(id) on delete cascade,
 membership_id uuid references public.club_memberships(id) on delete set null,
 region text references private.club_federations(region),
 automatic_enabled boolean not null default false,
 version integer not null default 0 check(version>=0),
 check(not automatic_enabled or membership_id is not null and region is not null)
);
create table private.club_primary_requests (
 actor_id uuid not null references public.user_accounts(id) on delete cascade,
 request_id uuid not null,
 fingerprint jsonb not null,
 before_data jsonb not null,
 result_data jsonb not null,
 created_at timestamptz not null default now(),
 primary key(actor_id,request_id)
);
alter table private.club_federations enable row level security;
alter table private.club_primary_memberships enable row level security;
alter table private.club_primary_requests enable row level security;
revoke all on private.club_federations,private.club_primary_memberships,private.club_primary_requests from public,anon,authenticated,service_role;

do $$
declare r record; c uuid;
begin
 for r in select * from (values ('서울','seoul'),('경기','gyeonggi'),('인천','incheon'),('충북','chungbuk'),('충남','chungnam'),('강원','gangwon'),('전북','jeonbuk'),('전남','jeonnam'),('경북','gyeongbuk'),('경남','gyeongnam'),('부산','busan'),('대구','daegu'),('광주','gwangju'),('대전','daejeon'),('울산','ulsan'),('제주','jeju'),('세종','sejong')) as v(region,code)
 loop
  insert into public.clubs(legacy_key,name,region,district,summary,club_status,directory_is_public,membership_recruitment_status)
   values('federation-'||r.code,r.region||' 지역 연합',r.region,'시도 지역 연합',r.region||' 소속 동호회 회원들이 함께하는 지역 연합입니다.','active',true,'closed') returning id into c;
  insert into private.club_federations values(r.region,c);
 end loop;
end $$;

create function private.club_primary_eligible(u uuid,m uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
  select 1 from public.club_memberships x join public.clubs c on c.id=x.club_id
  join private.club_profiles p on p.club_id=c.id
  where x.id=m and x.user_id=u and x.membership_status='active' and c.club_status='active'
   and p.profile->>'activityType' in ('field','both')
   and not exists(select 1 from private.club_federations f where f.club_id=c.id)
   and exists(select 1 from private.club_federations f where f.region=c.region)
   and private.club_user_has_permission(u,c.id,'club.posts.read')
 ),false)
$$;

create function private.club_federation_automatic(u uuid,c uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
  select 1 from private.club_primary_memberships p
  join public.club_memberships m on m.id=p.membership_id and m.user_id=p.user_id
  join public.clubs source on source.id=m.club_id
  join private.club_federations f on f.region=p.region and f.club_id=c
  join public.clubs target on target.id=f.club_id and target.club_status='active'
  join public.user_accounts a on a.id=p.user_id and a.account_status='active'
  where p.user_id=u and p.automatic_enabled and source.region=p.region
   and private.club_primary_eligible(u,m.id)
   and not exists(select 1 from public.club_memberships blocked where blocked.club_id=c and blocked.user_id=u and blocked.membership_status='suspended')
 ),false)
$$;

-- Every existing membership mutation, including direct guarded RPCs, reaches this trigger.
create function private.club_primary_relation_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update private.club_primary_memberships set membership_id=null,region=null,automatic_enabled=false,version=version+1 where membership_id=old.id;
  return old;
 end if;
 if new.membership_status='left' and old.membership_status is distinct from 'left' then
  update private.club_primary_memberships set membership_id=null,region=null,automatic_enabled=false,version=version+1 where membership_id=new.id;
 elsif new.membership_status='suspended' and old.membership_status is distinct from 'suspended' then
  update private.club_primary_memberships set automatic_enabled=false,version=version+1 where membership_id=new.id;
  update private.club_primary_memberships set automatic_enabled=false,version=version+1 where user_id=new.user_id and automatic_enabled and region=(select region from private.club_federations where club_id=new.club_id);
 end if;
 return new;
end $$;
create trigger club_primary_relation_changed after update of membership_status on public.club_memberships
 for each row execute function private.club_primary_relation_changed();
create trigger club_primary_relation_deleted before delete on public.club_memberships
 for each row execute function private.club_primary_relation_changed();

create function private.club_primary_account_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.account_status is distinct from 'active' and new.account_status is distinct from old.account_status then
  update private.club_primary_memberships set automatic_enabled=false,version=version+1 where user_id=new.id;
 end if;
 return new;
end $$;
create trigger club_primary_account_changed after update of account_status on public.user_accounts
 for each row execute function private.club_primary_account_changed();

create function private.club_primary_club_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.region is distinct from old.region and exists(select 1 from private.club_primary_memberships p join public.club_memberships m on m.id=p.membership_id where m.club_id=new.id) then
  raise exception '주 소속 동호회의 지역 이전은 처리 정책 확인이 필요합니다.' using errcode='22023';
 end if;
 if new.club_status is distinct from 'active' and new.club_status is distinct from old.club_status then
  update private.club_primary_memberships p set automatic_enabled=false,version=version+1 from public.club_memberships m where m.id=p.membership_id and m.club_id=new.id;
 end if;
 return new;
end $$;
create trigger club_primary_club_changed before update of region,club_status on public.clubs
 for each row execute function private.club_primary_club_changed();

create function private.club_primary_profile_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(new.profile->>'activityType','') not in ('field','both') then
  update private.club_primary_memberships p set automatic_enabled=false,version=version+1 from public.club_memberships m where m.id=p.membership_id and m.club_id=new.club_id and p.automatic_enabled;
 end if;
 return new;
end $$;
create trigger club_primary_profile_changed after update of profile on private.club_profiles for each row execute function private.club_primary_profile_changed();

create function public.list_club_federations() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('region',f.region,'club_key',c.legacy_key,'name',c.name) order by f.region),'[]'::jsonb)
 from private.club_federations f join public.clubs c on c.id=f.club_id where c.club_status='active' and c.directory_is_public
$$;
create function public.get_club_federation_region(p_club_key text) returns text language sql stable security definer set search_path='' as $$
 select f.region from private.club_federations f join public.clubs c on c.id=f.club_id where c.legacy_key=p_club_key
$$;

create function public.get_my_club_affiliations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); p private.club_primary_memberships; memberships jsonb; federations jsonb;
begin
 if u is null or not exists(select 1 from public.user_accounts where id=u and account_status='active') then raise exception '로그인 후 이용해 주세요.' using errcode='42501';end if;
 select * into p from private.club_primary_memberships where user_id=u;
 select coalesce(jsonb_agg(jsonb_build_object('club_key',c.legacy_key,'name',c.name,'region',c.region,'status',m.membership_status,
  'eligible',private.club_primary_eligible(u,m.id),'is_primary',coalesce(p.membership_id=m.id,false)) order by c.name),'[]'::jsonb) into memberships
 from public.club_memberships m join public.clubs c on c.id=m.club_id
 where m.user_id=u and m.membership_status in('active','suspended') and c.legacy_key is not null and not exists(select 1 from private.club_federations f where f.club_id=c.id);
 select coalesce(jsonb_agg(jsonb_build_object('region',f.region,'club_key',c.legacy_key,'name',c.name,
  'automatic',private.club_federation_automatic(u,c.id),'independent',private.club_stored_permission(u,c.id,'club.posts.read'))
  order by f.region),'[]'::jsonb) into federations
 from private.club_federations f join public.clubs c on c.id=f.club_id where c.club_status='active' and
  (private.club_federation_automatic(u,c.id) or exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=u and m.membership_status in('active','suspended')));
 return jsonb_build_object('viewer_id',u,'version',coalesce(p.version,0),'primary_club_key',(select c.legacy_key from public.club_memberships m join public.clubs c on c.id=m.club_id where m.id=p.membership_id),
  'automatic_enabled',coalesce(p.automatic_enabled,false),'memberships',memberships,'federations',federations);
end $$;

create function public.select_club_primary(p_club_key text,p_expected_version integer,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();m public.club_memberships;c public.clubs;p private.club_primary_memberships;req private.club_primary_requests;before_choice jsonb;
 fp jsonb:=jsonb_build_object('key',p_club_key,'version',p_expected_version);r jsonb;
begin
 if u is null or p_request_id is null or p_expected_version is null or p_expected_version<0 or p_club_key is null then raise exception '로그인과 선택 요청을 확인해 주세요.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||':club-primary:'||p_request_id::text,0));
 perform 1 from public.user_accounts where id=u and account_status='active' for share;
 if not found then raise exception '활동 중인 계정만 선택할 수 있습니다.' using errcode='42501';end if;
 select * into req from private.club_primary_requests where actor_id=u and request_id=p_request_id;
 if found then
  if req.fingerprint is distinct from fp then raise exception '같은 요청 번호의 선택 내용이 다릅니다.' using errcode='22023';end if;
  return req.result_data||jsonb_build_object('replayed',true);
 end if;
 -- Same order as existing membership mutations: club, account, membership, primary choice.
 select * into c from public.clubs where legacy_key=p_club_key for update;
 if not found then raise exception '동호회를 확인해 주세요.' using errcode='42501';end if;
 select * into m from public.club_memberships where club_id=c.id and user_id=u for update;
 if not found or private.club_primary_eligible(u,m.id) is not true then raise exception '승인된 활동 회원인 야외 동호회만 주 소속으로 선택할 수 있습니다.' using errcode='42501';end if;
 insert into private.club_primary_memberships(user_id) values(u) on conflict do nothing;
 select * into p from private.club_primary_memberships where user_id=u for update;
 if p.version<>p_expected_version then raise exception '소속이 변경되었습니다. 다시 조회한 뒤 선택해 주세요.' using errcode='40001';end if;
 before_choice:=to_jsonb(p);
 update private.club_primary_memberships set membership_id=m.id,region=c.region,automatic_enabled=true,version=version+1 where user_id=u returning * into p;
 r:=jsonb_build_object('club_key',c.legacy_key,'region',c.region,'version',p.version,'replayed',false);
 insert into private.club_primary_requests(actor_id,request_id,fingerprint,before_data,result_data) values(u,p_request_id,fp,before_choice,r);
 return r;
end $$;

create function public.get_club_federation(p_region text,p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.clubs;items jsonb;total integer;
begin
 if p_limit is null or p_limit not between 1 and 20 or p_offset is null or p_offset<0 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 select x.* into c from private.club_federations f join public.clubs x on x.id=f.club_id where f.region=p_region and x.club_status='active' and (x.directory_is_public or private.club_user_has_permission(auth.uid(),x.id,'club.posts.read'));
 if not found then raise exception '지역 연합을 찾을 수 없습니다.' using errcode='P0002';end if;
 select count(*) into total from public.club_posts p where p.club_id=c.id and private.club_post_readable(p) and p.moderation_status='visible' and p.post_status in('published','edited');
 select coalesce(jsonb_agg(private.club_post_safe_json(x) order by x.created_at desc,x.id),'[]'::jsonb) into items from(select p.* from public.club_posts p where p.club_id=c.id and private.club_post_readable(p) and p.moderation_status='visible' and p.post_status in('published','edited') order by p.created_at desc,p.id limit p_limit offset p_offset)x;
 return jsonb_build_object('region',c.region,'club_id',c.id,'club_key',c.legacy_key,'name',c.name,'viewer_id',auth.uid(),
  'automatic',private.club_federation_automatic(auth.uid(),c.id),'independent',private.club_stored_permission(auth.uid(),c.id,'club.posts.read'),'can_write',coalesce(private.club_user_has_permission(auth.uid(),c.id,'club.posts.create'),false),
  'items',items,'total',total,'limit',p_limit,'offset',p_offset);
end $$;

-- Until the separate application/approver policy is decided, old forms cannot start it accidentally.
create function private.club_federation_application_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.club_federations where club_id=new.club_id) then raise exception '지역 연합 별도 가입은 승인 담당자와 절차 확인 후 제공됩니다.' using errcode='42501';end if;
 return new;
end $$;
create trigger club_federation_application_guard before insert on public.club_membership_applications for each row execute function private.club_federation_application_guard();
create trigger club_federation_inquiry_guard before insert on public.club_join_inquiries for each row execute function private.club_federation_application_guard();

revoke all on function private.club_primary_eligible(uuid,uuid),private.club_federation_automatic(uuid,uuid),private.club_primary_relation_changed(),private.club_primary_account_changed(),private.club_primary_club_changed(),private.club_primary_profile_changed(),private.club_federation_application_guard() from public,anon,authenticated,service_role;
revoke all on function public.list_club_federations(),public.get_club_federation_region(text),public.get_my_club_affiliations(),public.select_club_primary(text,integer,uuid),public.get_club_federation(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_club_federations(),public.get_club_federation_region(text),public.get_club_federation(text,integer,integer) to anon,authenticated;
grant execute on function public.get_my_club_affiliations(),public.select_club_primary(text,integer,uuid) to authenticated;


create or replace function private.club_user_has_permission(
  p_user_id uuid,
  p_club_id uuid,
  p_permission_code text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (p_user_id is not null
    and p_club_id is not null
    and p_permission_code is not null
    and exists (
      select 1
      from public.user_accounts as account
      join public.club_memberships as membership
        on membership.user_id = account.id
       and membership.club_id = p_club_id
       and membership.membership_status = 'active'
      join public.clubs as club
        on club.id = membership.club_id
       and club.club_status = 'active'
      join public.club_role_assignments as assignment
        on assignment.membership_id = membership.id
       and assignment.revoked_at is null
      join public.club_role_definitions as role_definition
        on role_definition.role_code = assignment.role_code
       and role_definition.is_active
      join public.club_role_permissions as role_permission
        on role_permission.role_code = role_definition.role_code
      join public.club_permission_definitions as permission_definition
        on permission_definition.permission_code = role_permission.permission_code
       and permission_definition.is_active
      where account.id = p_user_id
        and account.account_status = 'active'
        and role_permission.permission_code = p_permission_code
        and permission_definition.permission_code = p_permission_code
    )) or case when exists(select 1 from private.club_federations f where f.club_id=p_club_id) then
    p_permission_code in ('club.posts.read','club.posts.create') and private.club_federation_automatic(p_user_id,p_club_id)
    and exists(select 1 from public.club_role_permissions rp join public.club_permission_definitions pd on pd.permission_code=rp.permission_code and pd.is_active join public.club_role_definitions rd on rd.role_code=rp.role_code and rd.is_active where rp.role_code='club_member' and rp.permission_code=p_permission_code)
    else false end;
$$;

create or replace function public.mutate_club_core_content(
  p_content_type text,
  p_operation text,
  p_request_id uuid,
  p_club_id uuid,
  p_content_id uuid default null,
  p_expected_version integer default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_account_status text;
  v_club_status text;
  v_actor_role_code text;
  v_content_id uuid;
  v_version integer;
  v_owner_id uuid;
  v_title text;
  v_summary text;
  v_visibility text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_location text;
  v_capacity integer;
  v_participant_target text;
  v_linked_course text;
  v_optional_text text;
  v_action_code text;
  v_input_fingerprint text;
  v_ledger_action_code text;
  v_ledger_club_id uuid;
  v_ledger_fingerprint text;
  v_ledger_result jsonb;
  v_ledger_completed_at timestamptz;
  v_ledger_found boolean := false;
  v_completed_ledger_count integer;
  v_result jsonb;
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_content_type not in ('notice', 'post', 'event') then
    raise exception '올바르지 않은 콘텐츠 종류입니다.';
  end if;
  if p_operation not in ('create', 'update', 'delete', 'cancel') then
    raise exception '올바르지 않은 작업입니다.';
  end if;
  if p_request_id is null then
    raise exception '요청 식별자가 필요합니다.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '입력 형식이 올바르지 않습니다.';
  end if;
  if p_operation = 'create' and (p_content_id is not null or p_expected_version is not null) then
    raise exception '새 콘텐츠 식별자가 올바르지 않습니다.';
  end if;
  if p_operation <> 'create' and (
    p_content_id is null or p_expected_version is null or p_expected_version < 1
  ) then
    raise exception '콘텐츠 식별자와 version이 필요합니다.';
  end if;
  if p_operation = 'cancel' and p_content_type <> 'event' then
    raise exception '일정만 취소할 수 있습니다.';
  end if;
  if p_operation = 'delete' and p_content_type = 'event' then
    raise exception '공식 일정은 삭제 대신 취소합니다.';
  end if;
  if (p_content_type in ('notice', 'post') and p_operation = 'cancel')
     or (p_content_type = 'event' and p_operation = 'delete') then
    raise exception '콘텐츠 종류와 작업이 일치하지 않습니다.';
  end if;

  v_action_code := 'club_content.' || p_content_type || '.' || p_operation;
  v_input_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'action_code', v_action_code,
      'club_id', p_club_id,
      'content_id', p_content_id,
      'expected_version', p_expected_version,
      'payload', p_payload
    )::text
  );

  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;
  if not found or v_account_status <> 'active' then
    raise exception '정상 활동 계정만 이용할 수 있습니다.';
  end if;

  select
    ledger.action_code,
    ledger.club_id,
    ledger.input_fingerprint,
    ledger.result_data,
    ledger.completed_at
  into
    v_ledger_action_code,
    v_ledger_club_id,
    v_ledger_fingerprint,
    v_ledger_result,
    v_ledger_completed_at
  from private.club_mutation_requests as ledger
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
  for update;

  v_ledger_found := found;

  if v_ledger_found then
    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;

    if v_ledger_completed_at is not null then
      return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
    end if;
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;
  if not found or v_club_status <> 'active' then
    raise exception '활동 중인 동호회를 찾을 수 없습니다.';
  end if;

  select assignment.role_code
  into v_actor_role_code
  from public.club_memberships as membership
  join public.club_role_assignments as assignment
    on assignment.membership_id = membership.id
   and assignment.revoked_at is null
  join public.club_role_definitions as definition
    on definition.role_code = assignment.role_code
   and definition.is_active
  where membership.club_id = p_club_id
    and membership.user_id = v_actor_id
    and membership.membership_status = 'active'
  order by case assignment.role_code
    when 'club_admin' then 1
    when 'club_vice_admin' then 2
    when 'club_manager' then 3
    when 'club_member' then 4
    else 5
  end
  limit 1;

  if v_actor_role_code is null and private.club_federation_automatic(v_actor_id,p_club_id) then
    v_actor_role_code := 'club_member';
  end if;

  if v_actor_role_code is null then
    raise exception '활동 중인 동호회 회원만 이용할 수 있습니다.';
  end if;

  if not v_ledger_found then
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
      v_action_code,
      p_club_id,
      null,
      null,
      v_input_fingerprint
    )
    on conflict on constraint club_mutation_requests_actor_request_unique
    do nothing;

    select
      ledger.action_code,
      ledger.club_id,
      ledger.input_fingerprint,
      ledger.result_data,
      ledger.completed_at
    into
      v_ledger_action_code,
      v_ledger_club_id,
      v_ledger_fingerprint,
      v_ledger_result,
      v_ledger_completed_at
    from private.club_mutation_requests as ledger
    where ledger.actor_id = v_actor_id
      and ledger.request_id = p_request_id
    for update;

    if not found then
      raise exception '요청 처리 기록을 확보할 수 없습니다.';
    end if;
    if v_ledger_action_code is distinct from v_action_code
       or v_ledger_club_id is distinct from p_club_id
       or v_ledger_fingerprint is distinct from v_input_fingerprint then
      raise exception '같은 요청 식별자를 다른 입력에 재사용할 수 없습니다.';
    end if;
    if v_ledger_completed_at is not null then
      return v_ledger_result || pg_catalog.jsonb_build_object('replayed', true);
    end if;
  end if;

  if p_content_type = 'notice' then
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.create') then
        raise exception '공지사항 작성 권한이 없습니다.';
      end if;
    elsif not private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.manage') then
      raise exception '공지사항 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array['title', 'content_summary', 'notice_type', 'importance', 'visibility'] <> '{}'::jsonb then
        raise exception '공지사항 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'content_summary'
        and p_payload ? 'notice_type'
        and p_payload ? 'importance'
        and p_payload ? 'visibility'
      ) then
        raise exception '공지사항 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_summary := btrim(p_payload->>'content_summary');
      v_visibility := p_payload->>'visibility';
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_summary is null
         or char_length(v_summary) not between 1 and 2000
         or p_payload->>'notice_type' not in ('general', 'schedule', 'rule', 'urgent', 'event', 'closure')
         or p_payload->>'importance' not in ('normal', 'important', 'urgent')
         or v_visibility not in ('public', 'club_members') then
        raise exception '공지사항 입력값을 확인해 주세요.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '공지사항 삭제 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_notices (
        club_id, author_user_id, author_role_code, notice_type, importance,
        title, content_summary, visibility, notice_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'notice_type',
        p_payload->>'importance', v_title, v_summary, v_visibility, 'published'
      )
      returning id, version into v_content_id, v_version;
    else
      select notice.version
      into v_version
      from public.club_notices as notice
      where notice.id = p_content_id
        and notice.club_id = p_club_id
        and notice.notice_status = 'published'
      for update;
      if not found then
        raise exception '관리할 공지사항을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '공지사항이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;

      if p_operation = 'update' then
        update public.club_notices
        set title = v_title,
            content_summary = v_summary,
            notice_type = p_payload->>'notice_type',
            importance = p_payload->>'importance',
            visibility = v_visibility,
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_notices
        set notice_status = 'archived', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;

  elsif p_content_type = 'post' then
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create') then
        raise exception '게시글 작성 권한이 없습니다.';
      end if;
    elsif not (
      private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create')
      or private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate')
    ) then
      raise exception '게시글 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array[
        'title', 'content_summary', 'post_type', 'starts_at', 'ends_at',
        'linked_course_legacy_key', 'location', 'capacity', 'participant_target',
        'recruitment_status', 'visibility'
      ] <> '{}'::jsonb then
        raise exception '게시글 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'content_summary'
        and p_payload ? 'post_type'
        and p_payload ? 'visibility'
      ) then
        raise exception '게시글 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_summary := btrim(p_payload->>'content_summary');
      v_visibility := p_payload->>'visibility';
      v_starts_at := nullif(btrim(p_payload->>'starts_at'), '')::timestamptz;
      v_ends_at := nullif(btrim(p_payload->>'ends_at'), '')::timestamptz;
      v_linked_course := nullif(btrim(p_payload->>'linked_course_legacy_key'), '');
      v_location := nullif(btrim(p_payload->>'location'), '');
      v_participant_target := nullif(btrim(p_payload->>'participant_target'), '');
      if p_payload->'capacity' is not null and p_payload->'capacity' <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(p_payload->'capacity') <> 'number' then
          raise exception '모집 인원은 숫자여야 합니다.';
        end if;
        if p_payload->>'capacity' !~ '^[0-9]+$' then
          raise exception '모집 인원은 정수여야 합니다.';
        end if;
        if p_payload->>'capacity' !~ '^[0-9]+$' then
          raise exception '정원은 정수여야 합니다.';
        end if;
        v_capacity := (p_payload->>'capacity')::integer;
      end if;
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_summary is null
         or char_length(v_summary) not between 1 and 5000
         or p_payload->>'post_type' not in (
           'general', 'flash_meeting', 'companion', 'question',
           'round_review', 'event_review', 'information'
         )
         or v_visibility not in ('public', 'club_members')
         or (v_ends_at is not null and (v_starts_at is null or v_ends_at <= v_starts_at))
         or (v_linked_course is not null and char_length(v_linked_course) > 100)
         or (v_location is not null and char_length(v_location) > 200)
         or (v_capacity is not null and v_capacity not between 2 and 1000)
         or (v_participant_target is not null and char_length(v_participant_target) > 200)
         or (
           p_payload->>'recruitment_status' is not null
           and p_payload->>'recruitment_status' not in ('recruiting', 'full', 'closed', 'completed', 'cancelled')
         ) then
        raise exception '게시글 입력값을 확인해 주세요.';
      end if;
      if p_payload->>'post_type' in ('flash_meeting', 'companion') and (
        v_starts_at is null
        or v_location is null
        or v_capacity is null
        or p_payload->>'recruitment_status' is null
      ) then
        raise exception '번개·같이 가요의 일정, 장소, 모집 인원과 상태가 필요합니다.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '게시글 삭제 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_posts (
        club_id, author_user_id, author_role_code, post_type, title,
        content_summary, starts_at, ends_at, linked_course_legacy_key,
        location, capacity, participant_target, recruitment_status,
        visibility, moderation_status, post_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'post_type',
        v_title, v_summary, v_starts_at, v_ends_at, v_linked_course,
        v_location, v_capacity, v_participant_target,
        nullif(p_payload->>'recruitment_status', ''), v_visibility,
        'visible', 'published'
      )
      returning id, version into v_content_id, v_version;
    else
      select post.author_user_id, post.version
      into v_owner_id, v_version
      from public.club_posts as post
      where post.id = p_content_id
        and post.club_id = p_club_id
        and post.post_status in ('published', 'edited')
        and post.moderation_status = 'visible'
      for update;
      if not found then
        raise exception '관리할 게시글을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '게시글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;
      if p_operation = 'update' and v_owner_id <> v_actor_id then
        raise exception '작성자만 게시글을 수정할 수 있습니다.';
      end if;
      if p_operation = 'delete'
         and v_owner_id <> v_actor_id
         and not private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate') then
        raise exception '게시글 삭제 권한이 없습니다.';
      end if;

      if p_operation = 'update' then
        update public.club_posts
        set post_type = p_payload->>'post_type',
            title = v_title,
            content_summary = v_summary,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            linked_course_legacy_key = v_linked_course,
            location = v_location,
            capacity = v_capacity,
            participant_target = v_participant_target,
            recruitment_status = nullif(p_payload->>'recruitment_status', ''),
            visibility = v_visibility,
            post_status = 'edited',
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_posts
        set post_status = 'deleted', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;

  else
    if p_operation = 'create' then
      if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.create') then
        raise exception '공식 일정 작성 권한이 없습니다.';
      end if;
    elsif not private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.manage') then
      raise exception '공식 일정 관리 권한이 없습니다.';
    end if;

    if p_operation in ('create', 'update') then
      if p_payload - array[
        'title', 'event_type', 'event_status', 'starts_at', 'ends_at',
        'linked_course_legacy_key', 'location', 'participant_target',
        'capacity', 'reservation_method', 'member_reservation_guidance',
        'organizer_guidance', 'visibility'
      ] <> '{}'::jsonb then
        raise exception '공식 일정 입력 항목이 올바르지 않습니다.';
      end if;
      if not (
        p_payload ? 'title'
        and p_payload ? 'event_type'
        and p_payload ? 'event_status'
        and p_payload ? 'starts_at'
        and p_payload ? 'location'
        and p_payload ? 'participant_target'
        and p_payload ? 'reservation_method'
        and p_payload ? 'visibility'
      ) then
        raise exception '공식 일정 필수 입력이 누락되었습니다.';
      end if;
      v_title := btrim(p_payload->>'title');
      v_starts_at := nullif(btrim(p_payload->>'starts_at'), '')::timestamptz;
      v_ends_at := nullif(btrim(p_payload->>'ends_at'), '')::timestamptz;
      v_linked_course := nullif(btrim(p_payload->>'linked_course_legacy_key'), '');
      v_location := btrim(p_payload->>'location');
      v_participant_target := btrim(p_payload->>'participant_target');
      v_visibility := p_payload->>'visibility';
      if p_payload->'capacity' is not null and p_payload->'capacity' <> 'null'::jsonb then
        if pg_catalog.jsonb_typeof(p_payload->'capacity') <> 'number' then
          raise exception '정원은 숫자여야 합니다.';
        end if;
        v_capacity := (p_payload->>'capacity')::integer;
      end if;
      if v_title is null
         or char_length(v_title) not between 2 and 120
         or v_starts_at is null
         or (v_ends_at is not null and v_ends_at <= v_starts_at)
         or p_payload->>'event_type' not in (
           'monthly_meeting', 'club_tournament', 'screen_tournament',
           'friendly_match', 'outing', 'year_end_party', 'new_year_event',
           'general_meeting', 'training', 'other'
         )
         or p_payload->>'event_status' not in (
           'scheduled', 'registration_open', 'registration_closed', 'completed'
         )
         or v_location is null
         or char_length(v_location) not between 1 and 200
         or v_participant_target is null
         or char_length(v_participant_target) not between 1 and 200
         or (v_linked_course is not null and char_length(v_linked_course) > 100)
         or (v_capacity is not null and v_capacity not between 2 and 1000)
         or p_payload->>'reservation_method' not in (
           'individual_synchronized', 'club_group_booking', 'walk_in',
           'no_reservation', 'checking'
         )
         or v_visibility not in ('public', 'club_members') then
        raise exception '공식 일정 입력값을 확인해 주세요.';
      end if;
      v_optional_text := nullif(btrim(p_payload->>'member_reservation_guidance'), '');
      if v_optional_text is not null and char_length(v_optional_text) > 1000 then
        raise exception '회원 예약 안내는 1000자 이하여야 합니다.';
      end if;
      if nullif(btrim(p_payload->>'organizer_guidance'), '') is not null
         and char_length(nullif(btrim(p_payload->>'organizer_guidance'), '')) > 1000 then
        raise exception '운영진 안내는 1000자 이하여야 합니다.';
      end if;
    elsif p_payload <> '{}'::jsonb then
      raise exception '일정 종료 입력이 올바르지 않습니다.';
    end if;

    if p_operation = 'create' then
      insert into public.club_official_events (
        club_id, creator_user_id, creator_role_code, event_type,
        event_status, title, starts_at, ends_at, linked_course_legacy_key,
        location, participant_target, capacity, reservation_method,
        member_reservation_guidance, organizer_guidance, visibility,
        moderation_status
      ) values (
        p_club_id, v_actor_id, v_actor_role_code, p_payload->>'event_type',
        p_payload->>'event_status', v_title, v_starts_at, v_ends_at,
        v_linked_course, v_location, v_participant_target, v_capacity,
        p_payload->>'reservation_method', v_optional_text,
        nullif(btrim(p_payload->>'organizer_guidance'), ''), v_visibility,
        'visible'
      )
      returning id, version into v_content_id, v_version;
    else
      select event.version
      into v_version
      from public.club_official_events as event
      where event.id = p_content_id
        and event.club_id = p_club_id
        and event.event_status <> 'cancelled'
        and event.moderation_status = 'visible'
      for update;
      if not found then
        raise exception '관리할 공식 일정을 찾을 수 없습니다.';
      end if;
      if v_version <> p_expected_version then
        raise exception '공식 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
      end if;

      if p_operation = 'update' then
        update public.club_official_events
        set event_type = p_payload->>'event_type',
            event_status = p_payload->>'event_status',
            title = v_title,
            starts_at = v_starts_at,
            ends_at = v_ends_at,
            linked_course_legacy_key = v_linked_course,
            location = v_location,
            participant_target = v_participant_target,
            capacity = v_capacity,
            reservation_method = p_payload->>'reservation_method',
            member_reservation_guidance = v_optional_text,
            organizer_guidance = nullif(btrim(p_payload->>'organizer_guidance'), ''),
            visibility = v_visibility,
            version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      else
        update public.club_official_events
        set event_status = 'cancelled', version = version + 1
        where id = p_content_id
        returning id, version into v_content_id, v_version;
      end if;
    end if;
  end if;

  if v_content_id is null or v_version is null then
    raise exception '콘텐츠 변경 결과를 확인할 수 없습니다.';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'content_type', p_content_type,
    'operation', p_operation,
    'id', v_content_id,
    'version', v_version,
    'replayed', false
  );

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
    metadata,
    request_id,
    outcome
  ) values (
    v_actor_id,
    case when v_actor_role_code = 'club_member' then 'user' else 'operator' end,
    v_actor_role_code,
    v_action_code,
    'club_' || p_content_type,
    v_content_id::text,
    p_club_id::text,
    case
      when p_operation = 'create' then null
      else pg_catalog.jsonb_build_object('version', p_expected_version)
    end,
    pg_catalog.jsonb_build_object('version', v_version, 'operation', p_operation),
    pg_catalog.jsonb_build_object('content_type', p_content_type),
    p_request_id,
    'success'
  );

  update private.club_mutation_requests as ledger
  set outcome = 'success',
      result_data = v_result,
      completed_at = pg_catalog.now()
  where ledger.actor_id = v_actor_id
    and ledger.request_id = p_request_id
    and ledger.completed_at is null;

  get diagnostics v_completed_ledger_count = row_count;
  if v_completed_ledger_count <> 1 then
    raise exception '요청 처리 기록 완료 상태를 저장할 수 없습니다.';
  end if;

  return v_result;
end;
$$;

create or replace function public.list_public_clubs(
  p_keyword text default null,
  p_region text default null,
  p_district text default null,
  p_recruitment_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_district text := nullif(pg_catalog.btrim(p_district), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하여야 합니다.';
  end if;
  if v_region is not null and v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_district is not null and pg_catalog.char_length(v_district) > 80 then
    raise exception '활동 지역은 80자 이하여야 합니다.';
  end if;
  if p_recruitment_status is not null
     and p_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.clubs as club
  where club.club_status = 'active'
    and not exists(select 1 from private.club_federations f where f.club_id=club.id)
    and club.legacy_key is not null
    and (v_region is null or club.region = v_region)
    and (v_district is null or club.district ilike '%' || v_district || '%')
    and (
      p_recruitment_status is null
      or club.membership_recruitment_status = p_recruitment_status
    )
    and (
      v_keyword is null
      or club.name ilike '%' || v_keyword || '%'
      or club.region ilike '%' || v_keyword || '%'
      or club.district ilike '%' || v_keyword || '%'
      or club.summary ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select club.id, club.created_at,
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at
      ) as item
    from public.clubs as club
    where club.club_status = 'active'
    and not exists(select 1 from private.club_federations f where f.club_id=club.id)
      and club.legacy_key is not null
      and (v_region is null or club.region = v_region)
      and (v_district is null or club.district ilike '%' || v_district || '%')
      and (
        p_recruitment_status is null
        or club.membership_recruitment_status = p_recruitment_status
      )
      and (
        v_keyword is null
        or club.name ilike '%' || v_keyword || '%'
        or club.region ilike '%' || v_keyword || '%'
        or club.district ilike '%' || v_keyword || '%'
        or club.summary ilike '%' || v_keyword || '%'
      )
    order by club.created_at desc, club.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;
