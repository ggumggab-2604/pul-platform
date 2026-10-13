-- Local candidate only. No users, course grants or subscriptions seeded.
begin;
alter table public.courses
 add column operating_status text check(operating_status in ('open','closed')),
 add column closed_from date, add column closed_to date, add column closed_reason text,
 add column planned_closed_from date, add column planned_closed_to date, add column planned_closed_reason text;
comment on column public.courses.operating_status is 'Manually set venue state, not publication_status or computed current admission. No automatic transition.';
comment on column private.course_stewards.active is 'Current exact-course information/content authority. Revocation also revokes the same-course messaging grant.';

create function private.course_can_manage(p_course uuid,p_actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select p_actor is not null and exists(select 1 from public.user_accounts where id=p_actor and account_status='active')
 and (private.course_actor_has_permission(p_actor,'courses.manage') or exists(select 1 from private.course_stewards where course_id=p_course and user_id=p_actor and active))
$$;
create function private.course_require_scope(p_course uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant();
begin
 perform user_id from private.course_stewards where course_id=p_course and user_id=a and active for share;
 if not private.course_can_manage(p_course,a) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 return a;
end $$;
create function private.course_sync_steward_grant() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active then
  insert into public.course_messaging_operator_grants(course_id,user_id,granted_by) values(new.course_id,new.user_id,new.granted_by)
  on conflict(course_id,user_id) do update set revoked_at=null,granted_by=excluded.granted_by,granted_at=clock_timestamp();
 else update public.course_messaging_operator_grants set revoked_at=clock_timestamp() where course_id=new.course_id and user_id=new.user_id and revoked_at is null;end if;
 return new;
end $$;
create trigger course_steward_messaging_link after insert or update of active on private.course_stewards for each row execute function private.course_sync_steward_grant();
-- Existing assignments are not backfilled automatically. Execution additionally requires an active current relationship.
create or replace function private.messaging_assert_course_broadcaster(p_course_id uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();
begin
 if not exists(select 1 from public.courses c join public.course_messaging_operator_grants g on g.course_id=c.id
 where c.id=p_course_id and c.course_status='active' and g.user_id=a and g.revoked_at is null)
 or not private.course_can_manage(p_course_id,a) then raise exception 'course_notification_permission' using errcode='42501';end if;
 return a;
end $$;

create function private.course_state_json(c public.courses) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('operating_status',c.operating_status,'closed_from',c.closed_from,'closed_to',c.closed_to,'closed_reason',c.closed_reason,
 'planned_closed_from',c.planned_closed_from,'planned_closed_to',c.planned_closed_to,'planned_closed_reason',c.planned_closed_reason)
$$;
create function private.course_management_read(p_course_key text,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype; result jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active';
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 result:=private.course_state_json(c)||jsonb_build_object('can_manage',private.course_can_manage(c.id));
 if not p_manage then return result;end if;
 if not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 return result||jsonb_build_object('course',private.public_course_json(c),'updated_at',c.updated_at,
 'resources',coalesce((select jsonb_agg(private.course_content_resource_json(r)||jsonb_build_object('status',r.status) order by r.created_at desc) from private.course_resources r where r.course_id=c.id and r.status='published'),'[]'),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('media_key',media_key,'caption',caption,'version',version) order by created_at desc) from public.course_media where course_id=c.id and media_status='available'),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',id,'body',report_body,'status',report_status,'updated_at',updated_at) order by created_at desc) from public.course_information_reports where target_course_id=c.id),'[]'));
end $$;
create function private.course_management_save(p_course_key text,p_updated_at timestamptz,p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.courses%rowtype; a uuid; d jsonb; state jsonb; result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date; cf date;ct date;pf date;pt date;os text;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' for update;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c.id);
 if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.direct_information',jsonb_build_object('course',c.id,'base',p_updated_at,'input',p_input));if result is not null then return result;end if;
 if c.updated_at is distinct from p_updated_at then raise exception '다른 변경이 먼저 저장되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='40001';end if;
 d:=private.course_application_draft(p_input->'course');state:=p_input->'state';
 if d->>'reservation_url' ~ '^https://[^/]*@' or d->>'reservation_url' ~ '[[:space:]\\]' then raise exception '예약 링크는 인증정보 없는 HTTPS 주소를 확인해 주세요.' using errcode='22023';end if;
 if d->>'course_type' is distinct from c.course_type or d->>'region' is distinct from c.region or d->>'city' is distinct from c.city then raise exception '유형·지역 변경은 기존 PUL 관리에서 처리해 주세요.' using errcode='22023';end if;
 if state is null or jsonb_typeof(state)<>'object' or exists(select 1 from jsonb_object_keys(state) k where k not in ('operating_status','closed_from','closed_to','closed_reason','planned_closed_from','planned_closed_to','planned_closed_reason')) then raise exception '운영 상태를 확인해 주세요.' using errcode='22023';end if;
 os:=nullif(state->>'operating_status','');cf:=nullif(state->>'closed_from','')::date;ct:=nullif(state->>'closed_to','')::date;pf:=nullif(state->>'planned_closed_from','')::date;pt:=nullif(state->>'planned_closed_to','')::date;
 if os is not null and os not in ('open','closed') or (cf is null)<>(ct is null) or (pf is null)<>(pt is null) or cf>ct or pf>pt
 or cf is not null and (os is distinct from 'closed' or cf>today or ct<today)
 or pf is not null and pf<=today or char_length(coalesce(state->>'closed_reason',''))>500 or char_length(coalesce(state->>'planned_closed_reason',''))>500
 or pf is not null and char_length(btrim(coalesce(state->>'planned_closed_reason','')))<2 then raise exception '현재 상태와 휴장 기간·사유를 확인해 주세요. 예정 휴장은 미래 기간으로 입력합니다.' using errcode='22023';end if;
 update public.courses set name=d->>'name',address=d->>'address',holes=(d->>'holes')::smallint,bay_count=(d->>'bay_count')::integer,
 operating_hours=d->>'operating_hours',operation_code=d->>'operation_code',phone=d->>'phone',parking_available=(d->>'parking_available')::boolean,
 description=d->>'description',reservation_url=d->>'reservation_url',reservation_guide=d->>'reservation_guide',fee_guide=d->>'fee_guide',
 operating_status=os,closed_from=cf,closed_to=ct,closed_reason=nullif(btrim(state->>'closed_reason'),''),planned_closed_from=pf,planned_closed_to=pt,planned_closed_reason=nullif(btrim(state->>'planned_closed_reason'),''),updated_at=clock_timestamp() where id=c.id returning * into c;
 result:=jsonb_build_object('course_key',c.course_key,'updated_at',c.updated_at);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;

alter table public.course_discussion_posts add column title text check(title is null or char_length(title) between 2 and 120),
 add column category text not null default 'free' check(category in ('free','question','lost')),
 add column processing_status text check(processing_status in ('received','processing','done','unresolved','resolved')),
 add column version integer not null default 1,add column pinned boolean not null default false,
 add column pinned_by uuid references public.user_accounts(id),add column pinned_at timestamptz;
create index course_story_pinned_idx on public.course_discussion_posts(course_id,pinned_at desc,id) where pinned and post_status='published';
create table private.course_story_comments(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.course_discussion_posts(id),parent_id uuid references private.course_story_comments(id),author_id uuid not null references public.user_accounts(id),body text not null check(char_length(body) between 1 and 1000),hidden boolean not null default false,created_at timestamptz not null default now());
create index course_story_comments_parent_idx on private.course_story_comments(post_id,parent_id,created_at) where not hidden;
create table private.course_story_images(id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),post_id uuid references public.course_discussion_posts(id),owner_id uuid not null references public.user_accounts(id),request_id uuid not null,mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),byte_size integer not null check(byte_size between 1 and 4000000),content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),ready boolean not null default false,position integer,unique(owner_id,request_id));
create index course_story_images_parent_idx on private.course_story_images(post_id,position) where ready;
create table private.course_story_reports(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.course_discussion_posts(id),comment_id uuid references private.course_story_comments(id),reporter_id uuid not null references public.user_accounts(id),reason text not null check(char_length(reason) between 2 and 1000),resolved boolean not null default false,created_at timestamptz not null default now());
create index course_story_reports_post_idx on private.course_story_reports(post_id,created_at desc);
alter table private.course_story_comments enable row level security;alter table private.course_story_comments force row level security;
alter table private.course_story_images enable row level security;alter table private.course_story_images force row level security;
alter table private.course_story_reports enable row level security;alter table private.course_story_reports force row level security;
revoke all on private.course_story_comments,private.course_story_images,private.course_story_reports from public,anon,authenticated,service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('course-story-images','course-story-images',false,4000000,array['image/jpeg','image/png','image/webp']);
-- Course activity photos need the same fresh read gate. No file is moved or removed.
update storage.buckets set public=false where id='course-media';

create function private.course_story_json(p public.course_discussion_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()),'created_at',p.created_at,
 'category',p.category,'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_by',case when p.pinned then private.messaging_display_name(p.pinned_by) end,'pinned_at',p.pinned_at,
 'can_edit',p.author_user_id=auth.uid(),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$$;
create function private.course_story_read(p_course_key text,p_post_key text,p_category text,p_offset integer,p_preview boolean,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype;p public.course_discussion_posts%rowtype;items jsonb;total integer;comments jsonb;notices jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_manage and not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_category is not null and p_category not in ('free','question','lost') then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 if p_post_key is not null then
  select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id and post_status='published' and moderation_hidden_at is null;
  if not found then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'parent_id',x.parent_id,'body',x.body,'author',private.community_actor_display_name(x.author_id,auth.uid()),'created_at',x.created_at,'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=x.author_id and active),'can_delete',x.author_id=auth.uid()) order by x.created_at,x.id),'[]') into comments from private.course_story_comments x where x.post_id=p.id and not x.hidden and (x.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=x.parent_id and not parent.hidden));
  return private.course_story_json(p)||jsonb_build_object('comments',comments);
 end if;
 select count(*) into total from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category);
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned desc,x.created_at desc,x.id),'[]') into items from (select * from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category) and (not p_preview or not pinned) order by pinned desc,created_at desc,id limit case when p_preview then 3 else 20 end offset p_offset)x;
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned_at desc,x.id),'[]') into notices from (select * from public.course_discussion_posts where course_id=c.id and pinned and post_status='published' and moderation_hidden_at is null order by pinned_at desc,id limit 1)x;
 return jsonb_build_object('items',items,'total',total,'notice',notices,'can_manage',private.course_can_manage(c.id),'reports',case when p_manage then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'post_key',reported.post_key,'comment_id',r.comment_id,'reason',r.reason,'resolved',r.resolved) order by r.created_at desc) from private.course_story_reports r join public.course_discussion_posts reported on reported.id=r.post_id where reported.course_id=c.id),'[]') else '[]'::jsonb end);
