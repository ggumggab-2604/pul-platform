-- After the beta lineage + 00110/00111. No historical course or account backfill.
begin;
create table private.course_applications (
  id uuid primary key,
  applicant_id uuid not null references public.user_accounts(id),
  kind text not null check (kind in ('new','claim','edit')),
  target_course_id uuid references public.courses(id),
  draft jsonb not null check (jsonb_typeof(draft) = 'object'),
  relation text not null check (char_length(relation) between 2 and 200),
  verification_contact text not null check (char_length(verification_contact) between 5 and 200),
  public_contact_confirmed boolean not null default false,
  base_updated_at timestamptz,
  status text not null default 'pending' check (status in ('pending','supplement','approved','rejected')),
  version integer not null default 1,
  review_note text check (char_length(review_note) <= 500),
  reviewed_by uuid references public.user_accounts(id),
  permission_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index course_applications_owner_idx on private.course_applications(applicant_id,created_at desc,id);
create index course_applications_review_idx on private.course_applications(status,created_at desc,id);
create index course_applications_target_idx on private.course_applications(target_course_id);
create table private.course_stewards (
  course_id uuid not null references public.courses(id),
  user_id uuid not null references public.user_accounts(id),
  active boolean not null default true,
  granted_by uuid not null references public.user_accounts(id),
  updated_at timestamptz not null default now(),
  primary key(course_id,user_id)
);
create index course_stewards_user_idx on private.course_stewards(user_id,course_id) where active;
alter table private.course_applications enable row level security;
alter table private.course_applications force row level security;
alter table private.course_stewards enable row level security;
alter table private.course_stewards force row level security;
revoke all on private.course_applications,private.course_stewards from public,anon,authenticated,service_role;
comment on table private.course_stewards is 'Course information edit requests only. Does not grant platform admin, broadcast or other course permissions.';

create function private.require_course_applicant() returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid := auth.uid();
begin
  if v_id is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
  perform 1 from public.user_accounts where id=v_id and account_status='active' for share;
  if not found then raise exception '정상 회원만 신청할 수 있습니다.' using errcode='42501'; end if;
  return v_id;
end; $$;
revoke all on function private.require_course_applicant() from public,anon,authenticated,service_role;

-- Validate independently of the form, before private draft storage.
create function private.course_application_draft(p jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d jsonb := p; k text; n numeric; limits jsonb := '{"name":120,"address":300,"city":100,"operating_hours":200,"fee_guide":500,"reservation_guide":1000,"description":2000,"phone":30,"reservation_url":500}';
begin
  if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) x where x not in ('name','course_type','region','city','address','holes','bay_count','operating_hours','operation_code','phone','parking_available','description','reservation_url','reservation_guide','fee_guide')) then
    raise exception '구장 입력 항목을 확인해 주세요.' using errcode='22023';
  end if;
  foreach k in array array['name','address','city','operating_hours','fee_guide','reservation_guide','description','phone','reservation_url'] loop
    if p ? k and jsonb_typeof(p->k) not in ('string','null') then raise exception '문자 입력값을 확인해 주세요.' using errcode='22023'; end if;
    if char_length(coalesce(p->>k,''))>(limits->>k)::integer then raise exception '입력 길이를 확인해 주세요.' using errcode='22023'; end if;
    d:=jsonb_set(d,array[k],coalesce(to_jsonb(nullif(btrim(p->>k),'')),'null'::jsonb));
  end loop;
  d:=jsonb_set(d,'{description}',to_jsonb(coalesce(d->>'description','')));
  if coalesce(char_length(d->>'name'),0)<2 or coalesce(char_length(d->>'address'),0)<5 or coalesce(char_length(d->>'city'),0)<1
    or coalesce(d->>'course_type','') not in ('field','screen') or coalesce(d->>'region','') not in ('서울','경기','인천','충청','강원','전라','경상','제주') then
    raise exception '구장명·주소·지역·유형을 확인해 주세요.' using errcode='22023';
  end if;
  k:=case when d->>'course_type'='field' then 'holes' else 'bay_count' end;
  if jsonb_typeof(d->k) is distinct from 'number' then raise exception '홀 수 또는 실제 타석 수를 입력해 주세요.' using errcode='22023'; end if;
  n:=(d->>k)::numeric;
  if n<1 or n<>trunc(n) or n>(case when k='holes' then 32767 else 2147483647 end) then raise exception '홀 수·타석 수는 양의 정수로 입력해 주세요.' using errcode='22023'; end if;
  d:=jsonb_set(d,array[case when k='holes' then 'bay_count' else 'holes' end],'null');
  if d->>'operation_code' is not null and d->>'operation_code' not in ('reservation','phone','walkIn') then raise exception '이용 방식을 확인해 주세요.' using errcode='22023'; end if;
  if d ? 'parking_available' and jsonb_typeof(d->'parking_available') not in ('boolean','null') then raise exception '주차 정보를 확인해 주세요.' using errcode='22023'; end if;
  if d->>'phone' is not null and char_length(d->>'phone')<7 then raise exception '공개 연락처를 확인해 주세요.' using errcode='22023'; end if;
  if d->>'reservation_guide' is not null and char_length(d->>'reservation_guide')<2 then raise exception '이용 안내는 2자 이상 입력해 주세요.' using errcode='22023'; end if;
  if d->>'reservation_url' is not null and (char_length(d->>'reservation_url')<12 or d->>'reservation_url' !~ '^https://[^/@[:space:]]+([/:?#]|$)') then raise exception '예약 링크는 https 주소를 확인해 주세요.' using errcode='22023'; end if;
  return jsonb_build_object('operation_code',null,'parking_available',null)||d;
