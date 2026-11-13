-- Keep directory identity, operator publication control and information reports.
alter table public.lesson_university_departments
  add column guide_url text,
  add column recruitment_title text,
  add column recruitment_body text,
  add column recruitment_start date,
  add column recruitment_end date,
  add column photo_path text,
  add constraint university_recruitment_period check (
    (recruitment_start is null and recruitment_end is null)
    or (recruitment_start is not null and recruitment_end >= recruitment_start and recruitment_end is not null)
  );

create table public.lesson_university_managers (
  department_id uuid not null references public.lesson_university_departments(id),
  user_id uuid not null references public.user_accounts(id),
  primary key (department_id, user_id)
);
create index lesson_university_managers_user on public.lesson_university_managers(user_id);

create table public.lesson_university_consultations (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.lesson_university_departments(id),
  user_id uuid not null references public.user_accounts(id),
  request_key uuid not null,
  body text not null check (char_length(body) between 2 and 1000),
  contact_status text not null default 'received' check (contact_status in ('received','contacting','contacted')),
  contact_note text check (char_length(contact_note) <= 1000),
  created_at timestamptz not null default now(),
  unique (department_id, user_id, request_key)
);
create index lesson_university_consultation_inbox
  on public.lesson_university_consultations(department_id, created_at desc, id);

create table public.lesson_university_students (
  department_id uuid not null references public.lesson_university_departments(id),
  user_id uuid not null references public.user_accounts(id),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.user_accounts(id),
  primary key (department_id, user_id),
  check ((approved_at is null) = (approved_by is null))
);
create index lesson_university_students_user on public.lesson_university_students(user_id);

alter table public.lesson_university_managers enable row level security;
alter table public.lesson_university_consultations enable row level security;
alter table public.lesson_university_students enable row level security;
revoke all on public.lesson_university_managers, public.lesson_university_consultations,
  public.lesson_university_students from public, anon, authenticated, service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('university-representatives','university-representatives',false,4000000,array['image/jpeg','image/png','image/webp']);
create policy university_representatives_no_direct_access on storage.objects as restrictive
  for all to anon, authenticated
  using (bucket_id <> 'university-representatives')
  with check (bucket_id <> 'university-representatives');

create function private.university_active(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_accounts a where a.id = p_user and a.account_status = 'active')
$$;
create function private.university_manages(p_department uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.university_active(p_user) and exists (
    select 1 from public.lesson_university_managers m
    where m.department_id = p_department and m.user_id = p_user)
$$;
create function private.university_url_valid(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select p_url is null or (
    pg_catalog.char_length(p_url) <= 500
    and p_url ~ '^https://([a-z0-9][a-z0-9.-]*|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#].*)?$'
    and p_url !~ '[[:space:][:cntrl:]\\]'
  )
$$;
create function private.university_detail_json(d public.lesson_university_departments)
returns jsonb language sql stable set search_path = '' as $$
  select private.public_lesson_university_department_json(d) || pg_catalog.jsonb_build_object(
    'guide_url', d.guide_url, 'recruitment_title', d.recruitment_title, 'recruitment_body', d.recruitment_body,
    'recruitment_start', d.recruitment_start, 'recruitment_end', d.recruitment_end, 'photo_path', d.photo_path,
    'version', d.version)
$$;
revoke all on function private.university_active(uuid), private.university_manages(uuid,uuid),
  private.university_url_valid(text), private.university_detail_json(public.lesson_university_departments)
  from public, anon, authenticated, service_role;

create function public.get_university_department_detail(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.university_detail_json(d) || pg_catalog.jsonb_build_object(
    'can_manage', private.university_manages(d.id, auth.uid()),
    'student_status', case when s.approved_at is not null then 'approved' when s.user_id is not null then 'pending' end
  )
  from public.lesson_university_departments d
  left join public.lesson_university_students s on s.department_id = d.id and s.user_id = auth.uid()
    and private.university_active(auth.uid())
  where d.department_key = p_key and d.publication_status = 'published'
$$;

create function public.get_university_workspace(p_key text, p_section text, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  items jsonb := '[]';
begin
  select * into d from public.lesson_university_departments where department_key = p_key;
  if not private.university_manages(d.id, auth.uid()) then
    raise exception using errcode = '42501', message = '학과 관리 권한이 필요합니다.';
  end if;
  if p_section = 'consultations' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc, r.id), '[]') into items
    from (select c.id, c.body, c.contact_status, c.contact_note, c.created_at,
            coalesce(u.display_name, u.nickname, 'PUL 회원') as member_name
          from public.lesson_university_consultations c
          left join public.user_profiles u on u.user_id = c.user_id
          where c.department_id = d.id order by c.created_at desc, c.id
          limit 26 offset greatest(p_offset, 0)) r;
  elsif p_section = 'students' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.approved_at nulls first, r.requested_at desc, r.user_id), '[]') into items
    from (select s.user_id, s.requested_at, s.approved_at,
            coalesce(u.display_name, u.nickname, 'PUL 회원') as member_name
          from public.lesson_university_students s
          join public.user_accounts a on a.id = s.user_id and a.account_status = 'active'
          left join public.user_profiles u on u.user_id = s.user_id
          where s.department_id = d.id order by s.approved_at nulls first, s.requested_at desc, s.user_id
          limit 26 offset greatest(p_offset, 0)) r;
  end if;
  return private.university_detail_json(d) || pg_catalog.jsonb_build_object('publication_status', d.publication_status, 'items', items);
