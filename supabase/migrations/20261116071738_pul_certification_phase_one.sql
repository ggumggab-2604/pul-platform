-- Public directory rows retain their original contracts. Supplemental metadata and
-- recipient links stay in private tables and are projected by purpose.
create table private.certification_course_details (
  course_key text primary key references public.certification_courses(course_key) on delete cascade,
  details jsonb not null default '{}'
);
-- Preserve prior links so deleted or disconnected courses never restore a legacy ad.
create table private.certification_course_promotions (
  promotion_slug text primary key,
  course_key text unique references public.certification_courses(course_key) on delete set null
);
create table private.certification_job_details (
  job_key text primary key references public.certification_jobs(job_key) on delete cascade,
  details jsonb not null default '{}',
  event_key text references public.events(event_key) on delete set null,
  contact_user_id uuid references public.user_accounts(id) on delete set null
);
create index certification_job_details_event_idx on private.certification_job_details(event_key)
  where event_key is not null;
create index certification_job_details_contact_idx on private.certification_job_details(contact_user_id)
  where contact_user_id is not null;

create table private.certification_talent_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.user_accounts(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  qualification text not null,
  issuer text not null,
  grade text not null,
  region text not null,
  availability text not null,
  experience text not null,
  is_public boolean not null default false
);

create table private.certification_oral_submissions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.user_accounts(id) on delete set null,
  kind text not null check (kind in ('official','recalled')),
  question text not null check (char_length(question) between 5 and 500),
  answer text not null check (char_length(answer) <= 1500),
  source_note text not null check (char_length(source_note) between 5 and 500),
  source_url text not null check (source_url = '' or private.valid_certification_external_url(source_url)),
  status text not null default 'pending' check (status in ('pending','published','hidden')),
  created_at timestamptz not null default now()
);
create index certification_oral_queue_idx on private.certification_oral_submissions(status, created_at desc);

alter table private.certification_course_details enable row level security;
alter table private.certification_course_promotions enable row level security;
alter table private.certification_job_details enable row level security;
alter table private.certification_talent_profiles enable row level security;
alter table private.certification_oral_submissions enable row level security;
revoke all on private.certification_course_details, private.certification_course_promotions,
  private.certification_job_details,
  private.certification_talent_profiles, private.certification_oral_submissions from public, anon, authenticated, service_role;

