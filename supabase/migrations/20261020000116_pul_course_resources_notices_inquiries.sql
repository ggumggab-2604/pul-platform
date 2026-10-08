-- Course resources, public notices and private inquiries. No account/course seeds.
-- Existing 00115 and earlier files remain immutable. Local lineage checked at 116/00115.
begin;
create table private.course_resources (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id), author_id uuid not null references public.user_accounts(id),
 kind text not null check(kind in ('video','yardage')), title text not null check(char_length(title) between 2 and 120), scope text not null check(char_length(scope) between 1 and 100),
 description text not null default '' check(char_length(description)<=3000), video_url text, reference_date text check(char_length(reference_date)<=100), source text check(char_length(source)<=300),
 status text not null default 'published' check(status in ('published','hidden','deleted')), representative boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index course_resources_public_idx on private.course_resources(course_id,kind,created_at desc,id desc) where status='published';
create table private.course_resource_images (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id), owner_id uuid not null references public.user_accounts(id),
 request_id uuid not null, resource_id uuid references private.course_resources(id), position integer, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 byte_size integer not null check(byte_size between 1 and 8388608), content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'), ready boolean not null default false,
 created_at timestamptz not null default now(), unique(owner_id,request_id)
);
create index course_resource_images_parent_idx on private.course_resource_images(resource_id,position);
create table private.course_public_notices (
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),title text not null default '',body text not null default '',
 status text not null default 'draft' check(status in ('draft','published','hidden')),version integer not null default 1,published_at timestamptz,
 pending_input jsonb,submitted_by uuid references public.user_accounts(id), updated_at timestamptz not null default now()
);
create index course_public_notices_public_idx on private.course_public_notices(course_id,published_at desc,id desc) where status='published';
create table private.course_inquiry_recipients(course_id uuid primary key references public.courses(id),user_id uuid references public.user_accounts(id),version integer not null default 1,updated_at timestamptz not null default now());
create table private.course_inquiry_contexts(message_id uuid primary key references public.messaging_messages(id),course_id uuid references public.courses(id),course_name text not null);
create table private.course_notice_deliveries(notice_id uuid not null references private.course_public_notices(id),version integer not null,message_id uuid not null references public.messaging_messages(id),title text not null,body text not null,primary key(notice_id,version));
alter table public.events add column occurrence_status text not null default 'scheduled' check(occurrence_status in ('scheduled','cancelled'));
comment on column public.events.occurrence_status is 'Event cancellation is independent of registration_status. Null start excluded; null end is a single start-date event.';
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('course-resources','course-resources',false,8388608,array['image/jpeg','image/png','image/webp']);
-- No direct Storage policies: only the existing trusted-server upload pattern and gated proxy reads.
alter table private.course_resources enable row level security; alter table private.course_resources force row level security; revoke all on private.course_resources from public,anon,authenticated,service_role;
alter table private.course_resource_images enable row level security; alter table private.course_resource_images force row level security; revoke all on private.course_resource_images from public,anon,authenticated,service_role;
alter table private.course_public_notices enable row level security; alter table private.course_public_notices force row level security; revoke all on private.course_public_notices from public,anon,authenticated,service_role;
alter table private.course_inquiry_recipients enable row level security; alter table private.course_inquiry_recipients force row level security; revoke all on private.course_inquiry_recipients from public,anon,authenticated,service_role;
alter table private.course_inquiry_contexts enable row level security; alter table private.course_inquiry_contexts force row level security; revoke all on private.course_inquiry_contexts from public,anon,authenticated,service_role;
alter table private.course_notice_deliveries enable row level security; alter table private.course_notice_deliveries force row level security; revoke all on private.course_notice_deliveries from public,anon,authenticated,service_role;