end
$$;

create function public.list_my_university_departments()
returns table(department_key text, university_name text, department_name text, can_manage boolean, student_status text)
language sql stable security definer set search_path = '' as $$
  select d.department_key, d.university_name, d.department_name, m.user_id is not null,
    case when s.approved_at is not null then 'approved' when s.user_id is not null then 'pending' end
  from public.lesson_university_departments d
  left join public.lesson_university_students s on s.department_id = d.id and s.user_id = auth.uid()
    and d.publication_status = 'published'
  left join public.lesson_university_managers m on m.department_id = d.id and m.user_id = auth.uid()
  where private.university_active(auth.uid()) and (m.user_id is not null or s.user_id is not null)
  order by d.university_name, d.department_name, d.department_key
$$;

create function public.list_university_department_managers(p_key text)
returns table(user_id uuid, member_name text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  -- The existing operator permission check locks the account row.
  perform private.require_lesson_directory_manager();
  return query select m.user_id, coalesce(u.display_name, u.nickname, 'PUL 회원')
  from public.lesson_university_managers m
  join public.lesson_university_departments d on d.id = m.department_id
  left join public.user_profiles u on u.user_id = m.user_id
  where d.department_key = p_key order by m.user_id;
end
$$;

create function public.set_university_department_manager(p_key text, p_user uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_department uuid;
begin
  perform private.require_lesson_directory_manager();
  select id into v_department from public.lesson_university_departments where department_key = p_key for update;
  if v_department is null or p_user is null or p_enabled is null
    or (p_enabled and not private.university_active(p_user)) then
    raise exception using errcode = '22023', message = '학과와 활동 중인 PUL 계정을 확인해 주세요.';
  end if;
  if p_enabled then
    insert into public.lesson_university_managers(department_id,user_id) values (v_department,p_user) on conflict do nothing;
  else
    delete from public.lesson_university_managers where department_id = v_department and user_id = p_user;
  end if;
end
$$;

create function public.submit_university_consultation(p_key text, p_request uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_department uuid;
  v_id uuid;
begin
  if not private.university_active(v_actor) then
    raise exception using errcode = '42501', message = '활동 중인 PUL 회원만 신청할 수 있습니다.';
  end if;
  if p_request is null or p_body is null or pg_catalog.char_length(pg_catalog.btrim(p_body)) not between 2 and 1000 then
    raise exception using errcode = '22023', message = '상담 내용을 2~1000자로 입력해 주세요.';
  end if;
  select id into v_department from public.lesson_university_departments
    where department_key = p_key and publication_status = 'published' for share;
  if v_department is null then
    raise exception using errcode = '22023', message = '공개된 학과에서 신청할 수 있습니다.';
  end if;
  insert into public.lesson_university_consultations(department_id,user_id,request_key,body)
    values(v_department,v_actor,p_request,pg_catalog.btrim(p_body)) on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.lesson_university_consultations
      where department_id = v_department and user_id = v_actor and request_key = p_request;
  end if;
  return v_id;
end
$$;

create function public.request_university_student(p_key text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_department uuid;
begin
  if not private.university_active(v_actor) then
    raise exception using errcode = '42501', message = '활동 중인 PUL 회원만 요청할 수 있습니다.';
  end if;
  select id into v_department from public.lesson_university_departments
    where department_key = p_key and publication_status = 'published' for share;
  if v_department is null then
    raise exception using errcode = '22023', message = '공개된 학과에서 요청할 수 있습니다.';
  end if;
  insert into public.lesson_university_students(department_id,user_id)
    values(v_department,v_actor) on conflict do nothing;
end
$$;

create function public.update_university_contact(p_key text, p_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_department uuid;
begin
  select id into v_department from public.lesson_university_departments where department_key = p_key for share;
  if not private.university_manages(v_department, auth.uid()) then
    raise exception using errcode = '42501', message = '학과 관리 권한이 필요합니다.';
  end if;
  update public.lesson_university_consultations set contact_status = p_status, contact_note = nullif(pg_catalog.btrim(p_note),'')
    where id = p_id and department_id = v_department;
  if not found then raise exception using errcode = '22023', message = '상담을 찾을 수 없습니다.'; end if;
end
$$;

create function public.approve_university_student(p_key text, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_department uuid;
begin
  select id into v_department from public.lesson_university_departments where department_key = p_key for share;
  if not private.university_manages(v_department, auth.uid()) then
    raise exception using errcode = '42501', message = '학과 관리 권한이 필요합니다.';
  end if;
  if not private.university_active(p_user) or not exists (
    select 1 from public.lesson_university_students where department_id = v_department and user_id = p_user
  ) then raise exception using errcode = '22023', message = '재학생 소속 확인 요청을 찾을 수 없습니다.'; end if;
  update public.lesson_university_students set approved_at = pg_catalog.now(), approved_by = auth.uid()
    where department_id = v_department and user_id = p_user and approved_at is null;
end
$$;

-- Photo bytes are checked by the server before a service-role upload. Only this
-- server RPC can install that object as the current photo, under the row lock.
create function public.save_university_profile(
  p_key text, p_actor uuid, p_version integer, p_profile jsonb, p_photo text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  v_summary text := pg_catalog.btrim(p_profile->>'summary');
  v_title text := nullif(pg_catalog.btrim(p_profile->>'recruitment_title'),'');
  v_body text := nullif(pg_catalog.btrim(p_profile->>'recruitment_body'),'');
  v_official text := nullif(pg_catalog.btrim(p_profile->>'official_url'),'');
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
    or not (private.university_url_valid(v_official) and private.university_url_valid(v_guide) and private.university_url_valid(v_admissions))
  then raise exception using errcode = '22023', message = '학과 소개·공고·HTTPS 주소를 확인해 주세요.'; end if;
  if p_photo is not null and (p_photo !~ ('^' || p_key || '/[a-f0-9-]{36}$') or not exists (
    select 1 from storage.objects o where o.bucket_id = 'university-representatives' and o.name = p_photo
  )) then raise exception using errcode = '22023', message = '업로드한 대표 사진을 확인해 주세요.'; end if;
  update public.lesson_university_departments set
    summary = v_summary, official_url = v_official, guide_url = v_guide, admissions_url = v_admissions,
    recruitment_title = v_title, recruitment_body = v_body,
    recruitment_start = nullif(p_profile->>'recruitment_start','')::date,
    recruitment_end = nullif(p_profile->>'recruitment_end','')::date,
    photo_path = coalesce(p_photo, d.photo_path), version = d.version + 1, updated_by = p_actor
    where id = d.id;
  return pg_catalog.jsonb_build_object('version', d.version + 1, 'previous_photo', case when p_photo is not null then d.photo_path end);
end
$$;

revoke all on function public.get_university_department_detail(text), public.get_university_workspace(text,text,integer),
  public.list_my_university_departments(), public.list_university_department_managers(text),
  public.set_university_department_manager(text,uuid,boolean), public.submit_university_consultation(text,uuid,text),
  public.request_university_student(text), public.update_university_contact(text,uuid,text,text),
  public.approve_university_student(text,uuid), public.save_university_profile(text,uuid,integer,jsonb,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_university_department_detail(text) to anon, authenticated;
grant execute on function public.get_university_workspace(text,text,integer), public.list_my_university_departments(),
  public.list_university_department_managers(text), public.set_university_department_manager(text,uuid,boolean),
  public.submit_university_consultation(text,uuid,text), public.request_university_student(text),
  public.update_university_contact(text,uuid,text,text), public.approve_university_student(text,uuid) to authenticated;
grant execute on function public.save_university_profile(text,uuid,integer,jsonb,text) to service_role;
