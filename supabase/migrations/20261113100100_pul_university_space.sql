
create table public.lesson_university_space_entries (
  id uuid primary key,
  department_id uuid not null references public.lesson_university_departments(id),
  author_id uuid not null references public.user_accounts(id),
  kind text not null check(kind in ('notice','story','event')),
  title text not null check(char_length(title) between 2 and 160),
  body text not null check(char_length(body) between 1 and 3000),
  event_date date,
  event_time time,
  place text,
  photo_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind='event')=(event_date is not null and event_time is not null and place is not null)),
  check (kind='story' or photo_path is null)
);
create index university_space_section on public.lesson_university_space_entries(department_id,kind,created_at desc,id);
create table public.lesson_university_event_members (
  entry_id uuid not null references public.lesson_university_space_entries(id) on delete cascade,
  user_id uuid not null references public.user_accounts(id),
  primary key(entry_id,user_id)
);
create index university_event_members_user on public.lesson_university_event_members(user_id);
alter table public.lesson_university_space_entries enable row level security;
alter table public.lesson_university_event_members enable row level security;
revoke all on public.lesson_university_space_entries,public.lesson_university_event_members from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('university-activities','university-activities',false,4000000,array['image/jpeg','image/png','image/webp']);
create policy university_activities_no_direct_access on storage.objects as restrictive for all to anon,authenticated
using (bucket_id<>'university-activities') with check(bucket_id<>'university-activities');

create function private.university_student_approved(p_department uuid,p_actor uuid)
returns boolean language sql stable set search_path = '' as $$
  select private.university_active(p_actor) and exists (
    select 1 from public.lesson_university_students where department_id=p_department and user_id=p_actor and approved_at is not null)
$$;

create function public.get_university_space(p_key text,p_kind text,p_offset integer default 0,p_photos boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  manager boolean;
  student boolean;
begin
  select * into d from public.lesson_university_departments where department_key=p_key;
  manager := private.university_manages(d.id,auth.uid());
  student := d.publication_status is not distinct from 'published' and private.university_student_approved(d.id,auth.uid());
  if not (manager or student) then raise exception using errcode='42501',message='학과 공간 이용 권한이 필요합니다.'; end if;
  if p_kind not in ('notice','story','event') or p_kind is null then raise exception using errcode='22023',message='메뉴를 확인해 주세요.'; end if;
  return jsonb_build_object('school',d.university_name,'name',d.department_name,'manager',manager,'student',student,'items',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]')
    from (select e.id,e.kind,e.title,e.body,e.event_date,e.event_time,e.place,e.version,e.created_at,
           e.photo_path is not null as has_photo,e.author_id=auth.uid() as own,
           coalesce(u.display_name,u.nickname,'PUL 회원') as author,
           case when e.kind='event' then (select count(*) from public.lesson_university_event_members m where m.entry_id=e.id) end as participants,
           exists(select 1 from public.lesson_university_event_members m where m.entry_id=e.id and m.user_id=auth.uid()) as joined
          from public.lesson_university_space_entries e left join public.user_profiles u on u.user_id=e.author_id
          where e.department_id=d.id and e.kind=p_kind and (not coalesce(p_photos,false) or e.photo_path is not null)
          order by e.created_at desc,e.id limit 21 offset greatest(p_offset,0)) x
  ));
end
$$;

