
-- University applications and school information. Existing official_url remains the department link.
alter table public.lesson_university_departments
  add column school_url text check (private.university_url_valid(school_url)),
  add column campus text check (char_length(campus) between 1 and 120),
  add column program_kind text check (program_kind in ('degree','continuing'));

create function private.university_identity(p_text text)
returns text language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(p_text,''),'[[:space:][:punct:]]+','','g'))
$$;

create index university_identity_lookup on public.lesson_university_departments
  (private.university_identity(university_name), private.university_identity(department_name));

create function private.university_duplicate(p_school text,p_name text,p_campus text,p_region text,p_kind text,p_except uuid default null)
returns public.lesson_university_departments language sql stable set search_path = '' as $$
  select d from public.lesson_university_departments d
  where private.university_identity(d.university_name)=private.university_identity(p_school)
    and private.university_identity(d.department_name)=private.university_identity(p_name)
    and d.id is distinct from p_except
    and (d.program_kind is null or p_kind is null or d.program_kind=p_kind)
    and (case when d.campus is null or p_campus is null then d.region=p_region
          else private.university_identity(d.campus)=private.university_identity(p_campus) end)
  order by (d.publication_status='published') desc,d.id limit 1
$$;

create function private.university_identity_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and row(old.university_name,old.department_name,old.campus,old.region,old.program_kind)
    is not distinct from row(new.university_name,new.department_name,new.campus,new.region,new.program_kind) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    private.university_identity(new.university_name)||'|'||private.university_identity(new.department_name), 733));
  if (private.university_duplicate(new.university_name,new.department_name,new.campus,new.region,new.program_kind,new.id)).id is not null then
    raise exception using errcode='PT409', message='같은 대학·캠퍼스의 학과 또는 과정이 이미 있습니다.';
  end if;
  return new;
end
$$;
create trigger university_identity_guard before insert or update of university_name,department_name,campus,region,program_kind
on public.lesson_university_departments for each row execute function private.university_identity_guard();

create or replace function private.university_detail_json(d public.lesson_university_departments)
returns jsonb language sql stable set search_path = '' as $$
  select private.public_lesson_university_department_json(d) || jsonb_build_object(
    'school_url',d.school_url,'campus',d.campus,'program_kind',d.program_kind,
    'guide_url',d.guide_url,'recruitment_title',d.recruitment_title,'recruitment_body',d.recruitment_body,
    'recruitment_start',d.recruitment_start,'recruitment_end',d.recruitment_end,'photo_path',d.photo_path,'version',d.version)
$$;

create table public.lesson_university_applications (
  id uuid primary key,
  applicant_id uuid not null references public.user_accounts(id),
  kind text not null check (kind in ('opening','manager')),
  department_id uuid references public.lesson_university_departments(id),
  status text not null default 'pending' check (status in ('pending','revision','approved','rejected')),
  details jsonb not null,
  photo_path text,
  note text,
  version integer not null default 1,
  submission_key uuid not null,
  reviewed_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind='opening' or department_id is not null)
);
create index university_application_applicant on public.lesson_university_applications(applicant_id,created_at desc);
create index university_application_queue on public.lesson_university_applications(status,updated_at desc);
create unique index university_application_manager_open on public.lesson_university_applications(applicant_id,department_id)
  where kind='manager' and status in ('pending','revision');
alter table public.lesson_university_applications enable row level security;
revoke all on public.lesson_university_applications from public,anon,authenticated,service_role;

create function public.find_existing_university_department(p_school text,p_name text,p_campus text,p_region text,p_kind text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('key',d.department_key,'name',d.department_name,'school',d.university_name)
  from private.university_duplicate(p_school,p_name,p_campus,p_region,p_kind) d
  where private.university_active(auth.uid()) and d.publication_status='published'
$$;

create function public.get_university_applications(p_operator boolean,p_id uuid default null,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_operator then perform private.require_lesson_directory_manager();
  elsif not private.university_active(auth.uid()) then raise exception using errcode='42501',message='활동 중인 회원만 이용할 수 있습니다.';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.id),'[]')
    from (select a.id,a.kind,a.status,a.details,a.photo_path,a.note,a.version,a.updated_at,
            d.department_key,d.university_name,d.department_name,d.publication_status
          from public.lesson_university_applications a left join public.lesson_university_departments d on d.id=a.department_id
          where (p_operator or a.applicant_id=auth.uid()) and (p_id is null or a.id=p_id)
          order by a.updated_at desc,a.id limit 26 offset greatest(p_offset,0)) r
  );