create function private.certification_details(p_entity text, p_key text, p_manage boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_manage and not private.certification_actor_has_management_permission(auth.uid()) then
    raise exception 'certification_permission' using errcode='42501';
  end if;
  if p_entity = 'course' then
    select jsonb_build_object('details',coalesce(d.details,'{}'::jsonb))
      || case when p_manage then jsonb_build_object('version',c.version,'promotion_slug',a.promotion_slug) else '{}'::jsonb end
      into v_result from public.certification_courses c left join private.certification_course_details d using(course_key)
      left join private.certification_course_promotions a using(course_key)
      where c.course_key=p_key and ((p_manage and c.publication_status<>'removed') or c.publication_status='published');
  elsif p_entity = 'job' then
    select jsonb_build_object('details',coalesce(d.details,'{}'::jsonb),'can_contact',
      j.recruit_status<>'closed' and coalesce(j.application_ends_on >= (now() at time zone 'Asia/Seoul')::date,true)
      and private.messaging_account_available(d.contact_user_id),'event_key',e.event_key)
      || case when p_manage then jsonb_build_object('version',j.version,'contact_user_id',d.contact_user_id,'event_key',d.event_key) else '{}'::jsonb end
      into v_result from public.certification_jobs j left join private.certification_job_details d using(job_key)
      left join public.events e on e.event_key=d.event_key and e.publication_status='published'
      where j.job_key=p_key and ((p_manage and j.publication_status<>'removed') or j.publication_status='published');
  end if;
  return v_result;
end;
$$;

create function private.save_certification_details(p_entity text, p_key text, p_version integer, p_details jsonb,
  p_promotion_slug text, p_event_key text, p_contact_user_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid := private.require_certification_directory_manager();
  v_keys text[];
  v_field text;
  v_value jsonb;
begin
  v_keys := case p_entity when 'course' then array['issuer','qualification','grade','registration','tuition','exam_fee','issue_fee']
    when 'job' then array['activity_date','venue','issuer','grade'] end;
  if v_keys is null or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'certification_invalid' using errcode='22023';
  end if;
  for v_field,v_value in select key,value from jsonb_each(p_details) loop
    if not (v_field=any(v_keys)) or jsonb_typeof(v_value)<>'string' or char_length(v_value #>> '{}') not between 1 and 160
      or (v_field in ('tuition','exam_fee','issue_fee') and (v_value #>> '{}') !~ '^[0-9]{1,9}$')
      or (v_field='activity_date' and (v_value #>> '{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
      raise exception 'certification_invalid' using errcode='22023';
    end if;
    if v_field='activity_date' then perform (v_value #>> '{}')::date; end if;
  end loop;
  if p_entity='course' then
    if p_promotion_slug is not null and p_promotion_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then
      raise exception 'certification_invalid' using errcode='22023';
    end if;
    update public.certification_courses set updated_by=v_actor, version=version+1, updated_at=now()
      where course_key=p_key and publication_status<>'removed' and version=p_version;
    if not found then raise exception 'certification_changed' using errcode='40001'; end if;
    insert into private.certification_course_details values(p_key,p_details)
      on conflict(course_key) do update set details=excluded.details;
    update private.certification_course_promotions set course_key=null
      where course_key=p_key and promotion_slug is distinct from p_promotion_slug;
    if p_promotion_slug is not null then
      insert into private.certification_course_promotions as a values(p_promotion_slug,p_key)
        on conflict(promotion_slug) do update set course_key=excluded.course_key
        where a.course_key is null or a.course_key=excluded.course_key;
      if not found then raise exception 'certification_promotion_in_use' using errcode='23505'; end if;
    end if;
  else
    if p_contact_user_id is not null and not private.messaging_account_available(p_contact_user_id) then
      raise exception 'certification_invalid_recipient' using errcode='22023';
    end if;
    update public.certification_jobs set updated_by=v_actor, version=version+1, updated_at=now()
      where job_key=p_key and publication_status<>'removed' and version=p_version;
    if not found then raise exception 'certification_changed' using errcode='40001'; end if;
    insert into private.certification_job_details values(p_key,p_details,p_event_key,p_contact_user_id)
      on conflict(job_key) do update set details=excluded.details,event_key=excluded.event_key,contact_user_id=excluded.contact_user_id;
  end if;
end;
$$;

create function private.certification_promotion_course(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('course_key',c.course_key)
  from private.certification_course_promotions a
  left join public.certification_courses c on c.course_key=a.course_key and c.publication_status='published'
  where a.promotion_slug=p_slug;
$$;

create function private.certification_event_jobs(p_event_key text)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('key',j.job_key,'title',j.title) order by j.title,j.job_key),'[]'::jsonb)
  from public.events e join private.certification_job_details d using(event_key)
  join public.certification_jobs j using(job_key)
  where e.event_key=p_event_key and e.publication_status='published' and j.publication_status='published';
$$;

create function private.certification_public_profile_text(p_text text)
returns boolean language sql immutable set search_path='' as $$
  select p_text is not null and p_text !~* '(@|https?://|자격증[[:space:]]*번호|(^|[^0-9])0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}([^0-9]|$)|[0-9]{8,})';
$$;

create function private.certification_profile_json(p private.certification_talent_profiles, p_nickname text)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p.id,'nickname',p_nickname,'qualification',p.qualification,'issuer',p.issuer,
    'grade',p.grade,'region',p.region,'availability',p.availability,'experience',p.experience);
$$;

create function private.certification_profiles(p_id uuid, p_own boolean, p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_own then
    perform private.messaging_assert_actor();
    select private.certification_profile_json(p,null) || jsonb_build_object('is_public',p.is_public)
      into v_result from private.certification_talent_profiles p where p.owner_id=auth.uid();
  elsif p_id is not null then
    select private.certification_profile_json(p,pr.nickname)
      || case when p.owner_id=auth.uid() then '{"is_owner":true}'::jsonb else '{}'::jsonb end
      into v_result
      from private.certification_talent_profiles p join public.user_profiles pr on pr.user_id=p.owner_id
      where p.id=p_id and p.is_public and private.certification_public_profile_text(pr.nickname) and private.messaging_account_available(p.owner_id);
  else
    select coalesce(jsonb_agg(private.certification_profile_json(s.p,s.nickname) order by s.id),'[]'::jsonb) into v_result
      from (select p,pr.nickname,p.id from private.certification_talent_profiles p
        join public.user_profiles pr on pr.user_id=p.owner_id
        where p.is_public and private.certification_public_profile_text(pr.nickname) and private.messaging_account_available(p.owner_id)
        order by p.id limit 25 offset greatest(p_offset,0)) s;
  end if;
  return v_result;
end;
$$;

create function private.save_certification_profile(p_qualification text,p_issuer text,p_grade text,
  p_region text,p_availability text,p_experience text,p_public boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_id uuid;
begin
  if char_length(btrim(p_qualification)) not between 1 and 100
    or char_length(btrim(p_issuer)) not between 1 and 100 or char_length(btrim(p_grade)) not between 1 and 40
    or char_length(btrim(p_region)) not between 1 and 100 or char_length(p_availability)>160 or char_length(p_experience)>500
    or not private.certification_public_profile_text(concat_ws(' ',p_qualification,p_issuer,p_grade,p_region,p_availability,p_experience))
    or (p_public is true and not exists (
      select 1 from public.user_profiles where user_id=v_actor and private.certification_public_profile_text(nickname)
    ))
  then raise exception 'certification_invalid' using errcode='22023'; end if;
  insert into private.certification_talent_profiles(owner_id,qualification,issuer,grade,region,availability,experience,is_public)
    values(v_actor,btrim(p_qualification),btrim(p_issuer),btrim(p_grade),btrim(p_region),
      btrim(p_availability),btrim(p_experience),coalesce(p_public,false))
    on conflict(owner_id) do update set qualification=excluded.qualification,issuer=excluded.issuer,grade=excluded.grade,
      region=excluded.region,availability=excluded.availability,experience=excluded.experience,
      is_public=excluded.is_public,revision=gen_random_uuid()
    returning id into v_id;
  return v_id;
end;
$$;

create function private.certification_message_target(p_kind text,p_key text,p_lock boolean default false)
returns table(recipient uuid, title text, binding text)
language plpgsql security definer set search_path='' as $$
begin
  if p_kind='job' then
    if p_lock then
      perform 1 from public.certification_jobs j where j.job_key=p_key for share;
    end if;
    return query select d.contact_user_id,j.title,j.version::text
      from public.certification_jobs j join private.certification_job_details d using(job_key)
      where j.job_key=p_key and j.publication_status='published' and j.recruit_status<>'closed'
        and coalesce(j.application_ends_on >= (now() at time zone 'Asia/Seoul')::date,true);
  elsif p_kind='talent' and p_key ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    if p_lock then
      perform 1 from private.certification_talent_profiles p where p.id=p_key::uuid for share;
    end if;
    return query select p.owner_id,pr.nickname,p.revision::text
      from private.certification_talent_profiles p join public.user_profiles pr on pr.user_id=p.owner_id
      where p.id=p_key::uuid and p.is_public and private.certification_public_profile_text(pr.nickname);
  end if;
end;
$$;

create function private.certification_message_context(p_kind text,p_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_target record;
begin
  select * into v_target from private.certification_message_target(p_kind,p_key);
  if v_target.recipient is null or v_target.recipient=v_actor or not private.messaging_account_available(v_target.recipient) then
    raise exception 'messaging_recipient_unavailable' using errcode='P0002';
  end if;
  return jsonb_build_object('name',v_target.title,'binding',v_target.binding);
end;
$$;

create function private.send_certification_message(p_kind text,p_key text,p_binding text,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_target record;
begin
  perform private.messaging_assert_actor();
  perform private.messaging_assert_read_committed();
  select * into v_target from private.certification_message_target(p_kind,p_key,true);
  if v_target.recipient is null or v_target.binding is distinct from p_binding then
    raise exception 'messaging_recipient_unavailable' using errcode='P0002';
  end if;
  return private.messaging_create(v_target.recipient,null,p_body,p_request_id);
end;
$$;

create function private.certification_oral(p_manage boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if p_manage and not private.certification_actor_has_management_permission(auth.uid()) then
    raise exception 'certification_permission' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'question',s.question,
    'answer',s.answer,'source_url',s.source_url) || case when p_manage
    then jsonb_build_object('source_note',s.source_note,'status',s.status) else '{}'::jsonb end
    order by s.created_at desc),'[]'::jsonb)
    into v_result from (select * from private.certification_oral_submissions o

      where p_manage or o.status='published'
      order by case o.status when 'pending' then 0 when 'published' then 1 else 2 end, o.created_at desc
      limit 50) s;
  return v_result;
end;
$$;

create function private.submit_certification_oral(p_kind text,p_question text,p_answer text,p_source_note text,p_source_url text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid := private.community_assert_active_actor();
begin
  perform pg_advisory_xact_lock(1199040523,hashtext(v_actor::text));
  if (select count(*) from private.certification_oral_submissions where author_id=v_actor and created_at>now()-interval '1 day')>=5 then
    raise exception 'certification_quota' using errcode='22023';
  end if;
  if p_kind='official' and coalesce(btrim(p_source_url),'')='' then
    raise exception 'certification_invalid' using errcode='22023';
  end if;
  insert into private.certification_oral_submissions(author_id,kind,question,answer,source_note,source_url)
    values(v_actor,p_kind,btrim(p_question),btrim(p_answer),btrim(p_source_note),btrim(p_source_url));
end;
$$;

create function private.review_certification_oral(p_id uuid,p_publish boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_certification_directory_manager();
  update private.certification_oral_submissions set status=case when p_publish then 'published' else 'hidden' end
    where id=p_id and (p_publish and status in ('pending','hidden') or not p_publish and status in ('pending','published'));
  if not found then raise exception 'certification_changed' using errcode='40001'; end if;
end;
$$;

alter table public.certification_study_posts
  add column topic text,
  add column parent_key text references public.certification_study_posts(post_key) on delete cascade;
create index certification_study_thread_idx on public.certification_study_posts(topic,parent_key,created_at desc,id desc)
  where post_status='published' and topic is not null;

create function private.certification_topic_valid(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(p_topic ~ '^(written-2026-(education|society|psychology|ethics|physiology|mechanics|history)-([1-9]|1[0-9]|20)|practical-hancheon|oral-(safety|local-rules)|training-(hanyang|kyonggi))$'
    or exists (select 1 from private.certification_oral_submissions o
      where p_topic='oral-'||o.id::text and o.status='published'),false);
$$;

create function private.certification_topic_page(p_topic text,p_parent text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_count integer; v_root jsonb;
begin
  if not private.certification_topic_valid(p_topic) or p_limit is null or p_limit not between 1 and 24
    or p_offset is null or p_offset<0 then
    raise exception '시험 준비 게시판 페이지 범위를 확인해 주세요.' using errcode='22023';
  end if;
  if p_parent is not null then
    select jsonb_build_object('post_key',p.post_key,'body',p.body,'created_at',p.created_at,
      'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()))
      into v_root from public.certification_study_posts p
      where p.post_key=p_parent and p.topic=p_topic and p.parent_key is null and p.post_status='published';
    if v_root is null then raise exception '시험 준비 게시글을 찾을 수 없습니다.' using errcode='P0002'; end if;
  end if;
  select count(*) into v_count from public.certification_study_posts p where
    p.topic=p_topic and p.parent_key is not distinct from p_parent and p.post_status='published';
  select coalesce(jsonb_agg(jsonb_build_object('post_key',p.post_key,'body',p.body,'created_at',p.created_at,
    'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()))
    order by p.created_at desc,p.id desc),'[]'::jsonb) into v_items
  from (select * from public.certification_study_posts s where s.topic=p_topic
    and s.parent_key is not distinct from p_parent and s.post_status='published'
    order by s.created_at desc,s.id desc limit p_limit offset p_offset) p;
  return jsonb_build_object('root',v_root,'page',jsonb_build_object('items',v_items,'total',v_count,
    'limit',p_limit,'offset',p_offset,'has_more',p_offset+jsonb_array_length(v_items)<v_count));
end;
$$;

create function private.submit_certification_topic_post(p_topic text,p_parent text,p_body text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not private.certification_topic_valid(p_topic) then
    raise exception '시험 준비 게시판 주제를 확인해 주세요.' using errcode='22023';
  end if;
  if p_parent is not null then
    perform 1 from public.certification_study_posts p where p.post_key=p_parent and p.topic=p_topic
      and p.parent_key is null and p.post_status='published' for share;
    if not found then raise exception '답변할 게시글을 확인해 주세요.' using errcode='22023'; end if;
  end if;
  v_result:=public.submit_certification_study_post(p_body);
  update public.certification_study_posts set topic=p_topic,parent_key=p_parent where post_key=v_result->>'post_key';
  return v_result;
end;
$$;

create or replace function public.list_public_certification_study_posts(p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_count integer; v_items jsonb;
begin
  if p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 then
    raise exception '시험 준비 게시판 페이지 범위를 확인해 주세요.';
  end if;
  select count(*) into v_count from public.certification_study_posts p where p.topic is null and p.post_status='published';
  select coalesce(jsonb_agg(jsonb_build_object('post_key',p.post_key,'body',p.body,'created_at',p.created_at,
    'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()))
    order by p.created_at desc,p.id desc),'[]'::jsonb) into v_items
  from (select * from public.certification_study_posts s where s.topic is null and s.post_status='published'
    order by s.created_at desc,s.id desc limit p_limit offset p_offset) p;
  return jsonb_build_object('items',v_items,'total',v_count,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset+jsonb_array_length(v_items)<v_count);
end;
$$;

revoke all on function private.certification_public_profile_text(text),
  private.certification_profile_json(private.certification_talent_profiles,text),
  private.certification_message_target(text,text,boolean), private.certification_topic_valid(text)
  from public, anon, authenticated, service_role;

create function public.certification_details(p_entity text,p_key text,p_manage boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_details(p_entity,p_key,p_manage);
$$;
revoke all on function public.certification_details(text,text,boolean), private.certification_details(text,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_details(text,text,boolean), private.certification_details(text,text,boolean) to anon, authenticated;

create function public.save_certification_details(p_entity text,p_key text,p_version integer,p_details jsonb,p_promotion_slug text,p_event_key text,p_contact_user_id uuid)
returns void language sql security invoker set search_path='' as $$
  select private.save_certification_details(p_entity,p_key,p_version,p_details,p_promotion_slug,p_event_key,p_contact_user_id);
$$;
revoke all on function public.save_certification_details(text,text,integer,jsonb,text,text,uuid), private.save_certification_details(text,text,integer,jsonb,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.save_certification_details(text,text,integer,jsonb,text,text,uuid), private.save_certification_details(text,text,integer,jsonb,text,text,uuid) to authenticated;

create function public.certification_promotion_course(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_promotion_course(p_slug);
$$;
revoke all on function public.certification_promotion_course(text), private.certification_promotion_course(text)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_promotion_course(text), private.certification_promotion_course(text) to anon, authenticated;

create function public.certification_event_jobs(p_event_key text)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_event_jobs(p_event_key);
$$;
revoke all on function public.certification_event_jobs(text), private.certification_event_jobs(text)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_event_jobs(text), private.certification_event_jobs(text) to anon, authenticated;

create function public.certification_profiles(p_id uuid,p_own boolean,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_profiles(p_id,p_own,p_offset);
$$;
revoke all on function public.certification_profiles(uuid,boolean,integer), private.certification_profiles(uuid,boolean,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_profiles(uuid,boolean,integer), private.certification_profiles(uuid,boolean,integer) to anon, authenticated;

create function public.save_certification_profile(p_qualification text,p_issuer text,p_grade text,p_region text,p_availability text,p_experience text,p_public boolean)
returns uuid language sql security invoker set search_path='' as $$
  select private.save_certification_profile(p_qualification,p_issuer,p_grade,p_region,p_availability,p_experience,p_public);
$$;
revoke all on function public.save_certification_profile(text,text,text,text,text,text,boolean), private.save_certification_profile(text,text,text,text,text,text,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.save_certification_profile(text,text,text,text,text,text,boolean), private.save_certification_profile(text,text,text,text,text,text,boolean) to authenticated;

create function public.certification_message_context(p_kind text,p_key text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.certification_message_context(p_kind,p_key);
$$;
revoke all on function public.certification_message_context(text,text), private.certification_message_context(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_message_context(text,text), private.certification_message_context(text,text) to authenticated;

create function public.send_certification_message(p_kind text,p_key text,p_binding text,p_body text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.send_certification_message(p_kind,p_key,p_binding,p_body,p_request_id);
$$;
revoke all on function public.send_certification_message(text,text,text,text,uuid), private.send_certification_message(text,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.send_certification_message(text,text,text,text,uuid), private.send_certification_message(text,text,text,text,uuid) to authenticated;

create function public.certification_oral(p_manage boolean)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_oral(p_manage);
$$;
revoke all on function public.certification_oral(boolean), private.certification_oral(boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_oral(boolean), private.certification_oral(boolean) to anon, authenticated;

create function public.submit_certification_oral(p_kind text,p_question text,p_answer text,p_source_note text,p_source_url text)
returns void language sql security invoker set search_path='' as $$
  select private.submit_certification_oral(p_kind,p_question,p_answer,p_source_note,p_source_url);
$$;
revoke all on function public.submit_certification_oral(text,text,text,text,text), private.submit_certification_oral(text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_certification_oral(text,text,text,text,text), private.submit_certification_oral(text,text,text,text,text) to authenticated;

create function public.review_certification_oral(p_id uuid,p_publish boolean)
returns void language sql security invoker set search_path='' as $$
  select private.review_certification_oral(p_id,p_publish);
$$;
revoke all on function public.review_certification_oral(uuid,boolean), private.review_certification_oral(uuid,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.review_certification_oral(uuid,boolean), private.review_certification_oral(uuid,boolean) to authenticated;

create function public.certification_topic_page(p_topic text,p_parent text,p_limit integer,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.certification_topic_page(p_topic,p_parent,p_limit,p_offset);
$$;
revoke all on function public.certification_topic_page(text,text,integer,integer), private.certification_topic_page(text,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.certification_topic_page(text,text,integer,integer), private.certification_topic_page(text,text,integer,integer) to anon, authenticated;

create function public.submit_certification_topic_post(p_topic text,p_parent text,p_body text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.submit_certification_topic_post(p_topic,p_parent,p_body);
$$;
revoke all on function public.submit_certification_topic_post(text,text,text), private.submit_certification_topic_post(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_certification_topic_post(text,text,text), private.submit_certification_topic_post(text,text,text) to authenticated;