end $$;

create function private.course_story_mutate(p_course_key text,p_post_key text,p_action text,p_version integer,p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=private.community_assert_active_actor();c public.courses%rowtype;p public.course_discussion_posts%rowtype;cm private.course_story_comments%rowtype;manager boolean;result jsonb;ids uuid[];cat text;state text;cid uuid;parent uuid;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field' for share;if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action is null or p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 manager:=private.course_can_manage(c.id,a);if p_action='save' and coalesce((p_input->>'pin')::boolean,false) then perform private.course_require_scope(c.id);end if;
 if p_post_key is not null then select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id for update;if not found then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
 if p_action in ('hide','unhide','pin','status','report_resolve') then perform private.course_require_scope(c.id);end if;
 if p_action in ('save','delete') and p.id is not null and p.author_user_id<>a then raise exception '본인 글만 수정·삭제할 수 있습니다.' using errcode='42501';end if;
 if p_action<>'save' and p.id is null then raise exception '글을 확인해 주세요.' using errcode='22023';end if;
 if p_action not in ('unhide','report_resolve') and p.id is not null and (p.post_status<>'published' or p.moderation_hidden_at is not null) then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action='unhide' and not private.course_actor_has_permission(a,'courses.manage') then raise exception '숨김 해제 권한이 없습니다.' using errcode='42501';end if;
 result:=private.course_claim_request(a,p_request_id,'course.story_'||p_action,jsonb_build_object('course',c.id,'key',p_post_key,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if p_action in ('save','delete','hide','unhide','pin','status') and p.id is not null and p.version is distinct from p_version then raise exception '글이 변경되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='40001';end if;
 if p_action='save' then
  cat:=p_input->>'category';if cat is null or cat not in ('free','question','lost') or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'body',''))) not between 10 and 1000 or jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '제목 2~120자·본문 10~1000자·분류를 확인해 주세요.' using errcode='22023';end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
  if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';end if;
  perform id from private.course_story_images where id=any(ids) order by id for update;
  if (select count(*) from private.course_story_images where id=any(ids) and owner_id=a and course_id=c.id and ready and (post_id is null or post_id=p.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 사진만 연결할 수 있습니다.' using errcode='42501';end if;
  state:=case when cat='question' then 'received' when cat='lost' then 'unresolved' end;
  if p.id is null then perform private.check_public_create_limit('course_discussion',btrim(p_input->>'body'));insert into public.course_discussion_posts(course_id,author_user_id,title,body,category,processing_status) values(c.id,a,btrim(p_input->>'title'),btrim(p_input->>'body'),cat,state) returning * into p;
  else update public.course_discussion_posts set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),category=cat,processing_status=case when cat=category then processing_status else state end,version=version+1 where id=p.id returning * into p;end if;
  update private.course_story_images set post_id=null,position=null where post_id=p.id and not(id=any(ids));update private.course_story_images set post_id=p.id,position=array_position(ids,id) where id=any(ids);
  if coalesce((p_input->>'pin')::boolean,false) then update public.course_discussion_posts set pinned=true,pinned_by=a,pinned_at=now() where id=p.id returning * into p;end if;
 elsif p_action in ('delete','hide','unhide') then
  if p_action='unhide' and (p.post_status<>'hidden' or p.moderation_hidden_at is null) then raise exception '숨김 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set post_status=case when p_action='delete' then 'removed' when p_action='hide' then 'hidden' else 'published' end,removed_at=case when p_action='delete' then now() end,moderation_hidden_at=case when p_action='hide' then now() end,moderation_version=moderation_version+case when p_action='delete' then 0 else 1 end,version=version+1,pinned=false where id=p.id returning * into p;
 elsif p_action='pin' then
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '공지 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set pinned=(p_input->>'enabled')::boolean,pinned_by=a,pinned_at=now(),version=version+1 where id=p.id returning * into p;
 elsif p_action='status' then
  state:=p_input->>'status';if state is null or p.category='free' or p.category='question' and state not in ('received','processing','done') or p.category='lost' and state not in ('unresolved','resolved') then raise exception '이 분류의 처리 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set processing_status=state,version=version+1 where id=p.id returning * into p;
 elsif p_action='comment' then
  parent:=nullif(p_input->>'parent_id','')::uuid;
  if char_length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1000 then raise exception '댓글은 1~1000자로 입력해 주세요.' using errcode='22023';end if;
  if parent is not null then perform id from private.course_story_comments where id=parent and post_id=p.id and parent_id is null and not hidden for share;if not found then raise exception '이 글의 공개 댓글에만 답글을 달 수 있습니다.' using errcode='22023';end if;end if;
  insert into private.course_story_comments(post_id,parent_id,author_id,body) values(p.id,parent,a,btrim(p_input->>'body'));
 elsif p_action in ('comment_hide','comment_delete') then
  select * into cm from private.course_story_comments where id=(p_input->>'comment_id')::uuid and post_id=p.id for update;if not found then raise exception '댓글을 찾을 수 없습니다.' using errcode='P0002';end if;
  if p_action='comment_hide' then perform private.course_require_scope(c.id);elsif cm.author_id<>a then raise exception '본인 댓글만 삭제할 수 있습니다.' using errcode='42501';end if;
  update private.course_story_comments set hidden=true where id=cm.id;
 elsif p_action='report' then
  cid:=nullif(p_input->>'comment_id','')::uuid;
  if cid is not null then select * into cm from private.course_story_comments where id=cid and post_id=p.id and not hidden;if not found or cm.parent_id is not null and exists(select 1 from private.course_story_comments where id=cm.parent_id and hidden) then raise exception '공개 댓글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
  if coalesce(cm.author_id,p.author_user_id)=a or char_length(btrim(coalesce(p_input->>'reason',''))) not between 2 and 1000 then raise exception '신고 대상·사유를 확인해 주세요.' using errcode='22023';end if;
  insert into private.course_story_reports(post_id,comment_id,reporter_id,reason) values(p.id,cid,a,btrim(p_input->>'reason'));
 elsif p_action='report_resolve' then update private.course_story_reports set resolved=true where id=(p_input->>'report_id')::uuid and post_id=p.id;if not found then raise exception '신고를 찾을 수 없습니다.' using errcode='P0002';end if;
 else raise exception '작업을 확인해 주세요.' using errcode='22023';end if;
 result:=jsonb_build_object('post_key',p.post_key,'version',p.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;

create function private.course_story_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid;i private.course_story_images%rowtype;
begin
 if not private.messaging_account_available(p_actor) then raise exception '정상 회원 인증이 필요합니다.' using errcode='42501';end if;
 select id into c from public.courses where course_key=p_course_key and course_type='field' and course_status='active';if c is null then raise exception '야외 구장을 확인해 주세요.' using errcode='P0002';end if;
 insert into private.course_story_images(course_id,owner_id,request_id,mime_type,byte_size,content_hash) values(c,p_actor,p_request_id,p_mime,p_bytes,p_hash) on conflict(owner_id,request_id) do nothing;
 select * into i from private.course_story_images where owner_id=p_actor and request_id=p_request_id for update;
 if i.course_id<>c or i.mime_type<>p_mime or i.byte_size<>p_bytes or i.content_hash<>p_hash then raise exception '동일 요청의 파일 내용이 다릅니다.' using errcode='22023';end if;
 return jsonb_build_object('id',i.id,'ready',i.ready);
end $$;
create function private.course_story_image_finish(p_actor uuid,p_id uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.messaging_account_available(p_actor) then raise exception '정상 회원 인증이 필요합니다.' using errcode='42501';end if;
 update private.course_story_images set ready=true where id=p_id and owner_id=p_actor and content_hash=p_hash;if not found then raise exception '사진 소유자를 확인해 주세요.' using errcode='42501';end if;
end $$;
create function private.course_story_image_read(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'mime_type',i.mime_type) from private.course_story_images i join public.courses c on c.id=i.course_id
 where i.id=p_id and i.ready and c.course_status='active' and c.course_type='field' and (i.post_id is null and i.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) or exists(select 1 from public.course_discussion_posts p where p.id=i.post_id and p.post_status='published' and p.moderation_hidden_at is null))
$$;
create function private.course_media_read(p_media_key text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('path',m.storage_path,'mime_type',m.verified_mime_type) from public.course_media m join public.courses c on c.id=m.course_id where m.media_key=p_media_key and m.media_status='available' and c.course_status='active'
$$;
create function private.course_media_hide(p_course_key text,p_media_key text,p_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid;a uuid;m public.course_media%rowtype;result jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c);select * into m from public.course_media where course_id=c and media_key=p_media_key for update;if not found then raise exception '사진을 찾을 수 없습니다.' using errcode='P0002';end if;
 result:=private.course_claim_request(a,p_request_id,'course.media_hide',jsonb_build_object('course',c,'media',p_media_key,'version',p_version));if result is not null then return result;end if;
 if m.version is distinct from p_version or m.media_status<>'available' then raise exception '사진 상태가 변경되었습니다.' using errcode='40001';end if;
 update public.course_media set media_status='removed',removed_at=now(),version=version+1 where id=m.id;
 result:=jsonb_build_object('media_key',p_media_key);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;

create function private.course_report_process(p_course_key text,p_report_id uuid,p_updated_at timestamptz,p_resolution text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid;a uuid;r public.course_information_reports%rowtype;result jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c);
 select * into r from public.course_information_reports where id=p_report_id and target_course_id=c for update;if not found then raise exception '담당 구장 제보를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_resolution is null or p_resolution not in ('handled','dismissed') or p_request_id is null then raise exception '처리 상태를 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.scoped_report',jsonb_build_object('course',c,'report',p_report_id,'base',p_updated_at,'resolution',p_resolution));if result is not null then return result;end if;
 if r.updated_at is distinct from p_updated_at or r.report_status<>'received' then raise exception '제보 상태가 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='40001';end if;
 update public.course_information_reports set report_status=p_resolution,resolved_at=now(),resolved_by=a,resolution_note=null where id=r.id;
 result:=jsonb_build_object('id',r.id);perform private.course_complete_request(a,p_request_id,result);return result;
end $$;
revoke all on function private.course_report_process(text,uuid,timestamptz,text,uuid) from public,anon,authenticated,service_role;
create function public.course_report_process(p_course_key text,p_report_id uuid,p_updated_at timestamptz,p_resolution text,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_report_process(p_course_key,p_report_id,p_updated_at,p_resolution,p_request_id)$$;
revoke all on function public.course_report_process(text,uuid,timestamptz,text,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_report_process(text,uuid,timestamptz,text,uuid) to authenticated;


create or replace function private.course_content_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant(); c public.courses%rowtype; r private.course_resources%rowtype; manager boolean; result jsonb; ids uuid[]; k text; url text;
begin
 if not private.messaging_account_available(a) then raise exception '정상 활동 회원만 등록할 수 있습니다.' using errcode='42501';end if;
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 manager:=private.course_can_manage(c.id,a);if p_action in ('hide','represent') then perform private.course_require_scope(c.id);end if;
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

create or replace function private.course_content_detail(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r private.course_resources%rowtype; c public.courses%rowtype;
begin
 select * into r from private.course_resources where id=p_id and status='published';select * into c from public.courses where id=r.course_id and course_status='active';
 if c.id is null then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 return private.course_content_resource_json(r)||jsonb_build_object('course_key',c.course_key,'course_name',c.name,'course_type',c.course_type,'can_manage',private.course_can_manage(c.id));
end $$;

create or replace function private.course_content_image_read(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'mime_type',i.mime_type) from private.course_resource_images i join public.courses c on c.id=i.course_id
 where i.id=p_id and i.ready and c.course_status='active' and (i.resource_id is null and i.owner_id=auth.uid() and private.messaging_account_available(auth.uid()) or exists(select 1 from private.course_resources r where r.id=i.resource_id and r.status='published'))
$$;

create or replace function private.course_content_set_recipient(p_course_key text,p_user_id uuid,p_version integer,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid;c uuid;r private.course_inquiry_recipients%rowtype;result jsonb;
begin
 select actor_id into a from private.require_course_manager();select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
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

create or replace function private.course_content_workspace(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant(); c uuid; manager boolean; steward boolean; notices jsonb; candidates jsonb; recipient jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active';if c is null then raise exception '스크린 구장을 찾을 수 없습니다.';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');steward:=exists(select 1 from private.course_stewards where course_id=c and user_id=a and active);
 if not(manager or steward) then raise exception '구장 운영 권한이 없습니다.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(n) order by updated_at desc,id desc),'[]') into notices from (select id,title,body,status,version,published_version,published_at,pending_input,updated_at from private.course_public_notices where course_id=c order by updated_at desc,id desc limit 50)n;
 if manager then
 select coalesce(jsonb_agg(jsonb_build_object('id',s.user_id,'name',private.messaging_display_name(s.user_id))),'[]') into candidates from private.course_stewards s where s.course_id=c and s.active and private.messaging_account_available(s.user_id);
 select jsonb_build_object('user_id',user_id,'version',version) into recipient from private.course_inquiry_recipients where course_id=c;
 end if;
 return jsonb_build_object('manager',manager,'notices',notices,'candidates',coalesce(candidates,'[]'),'recipient',recipient);
end $$;

create or replace function private.course_content_notice_mutate(p_course_key text,p_action text,p_id uuid,p_version integer,p_request_id uuid,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.require_course_applicant();c uuid;manager boolean;steward boolean;n private.course_public_notices%rowtype;result jsonb;draft jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');if p_action in ('publish','hide') then perform private.course_require_scope(c);manager:=true;end if;
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

create or replace function private.course_content_message_context(p_message_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform public.get_messaging_message(p_message_id,false);return (select jsonb_build_object('course_name',course_name,'recipient_changed',exists(select 1 from private.course_inquiry_recipients r where r.course_id=course_inquiry_contexts.course_id and r.user_id is not null and not exists(select 1 from public.messaging_messages m where m.id=p_message_id and m.sender_user_id=r.user_id) and not exists(select 1 from public.messaging_recipients mr where mr.message_id=p_message_id and mr.recipient_user_id=r.user_id)),'course_key',(select course_key from public.courses where id=course_id and course_status='active')) from private.course_inquiry_contexts where message_id=p_message_id);end $$;

create or replace function private.messaging_lock_course_broadcaster(p_course_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=private.messaging_assert_actor();
begin
  perform id from public.user_accounts where id=v_actor for share;
  perform user_id from public.user_profiles where user_id=v_actor for share;
  perform id from public.consent_records where user_id=v_actor order by id for share;
  perform id from public.courses where id=p_course_id for share;
  perform user_id from private.course_stewards where course_id=p_course_id and user_id=v_actor and active for share;
  perform user_id from public.course_messaging_operator_grants
    where course_id=p_course_id and user_id=v_actor for share;
  return private.messaging_assert_course_broadcaster(p_course_id);
end;
$$;

create or replace function private.course_content_send_inquiry(p_course_key text,p_body text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c public.courses%rowtype;r private.course_inquiry_recipients%rowtype;m public.messaging_messages%rowtype;fp text;result jsonb;
begin
 perform private.messaging_assert_read_committed();select * into c from public.courses where course_key=p_course_key and course_status='active' for share;if not found then raise exception '문의할 구장을 확인해 주세요.';end if;
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

create function private.course_inquiry_current(p_course_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid;r private.course_inquiry_recipients%rowtype;
begin
 perform private.require_course_applicant();select id into c from public.courses where course_key=p_course_key and course_status='active';if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 select * into r from private.course_inquiry_recipients where course_id=c;
 if r.user_id is null or not exists(select 1 from private.course_stewards where course_id=c and user_id=r.user_id and active) or not private.messaging_account_available(r.user_id) then return jsonb_build_object('user_id',null,'version',coalesce(r.version,0),'name',null);end if;
 return jsonb_build_object('user_id',r.user_id,'version',r.version,'name',private.messaging_display_name(r.user_id));
end $$;
create function private.course_inquiry_send(p_course_key text,p_body text,p_request_id uuid,p_recipient uuid,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c uuid;r private.course_inquiry_recipients%rowtype;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 -- An already committed request returns its original receipt without delivering to a new representative.
 if exists(select 1 from public.messaging_messages m join private.course_inquiry_contexts x on x.message_id=m.id where m.sender_user_id=a and m.request_id=p_request_id and x.course_id=c) then return private.course_content_send_inquiry(p_course_key,p_body,p_request_id);end if;
 select * into r from private.course_inquiry_recipients where course_id=c for share;
 if r.user_id is null or r.user_id is distinct from p_recipient or r.version is distinct from p_version then raise exception '문의 수신자가 변경되었습니다. 작성 내용은 유지됩니다. 새 수신자를 확인해 주세요.' using errcode='40001';end if;
 return private.course_content_send_inquiry(p_course_key,p_body,p_request_id);
end $$;

revoke all on function public.course_content_send_inquiry(text,text,uuid) from public,anon,authenticated,service_role;

revoke all on function private.course_management_read(text,boolean) from public,anon,authenticated,service_role;
create function public.course_management_read(p_course_key text,p_manage boolean default false) returns jsonb language sql security definer set search_path='' as $$select private.course_management_read(p_course_key,p_manage)$$;
revoke all on function public.course_management_read(text,boolean) from public,anon,authenticated,service_role;grant execute on function public.course_management_read(text,boolean) to anon,authenticated;

revoke all on function private.course_management_save(text,timestamptz,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.course_management_save(p_course_key text,p_updated_at timestamptz,p_request_id uuid,p_input jsonb) returns jsonb language sql security definer set search_path='' as $$select private.course_management_save(p_course_key,p_updated_at,p_request_id,p_input)$$;
revoke all on function public.course_management_save(text,timestamptz,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function public.course_management_save(text,timestamptz,uuid,jsonb) to authenticated;

revoke all on function private.course_story_read(text,text,text,integer,boolean,boolean) from public,anon,authenticated,service_role;
create function public.course_story_read(p_course_key text,p_post_key text default null,p_category text default null,p_offset integer default 0,p_preview boolean default false,p_manage boolean default false) returns jsonb language sql security definer set search_path='' as $$select private.course_story_read(p_course_key,p_post_key,p_category,p_offset,p_preview,p_manage)$$;
revoke all on function public.course_story_read(text,text,text,integer,boolean,boolean) from public,anon,authenticated,service_role;grant execute on function public.course_story_read(text,text,text,integer,boolean,boolean) to anon,authenticated;

revoke all on function private.course_story_mutate(text,text,text,integer,uuid,jsonb) from public,anon,authenticated,service_role;
create function public.course_story_mutate(p_course_key text,p_post_key text,p_action text,p_version integer,p_request_id uuid,p_input jsonb) returns jsonb language sql security definer set search_path='' as $$select private.course_story_mutate(p_course_key,p_post_key,p_action,p_version,p_request_id,p_input)$$;
revoke all on function public.course_story_mutate(text,text,text,integer,uuid,jsonb) from public,anon,authenticated,service_role;grant execute on function public.course_story_mutate(text,text,text,integer,uuid,jsonb) to authenticated;

revoke all on function private.course_story_image_read(uuid) from public,anon,authenticated,service_role;
create function public.course_story_image_read(p_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_story_image_read(p_id)$$;
revoke all on function public.course_story_image_read(uuid) from public,anon,authenticated,service_role;grant execute on function public.course_story_image_read(uuid) to anon,authenticated;

revoke all on function private.course_story_image_prepare(uuid,text,uuid,text,integer,text) from public,anon,authenticated,service_role;
create function public.course_story_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb language sql security definer set search_path='' as $$select private.course_story_image_prepare(p_actor,p_course_key,p_request_id,p_mime,p_bytes,p_hash)$$;
revoke all on function public.course_story_image_prepare(uuid,text,uuid,text,integer,text) from public,anon,authenticated,service_role;grant execute on function public.course_story_image_prepare(uuid,text,uuid,text,integer,text) to service_role;

revoke all on function private.course_media_read(text) from public,anon,authenticated,service_role;
create function public.course_media_read(p_media_key text) returns jsonb language sql security definer set search_path='' as $$select private.course_media_read(p_media_key)$$;
revoke all on function public.course_media_read(text) from public,anon,authenticated,service_role;grant execute on function public.course_media_read(text) to anon,authenticated;

revoke all on function private.course_media_hide(text,text,integer,uuid) from public,anon,authenticated,service_role;
create function public.course_media_hide(p_course_key text,p_media_key text,p_version integer,p_request_id uuid) returns jsonb language sql security definer set search_path='' as $$select private.course_media_hide(p_course_key,p_media_key,p_version,p_request_id)$$;
revoke all on function public.course_media_hide(text,text,integer,uuid) from public,anon,authenticated,service_role;grant execute on function public.course_media_hide(text,text,integer,uuid) to authenticated;

revoke all on function private.course_inquiry_current(text) from public,anon,authenticated,service_role;
create function public.course_inquiry_current(p_course_key text) returns jsonb language sql security definer set search_path='' as $$select private.course_inquiry_current(p_course_key)$$;
revoke all on function public.course_inquiry_current(text) from public,anon,authenticated,service_role;grant execute on function public.course_inquiry_current(text) to authenticated;

revoke all on function private.course_inquiry_send(text,text,uuid,uuid,integer) from public,anon,authenticated,service_role;
create function public.course_inquiry_send(p_course_key text,p_body text,p_request_id uuid,p_recipient uuid,p_version integer) returns jsonb language sql security definer set search_path='' as $$select private.course_inquiry_send(p_course_key,p_body,p_request_id,p_recipient,p_version)$$;
revoke all on function public.course_inquiry_send(text,text,uuid,uuid,integer) from public,anon,authenticated,service_role;grant execute on function public.course_inquiry_send(text,text,uuid,uuid,integer) to authenticated;

revoke all on function private.course_story_image_finish(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.course_story_image_finish(p_actor uuid,p_id uuid,p_hash text) returns void language sql security definer set search_path='' as $$select private.course_story_image_finish(p_actor,p_id,p_hash)$$;
revoke all on function public.course_story_image_finish(uuid,uuid,text) from public,anon,authenticated,service_role;grant execute on function public.course_story_image_finish(uuid,uuid,text) to service_role;
revoke all on function private.course_can_manage(uuid,uuid),private.course_require_scope(uuid),private.course_sync_steward_grant(),private.course_state_json(public.courses),private.course_story_json(public.course_discussion_posts) from public,anon,authenticated,service_role;
commit;