create function private.course_content_youtube(p_url text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_url ~ '^https?://(www\.|m\.)?youtube\.com/(watch\?([^#]*&)?v=[A-Za-z0-9_-]{11}(&[^#]*)?|shorts/[A-Za-z0-9_-]{11}([/?#].*)?|live/[A-Za-z0-9_-]{11}([/?#].*)?)$' or p_url ~ '^https?://youtu\.be/[A-Za-z0-9_-]{11}([/?#].*)?$',false)
$$;
create function private.course_content_resource_json(r private.course_resources) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'course_id',r.course_id,'kind',r.kind,'title',r.title,'scope',r.scope,'description',r.description,'video_url',r.video_url,'reference_date',r.reference_date,'source',r.source,'representative',r.representative,'version',r.version,'created_at',r.created_at,'author',private.messaging_display_name(r.author_id),'can_edit',r.author_id=auth.uid(),'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position) order by i.position) from private.course_resource_images i where i.resource_id=r.id and i.ready),'[]'::jsonb))
$$;
create function private.course_content_list(p_course_key text,p_kind text default null,p_limit integer default 12,p_offset integer default 0,p_featured boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; items jsonb; total integer;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active'; if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
 if p_limit not between 1 and 24 or p_offset<0 or p_kind is not null and p_kind not in ('video','yardage') then raise exception '자료 조회 조건을 확인해 주세요.'; end if;
 select count(*) into total from private.course_resources r where r.course_id=c.id and r.status='published' and (p_kind is null or r.kind=p_kind);
 select coalesce(jsonb_agg(private.course_content_resource_json(r) order by (p_featured and c.course_type='field' and r.representative) desc,r.created_at desc,r.id desc),'[]') into items from (select * from private.course_resources where course_id=c.id and status='published' and (p_kind is null or kind=p_kind) order by (p_featured and c.course_type='field' and representative) desc,created_at desc,id desc limit p_limit offset p_offset) r;
 return jsonb_build_object('items',items,'total',total,'limit',p_limit,'offset',p_offset);
end $$;
create function private.course_content_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.course_resources%rowtype; c public.courses%rowtype;
begin
 select * into r from private.course_resources where id=p_id and status='published';select * into c from public.courses where id=r.course_id and course_status='active';
 if c.id is null then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 return private.course_content_resource_json(r)||jsonb_build_object('course_key',c.course_key,'course_name',c.name,'course_type',c.course_type,'can_manage',private.course_actor_has_permission(auth.uid(),'courses.manage'));
end $$;
create function private.course_content_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant(); c public.courses%rowtype; r private.course_resources%rowtype; manager boolean; result jsonb; ids uuid[]; k text; url text;
begin
 if not private.messaging_account_available(a) then raise exception '정상 활동 회원만 등록할 수 있습니다.' using errcode='42501';end if;
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');
 if p_action not in ('save','delete','represent','hide') then raise exception '자료 작업을 확인해 주세요.';end if;
 if p_id is not null then
 select * into r from private.course_resources where id=p_id and course_id=c.id for update;
 if not found then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action in ('save','delete') and r.author_id<>a or p_action in ('represent','hide') and not manager then raise exception '자료 관리 권한이 없습니다.' using errcode='42501';end if;
 elsif p_action<>'save' then raise exception '자료를 확인해 주세요.';end if;
 result:=private.course_claim_request(a,p_request_id,'course.resource_'||p_action,jsonb_build_object('course',c.id,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if r.id is not null and (r.version<>p_version or r.status<>'published') then raise exception '자료가 변경되었거나 공개되지 않았습니다. 새로고침해 주세요.' using errcode='40001';end if;
 if p_action='save' then
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) x where x not in ('kind','title','scope','description','video_url','reference_date','source','images')) then raise exception '자료 입력 항목을 확인해 주세요.';end if;
 k:=p_input->>'kind';url:=nullif(btrim(p_input->>'video_url'),'');
 if k not in ('video','yardage') or k is null or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'scope',''))) not between 1 and 100 or char_length(coalesce(p_input->>'description',''))>3000 or char_length(coalesce(p_input->>'reference_date',''))>100 or char_length(coalesce(p_input->>'source',''))>300 then raise exception '자료 제목·분류·설명을 확인해 주세요.';end if;
 if c.course_type='screen' and (k<>'video' or not private.course_content_youtube(url)) then raise exception '스크린은 유튜브 동영상 링크만 등록할 수 있습니다.';end if;
 if k='video' and (url is null or char_length(url)>1000 or url !~ '^https?://[^/@[:space:]]+[^[:space:]]*$') then raise exception '영상 링크를 확인해 주세요.';end if;
 if k='yardage' and url is not null then raise exception '야디지북에는 이미지 자료를 선택해 주세요.';end if;
 if jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '이미지 목록을 확인해 주세요.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
 if cardinality(ids)>8 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or k='yardage' and cardinality(ids)=0 or k='video' and cardinality(ids)>0 then raise exception '야디지북은 중복 없이 1~8장을 선택해 주세요.';end if;
 perform id from private.course_resource_images where id=any(ids) order by id for update;
 if (select count(*) from private.course_resource_images i where i.id=any(ids) and i.owner_id=a and i.course_id=c.id and i.ready and (i.resource_id is null or i.resource_id=r.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 이미지만 연결할 수 있습니다.' using errcode='42501';end if;
 if r.id is null then insert into private.course_resources(course_id,author_id,kind,title,scope,description,video_url,reference_date,source) values(c.id,a,k,btrim(p_input->>'title'),btrim(p_input->>'scope'),coalesce(p_input->>'description',''),url,nullif(btrim(p_input->>'reference_date'),''),nullif(btrim(p_input->>'source'),'')) returning * into r;
 else update private.course_resources set kind=k,title=btrim(p_input->>'title'),scope=btrim(p_input->>'scope'),description=coalesce(p_input->>'description',''),video_url=url,reference_date=nullif(btrim(p_input->>'reference_date'),''),source=nullif(btrim(p_input->>'source'),''),version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 update private.course_resource_images set resource_id=null,position=null where resource_id=r.id and not(id=any(ids));
 update private.course_resource_images set resource_id=r.id,position=array_position(ids,id) where id=any(ids);
 elsif p_action='represent' then
 if c.course_type<>'field' then raise exception '스크린에는 대표 자료 기능이 없습니다.';end if;
 if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '대표 상태를 확인해 주세요.';end if;
 update private.course_resources set representative=(p_input->>'enabled')::boolean,version=version+1,updated_at=now() where id=r.id returning * into r;
 else update private.course_resources set status=case when p_action='delete' then 'deleted' else 'hidden' end,representative=false,version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 result:=jsonb_build_object('id',r.id,'version',r.version,'status',r.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;
create function private.course_content_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; i private.course_resource_images%rowtype;
begin
 if not private.messaging_account_available(p_actor) then raise exception '정상 회원 인증이 필요합니다.' using errcode='42501';end if;
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';if c is null then raise exception '이미지를 등록할 야외 구장을 확인해 주세요.';end if;
 insert into private.course_resource_images(course_id,owner_id,request_id,mime_type,byte_size,content_hash) values(c,p_actor,p_request_id,p_mime,p_bytes,p_hash) on conflict(owner_id,request_id) do nothing;
 select * into i from private.course_resource_images where owner_id=p_actor and request_id=p_request_id for update;
 if i.course_id<>c or i.mime_type<>p_mime or i.byte_size<>p_bytes or i.content_hash<>p_hash then raise exception '동일한 업로드 요청 내용이 다릅니다.';end if;
 return jsonb_build_object('id',i.id,'ready',i.ready);
end $$;
create function private.course_content_image_finish(p_actor uuid,p_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.messaging_account_available(p_actor) then raise exception '정상 회원 인증이 필요합니다.' using errcode='42501';end if;
 update private.course_resource_images set ready=true where id=p_id and owner_id=p_actor and content_hash=p_hash;
 if not found then raise exception '업로드 소유자를 확인해 주세요.' using errcode='42501';end if;
end $$;
create function private.course_content_image_read(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'mime_type',i.mime_type) from private.course_resource_images i join public.courses c on c.id=i.course_id
 where i.id=p_id and i.ready and c.course_status='active' and (i.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) or exists(select 1 from private.course_resources r where r.id=i.resource_id and r.status='published'))
$$;

alter table private.course_public_notices add column published_version integer not null default 0;
create function private.course_content_notices(p_course_key text,p_limit integer default 20,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; items jsonb; total integer;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen';if c is null then raise exception '스크린 구장을 찾을 수 없습니다.';end if;
 if p_limit not between 1 and 30 or p_offset<0 then raise exception '페이지를 확인해 주세요.';end if;
 select count(*) into total from private.course_public_notices where course_id=c and status='published';
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'version',n.published_version,'published_at',n.published_at) order by n.published_at desc,n.id desc),'[]') into items from (select * from private.course_public_notices where course_id=c and status='published' order by published_at desc,id desc limit p_limit offset p_offset)n;
 return jsonb_build_object('items',items,'total',total);
end $$;
create function private.course_content_workspace(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant(); c uuid; manager boolean; steward boolean; notices jsonb; candidates jsonb; recipient jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen';if c is null then raise exception '스크린 구장을 찾을 수 없습니다.';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');steward:=exists(select 1 from private.course_stewards where course_id=c and user_id=a and active);
 if not(manager or steward) then raise exception '구장 운영 권한이 없습니다.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(n) order by updated_at desc,id desc),'[]') into notices from (select id,title,body,status,version,published_version,published_at,pending_input,updated_at from private.course_public_notices where course_id=c order by updated_at desc,id desc limit 50)n;
 if manager then
 select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'name',private.messaging_display_name(s.user_id))),'[]') into candidates from private.course_stewards s where s.course_id=c and s.active and private.messaging_account_available(s.user_id);
 select jsonb_build_object('user_id',user_id,'version',version) into recipient from private.course_inquiry_recipients where course_id=c;
 end if;
 return jsonb_build_object('manager',manager,'notices',notices,'candidates',coalesce(candidates,'[]'),'recipient',recipient);