end
$$;

create function public.submit_university_application(p_actor uuid,p_id uuid,p_request uuid,p_version integer,
  p_kind text,p_department text,p_details jsonb,p_photo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.lesson_university_applications;
  d public.lesson_university_departments;
  v_details jsonb := '{}';
  field text;
  val text;
  min_chars integer;
  max_chars integer;
  start_date date;
  end_date date;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,734));
  perform 1 from public.user_accounts where id=p_actor and account_status='active' for share;
  if not found then raise exception using errcode='42501',message='활동 중인 회원만 신청할 수 있습니다.'; end if;
  if p_id is null or p_request is null or p_kind is null or p_kind not in ('opening','manager') then
    raise exception using errcode='22023',message='신청 정보를 확인해 주세요.';
  end if;
  select * into a from public.lesson_university_applications where id=p_id for update;
  if a.id is not null then
    if a.applicant_id<>p_actor or a.kind<>p_kind then raise exception using errcode='42501',message='신청 권한이 없습니다.'; end if;
    if a.submission_key=p_request then return jsonb_build_object('id',a.id,'replay',true); end if;
    if a.status<>'revision' or a.version is distinct from p_version then
      raise exception using errcode='PT409',message='신청 상태가 바뀌었습니다. 최신 내용을 확인해 주세요.';
    end if;
  elsif p_version is not null then raise exception using errcode='PT409',message='신청 내역을 다시 확인해 주세요.';
  end if;
  for field,min_chars,max_chars in
    select * from (values ('applicant_name',2,100),('position',2,160),('contact',5,160),('verification',5,1000),
      ('university_name',2,160),('department_name',2,160),('campus',1,120),('summary',10,1000),
      ('region',1,12),('program_kind',1,20),('school_url',1,500),('official_url',0,500),
      ('guide_url',0,500),('admissions_url',0,500),('recruitment_start',0,10),('recruitment_end',0,10)) as fields(k,lo,hi)
  loop
    if p_kind='manager' and field not in ('applicant_name','position','contact','verification') then continue; end if;
    val := nullif(btrim(p_details->>field),'');
    if coalesce(char_length(val),0) not between min_chars and max_chars
      or (field in ('school_url','official_url','guide_url','admissions_url') and not private.university_url_valid(val)) then
      raise exception using errcode='22023',message='필수 항목, 글자 수와 HTTPS 주소를 확인해 주세요.';
    end if;
    v_details := v_details || jsonb_build_object(field,val);
  end loop;
  if v_details->>'contact' !~ '(^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$|^[+0-9][0-9() -]{6,}$)' then
    raise exception using errcode='22023',message='대학 공식 이메일 또는 부서 전화번호를 입력해 주세요.';
  end if;
  if p_kind='manager' then
    if p_photo is not null then raise exception using errcode='22023',message='담당자 신청에는 사진을 첨부할 수 없습니다.'; end if;
    if a.id is null then
      select * into d from public.lesson_university_departments where department_key=p_department and publication_status='published';
    else
      select * into d from public.lesson_university_departments where id=a.department_id;
    end if;
    if d.id is null or private.university_manages(d.id,p_actor) then
      raise exception using errcode='PT409',message='이미 담당 중이거나 신청할 수 없는 학과입니다.';
    end if;
    if exists(select 1 from public.lesson_university_applications x where x.applicant_id=p_actor
      and x.department_id=d.id and x.kind='manager' and x.status in ('pending','revision') and x.id<>p_id) then
      raise exception using errcode='PT409',message='같은 학과의 진행 중인 신청이 있습니다. 내 신청 내역을 확인해 주세요.';
    end if;
  else
    if v_details->>'program_kind' not in ('degree','continuing') or v_details->>'region' not in ('서울','경기','인천','충청','강원','전라','경상','제주')
      or private.university_identity(v_details->>'campus')='' then raise exception using errcode='22023',message='과정 구분과 캠퍼스·지역을 확인해 주세요.'; end if;
    start_date := (v_details->>'recruitment_start')::date;
    end_date := (v_details->>'recruitment_end')::date;
    if (start_date is null) <> (end_date is null) or end_date<start_date then
      raise exception using errcode='22023',message='모집 시작일과 마감일을 확인해 주세요.';
    end if;
    if (private.university_duplicate(v_details->>'university_name',v_details->>'department_name',v_details->>'campus',v_details->>'region',v_details->>'program_kind')).id is not null then
      raise exception using errcode='PT409',message='같은 대학·캠퍼스의 학과 또는 과정이 이미 있습니다.';
    end if;
    if exists(select 1 from public.lesson_university_applications x where x.applicant_id=p_actor and x.id<>p_id
      and x.kind='opening' and x.status in ('pending','revision')
      and private.university_identity(x.details->>'university_name')=private.university_identity(v_details->>'university_name')
      and private.university_identity(x.details->>'department_name')=private.university_identity(v_details->>'department_name')
      and private.university_identity(x.details->>'campus')=private.university_identity(v_details->>'campus')
      and x.details->>'program_kind'=v_details->>'program_kind') then
      raise exception using errcode='PT409',message='같은 과정의 진행 중인 신청이 있습니다. 내 신청 내역을 확인해 주세요.';
    end if;
    if p_photo is not null and (p_photo !~ ('^dept-'||p_id::text||'/[a-f0-9-]{36}$') or not exists(
      select 1 from storage.objects where bucket_id='university-representatives' and name=p_photo)) then
      raise exception using errcode='22023',message='첨부한 대표 사진을 확인해 주세요.';
    end if;
  end if;
  if a.id is null then
    insert into public.lesson_university_applications(id,applicant_id,kind,department_id,details,photo_path,submission_key)
    values(p_id,p_actor,p_kind,d.id,v_details,p_photo,p_request);
  else
    update public.lesson_university_applications set details=v_details,
      photo_path=coalesce(p_photo,a.photo_path),status='pending',submission_key=p_request,version=a.version+1,updated_at=now()
      where id=a.id;
  end if;
  return jsonb_build_object('id',p_id,'previous_photo',case when p_photo is not null then a.photo_path end);