end; $$;
revoke all on function private.course_application_draft(jsonb) from public,anon,authenticated,service_role;

create function private.read_course_application_workspace(p_manage boolean,p_offset integer,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; manager boolean; rows jsonb; mine jsonb;
begin
  a:=private.require_course_applicant(); manager:=private.course_actor_has_permission(a,'courses.manage');
  if p_manage and not manager then raise exception '검토 권한이 없습니다.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>10000 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023'; end if;
  if p_id is not null and not exists(select 1 from private.course_applications where id=p_id and (applicant_id=a or (p_manage and manager))) then raise exception '신청을 찾을 수 없습니다.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(t.body order by t.created_at desc,t.id),'[]') into rows from (
    select r.id,r.created_at,jsonb_build_object('id',r.id,'kind',r.kind,'draft',r.draft,'relation',r.relation,'verificationContact',r.verification_contact,'publicContactConfirmed',r.public_contact_confirmed,'status',r.status,'version',r.version,'reviewNote',r.review_note,'courseKey',c.course_key,'baseUpdatedAt',r.base_updated_at,'permissionGranted',r.permission_granted,'createdAt',r.created_at,'currentCourse',case when c.id is not null then private.management_course_json(c) else null end) body
    from private.course_applications r left join public.courses c on c.id=r.target_course_id
    where (r.applicant_id=a or (p_manage and manager)) and (p_id is null or r.id=p_id)
    order by r.created_at desc,r.id limit 21 offset p_offset
  ) t;
  select coalesce(jsonb_agg(private.management_course_json(c) order by c.name),'[]') into mine
    from private.course_stewards s join public.courses c on c.id=s.course_id where s.user_id=a and s.active and c.course_status<>'removed';
  return jsonb_build_object('items',rows,'managed',mine,'canManage',manager);
