-- New feature only. 118/00117 lineage and reserved filenames checked before creation.
-- The separately applied market_image_finalize_boundary.sql is NOT incorporated here.
begin;
create table private.course_operator_image_sets (
 course_id uuid primary key references public.courses(id), version integer not null default 0
);
create table private.course_operator_images (
 id uuid primary key, course_id uuid not null references public.courses(id), owner_id uuid not null references public.user_accounts(id),
 purpose text not null check(purpose in ('photo','document')), mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 4000000), content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 width integer not null check(width>0), height integer not null check(height>0),
status text not null default 'pending' check(status in ('pending','uploaded','ready','removed')), position integer check(position between 0 and 7),
 caption text not null default '' check(char_length(caption)<=180), created_at timestamptz not null default now()
);
create index course_operator_images_course_idx on private.course_operator_images(course_id,status,position);
create unique index course_operator_images_order_idx on private.course_operator_images(course_id,position) where status='ready';
alter table private.course_operator_image_sets enable row level security;
alter table private.course_operator_image_sets force row level security;
alter table private.course_operator_images enable row level security;
alter table private.course_operator_images force row level security;
revoke all on private.course_operator_image_sets,private.course_operator_images from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('course-operator-images','course-operator-images',false,4000000,array['image/jpeg','image/png','image/webp']);
-- No browser Storage policies. Incomplete/staged objects never have a public path.

create function private.course_operator_assert(p_actor uuid,p_course_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if p_actor is null then raise exception '로그인이 필요합니다.' using errcode='42501';end if;
 perform id from public.user_accounts where id=p_actor and account_status='active' for share;
 if not found or not private.messaging_account_available(p_actor) then raise exception '정상 회원만 관리할 수 있습니다.' using errcode='42501';end if;
 select id into c from public.courses where course_key=p_course_key and course_status='active' for update;
 if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 perform user_id from private.course_stewards where course_id=c and user_id=p_actor and active for share;
 if not found and not private.course_actor_has_permission(p_actor,'courses.manage') then raise exception '이 구장의 이미지 관리 권한이 없습니다.' using errcode='42501';end if;
 return c;
end $$;
revoke all on function private.course_operator_assert(uuid,text) from public,anon,authenticated,service_role;

create function public.course_operator_images(p_course_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c uuid; a uuid:=auth.uid(); editable boolean; items jsonb; v integer;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active';
 if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 editable:=a is not null and exists(select 1 from public.user_accounts where id=a and account_status='active') and private.messaging_account_available(a)
  and (exists(select 1 from private.course_stewards where course_id=c and user_id=a and active) or private.course_actor_has_permission(a,'courses.manage'));
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'caption',caption,'purpose',purpose,'createdAt',created_at,'width',width,'height',height) order by position,id),'[]') into items
  from private.course_operator_images where course_id=c and status='ready' and position is not null;
 select version into v from private.course_operator_image_sets where course_id=c;
 return jsonb_build_object('items',items,'version',coalesce(v,0),'canManage',coalesce(editable,false));
end $$;
revoke all on function public.course_operator_images(text) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_images(text) to anon,authenticated;

create function public.course_operator_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_purpose text,p_mime text,p_bytes integer,p_hash text,p_width integer,p_height integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; r private.course_operator_images%rowtype;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception '서버 전용 처리입니다.' using errcode='42501';end if;
 c:=private.course_operator_assert(p_actor,p_course_key);
 if p_request_id is null or p_purpose is null or p_purpose not in ('photo','document') or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_bytes is null or p_bytes not between 1 and 4000000 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_width is null or p_height is null or least(p_width,p_height)<1 or greatest(p_width,p_height)>(case when p_purpose='document' then 2560 else 800 end) then raise exception '사진 입력을 확인해 주세요.' using errcode='22023';end if;
 select * into r from private.course_operator_images where id=p_request_id for update;
 if found then
  if r.course_id<>c or r.owner_id<>p_actor or r.purpose<>p_purpose or r.mime_type<>p_mime or r.byte_size<>p_bytes or r.content_hash<>p_hash or r.width<>p_width or r.height<>p_height or r.status='removed' then raise exception '같은 요청번호의 파일 정보를 확인해 주세요.' using errcode='22023';end if;
 else
  if (select count(*) from private.course_operator_images where course_id=c and status in ('pending','uploaded'))>=8 then raise exception '미저장 이미지가 최대 8장입니다. 이전 작업을 완료하거나 취소해 주세요.' using errcode='22023';end if;
  insert into private.course_operator_images(id,course_id,owner_id,purpose,mime_type,byte_size,content_hash,width,height)
   values(p_request_id,c,p_actor,p_purpose,p_mime,p_bytes,p_hash,p_width,p_height) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'uploaded',r.status in ('uploaded','ready'));