end
$$;

create function public.review_university_application(p_id uuid,p_version integer,p_decision text,p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.lesson_university_applications;
  d public.lesson_university_departments;
  payload jsonb;
  v_note text := nullif(btrim(p_note),'');
begin
  perform private.require_lesson_directory_manager();
  if p_decision is null or p_decision not in ('approved','revision','rejected')
    or char_length(v_note)>1000 or (p_decision<>'approved' and v_note is null) then
    raise exception using errcode='22023',message='심사 결과와 안내를 확인해 주세요.';
  end if;
  select * into a from public.lesson_university_applications where id=p_id for update;
  if a.id is null then raise exception using errcode='22023',message='신청을 찾을 수 없습니다.'; end if;
  if a.status=p_decision and a.version=p_version+1 and a.reviewed_by=auth.uid() then
    return jsonb_build_object('status',a.status,'replay',true);
  end if;
  if a.status<>'pending' or a.version is distinct from p_version then
    raise exception using errcode='PT409',message='다른 곳에서 신청을 처리했습니다. 최신 상태를 확인해 주세요.';
  end if;
  if p_decision='approved' then
    perform 1 from public.user_accounts where id=a.applicant_id and account_status='active' for share;
    if not found then raise exception using errcode='22023',message='신청 계정이 활동 중이 아닙니다.'; end if;
    if a.kind='opening' then
      payload := a.details;
      insert into public.lesson_university_departments(department_key,university_name,department_name,campus,region,program_kind,
        summary,school_url,official_url,guide_url,admissions_url,recruitment_start,recruitment_end,photo_path,created_by,updated_by)
      values('dept-'||a.id,payload->>'university_name',payload->>'department_name',payload->>'campus',payload->>'region',
        payload->>'program_kind',payload->>'summary',payload->>'school_url',payload->>'official_url',payload->>'guide_url',
        payload->>'admissions_url',(payload->>'recruitment_start')::date,(payload->>'recruitment_end')::date,a.photo_path,auth.uid(),auth.uid())
      returning * into d;
    else
      select * into d from public.lesson_university_departments where id=a.department_id for update;
    end if;
    insert into public.lesson_university_managers(department_id,user_id) values(d.id,a.applicant_id) on conflict do nothing;
  end if;
  update public.lesson_university_applications set status=p_decision,note=v_note,
    reviewed_by=auth.uid(),department_id=coalesce(d.id,a.department_id),
    photo_path=case when p_decision='approved' and a.kind='opening' then null else a.photo_path end,
    version=a.version+1,updated_at=now() where id=a.id;
  return jsonb_build_object('status',p_decision);
end
$$;

revoke all on function private.university_identity(text),private.university_duplicate(text,text,text,text,text,uuid),
  private.university_identity_guard() from public,anon,authenticated,service_role;
revoke all on function public.find_existing_university_department(text,text,text,text,text),
  public.get_university_applications(boolean,uuid,integer),public.review_university_application(uuid,integer,text,text),
  public.submit_university_application(uuid,uuid,uuid,integer,text,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.find_existing_university_department(text,text,text,text,text),
  public.get_university_applications(boolean,uuid,integer),public.review_university_application(uuid,integer,text,text) to authenticated;
grant execute on function public.submit_university_application(uuid,uuid,uuid,integer,text,text,jsonb,text) to service_role;


create or replace function public.save_university_profile(
  p_key text, p_actor uuid, p_version integer, p_profile jsonb, p_photo text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  v_summary text := pg_catalog.btrim(p_profile->>'summary');
  v_title text := nullif(pg_catalog.btrim(p_profile->>'recruitment_title'),'');
  v_body text := nullif(pg_catalog.btrim(p_profile->>'recruitment_body'),'');
  v_official text := nullif(pg_catalog.btrim(p_profile->>'official_url'),'');
  v_school text := case when p_profile ? 'school_url' then nullif(pg_catalog.btrim(p_profile->>'school_url'),'') end;
  v_guide text := nullif(pg_catalog.btrim(p_profile->>'guide_url'),'');
  v_admissions text := nullif(pg_catalog.btrim(p_profile->>'admissions_url'),'');
begin
  select * into d from public.lesson_university_departments where department_key = p_key for update;
  if not private.university_manages(d.id, p_actor) then
    raise exception using errcode = '42501', message = '학과 관리 권한이 필요합니다.';
  end if;
  if d.version is distinct from p_version then
    raise exception using errcode = 'PT409', message = '다른 곳에서 학과 정보가 변경되었습니다. 최신 정보를 확인해 주세요.';
  end if;
  if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 1000
    or pg_catalog.char_length(v_title) > 160 or pg_catalog.char_length(v_body) > 2000
    or not (private.university_url_valid(v_official) and private.university_url_valid(v_guide) and private.university_url_valid(v_admissions) and private.university_url_valid(v_school))
  then raise exception using errcode = '22023', message = '학과 소개·공고·HTTPS 주소를 확인해 주세요.'; end if;
  if p_photo is not null and (p_photo !~ ('^' || p_key || '/[a-f0-9-]{36}$') or not exists (
    select 1 from storage.objects o where o.bucket_id = 'university-representatives' and o.name = p_photo
  )) then raise exception using errcode = '22023', message = '업로드한 대표 사진을 확인해 주세요.'; end if;
  update public.lesson_university_departments set
    summary = v_summary, official_url = v_official,
    school_url = case when p_profile ? 'school_url' then v_school else d.school_url end, guide_url = v_guide, admissions_url = v_admissions,
    recruitment_title = v_title, recruitment_body = v_body,
    recruitment_start = nullif(p_profile->>'recruitment_start','')::date,
    recruitment_end = nullif(p_profile->>'recruitment_end','')::date,
    photo_path = coalesce(p_photo, d.photo_path), version = d.version + 1, updated_by = p_actor
    where id = d.id;
  return pg_catalog.jsonb_build_object('version', d.version + 1, 'previous_photo', case when p_photo is not null then d.photo_path end);
end
$$;


create function public.count_pending_university_applications()
returns bigint language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.require_lesson_directory_manager();
  return (select count(*) from public.lesson_university_applications where status='pending');
end
$$;
revoke all on function public.count_pending_university_applications() from public,anon,authenticated,service_role;
grant execute on function public.count_pending_university_applications() to authenticated;