end $$;
create function private.course_content_notice_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant();c uuid;manager boolean;steward boolean;n private.course_public_notices%rowtype;result jsonb;draft jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');
 perform user_id from private.course_stewards where course_id=c and user_id=a and active for share;steward:=found;
 if not(manager or steward) or p_action not in ('submit','publish','approve','reject','hide') or p_action<>'submit' and not manager then raise exception '공지 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_id is not null then select * into n from private.course_public_notices where id=p_id and course_id=c for update;if not found then raise exception '공지를 찾을 수 없습니다.';end if;end if;
 result:=private.course_claim_request(a,p_request_id,'course.notice_'||p_action,jsonb_build_object('course',c,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if n.id is not null and n.version<>p_version then raise exception '공지가 변경되었습니다. 새로고침해 주세요.' using errcode='40001';end if;
 if p_action in ('submit','publish') then
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input)x where x not in ('title','body')) or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'body',''))) not between 2 and 1800 then raise exception '제목 2~120자·내용 2~1800자를 입력해 주세요.';end if;
 draft:=jsonb_build_object('title',btrim(p_input->>'title'),'body',btrim(p_input->>'body'));
 if n.id is null then insert into private.course_public_notices(course_id) values(c) returning * into n;end if;
 if p_action='submit' then update private.course_public_notices set pending_input=draft,submitted_by=a,version=version+1,updated_at=now() where id=n.id returning * into n;
 else update private.course_public_notices set title=draft->>'title',body=draft->>'body',status='published',published_at=coalesce(published_at,now()),pending_input=null,submitted_by=null,published_version=version+1,version=version+1,updated_at=now() where id=n.id returning * into n;end if;
 elsif p_action='approve' then
 if n.pending_input is null then raise exception '검토할 제출본이 없습니다.';end if;
 perform user_id from private.course_stewards where course_id=c and user_id=n.submitted_by and active for share;
 if not found or not private.messaging_account_available(n.submitted_by) then raise exception '제출자의 현재 담당 권한을 확인해 주세요.' using errcode='42501';end if;
 update private.course_public_notices set title=pending_input->>'title',body=pending_input->>'body',status='published',published_at=coalesce(published_at,now()),pending_input=null,submitted_by=null,published_version=version+1,version=version+1,updated_at=now() where id=n.id returning * into n;
 elsif p_action='reject' then update private.course_public_notices set pending_input=null,submitted_by=null,version=version+1,updated_at=now() where id=n.id returning * into n;
 else update private.course_public_notices set status='hidden',version=version+1,updated_at=now() where id=n.id returning * into n;end if;
 if n.id is null then raise exception '공지를 확인해 주세요.';end if;
 result:=jsonb_build_object('id',n.id,'version',n.version,'status',n.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;
create function private.course_content_notice_send(p_id uuid,p_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n private.course_public_notices%rowtype;d private.course_notice_deliveries%rowtype;result jsonb;
begin
 select * into n from private.course_public_notices where id=p_id for update;if not found then raise exception '공지를 찾을 수 없습니다.';end if;
 perform private.messaging_lock_course_broadcaster(n.course_id);
 if n.status<>'published' or n.published_version<>p_version then raise exception '현재 공개 공지 버전을 확인해 주세요.' using errcode='40001';end if;
 select * into d from private.course_notice_deliveries where notice_id=n.id and version=n.published_version;
 if found then select jsonb_build_object('id',id,'created_at',created_at,'recipient_count',broadcast_recipient_count) into result from public.messaging_messages where id=d.message_id;return result;end if;
 result:=public.send_course_broadcast(n.course_id,'[운영공지] '||n.title||E'\n'||n.body,p_request_id);
 insert into private.course_notice_deliveries(notice_id,version,message_id,title,body) values(n.id,n.published_version,(result->>'id')::uuid,n.title,n.body);
 return result;
end $$;
create function private.course_content_set_recipient(p_course_key text,p_user_id uuid,p_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;c uuid;r private.course_inquiry_recipients%rowtype;result jsonb;
begin
 select actor_id into a from private.require_course_manager();select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
 perform pg_advisory_xact_lock(813614,hashtext(c::text));
 select * into r from private.course_inquiry_recipients where course_id=c for update;
 result:=private.course_claim_request(a,p_request_id,'course.inquiry_recipient',jsonb_build_object('course',c,'user',p_user_id,'version',p_version));if result is not null then return result;end if;
 if coalesce(r.version,0)<>p_version then raise exception '문의 담당자가 변경되었습니다. 새로고침해 주세요.' using errcode='40001';end if;
 if p_user_id is not null then
 perform user_id from private.course_stewards where course_id=c and user_id=p_user_id and active for share;
 if not found or not private.messaging_account_available(p_user_id) then raise exception '활성 상태인 확인된 구장 담당자를 선택해 주세요.' using errcode='42501';end if;end if;
 insert into private.course_inquiry_recipients(course_id,user_id) values(c,p_user_id) on conflict(course_id) do update set user_id=excluded.user_id,version=course_inquiry_recipients.version+1,updated_at=now() returning * into r;
 result:=jsonb_build_object('version',r.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;
create function private.course_content_send_inquiry(p_course_key text,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c public.courses%rowtype;r private.course_inquiry_recipients%rowtype;m public.messaging_messages%rowtype;fp text;result jsonb;
begin
 perform private.messaging_assert_read_committed();select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen' for share;if not found then raise exception '문의할 구장을 확인해 주세요.';end if;
 perform pg_advisory_xact_lock(1297303345,hashtext(a::text));
 fp:=encode(sha256(convert_to(jsonb_build_array('course_inquiry',c.id,private.messaging_normalize(p_body))::text,'UTF8')),'hex');
 select * into m from public.messaging_messages where sender_user_id=a and request_id=p_request_id;
 if found then if m.request_fingerprint<>fp then raise exception 'messaging_replay_conflict' using errcode='22023';end if;return jsonb_build_object('id',m.id,'created_at',m.created_at);end if;
 select * into r from private.course_inquiry_recipients where course_id=c.id for share;
 perform user_id from private.course_stewards where course_id=c.id and user_id=r.user_id and active for share;
 if r.user_id is null or not found or not private.messaging_account_available(r.user_id) then raise exception '문의 담당자가 연결되지 않았습니다.' using errcode='P0002';end if;
 result:=private.messaging_create(r.user_id,null,p_body,p_request_id);
 update public.messaging_messages set request_fingerprint=fp where id=(result->>'id')::uuid;
 insert into private.course_inquiry_contexts(message_id,course_id,course_name) values((result->>'id')::uuid,c.id,c.name);
 return result;
end $$;
create function private.course_content_inherit_inquiry() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into private.course_inquiry_contexts(message_id,course_id,course_name) select new.id,course_id,course_name from private.course_inquiry_contexts where message_id=new.reply_to_message_id;return new;end $$;
create trigger course_inquiry_reply_context after insert on public.messaging_messages for each row when(new.reply_to_message_id is not null) execute function private.course_content_inherit_inquiry();
create function private.course_content_message_context(p_message_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.get_messaging_message(p_message_id,false);return (select jsonb_build_object('course_name',course_name,'course_key',(select course_key from public.courses where id=course_id and course_status='active')) from private.course_inquiry_contexts where message_id=p_message_id);end $$;

create function private.course_content_counts(p_course_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('video',(select count(*) from private.course_resources where course_id=p_course_id and status='published' and kind='video'),'yardage',(select count(*) from private.course_resources where course_id=p_course_id and status='published' and kind='yardage'),'event',(select count(*) from public.events where related_course_id=p_course_id and publication_status='published' and occurrence_status='scheduled' and start_date is not null and coalesce(end_date,start_date)>=(now() at time zone 'Asia/Seoul')::date))
$$;
create function private.course_content_overview(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; ev jsonb; can_send boolean:=false;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';if not found then raise exception '구장을 찾을 수 없습니다.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',e.event_key,'title',e.title,'start',e.start_date,'end',e.end_date,'note',e.schedule_note,'registration',e.registration_status,'phase',case when occurrence_status='cancelled' then 'cancelled' when start_date is null then 'unknown' when coalesce(end_date,start_date)<(now() at time zone 'Asia/Seoul')::date then 'past' when start_date>(now() at time zone 'Asia/Seoul')::date then 'upcoming' else 'ongoing' end) order by e.start_date desc nulls last,e.event_key),'[]') into ev from (select * from public.events where related_course_id=c.id and publication_status='published' order by start_date desc nulls last,event_key limit 50)e;
 if auth.uid() is not null then begin perform private.messaging_assert_course_broadcaster(c.id);can_send:=true;exception when others then can_send:=false;end;end if;
 return jsonb_build_object('counts',private.course_content_counts(c.id),'resources',private.course_content_list(p_course_key,null,6,0,true),'events',ev,'notices',case when c.course_type='screen' then private.course_content_notices(p_course_key,1,0) else jsonb_build_object('items','[]'::jsonb,'total',0) end,'contact_connected',exists(select 1 from private.course_inquiry_recipients r join private.course_stewards s on s.course_id=r.course_id and s.user_id=r.user_id and s.active where r.course_id=c.id and private.messaging_account_available(r.user_id)),'manager',private.course_actor_has_permission(auth.uid(),'courses.manage'),'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=auth.uid() and active),'can_broadcast',can_send);
end $$;
create function private.course_content_event_occurrence(p_event_key text,p_status text default null,p_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant(); e public.events%rowtype;
begin
 if not private.event_actor_has_management_permission(a) then raise exception '대회 관리 권한이 없습니다.' using errcode='42501';end if;
 select * into e from public.events where event_key=p_event_key for update;if not found then raise exception '대회를 찾을 수 없습니다.';end if;
 if p_status is not null then
 if p_status not in ('scheduled','cancelled') or p_version is distinct from e.version then raise exception '현재 대회 상태를 확인해 주세요.' using errcode='40001';end if;
 update public.events set occurrence_status=p_status,version=version+1,updated_at=now(),updated_by=a where id=e.id returning * into e;
 end if;
 return jsonb_build_object('status',e.occurrence_status,'version',e.version);
end $$;
create function private.course_content_directory(
  p_province text default null,
  p_district text default null,
  p_keyword text default null,
  p_course_type text default null,
  p_region text default null,
  p_operation_code text default null,
  p_holes text default null,
  p_feature_codes text[] default null,
  p_has_event boolean default false,
  p_has_video boolean default false,
  p_has_yardage boolean default false,
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
  v_total integer;
  v_items jsonb;
begin
  if p_province is not null and p_province not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') then raise exception '시·도를 확인해 주세요.'; end if;
  if p_district is not null and (p_province is null or char_length(p_district)>40 or p_district !~ '^[가-힣]+[시군구]( [가-힣]+구)?$') then raise exception '시·군·구를 확인해 주세요.'; end if;
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이내로 입력해 주세요.';
  end if;
  if p_course_type is not null and p_course_type not in ('field', 'screen') then
    raise exception '골프장 유형을 확인해 주세요.';
  end if;
  if p_region is not null
     and p_region not in ('서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역을 확인해 주세요.';
  end if;
  if p_operation_code is not null
     and p_operation_code not in ('reservation', 'phone', 'walkIn') then
    raise exception '운영 방식을 확인해 주세요.';
  end if;
  if p_course_type = 'field' and p_holes is not null and p_holes not in ('9', '18', '27_plus') then
    raise exception '홀 수 조건을 확인해 주세요.';
  end if;
  if p_feature_codes is not null
     and not p_feature_codes <@ array[
       'club_available',
       'event_history',
       'lesson_available',
       'equipment_rental',
       'parking'
     ]::text[] then
    raise exception '부가 정보 조건을 확인해 주세요.';
  end if;
  if p_limit is null or p_offset is null or p_limit not between 1 and 50 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  with matching as (
    select course.*
    from public.courses as course
    where course.course_status = 'active'
      and (not p_has_video or exists(select 1 from private.course_resources r where r.course_id=course.id and r.status='published' and r.kind='video'))
      and (not p_has_yardage or p_course_type='screen' or exists(select 1 from private.course_resources r where r.course_id=course.id and r.status='published' and r.kind='yardage'))
      and (not p_has_event or exists(select 1 from public.events e where e.related_course_id=course.id and e.publication_status='published' and e.occurrence_status='scheduled' and e.start_date is not null and coalesce(e.end_date,e.start_date)>=(now() at time zone 'Asia/Seoul')::date))
      and (p_course_type is null or course.course_type = p_course_type)
      and (p_province is null or private.course_address_region(course.address)->>'province' = p_province)
      and (p_district is null or private.course_address_region(course.address)->>'district' = p_district)
      and (p_region is null or course.region = p_region)
      and (p_operation_code is null or course.operation_code = p_operation_code)
      and (
        p_course_type is distinct from 'field' or p_holes is null
        or (p_holes = '9' and course.holes = 9)
        or (p_holes = '18' and course.holes = 18)
        or (p_holes = '27_plus' and course.holes >= 27)
      )
      and (
        p_feature_codes is null
        or (
          (not ('parking' = any(p_feature_codes)) or course.parking_available is true)
          and (
            array_remove(p_feature_codes, 'parking') = '{}'::text[]
            or course.feature_codes @> array_remove(p_feature_codes, 'parking')
          )
        )
      )
      and (
        v_keyword is null
        or pg_catalog.strpos(
          pg_catalog.lower(
            course.name || ' ' || course.region || ' ' || course.city || ' ' || course.address
          ),
          pg_catalog.lower(v_keyword)
        ) > 0
      )
  ), page as (
    select matching.*
    from matching
    order by matching.name, matching.course_key
    limit p_limit
    offset p_offset
  )
  select
    (select count(*)::integer from matching),
    coalesce(
      (
        select jsonb_agg(
          private.public_course_json(page)||jsonb_build_object('resource_counts',private.course_content_counts(page.id))
          order by page.name, page.course_key
        )
        from page
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;


revoke all on function private.course_content_list(text,text,integer,integer,boolean) from public,anon,authenticated,service_role;grant execute on function private.course_content_list(text,text,integer,integer,boolean) to anon,authenticated;
create function public.course_content_list(p_course_key text,p_kind text default null,p_limit integer default 12,p_offset integer default 0,p_featured boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_list(p_course_key,p_kind,p_limit,p_offset,p_featured)$$;
revoke all on function public.course_content_list(text,text,integer,integer,boolean) from public,anon,authenticated,service_role;grant execute on function public.course_content_list(text,text,integer,integer,boolean) to anon,authenticated;

revoke all on function private.course_content_detail(uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_detail(uuid) to anon,authenticated;
create function public.course_content_detail(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_detail(p_id)$$;
revoke all on function public.course_content_detail(uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_detail(uuid) to anon,authenticated;

revoke all on function private.course_content_overview(text) from public,anon,authenticated,service_role;grant execute on function private.course_content_overview(text) to anon,authenticated;
create function public.course_content_overview(p_course_key text) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_overview(p_course_key)$$;
revoke all on function public.course_content_overview(text) from public,anon,authenticated,service_role;grant execute on function public.course_content_overview(text) to anon,authenticated;

revoke all on function private.course_content_notices(text,integer,integer) from public,anon,authenticated,service_role;grant execute on function private.course_content_notices(text,integer,integer) to anon,authenticated;
create function public.course_content_notices(p_course_key text,p_limit integer default 20,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_notices(p_course_key,p_limit,p_offset)$$;
revoke all on function public.course_content_notices(text,integer,integer) from public,anon,authenticated,service_role;grant execute on function public.course_content_notices(text,integer,integer) to anon,authenticated;

revoke all on function private.course_content_image_read(uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_image_read(uuid) to anon,authenticated;
create function public.course_content_image_read(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_image_read(p_id)$$;
revoke all on function public.course_content_image_read(uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_image_read(uuid) to anon,authenticated;

revoke all on function private.course_content_mutate(text,text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function private.course_content_mutate(text,text,uuid,integer,uuid,jsonb) to authenticated;
create function public.course_content_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.course_content_mutate(p_course_key,p_action,p_id,p_version,p_request_id,p_input)$$;
revoke all on function public.course_content_mutate(text,text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function public.course_content_mutate(text,text,uuid,integer,uuid,jsonb) to authenticated;

revoke all on function private.course_content_workspace(text) from public,anon,authenticated,service_role;grant execute on function private.course_content_workspace(text) to authenticated;
create function public.course_content_workspace(p_course_key text) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_workspace(p_course_key)$$;
revoke all on function public.course_content_workspace(text) from public,anon,authenticated,service_role;grant execute on function public.course_content_workspace(text) to authenticated;

revoke all on function private.course_content_notice_mutate(text,text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function private.course_content_notice_mutate(text,text,uuid,integer,uuid,jsonb) to authenticated;
create function public.course_content_notice_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.course_content_notice_mutate(p_course_key,p_action,p_id,p_version,p_request_id,p_input)$$;
revoke all on function public.course_content_notice_mutate(text,text,uuid,integer,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function public.course_content_notice_mutate(text,text,uuid,integer,uuid,jsonb) to authenticated;

revoke all on function private.course_content_notice_send(uuid,integer,uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_notice_send(uuid,integer,uuid) to authenticated;
create function public.course_content_notice_send(p_id uuid,p_version integer,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_notice_send(p_id,p_version,p_request_id)$$;
revoke all on function public.course_content_notice_send(uuid,integer,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_notice_send(uuid,integer,uuid) to authenticated;

revoke all on function private.course_content_set_recipient(text,uuid,integer,uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_set_recipient(text,uuid,integer,uuid) to authenticated;
create function public.course_content_set_recipient(p_course_key text,p_user_id uuid,p_version integer,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_set_recipient(p_course_key,p_user_id,p_version,p_request_id)$$;
revoke all on function public.course_content_set_recipient(text,uuid,integer,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_set_recipient(text,uuid,integer,uuid) to authenticated;

revoke all on function private.course_content_send_inquiry(text,text,uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_send_inquiry(text,text,uuid) to authenticated;
create function public.course_content_send_inquiry(p_course_key text,p_body text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_send_inquiry(p_course_key,p_body,p_request_id)$$;
revoke all on function public.course_content_send_inquiry(text,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_send_inquiry(text,text,uuid) to authenticated;

revoke all on function private.course_content_message_context(uuid) from public,anon,authenticated,service_role;grant execute on function private.course_content_message_context(uuid) to authenticated;
create function public.course_content_message_context(p_message_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_message_context(p_message_id)$$;
revoke all on function public.course_content_message_context(uuid) from public,anon,authenticated,service_role;grant execute on function public.course_content_message_context(uuid) to authenticated;

revoke all on function private.course_content_image_prepare(uuid,text,uuid,text,integer,text) from public,anon,authenticated,service_role;grant execute on function private.course_content_image_prepare(uuid,text,uuid,text,integer,text) to service_role;
create function public.course_content_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_image_prepare(p_actor,p_course_key,p_request_id,p_mime,p_bytes,p_hash)$$;
revoke all on function public.course_content_image_prepare(uuid,text,uuid,text,integer,text) from public,anon,authenticated,service_role;grant execute on function public.course_content_image_prepare(uuid,text,uuid,text,integer,text) to service_role;

revoke all on function private.course_content_image_finish(uuid,uuid,text) from public,anon,authenticated,service_role;grant execute on function private.course_content_image_finish(uuid,uuid,text) to service_role;
create function public.course_content_image_finish(p_actor uuid,p_id uuid,p_hash text) returns void language sql security invoker set search_path='' as $$select private.course_content_image_finish(p_actor,p_id,p_hash)$$;
revoke all on function public.course_content_image_finish(uuid,uuid,text) from public,anon,authenticated,service_role;grant execute on function public.course_content_image_finish(uuid,uuid,text) to service_role;

revoke all on function private.course_content_event_occurrence(text,text,integer) from public,anon,authenticated,service_role;grant execute on function private.course_content_event_occurrence(text,text,integer) to authenticated;
create function public.course_content_event_occurrence(p_event_key text,p_status text default null,p_version integer default null) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_event_occurrence(p_event_key,p_status,p_version)$$;
revoke all on function public.course_content_event_occurrence(text,text,integer) from public,anon,authenticated,service_role;grant execute on function public.course_content_event_occurrence(text,text,integer) to authenticated;

revoke all on function private.course_content_directory(text,text,text,text,text,text,text,text[],boolean,boolean,boolean,integer,integer) from public,anon,authenticated,service_role;grant execute on function private.course_content_directory(text,text,text,text,text,text,text,text[],boolean,boolean,boolean,integer,integer) to anon,authenticated;
create function public.course_content_directory(p_province text default null,p_district text default null,p_keyword text default null,p_course_type text default null,p_region text default null,p_operation_code text default null,p_holes text default null,p_feature_codes text[] default null,p_has_event boolean default false,p_has_video boolean default false,p_has_yardage boolean default false,p_limit integer default 24,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.course_content_directory(p_province,p_district,p_keyword,p_course_type,p_region,p_operation_code,p_holes,p_feature_codes,p_has_event,p_has_video,p_has_yardage,p_limit,p_offset)$$;
revoke all on function public.course_content_directory(text,text,text,text,text,text,text,text[],boolean,boolean,boolean,integer,integer) from public,anon,authenticated,service_role;grant execute on function public.course_content_directory(text,text,text,text,text,text,text,text[],boolean,boolean,boolean,integer,integer) to anon,authenticated;
revoke all on function private.course_content_youtube(text) from public,anon,authenticated,service_role;
revoke all on function private.course_content_resource_json(private.course_resources) from public,anon,authenticated,service_role;
revoke all on function private.course_content_counts(uuid) from public,anon,authenticated,service_role;
revoke all on function private.course_content_inherit_inquiry() from public,anon,authenticated,service_role;
commit;