end $$;
revoke all on function public.course_operator_image_prepare(uuid,text,uuid,text,text,integer,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_image_prepare(uuid,text,uuid,text,text,integer,text,integer,integer) to service_role;

create function public.course_operator_image_finish(p_actor uuid,p_course_key text,p_id uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception '서버 전용 처리입니다.' using errcode='42501';end if;
 c:=private.course_operator_assert(p_actor,p_course_key);
 update private.course_operator_images set status='uploaded' where id=p_id and course_id=c and owner_id=p_actor and content_hash=p_hash and status in ('pending','uploaded');
 if not found then raise exception '사진 저장 상태를 확인해 주세요.' using errcode='22023';end if;
end $$;
revoke all on function public.course_operator_image_finish(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_image_finish(uuid,text,uuid,text) to service_role;

create function public.course_operator_images_save(p_course_key text,p_version integer,p_request_id uuid,p_images jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); c uuid; v integer; ids uuid[]; entry jsonb; i integer:=0; result jsonb; removed jsonb;
begin
 c:=private.course_operator_assert(a,p_course_key);
 if p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)>8 then raise exception '이미지는 최대 8장까지 저장할 수 있습니다.' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_images) loop
  if jsonb_typeof(entry)<>'object' or not(entry ? 'id') or jsonb_typeof(entry->'id')<>'string' or exists(select 1 from jsonb_object_keys(entry) k where k not in ('id','caption'))
   or (entry ? 'caption' and jsonb_typeof(entry->'caption')<>'string') or char_length(coalesce(entry->>'caption',''))>180 then raise exception '이미지 설명을 확인해 주세요.' using errcode='22023';end if;
 end loop;
 select coalesce(array_agg((value->>'id')::uuid),'{}') into ids from jsonb_array_elements(p_images);
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception '중복 이미지를 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.operator_images_save',jsonb_build_object('course',c,'version',p_version,'images',p_images));
 if result is not null then return result;end if;
 insert into private.course_operator_image_sets(course_id) values(c) on conflict do nothing;
 select version into v from private.course_operator_image_sets where course_id=c for update;
 if p_version is distinct from v then raise exception '내용이 변경되었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='40001';end if;
 if (select count(*) from private.course_operator_images where id=any(ids) and course_id=c and (status='ready' or status='uploaded' and owner_id=a))<>cardinality(ids) then raise exception '이 구장의 저장 완료 이미지만 선택해 주세요.' using errcode='42501';end if;
 select coalesce(jsonb_agg(id),'[]') into removed from private.course_operator_images where course_id=c and status='ready' and not(id=any(ids));
 update private.course_operator_images set status='removed',position=null where course_id=c and status='ready' and not(id=any(ids));
 update private.course_operator_images set position=null where course_id=c and id=any(ids);
 for entry in select value from jsonb_array_elements(p_images) loop
  update private.course_operator_images set status='ready',position=i,caption=btrim(coalesce(entry->>'caption','')) where id=(entry->>'id')::uuid and course_id=c;
  i:=i+1;
 end loop;
 update private.course_operator_image_sets set version=v+1 where course_id=c;
 result:=jsonb_build_object('version',v+1,'removed',removed);
 perform private.course_complete_request(a,p_request_id,result);return result;
end $$;
revoke all on function public.course_operator_images_save(text,integer,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_images_save(text,integer,uuid,jsonb) to authenticated;

create function public.course_operator_images_discard(p_course_key text,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();c uuid; removed jsonb;
begin
 c:=private.course_operator_assert(a,p_course_key);
 if p_ids is null or cardinality(p_ids)>8 then raise exception '이미지 선택을 확인해 주세요.' using errcode='22023';end if;
 if exists(select 1 from private.course_operator_images where id=any(p_ids) and (course_id<>c or owner_id<>a or status='ready')) then raise exception '본인의 미저장 이미지만 취소할 수 있습니다.' using errcode='42501';end if;
 with r as(update private.course_operator_images set status='removed',position=null where id=any(p_ids) and course_id=c and owner_id=a and status in ('pending','uploaded','removed') returning id)
  select coalesce(jsonb_agg(id),'[]') into removed from r;
 return jsonb_build_object('removed',removed);
end $$;
revoke all on function public.course_operator_images_discard(text,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_images_discard(text,uuid[]) to authenticated;

create function public.course_operator_image_read(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'mime',i.mime_type) from private.course_operator_images i join public.courses c on c.id=i.course_id
 where i.id=p_id and i.status='ready' and i.position is not null and c.course_status='active'
$$;
revoke all on function public.course_operator_image_read(uuid) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_image_read(uuid) to anon,authenticated;
comment on table private.course_operator_images is 'Explicit active course-steward / existing courses.manage scope. No broadcast, applicant, member-photo or HOF certification permissions granted.';
notify pgrst,'reload schema';
commit;