create function public.get_university_activity_photo(p_key text,p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select e.photo_path from public.lesson_university_space_entries e
  join public.lesson_university_departments d on d.id=e.department_id
  where d.department_key=p_key and e.id=p_id and (
    private.university_manages(d.id,auth.uid()) or
    (d.publication_status='published' and private.university_student_approved(d.id,auth.uid()))
  )
$$;

create function public.mutate_university_space(p_actor uuid,p_key text,p_id uuid,p_operation text,p_kind text,
  p_version integer,p_details jsonb,p_photo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  e public.lesson_university_space_entries;
  manager boolean;
  student boolean;
  v_title text := nullif(btrim(p_details->>'title'),'');
  v_body text := nullif(btrim(p_details->>'body'),'');
  v_place text := nullif(btrim(p_details->>'place'),'');
  v_event_date date;
  v_event_time time;
begin
  perform 1 from public.user_accounts where id=p_actor and account_status='active' for share;
  if not found then raise exception using errcode='42501',message='활동 중인 회원만 이용할 수 있습니다.'; end if;
  select * into d from public.lesson_university_departments where department_key=p_key for share;
  manager := private.university_manages(d.id,p_actor);
  student := d.publication_status is not distinct from 'published' and private.university_student_approved(d.id,p_actor);
  if not (manager or student) then raise exception using errcode='42501',message='학과 공간 이용 권한이 필요합니다.'; end if;
  if p_id is null or p_kind is null or p_kind not in ('notice','story','event') or p_operation is null
    or p_operation not in ('create','edit','delete','join','cancel') then
    raise exception using errcode='22023',message='요청을 확인해 주세요.';
  end if;
  if p_operation<>'create' then
    select * into e from public.lesson_university_space_entries where id=p_id and department_id=d.id and kind=p_kind for update;
    if e.id is null then raise exception using errcode='22023',message='학과의 게시물이나 일정을 찾을 수 없습니다.'; end if;
  end if;
  if p_operation in ('join','cancel') then
    if not student or p_kind<>'event' then raise exception using errcode='42501',message='승인된 재학생만 참가를 변경할 수 있습니다.'; end if;
    if p_operation='join' then
      if (e.event_date+e.event_time) <= (now() at time zone 'Asia/Seoul') then
        raise exception using errcode='22023',message='시작된 일정에는 참가 신청을 할 수 없습니다.';
      end if;
      insert into public.lesson_university_event_members(entry_id,user_id) values(e.id,p_actor) on conflict do nothing;
    else delete from public.lesson_university_event_members where entry_id=e.id and user_id=p_actor;
    end if;
    return '{}';
  end if;
  if (p_kind<>'story' and not manager)
    or (p_operation='edit' and p_kind='story' and e.author_id<>p_actor)
    or (p_operation='delete' and not (manager or e.author_id=p_actor)) then
    raise exception using errcode='42501',message='이 항목을 수정할 권한이 없습니다.';
  end if;
  if p_operation<>'create' and e.version is distinct from p_version then
    raise exception using errcode='PT409',message='다른 곳에서 변경되었습니다. 최신 내용을 확인해 주세요.';
  end if;
  if p_operation='delete' then
    delete from public.lesson_university_space_entries where id=e.id;
    return jsonb_build_object('previous_photo',e.photo_path);
  end if;
  if coalesce(char_length(v_title),0) not between 2 and 160 or coalesce(char_length(v_body),0) not between 1 and 3000 then
    raise exception using errcode='22023',message='제목과 내용을 확인해 주세요.';
  end if;
  if p_kind='event' then
    v_event_date := nullif(p_details->>'event_date','')::date;
    v_event_time := nullif(p_details->>'event_time','')::time;
    if v_event_date is null or v_event_time is null or coalesce(char_length(v_place),0) not between 1 and 200 then
      raise exception using errcode='22023',message='일정 날짜, 시간과 장소를 입력해 주세요.';
    end if;
  else v_place := null;
  end if;
  if p_photo is not null and (p_kind<>'story' or p_photo !~ ('^'||p_id::text||'/[a-f0-9-]{36}$') or not exists (
    select 1 from storage.objects where bucket_id='university-activities' and name=p_photo)) then
    raise exception using errcode='22023',message='활동 사진을 확인해 주세요.';
  end if;
  if p_operation='create' then
    insert into public.lesson_university_space_entries(id,department_id,author_id,kind,title,body,event_date,event_time,place,photo_path)
    values(p_id,d.id,p_actor,p_kind,v_title,v_body,v_event_date,v_event_time,v_place,p_photo)
    on conflict(id) do nothing;
    if not found then
      if not exists(select 1 from public.lesson_university_space_entries
        where id=p_id and author_id=p_actor and department_id=d.id and kind=p_kind) then
        raise exception using errcode='PT409',message='이미 처리된 요청입니다.';
      end if;
      return jsonb_build_object('replay',true);
    end if;
  else
    update public.lesson_university_space_entries
    set title=v_title,body=v_body,
      event_date=v_event_date,event_time=v_event_time,
      place=v_place,photo_path=coalesce(p_photo,e.photo_path),version=e.version+1,updated_at=now()
    where id=e.id;
  end if;
  return jsonb_build_object('previous_photo',case when p_photo is not null then e.photo_path end);
end
$$;

revoke all on function private.university_student_approved(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_university_space(text,text,integer,boolean),public.get_university_activity_photo(text,uuid),
  public.mutate_university_space(uuid,text,uuid,text,text,integer,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.get_university_space(text,text,integer,boolean),public.get_university_activity_photo(text,uuid) to authenticated;
grant execute on function public.mutate_university_space(uuid,text,uuid,text,text,integer,jsonb,text) to service_role;