end; $$;
revoke all on function private.read_course_application_workspace(boolean,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function private.read_course_application_workspace(boolean,integer,uuid) to authenticated;
grant usage on schema private to authenticated;
create function public.read_course_application_workspace(p_manage boolean default false,p_offset integer default 0,p_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.read_course_application_workspace(p_manage,p_offset,p_id); $$;
revoke all on function public.read_course_application_workspace(boolean,integer,uuid) from public,anon,service_role;
grant execute on function public.read_course_application_workspace(boolean,integer,uuid) to authenticated;

create function private.mutate_course_application(p_id uuid,p_action text,p_version integer,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; r private.course_applications%rowtype; c public.courses%rowtype; d jsonb; replay jsonb; result jsonb; kind text; target uuid; base timestamptz; grant_role boolean; verified boolean;
begin
  a:=private.require_course_applicant();
  if p_id is null or p_request_id is null or p_action is null or p_action not in ('submit','resubmit','supplement','approve','reject','revoke') or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023'; end if;
  if p_action in ('supplement','approve','reject','revoke') then perform private.require_course_manager(); end if;
  replay:=private.course_claim_request(a,p_request_id,'course.application_'||p_action,jsonb_build_object('id',p_id,'version',p_version,'input',p_input));
  if replay is not null then return replay; end if;
  if p_action<>'submit' then
    select * into r from private.course_applications where id=p_id for update;
    if not found then raise exception '신청을 찾을 수 없습니다.' using errcode='P0002'; end if;
    if p_action='resubmit' and r.applicant_id<>a then raise exception '본인 신청만 보완할 수 있습니다.' using errcode='42501'; end if;
    if r.version is distinct from p_version then raise exception '신청이 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='40001'; end if;
    if p_action='resubmit' and r.status<>'supplement' or p_action in ('supplement','approve','reject') and r.status<>'pending' or p_action='revoke' and (r.status<>'approved' or not r.permission_granted) then raise exception '이미 처리되었거나 처리할 수 없는 신청입니다.' using errcode='22023'; end if;
  end if;
  if p_action in ('submit','resubmit') then
    kind:=case when p_action='submit' then p_input->>'kind' else r.kind end;
    if kind is null or kind not in ('new','claim','edit') then raise exception '신청 종류를 확인해 주세요.' using errcode='22023'; end if;
    if kind<>'new' then
      select * into c from public.courses where (p_action='submit' and course_key=p_input->>'courseKey' or p_action='resubmit' and id=r.target_course_id) and course_status<>'removed' for update;
      if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if kind='claim' and c.course_status<>'active' then raise exception '공개 구장만 관리 권한을 신청할 수 있습니다.' using errcode='42501'; end if;
      if kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=a and active for share;
        if not found then raise exception '승인된 담당 구장만 수정 신청할 수 있습니다.' using errcode='42501'; end if;
        if (p_input->>'baseUpdatedAt')::timestamptz is distinct from c.updated_at then raise exception '공개 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='40001'; end if;
      end if;
      target:=c.id; base:=c.updated_at;
    end if;
    if coalesce(char_length(btrim(p_input->>'relation')),0) not between 2 and 200 or coalesce(char_length(btrim(p_input->>'verificationContact')),0) not between 5 and 200 then raise exception '담당 관계와 확인 연락 수단을 입력해 주세요.' using errcode='22023'; end if;
    d:=case when kind='claim' then private.public_course_json(c) else private.course_application_draft(p_input->'draft') end;
    if kind='edit' and d->>'course_type'<>c.course_type then raise exception '구장 유형 변경은 PUL 운영자에게 요청해 주세요.' using errcode='22023'; end if;
    if kind<>'claim' and d->>'phone' is not null and (p_input->>'publicContactConfirmed')::boolean is distinct from true then raise exception '공개할 구장 연락처임을 확인해 주세요.' using errcode='22023'; end if;
    if p_action='submit' then
      insert into private.course_applications(id,applicant_id,kind,target_course_id,draft,relation,verification_contact,public_contact_confirmed,base_updated_at)
      values(p_id,a,kind,target,d,btrim(p_input->>'relation'),btrim(p_input->>'verificationContact'),coalesce((p_input->>'publicContactConfirmed')::boolean,false),base) returning * into r;
    else
      update private.course_applications set draft=d,relation=btrim(p_input->>'relation'),verification_contact=btrim(p_input->>'verificationContact'),public_contact_confirmed=coalesce((p_input->>'publicContactConfirmed')::boolean,false),base_updated_at=base,status='pending',version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
    end if;
  elsif p_action in ('supplement','reject') then
    if coalesce(char_length(btrim(p_input->>'note')),0) not between 2 and 500 then raise exception '처리 사유를 2~500자로 입력해 주세요.' using errcode='22023'; end if;
    update private.course_applications set status=case when p_action='supplement' then 'supplement' else 'rejected' end,review_note=btrim(p_input->>'note'),reviewed_by=a,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  elsif p_action='revoke' then
    update private.course_stewards set active=false,updated_at=clock_timestamp() where course_id=r.target_course_id and user_id=r.applicant_id;
    update private.course_applications set permission_granted=false,version=version+1,updated_at=clock_timestamp(),reviewed_by=a where id=r.id returning * into r;
  else
    if (p_input->>'duplicatesChecked')::boolean is distinct from true then raise exception '중복 정보를 확인해 주세요.' using errcode='22023'; end if;
    grant_role:=coalesce((p_input->>'grantPermission')::boolean,false);
    verified:=coalesce((p_input->>'relationVerified')::boolean,false);
    if (r.kind='claim' or grant_role) and not verified then raise exception '담당 관계를 확인해야 권한을 승인할 수 있습니다.' using errcode='22023'; end if;
    if r.kind='claim' and not grant_role then raise exception '관리 권한 신청의 담당 관계를 확인해 주세요.' using errcode='22023'; end if;
    perform 1 from public.user_accounts where id=r.applicant_id and account_status='active' for share;
    if not found then raise exception '비활성 회원의 신청은 승인할 수 없습니다.' using errcode='42501'; end if;
    if r.kind<>'new' then
      select * into c from public.courses where id=r.target_course_id for update;
      if not found or c.course_status='removed' then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if c.updated_at is distinct from r.base_updated_at then raise exception '공개 정보가 변경되었습니다. 보완 요청 후 최신 내용으로 다시 검토해 주세요.' using errcode='40001'; end if;
      if r.kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=r.applicant_id and active for share;
        if not found then raise exception '담당 권한이 철회되었습니다.' using errcode='42501'; end if;
      end if;
    end if;
    if r.kind='new' then
      perform pg_advisory_xact_lock(hashtextextended(lower(r.draft->>'name')||'|'||lower(r.draft->>'address'),0));
      if exists(select 1 from public.courses where lower(name)=lower(r.draft->>'name') and lower(address)=lower(r.draft->>'address') and course_status<>'removed') then raise exception '같은 이름·주소의 구장이 있습니다. 기존 구장 관리 권한을 신청해 주세요.' using errcode='23505'; end if;
      d:=r.draft||jsonb_build_object('feature_codes','[]'::jsonb,'latitude',null,'longitude',null);
      result:=public.mutate_managed_course('create',null,null,gen_random_uuid(),d);
      result:=public.mutate_managed_course('activate',result->>'course_key',(result->>'updated_at')::timestamptz,gen_random_uuid(),'{}');
      select * into c from public.courses where course_key=result->>'course_key';
    elsif r.kind='edit' then
      d:=r.draft||jsonb_build_object('feature_codes',to_jsonb(c.feature_codes),'latitude',c.latitude,'longitude',c.longitude);
      perform public.mutate_managed_course('update',c.course_key,c.updated_at,gen_random_uuid(),d);
    end if;
    if grant_role then
      insert into private.course_stewards(course_id,user_id,granted_by) values(c.id,r.applicant_id,a)
      on conflict(course_id,user_id) do update set active=true,granted_by=a,updated_at=clock_timestamp();
    end if;
    update private.course_applications set target_course_id=c.id,status='approved',review_note=null,reviewed_by=a,permission_granted=grant_role,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  end if;
  result:=jsonb_build_object('id',r.id,'status',r.status,'version',r.version);
  perform private.course_complete_request(a,p_request_id,result);
  return result;
end; $$;
revoke all on function private.mutate_course_application(uuid,text,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.mutate_course_application(uuid,text,integer,uuid,jsonb) to authenticated;
create function public.mutate_course_application(p_id uuid,p_action text,p_version integer,p_request_id uuid,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_course_application(p_id,p_action,p_version,p_request_id,p_input); $$;
revoke all on function public.mutate_course_application(uuid,text,integer,uuid,jsonb) from public,anon,service_role;
grant execute on function public.mutate_course_application(uuid,text,integer,uuid,jsonb) to authenticated;
commit;
