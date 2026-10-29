-- Follow-up only. Existing F1/F2/LogoutButton and previous SQL files are preserved.
-- Club activities use canonical club_posts; media and course shares remain references.
alter table public.club_posts add column activity_category text check(activity_category in('monthly_meeting','tournament_participation','tournament_hosting','rounding','social','family_event','other')),
 add column activity_notice boolean not null default false,
 add column activity_event_id uuid references public.club_official_events(id) on delete restrict,
 add column activity_hidden_by uuid;
alter table public.club_media add column visibility text not null default 'public' check(visibility in('public','club_members')),
 add column public_consent boolean not null default true,
 add column gallery_hidden_by uuid,
 add column intended_course_id uuid references public.courses(id) on delete restrict;
alter table public.club_media drop constraint club_media_bucket_check;
alter table public.club_media add constraint club_media_bucket_check check(storage_bucket in('club-media','club-media-private'));
alter table public.club_media add constraint club_private_media_boundary check(visibility='public' or storage_bucket='club-media-private');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('club-media-private','club-media-private',false,4000000,array['image/jpeg','image/png','image/webp']);
create table private.club_post_photos(post_id uuid not null references public.club_posts(id) on delete restrict,media_id uuid not null references public.club_media(id) on delete restrict,position integer not null check(position between 1 and 5),primary key(post_id,media_id),unique(post_id,position));
create table private.club_course_shares(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id) on delete restrict,course_id uuid not null references public.courses(id) on delete restrict,post_id uuid references public.club_posts(id) on delete restrict,media_id uuid references public.club_media(id) on delete restrict,withdrawn boolean not null default false,course_hidden boolean not null default false,version integer not null default 1 check(version>0),created_at timestamptz not null default now(),check(num_nonnulls(post_id,media_id)=1));
create unique index club_course_post_share_unique on private.club_course_shares(post_id,course_id) where post_id is not null;
create unique index club_course_photo_share_unique on private.club_course_shares(media_id,course_id) where media_id is not null;
create index club_course_share_feed on private.club_course_shares(course_id,created_at desc) where not withdrawn and not course_hidden;
create index club_activity_feed on public.club_posts(club_id,activity_notice desc,created_at desc,id) where activity_category is not null;
create table private.club_extension_requests(actor_id uuid not null,request_id uuid not null,operation text not null,fingerprint text not null,result jsonb not null,primary key(actor_id,request_id));
create table private.club_content_reports(id uuid primary key default gen_random_uuid(),club_id uuid not null references public.clubs(id),post_id uuid references public.club_posts(id),media_id uuid references public.club_media(id),reporter_id uuid,reason text not null check(char_length(reason) between 5 and 500),created_at timestamptz not null default now(),resolved boolean not null default false,check(num_nonnulls(post_id,media_id)=1));
alter table private.club_post_photos enable row level security;
alter table private.club_course_shares enable row level security;
alter table private.club_extension_requests enable row level security;
alter table private.club_content_reports enable row level security;
revoke all on private.club_post_photos,private.club_course_shares,private.club_extension_requests,private.club_content_reports from public,anon,authenticated,service_role;

create function private.club_photo_writer(a uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.club_user_has_permission(a,c,'club.posts.create') or private.club_user_has_permission(a,c,'club.media.review'),false)
$$;
create function private.club_lock_photo_actor(a uuid,c uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform id from public.clubs where id=c and club_status='active' for update;
 perform id from public.user_accounts where id=a and account_status='active' for share;
 perform id from public.club_memberships where club_id=c and user_id=a and membership_status='active' for share;
 perform id from public.club_role_assignments where membership_id in(select id from public.club_memberships where club_id=c and user_id=a) and revoked_at is null for share;
 if a is null or private.club_photo_writer(a,c) is not true then raise exception '활동 중이며 사진을 올릴 수 있는 동호회 회원만 이용할 수 있습니다.' using errcode='42501';end if;
end $$;
create function private.club_extension_previous(a uuid,r uuid,op text,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior private.club_extension_requests;begin
 if a is null or r is null or input is null then raise exception '로그인과 요청 번호를 확인해 주세요.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(a::text||':club-extension:'||r::text,0));
 select * into prior from private.club_extension_requests where actor_id=a and request_id=r;
 if found then if prior.operation is distinct from op or prior.fingerprint is distinct from md5(input::text) then raise exception '같은 요청 번호의 내용이 다릅니다.' using errcode='22023';end if;return prior.result||'{"replayed":true}'::jsonb;end if;
 return null;
end $$;
create function private.club_extension_complete(a uuid,r uuid,op text,input jsonb,result jsonb) returns void language sql security definer set search_path='' as $$ insert into private.club_extension_requests values(a,r,op,md5(input::text),result) $$;
create function private.club_share_target(c uuid,k text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 select id into target from public.courses where course_key=k and course_type='field' and course_status='active' for share;
 if target is null then raise exception '연결 야외구장을 확인해 주세요.' using errcode='22023';end if;
 perform 1 from public.course_club_links where club_id=c and course_id=target for share;
 if not found then raise exception '활동 구장 연결이 변경되었습니다. 현재 연결 대상을 다시 확인해 주세요.' using errcode='40001';end if;
 return target;
end $$;
create function private.club_set_share(c uuid,p uuid,m uuid,k text,v text,confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if k is not null then
  if v is distinct from 'public' or confirmed is not true then raise exception '구장 방문자도 읽을 수 있도록 전체 공개 선택을 확인해 주세요.' using errcode='22023';end if;
  select course.id into target from public.courses course join private.club_course_shares s on s.course_id=course.id where course.course_key=k and course.course_type='field' and course.course_status='active' and s.club_id=c and s.post_id is not distinct from p and s.media_id is not distinct from m and not s.withdrawn;
  if target is null then target:=private.club_share_target(c,k);end if;
 end if;
 update private.club_course_shares set withdrawn=true,version=version+1 where club_id=c and post_id is not distinct from p and media_id is not distinct from m and not withdrawn and (target is null or course_id<>target);
 if target is not null then
  if p is not null then insert into private.club_course_shares(club_id,course_id,post_id) values(c,target,p) on conflict(post_id,course_id) where post_id is not null do update set withdrawn=false,version=private.club_course_shares.version+case when private.club_course_shares.withdrawn then 1 else 0 end;
  else insert into private.club_course_shares(club_id,course_id,media_id) values(c,target,m) on conflict(media_id,course_id) where media_id is not null do update set withdrawn=false,version=private.club_course_shares.version+case when private.club_course_shares.withdrawn then 1 else 0 end;end if;
 end if;
end $$;
create function private.club_photo_readable(m public.club_media) returns boolean language sql stable security definer set search_path='' as $$
 select m.media_status='available' and exists(select 1 from public.clubs c where c.id=m.club_id and c.club_status='active') and (
  not m.gallery_hidden and m.visibility='public' and m.public_consent and (exists(select 1 from public.clubs c where c.id=m.club_id and c.directory_is_public) or exists(select 1 from private.club_course_shares s join public.courses c on c.id=s.course_id where s.media_id=m.id and not s.withdrawn and not s.course_hidden and c.course_status='active' and c.course_type='field'))
  or private.club_user_has_permission(auth.uid(),m.club_id,'club.posts.read') and (not m.gallery_hidden or m.uploaded_by_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),m.club_id,'club.media.review'))
 )
$$;
create function private.club_post_readable(p public.club_posts) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clubs c where c.id=p.club_id and c.club_status='active') and (
 p.post_status in('published','edited') and p.moderation_status='visible' and (p.visibility='public' and (exists(select 1 from public.clubs c where c.id=p.club_id and c.directory_is_public) or exists(select 1 from private.club_course_shares s join public.courses c on c.id=s.course_id where s.post_id=p.id and not s.withdrawn and not s.course_hidden and c.course_status='active' and c.course_type='field')) or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.read'))
 or private.club_photo_writer(auth.uid(),p.club_id) and (p.author_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate'))
 )
$$;
create function private.club_post_safe_json(p public.club_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'club_key',c.legacy_key,'club_name',c.name,'title',p.title,'body',p.content_summary,'post_type',p.post_type,'activity_category',p.activity_category,'is_notice',p.activity_notice,'starts_at',p.starts_at,'ends_at',p.ends_at,'event_id',p.activity_event_id,'visibility',p.visibility,'created_at',p.created_at,'version',p.version,'hidden',p.moderation_status<>'visible' or p.post_status not in('published','edited'),
 'can_edit',coalesce(p.author_user_id=auth.uid() and private.club_photo_writer(auth.uid(),p.club_id),false),'can_moderate',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate'),false),'can_notice',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.notices.manage'),false),
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'caption',m.caption,'visibility',m.visibility) order by a.position) from private.club_post_photos a join public.club_media m on m.id=a.media_id where a.post_id=p.id and private.club_photo_readable(m)),'[]'::jsonb),
 'shared_course',case when p.author_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate') then (select jsonb_build_object('key',x.course_key,'name',x.name,'course_hidden',s.course_hidden) from private.club_course_shares s join public.courses x on x.id=s.course_id where s.post_id=p.id and not s.withdrawn limit 1) else null end)
 from public.clubs c where c.id=p.club_id
$$;

create function public.save_club_post(p_club_id uuid,p_operation text,p_content_id uuid,p_expected_version integer,p_request_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();prior jsonb;r jsonb;p public.club_posts;ids uuid[];event_id uuid;notice boolean;category text;target text;fp jsonb:=jsonb_build_object('club',p_club_id,'operation',p_operation,'id',p_content_id,'version',p_expected_version,'input',p_input);begin
 perform private.club_lock_photo_actor(a,p_club_id);
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_operation not in('create','update','delete','hide','restore') then raise exception '글 입력을 확인해 주세요.' using errcode='22023';end if;
 if p_operation<>'create' then select * into p from public.club_posts where id=p_content_id and club_id=p_club_id for update;if not found then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;
  if p.author_user_id<>a and (p_operation in('update','delete') or private.club_user_has_permission(a,p_club_id,'club.posts.moderate') is not true) then raise exception '본인 글 또는 담당 관리 권한을 확인해 주세요.' using errcode='42501';end if;
 end if;
 prior:=private.club_extension_previous(a,p_request_id,'post',fp);if prior is not null then return prior;end if;
 if p_operation<>'create' and (p_expected_version is null or p_expected_version<1 or p.version is distinct from p_expected_version) then raise exception '글이 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='40001';end if;
 if p_operation in('hide','restore') then
  if p_operation='restore' and p.activity_hidden_by is distinct from a and private.club_user_has_permission(a,p_club_id,'club.posts.moderate') is not true then raise exception '운영진이 숨긴 글은 운영진만 복원할 수 있습니다.' using errcode='42501';end if;
  update public.club_posts set moderation_status=case when p_operation='hide' then 'hidden' else 'visible' end,activity_hidden_by=case when p_operation='hide' then a end,version=version+1 where id=p.id returning * into p;
  if p_operation='hide' then perform private.club_set_share(p_club_id,p.id,null,null,p.visibility,false);end if;
  r:=jsonb_build_object('id',p.id,'version',p.version);
 else
  if p_operation in('create','update') then
   category:=p_input->>'activity_category';notice:=coalesce((p_input->>'is_notice')::boolean,false);event_id:=nullif(p_input->>'event_id','')::uuid;target:=nullif(p_input->>'share_course_key','');
   if category is not null and category not in('monthly_meeting','tournament_participation','tournament_hosting','rounding','social','family_event','other') then raise exception '활동 분류를 확인해 주세요.' using errcode='22023';end if;
   if notice is distinct from coalesce(p.activity_notice,false) and private.club_user_has_permission(a,p_club_id,'club.notices.manage') is not true then raise exception '공지 지정 권한이 없습니다.' using errcode='42501';end if;
   if event_id is not null and not exists(select 1 from public.club_official_events e where e.id=event_id and e.club_id=p_club_id and e.event_status<>'cancelled' and e.moderation_status='visible' and (e.visibility='public' or (p_input->>'visibility'='club_members' and private.club_user_has_permission(a,p_club_id,'club.events.read')))) then raise exception '이 동호회의 공개 범위에 맞는 기존 일정을 선택해 주세요.' using errcode='22023';end if;
   if p_input->>'visibility'='public' and (p_operation='create' or p.visibility is distinct from 'public' or target is not null) and coalesce((p_input->>'public_confirmed')::boolean,false) is not true then raise exception '전체 공개 범위를 확인해 주세요.' using errcode='22023';end if;
   if jsonb_typeof(coalesce(p_input->'images','[]'::jsonb))<>'array' then raise exception '첨부사진을 확인해 주세요.';end if;
   select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'::jsonb));
   if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';end if;
   perform id from public.club_media where id=any(ids) order by id for share;
   if (select count(*) from public.club_media m where m.id=any(ids) and m.club_id=p_club_id and m.uploaded_by_user_id=a and m.media_status='available' and not m.gallery_hidden and (p_input->>'visibility'='club_members' or m.visibility='public' and m.public_consent))<>cardinality(ids) then raise exception '본인이 이 동호회에 올린 공개 범위에 맞는 사진만 첨부할 수 있습니다.' using errcode='42501';end if;
  end if;
  r:=public.mutate_club_core_content('post',p_operation,p_request_id,p_club_id,p_content_id,p_expected_version,case when p_operation='delete' then '{}'::jsonb else p_input-array['activity_category','is_notice','event_id','images','share_course_key','public_confirmed'] end);
  if coalesce((r->>'replayed')::boolean,false) then raise exception '기존 작성 요청 번호를 새 설정에 재사용할 수 없습니다.' using errcode='22023';end if;
  select * into p from public.club_posts where id=(r->>'id')::uuid;
  if p_operation<>'delete' then
   update public.club_posts set activity_category=category,activity_notice=notice,activity_event_id=event_id where id=p.id;
   delete from private.club_post_photos where post_id=p.id;
   insert into private.club_post_photos select p.id,x,ord from unnest(ids) with ordinality as t(x,ord);
   perform private.club_set_share(p_club_id,p.id,null,target,p_input->>'visibility',coalesce((p_input->>'public_confirmed')::boolean,false));
  else perform private.club_set_share(p_club_id,p.id,null,null,p.visibility,false);end if;
 end if;
 perform private.club_extension_complete(a,p_request_id,'post',fp,r);return r;
end $$;

create function public.create_club_photo_upload(p_club_id uuid,p_request_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();prior jsonb;m uuid:=gen_random_uuid();target uuid;v text;consent boolean;mime text;bytes bigint;caption text;r jsonb;fp jsonb:=jsonb_build_object('club',p_club_id,'input',p_input);begin
 perform private.club_lock_photo_actor(a,p_club_id);prior:=private.club_extension_previous(a,p_request_id,'photo_upload',fp);if prior is not null then return prior;end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input-array['caption','visibility','public_confirmed','share_course_key','mime_type','byte_size']<>'{}'::jsonb then raise exception '사진 입력을 확인해 주세요.' using errcode='22023';end if;
 v:=p_input->>'visibility';consent:=coalesce((p_input->>'public_confirmed')::boolean,false);mime:=p_input->>'mime_type';bytes:=(p_input->>'byte_size')::bigint;caption:=nullif(btrim(p_input->>'caption'),'');
 if v is null or v not in('public','club_members') or v='public' and not consent or mime is null or mime not in('image/jpeg','image/png','image/webp') or bytes is null or bytes not between 1 and 4000000 or char_length(coalesce(caption,''))>180 then raise exception '사진 공개 범위·설명·파일 정보를 확인해 주세요.' using errcode='22023';end if;
 if nullif(p_input->>'share_course_key','') is not null then if v<>'public' or not consent then raise exception '구장 함께 표시는 전체 공개 확인이 필요합니다.' using errcode='22023';end if;target:=private.club_share_target(p_club_id,p_input->>'share_course_key');end if;
 insert into public.club_media(id,club_id,media_kind,storage_bucket,storage_path,caption,uploaded_by_user_id,declared_mime_type,declared_size_bytes,visibility,public_consent,intended_course_id) values(m,p_club_id,'gallery','club-media-private',p_club_id::text||'/'||m::text||'/original',caption,a,mime,bytes,v,consent,target);
 r:=jsonb_build_object('media_id',m,'media_status','pending_upload','version',1);perform private.club_extension_complete(a,p_request_id,'photo_upload',fp,r);return r;
end $$;
create function public.save_club_photo(p_media_id uuid,p_expected_version integer,p_request_id uuid,p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.club_media;a uuid:=auth.uid();prior jsonb;r jsonb;v text;h boolean;target text;fp jsonb:=jsonb_build_object('id',p_media_id,'version',p_expected_version,'input',p_input);begin
 select * into m from public.club_media where id=p_media_id;if not found then raise exception '사진을 찾을 수 없습니다.' using errcode='P0002';end if;
 perform private.club_lock_photo_actor(a,m.club_id);select * into m from public.club_media where id=p_media_id for update;
 if m.uploaded_by_user_id<>a and private.club_user_has_permission(a,m.club_id,'club.media.review') is not true then raise exception '본인 사진만 수정할 수 있습니다.' using errcode='42501';end if;
 prior:=private.club_extension_previous(a,p_request_id,'photo_edit',fp);if prior is not null then return prior;end if;
 if m.media_status<>'available' or p_expected_version is null or p_expected_version<1 or m.version is distinct from p_expected_version then raise exception '사진이 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='40001';end if;
 if p_input is null or jsonb_typeof(p_input)<>'object' or p_input-array['caption','visibility','public_confirmed','share_course_key','hidden']<>'{}'::jsonb then raise exception '사진 입력을 확인해 주세요.' using errcode='22023';end if;
 v:=p_input->>'visibility';h:=coalesce((p_input->>'hidden')::boolean,false);target:=nullif(p_input->>'share_course_key','');
 if v is null or v not in('public','club_members') or char_length(coalesce(p_input->>'caption',''))>180 then raise exception '사진 설명과 공개 범위를 확인해 주세요.' using errcode='22023';end if;
 if m.uploaded_by_user_id<>a and (v is distinct from m.visibility or target is distinct from (select c.course_key from private.club_course_shares s join public.courses c on c.id=s.course_id where s.media_id=m.id and not s.withdrawn limit 1)) then raise exception '업로더만 공개 범위와 공동 표시를 바꿀 수 있습니다.' using errcode='42501';end if;
 if v='club_members' and m.storage_bucket<>'club-media-private' then raise exception '기존 공개 사진의 파일 URL은 회수할 수 없습니다. 비공개 사진으로 새로 올려 주세요.' using errcode='22023';end if;
 if v='public' and (m.visibility<>'public' or not m.public_consent) and coalesce((p_input->>'public_confirmed')::boolean,false) is not true then raise exception '업로더의 전체 공개 선택을 확인해 주세요.' using errcode='22023';end if;
 update public.club_media set caption=nullif(btrim(p_input->>'caption'),''),visibility=v,public_consent=case when v='public' then true else false end,gallery_hidden=h,version=version+1 where id=m.id returning * into m;
 perform private.club_set_share(m.club_id,null,m.id,case when h then null else target end,v,coalesce((p_input->>'public_confirmed')::boolean,false));
 update private.club_galleries set primary_id=null,version=version+1 where club_id=m.club_id and primary_id=m.id and (h or v<>'public');
 r:=jsonb_build_object('id',m.id,'version',m.version);perform private.club_extension_complete(a,p_request_id,'photo_edit',fp,r);return r;
end $$;

create or replace function private.club_gallery_finalized() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.media_status='available' and (tg_op='INSERT' or old.media_status is distinct from new.media_status) then
  insert into private.club_galleries(club_id,primary_id) values(new.club_id,case when new.media_kind='representative' and new.visibility='public' and new.public_consent and not new.gallery_hidden then new.id end) on conflict(club_id) do update set version=private.club_galleries.version+1;
 end if;return new;
end $$;
create or replace function public.get_club_gallery(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs;g private.club_galleries;manage boolean;items jsonb;primary_photo uuid;begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' and (directory_is_public or private.club_user_has_permission(auth.uid(),id,'club.posts.read'));if not found then raise exception '동호회를 찾을 수 없습니다.' using errcode='P0002';end if;
 manage:=private.club_user_has_permission(auth.uid(),c.id,'club.media.review');select * into g from private.club_galleries where club_id=c.id;primary_photo:=g.primary_id;
 if primary_photo is null then select id into primary_photo from public.club_media where club_id=c.id and media_kind='representative' and media_status='available' and visibility='public' and public_consent and not gallery_hidden limit 1;end if;
 if not exists(select 1 from public.club_media m where m.id=primary_photo and m.club_id=c.id and m.visibility='public' and m.public_consent and not m.gallery_hidden and private.club_photo_readable(m)) then primary_photo:=null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'path',case when x.storage_bucket='club-media' then x.storage_path else null end,'can_restore',coalesce(x.gallery_hidden_by=auth.uid() or manage,false),'caption',x.caption,'hidden',x.gallery_hidden,'visibility',x.visibility,'version',x.version,'can_edit',coalesce((x.uploaded_by_user_id=auth.uid() and private.club_photo_writer(auth.uid(),c.id)) or manage,false),'is_owner',coalesce(x.uploaded_by_user_id=auth.uid(),false),'public_consent',x.public_consent,'shared_course',(select jsonb_build_object('key',course.course_key,'name',course.name,'course_hidden',s.course_hidden) from private.club_course_shares s join public.courses course on course.id=s.course_id where s.media_id=x.id and not s.withdrawn limit 1)) order by x.gallery_order,x.created_at,x.id),'[]'::jsonb) into items from (select distinct on(m.storage_bucket,m.storage_path) m.* from public.club_media m where m.club_id=c.id and private.club_photo_readable(m) order by m.storage_bucket,m.storage_path,(m.id=primary_photo) desc,m.created_at,m.id)x;
 return jsonb_build_object('items',items,'primary_id',primary_photo,'can_manage',coalesce(manage,false),'can_upload',private.club_photo_writer(auth.uid(),c.id),'viewer_id',auth.uid(),'version',case when manage then coalesce(g.version,1) else null end);
end $$;
create function public.get_club_photo_file(p_media_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('id',m.id,'bucket',m.storage_bucket,'path',m.storage_path,'mime_type',m.verified_mime_type) from public.club_media m where m.id=p_media_id and private.club_photo_readable(m) $$;

create function public.get_club_post(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.club_posts;begin select * into p from public.club_posts where id=p_id;if not found or private.club_post_readable(p) is not true then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;return private.club_post_safe_json(p);end $$;
create function public.list_club_activities(p_club_key text,p_limit integer default 3,p_offset integer default 0,p_manage boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs;items jsonb;total integer;can_read boolean;begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' and (directory_is_public or private.club_user_has_permission(auth.uid(),id,'club.posts.read'));if not found then raise exception '동호회를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_limit is null or p_limit not between 1 and 20 or p_offset is null or p_offset<0 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 can_read:=private.club_user_has_permission(auth.uid(),c.id,'club.posts.read');
 select count(*) into total from public.club_posts p where p.club_id=c.id and p.activity_category is not null and private.club_post_readable(p) and (p_manage or p.moderation_status='visible' and p.post_status in('published','edited'));
 select coalesce(jsonb_agg(private.club_post_safe_json(x) order by x.activity_notice desc,x.created_at desc,x.id),'[]'::jsonb) into items from(select * from public.club_posts p where p.club_id=c.id and p.activity_category is not null and private.club_post_readable(p) and (p_manage or p.moderation_status='visible' and p.post_status in('published','edited')) order by p.activity_notice desc,p.created_at desc,p.id limit p_limit offset p_offset)x;
 return jsonb_build_object('items',items,'total',total,'can_create',private.club_photo_writer(auth.uid(),c.id),'can_read_members',coalesce(can_read,false),'viewer_id',auth.uid());
end $$;

create function public.moderate_course_club_share(p_share_id uuid,p_expected_version integer,p_request_id uuid,p_hidden boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.club_course_shares;a uuid;r jsonb;fp jsonb:=jsonb_build_object('id',p_share_id,'version',p_expected_version,'hidden',p_hidden);begin
 select * into s from private.club_course_shares where id=p_share_id;if not found then raise exception '공동 표시를 찾을 수 없습니다.' using errcode='P0002';end if;a:=private.course_require_scope(s.course_id);
 if not p_hidden and private.course_actor_has_permission(a,'courses.manage') is not true then raise exception '구장 숨김 해제 권한이 없습니다.' using errcode='42501';end if;
 r:=private.club_extension_previous(a,p_request_id,'course_share',fp);if r is not null then return r;end if;
 select * into s from private.club_course_shares where id=p_share_id for update;
 if p_expected_version is null or p_expected_version<1 or s.version is distinct from p_expected_version or p_hidden is null then raise exception '공동 표시 상태가 변경되었습니다.' using errcode='40001';end if;
 update private.club_course_shares set course_hidden=p_hidden,version=version+1 where id=s.id;r:=jsonb_build_object('id',s.id,'version',s.version+1);perform private.club_extension_complete(a,p_request_id,'course_share',fp,r);return r;
end $$;
create function public.report_club_content(p_kind text,p_id uuid,p_reason text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.community_assert_active_actor();c uuid;r jsonb;fp jsonb:=jsonb_build_object('kind',p_kind,'id',p_id,'reason',p_reason);begin
 if p_kind='post' then select club_id into c from public.club_posts p where id=p_id and private.club_post_readable(p);elsif p_kind='photo' then select club_id into c from public.club_media m where id=p_id and private.club_photo_readable(m);end if;
 if c is null or char_length(btrim(coalesce(p_reason,''))) not between 5 and 500 then raise exception '공개 대상을 확인하고 신고 사유를 5~500자로 입력해 주세요.' using errcode='22023';end if;
 r:=private.club_extension_previous(a,p_request_id,'report',fp);if r is not null then return r;end if;
 insert into private.club_content_reports(club_id,post_id,media_id,reporter_id,reason) values(c,case when p_kind='post' then p_id end,case when p_kind='photo' then p_id end,a,btrim(p_reason)) returning jsonb_build_object('id',id) into r;
 perform private.club_extension_complete(a,p_request_id,'report',fp,r);return r;
end $$;

-- Every write path, including established RPCs, ends a share when its source closes.
create function private.club_source_share_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='club_posts' then
  if new.visibility<>'public' or new.moderation_status<>'visible' or new.post_status not in('published','edited') then update private.club_course_shares set withdrawn=true,version=version+1 where post_id=new.id and not withdrawn;end if;
 else
  if new.visibility<>'public' or not new.public_consent or new.gallery_hidden or new.media_status<>'available' then
   update private.club_course_shares set withdrawn=true,version=version+1 where media_id=new.id and not withdrawn;
   update private.club_galleries set primary_id=null,version=version+1 where club_id=new.club_id and primary_id=new.id;
  end if;
 end if;return new;
end $$;
create trigger club_post_share_guard after update of visibility,moderation_status,post_status on public.club_posts for each row execute function private.club_source_share_guard();
create trigger club_photo_share_guard after update of visibility,public_consent,gallery_hidden,media_status on public.club_media for each row execute function private.club_source_share_guard();
create function private.club_photo_hidden_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.gallery_hidden and not old.gallery_hidden then new.gallery_hidden_by:=auth.uid();end if;
 if not new.gallery_hidden and old.gallery_hidden then
  if old.gallery_hidden_by is distinct from auth.uid() and private.club_user_has_permission(auth.uid(),old.club_id,'club.media.review') is not true then raise exception '운영진이 숨긴 사진은 운영진만 복원할 수 있습니다.' using errcode='42501';end if;
  new.gallery_hidden_by:=null;
 end if;return new;
end $$;
create trigger club_photo_hidden_guard before update of gallery_hidden on public.club_media for each row execute function private.club_photo_hidden_guard();

create or replace function public.get_club_media_upload_context_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns table (
  media_id uuid,
  storage_bucket text,
  storage_path text,
  declared_mime_type text,
  declared_size_bytes bigint,
  media_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_club_id uuid;
  v_media_kind text;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진을 등록할 수 있습니다.';
  end if;

  select media.club_id,media.media_kind
  into v_club_id,v_media_kind
  from public.club_media as media
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status in ('pending_upload','available');

  if v_club_id is null
     or not (private.club_user_has_permission(p_actor_user_id,v_club_id,'club.media.review') or v_media_kind='gallery' and private.club_photo_writer(p_actor_user_id,v_club_id)) then
    raise exception '사진 업로드를 계속할 권한이 없습니다.';
  end if;

  perform private.club_lock_photo_actor(p_actor_user_id,v_club_id);
  return query
  select media.id, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.club_media as media
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status in ('pending_upload','available');
end;
$$;
create or replace function public.finalize_club_media_upload_server(
  p_actor_user_id uuid,
  p_media_id uuid,
  p_verified_mime_type text,
  p_verified_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_media public.club_media%rowtype;
  v_club_status text;
  v_replaced_paths jsonb := '[]'::jsonb;
begin
  select club_id into v_media.club_id from public.club_media where id=p_media_id;
  perform private.club_lock_photo_actor(p_actor_user_id,v_media.club_id);
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진 등록을 완료할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.club_media as media
  where media.id = p_media_id
  for update;

  if v_media.id is null or v_media.uploaded_by_user_id <> p_actor_user_id then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = v_media.club_id
  for update;

  if v_club_status <> 'active'
     or not (private.club_user_has_permission(p_actor_user_id,v_media.club_id,'club.media.review') or v_media.media_kind='gallery' and private.club_photo_writer(p_actor_user_id,v_media.club_id)) then
    raise exception '사진 등록을 완료할 권한이 없습니다.';
  end if;

  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type
       and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object(
        'media_id', v_media.id,
        'media_status', v_media.media_status,
        'version', v_media.version,
        'replayed', true,
        'replaced_storage_paths', '[]'::jsonb
      );
    end if;
    raise exception '이미 완료된 사진 정보와 검증 값이 다릅니다.';
  end if;

  if v_media.media_status <> 'pending_upload' then
    raise exception '완료할 수 없는 사진 업로드 상태입니다.';
  end if;
  if p_verified_mime_type <> v_media.declared_mime_type
     or p_verified_size_bytes <> v_media.declared_size_bytes then
    raise exception '업로드한 사진 파일이 등록 정보와 일치하지 않습니다.';
  end if;

  if v_media.media_kind = 'representative' then
    select coalesce(pg_catalog.jsonb_agg(existing.storage_path), '[]'::jsonb)
    into v_replaced_paths
    from public.club_media as existing
    where existing.club_id = v_media.club_id
      and existing.media_kind = 'representative'
      and existing.media_status = 'available'
      and existing.id <> v_media.id;

    update public.club_media as existing
    set media_status = 'removed', removed_at = now(), version = existing.version + 1
    where existing.club_id = v_media.club_id
      and existing.media_kind = 'representative'
      and existing.media_status = 'available'
      and existing.id <> v_media.id;
  end if;

  if v_media.intended_course_id is not null then
    perform private.club_share_target(v_media.club_id,(select course_key from public.courses where id=v_media.intended_course_id));
  end if;
  update public.club_media
  set media_status = 'available',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      available_at = now(),
      version = version + 1
  where id = v_media.id;

  if v_media.intended_course_id is not null then
    perform private.club_set_share(v_media.club_id,null,v_media.id,(select course_key from public.courses where id=v_media.intended_course_id),v_media.visibility,v_media.public_consent);
  end if;
  return pg_catalog.jsonb_build_object(
    'media_id', v_media.id,
    'media_status', 'available',
    'version', v_media.version + 1,
    'replayed', false,
    'replaced_storage_paths', v_replaced_paths
  );
end;
$$;
create or replace function public.save_club_gallery(p_club_key text,p_expected_version integer,p_request_id uuid,p_order uuid[],p_hidden uuid[],p_primary uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.clubs;g private.club_galleries;f text:=md5(jsonb_build_object('key',p_club_key,'version',p_expected_version,'order',p_order,'hidden',p_hidden,'primary',p_primary)::text);previous private.club_gallery_requests;r jsonb;
begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' for update;
 if not found or auth.uid() is null or not exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active') or private.club_user_has_permission(auth.uid(),c.id,'club.media.review') is not true then raise exception '동호회 사진 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_request_id is null then raise exception '요청 번호가 필요합니다.';end if;
 select * into previous from private.club_gallery_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if previous.fingerprint is distinct from f then raise exception '동일 요청 번호의 변경 내용이 다릅니다.';end if;return previous.result;end if;
 insert into private.club_galleries(club_id) values(c.id) on conflict do nothing;
 select * into g from private.club_galleries where club_id=c.id for update;
 if g.version is distinct from p_expected_version then raise exception '사진 구성이 변경되었습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001';end if;
 if p_order is null or p_hidden is null or cardinality(p_order)<>(select count(distinct x) from unnest(p_order)x) or cardinality(p_hidden)<>(select count(distinct x) from unnest(p_hidden)x) or exists(select 1 from unnest(p_order)x where x is null) or exists(select 1 from unnest(p_hidden)x where x is null or not(x=any(p_order))) then raise exception '사진 구성을 확인해 주세요.';end if;
 if exists(select 1 from public.club_media where club_id=c.id and media_status='available' and not(id=any(p_order))) or exists(select 1 from unnest(p_order)x where not exists(select 1 from public.club_media where id=x and club_id=c.id and media_status='available')) then raise exception '다른 동호회 또는 변경된 사진은 사용할 수 없습니다.';end if;
 if p_primary is not null and (not(p_primary=any(p_order)) or p_primary=any(p_hidden) or not exists(select 1 from public.club_media where id=p_primary and club_id=c.id and visibility='public' and public_consent)) then raise exception '대표사진은 공개된 사진에서 선택해 주세요.';end if;
 update public.club_media m set gallery_order=o.n::integer,gallery_hidden=m.id=any(p_hidden) from unnest(p_order) with ordinality o(id,n) where m.id=o.id and m.club_id=c.id;
 update private.club_galleries set primary_id=p_primary,version=version+1 where club_id=c.id;
 r:=jsonb_build_object('version',g.version+1);
 insert into private.club_gallery_requests values(auth.uid(),p_request_id,c.id,f,r);
 return r;
end $$;
create or replace function public.get_club_core_content(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_notices boolean := false;
  v_can_read_posts boolean := false;
  v_can_read_events boolean := false;
  v_can_create_notices boolean := false;
  v_can_manage_notices boolean := false;
  v_can_create_posts boolean := false;
  v_can_moderate_posts boolean := false;
  v_can_create_events boolean := false;
  v_can_manage_events boolean := false;
begin
  if p_club_id is null or not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    v_can_read_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.read');
    v_can_read_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.read');
    v_can_read_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.read');
    v_can_create_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.create');
    v_can_manage_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.manage');
    v_can_create_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create');
    v_can_moderate_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate');
    v_can_create_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.create');
    v_can_manage_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.manage');
  end if;

  return pg_catalog.jsonb_build_object(
    'notices', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(visible_notice) - 'importance_rank'
        order by visible_notice.importance_rank, visible_notice.published_at desc, visible_notice.id
      )
      from (
        select
          notice.id,
          notice.title,
          notice.content_summary,
          notice.notice_type,
          notice.importance,
          notice.visibility,
          notice.notice_status,
          notice.published_at,
          notice.created_at,
          notice.updated_at,
          notice.version,
          case notice.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as author_role,
          v_can_manage_notices as can_manage,
          case notice.importance when 'urgent' then 0 when 'important' then 1 else 2 end as importance_rank
        from public.club_notices as notice
        where notice.club_id = p_club_id
          and notice.notice_status = 'published'
          and (
            notice.visibility = 'public'
            or (notice.visibility = 'club_members' and v_can_read_notices)
          )
        order by importance_rank, notice.published_at desc, notice.id
        limit 50
      ) as visible_notice
    ), '[]'::jsonb),
    'posts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_post) order by visible_post.published_at desc, visible_post.id)
      from (
        select
          post.id,
          post.title,
          post.content_summary,
          post.post_type,
          post.starts_at,
          post.ends_at,
          post.linked_course_legacy_key,
          post.location,
          post.capacity,
          post.participant_target,
          post.recruitment_status,
          post.visibility,
          post.moderation_status,
          post.post_status,
          post.published_at,
          post.created_at,
          post.updated_at,
          post.version,
          case post.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            when 'club_manager' then 'clubManager'
            else 'member'
          end as author_role,
          case
            when profile.display_name is null then null
            when post.author_user_id = v_actor_id then profile.display_name
            when profile.profile_visibility = 'public' then profile.display_name
            when post.visibility = 'club_members'
             and v_can_read_posts
             and profile.profile_visibility = 'members' then profile.display_name
            else null
          end as author_display_name,
          (post.author_user_id = v_actor_id and v_can_create_posts) as can_edit,
          ((post.author_user_id = v_actor_id and v_can_create_posts) or v_can_moderate_posts) as can_delete
        from public.club_posts as post
        left join public.user_profiles as profile
          on profile.user_id = post.author_user_id
        where post.club_id = p_club_id
          and post.activity_category is null
          and post.moderation_status = 'visible'
          and post.post_status in ('published', 'edited')
          and (
            post.visibility = 'public'
            or (post.visibility = 'club_members' and v_can_read_posts)
          )
        order by post.published_at desc, post.id
        limit 50
      ) as visible_post
    ), '[]'::jsonb),
    'official_events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_event) order by visible_event.starts_at, visible_event.id)
      from (
        select
          event.id,
          event.event_type,
          event.event_status,
          event.title,
          event.starts_at,
          event.ends_at,
          event.linked_course_legacy_key,
          event.location,
          event.participant_target,
          event.capacity,
          event.reservation_method,
          event.member_reservation_guidance,
          event.organizer_guidance,
          event.visibility,
          event.moderation_status,
          event.version,
          event.created_at,
          event.updated_at,
          case event.creator_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as creator_role,
          v_can_manage_events as can_manage
        from public.club_official_events as event
        where event.club_id = p_club_id
          and event.moderation_status = 'visible'
          and event.event_status <> 'draft'
          and (
            event.visibility = 'public'
            or (event.visibility = 'club_members' and v_can_read_events)
          )
        order by event.starts_at, event.id
        limit 50
      ) as visible_event
    ), '[]'::jsonb),
    'capabilities', pg_catalog.jsonb_build_object(
      'can_create_notice', v_can_create_notices,
      'can_manage_notice', v_can_manage_notices,
      'can_create_post', v_can_create_posts,
      'can_moderate_post', v_can_moderate_posts,
      'can_create_event', v_can_create_events,
      'can_manage_event', v_can_manage_events
    )
  );
end;
$$;
-- Shared projections expose only the explicitly public original, never membership/contact data.
create function private.club_visible_course_shares(c uuid,kind text) returns setof private.club_course_shares language sql stable security definer set search_path='' as $$
 select s.* from private.club_course_shares s join public.clubs club on club.id=s.club_id
 where s.course_id=c and not s.withdrawn and not s.course_hidden and club.club_status='active' and exists(select 1 from public.courses x where x.id=c and x.course_status='active' and x.course_type='field') and (
 kind='post' and exists(select 1 from public.club_posts p where p.id=s.post_id and p.club_id=s.club_id and p.visibility='public' and p.post_status in('published','edited') and p.moderation_status='visible')
 or kind='photo' and exists(select 1 from public.club_media m where m.id=s.media_id and m.club_id=s.club_id and m.visibility='public' and m.public_consent and m.media_status='available' and not m.gallery_hidden)
 )
$$;
create function public.read_course_stories_with_clubs(p_course_key text,p_category text default null,p_offset integer default 0,p_preview boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses;base jsonb;items jsonb;shared_count integer;begin
 base:=public.course_story_read(p_course_key,null,p_category,p_offset,p_preview,false);
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';
 select count(*) into shared_count from private.club_visible_course_shares(c.id,'post') s join public.club_posts p on p.id=s.post_id where p_category is null or p_category=case when p.post_type='question' then 'question' else 'free' end;
 with combined as (
  select p.pinned,p.created_at,p.id,private.course_story_json(p) as data from public.course_discussion_posts p where p.course_id=c.id and p.post_status='published' and p.moderation_hidden_at is null and (p_category is null or p.category=p_category) and (not p_preview or not p.pinned)
  union all
  select false,p.created_at,p.id,jsonb_build_object('post_key',p.id::text,'title',p.title,'body',p.content_summary,'author_display_name',club.name||' 동호회','created_at',p.created_at,'category',case when p.post_type='question' then 'question' else 'free' end,'processing_status',null,'version',p.version,'pinned',false,'pinned_by',null,'pinned_at',null,'can_edit',false,'can_message',false,'can_manage',false,'hidden',false,'images','[]'::jsonb,'comment_count',0,'source_club_key',club.legacy_key,'source_club_name',club.name,'source_id',p.id,'share_id',s.id,'share_version',s.version,'can_hide',private.course_can_manage(c.id))
  from private.club_visible_course_shares(c.id,'post') s join public.club_posts p on p.id=s.post_id join public.clubs club on club.id=s.club_id where p_category is null or p_category=case when p.post_type='question' then 'question' else 'free' end
 ),limited as(select * from combined order by pinned desc,created_at desc,id limit case when p_preview then 4 else 20 end offset p_offset)
 select coalesce(jsonb_agg(data order by pinned desc,created_at desc,id),'[]'::jsonb) into items from limited;
 return base||jsonb_build_object('items',items,'total',(base->>'total')::integer+shared_count);
end $$;
create function public.list_course_media_with_clubs(p_course_key text,p_limit integer default 12,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.courses;items jsonb;total integer;base jsonb;begin
 -- Reuse the original input validation, current venue scope and status contract.
 base:=public.list_public_course_media(p_course_key,p_limit,p_offset);
 select * into c from public.courses where course_key=btrim(p_course_key) and course_status='active';
 if c.course_type<>'field' then return base;end if;
 select (base->>'total')::integer+count(*) into total from private.club_visible_course_shares(c.id,'photo');
 with combined as (
  select m.available_at,m.id,jsonb_build_object('media_key',m.media_key,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path,'caption',m.caption,'created_at',m.created_at,'can_delete',coalesce(m.uploader_user_id=auth.uid() and exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active'),false)) as data from public.course_media m where m.course_id=c.id and m.media_status='available'
  union all
  select m.available_at,m.id,jsonb_build_object('media_key','club_'||replace(m.id::text,'-',''),'source_id',m.id,'source_club_key',club.legacy_key,'source_club_name',club.name,'caption',m.caption,'created_at',m.created_at,'can_delete',false,'share_id',s.id,'share_version',s.version,'can_hide',private.course_can_manage(c.id))
  from private.club_visible_course_shares(c.id,'photo') s join public.club_media m on m.id=s.media_id join public.clubs club on club.id=s.club_id
 ),limited as(select * from combined order by available_at desc,id limit p_limit offset p_offset)
 select coalesce(jsonb_agg(data order by available_at desc,id),'[]'::jsonb) into items from limited;
 return jsonb_build_object('items',items,'total',total,'limit',p_limit,'offset',p_offset,'has_more',p_offset+p_limit<total);
end $$;
create function public.list_club_content_reports(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid;begin
 select id into c from public.clubs where legacy_key=p_club_key and club_status='active';
 if c is null or (private.club_user_has_permission(auth.uid(),c,'club.posts.moderate') or private.club_user_has_permission(auth.uid(),c,'club.media.review')) is not true then raise exception '신고 검토 권한이 없습니다.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'post_id',r.post_id,'media_id',r.media_id,'reason',r.reason,'created_at',r.created_at,'resolved',r.resolved) order by r.created_at desc) from (select * from private.club_content_reports r where r.club_id=c and (r.post_id is not null and private.club_user_has_permission(auth.uid(),c,'club.posts.moderate') or r.media_id is not null and private.club_user_has_permission(auth.uid(),c,'club.media.review')) order by r.created_at desc limit 50)r),'[]'::jsonb);
end $$;
create function public.resolve_club_content_report(p_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.club_content_reports;a uuid:=auth.uid();result jsonb;fp jsonb:=jsonb_build_object('id',p_id);begin
 select * into r from private.club_content_reports where id=p_id for update;
 if not found or private.club_user_has_permission(a,r.club_id,case when r.post_id is not null then 'club.posts.moderate' else 'club.media.review' end) is not true then raise exception '신고 검토 권한이 없습니다.' using errcode='42501';end if;
 result:=private.club_extension_previous(a,p_request_id,'report_resolve',fp);if result is not null then return result;end if;
 update private.club_content_reports set resolved=true where id=p_id;result:=jsonb_build_object('id',p_id);perform private.club_extension_complete(a,p_request_id,'report_resolve',fp,result);return result;
end $$;

DO $acl$ DECLARE r record; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE (n.nspname='private' AND p.proname=ANY(ARRAY['club_photo_writer','club_lock_photo_actor','club_extension_previous','club_extension_complete','club_share_target','club_set_share','club_photo_readable','club_post_readable','club_post_safe_json','club_gallery_finalized','club_source_share_guard','club_photo_hidden_guard','club_visible_course_shares'])) OR (n.nspname='public' AND p.proname=ANY(ARRAY['save_club_post','create_club_photo_upload','save_club_photo','get_club_gallery','get_club_photo_file','get_club_post','list_club_activities','moderate_course_club_share','report_club_content','read_course_stories_with_clubs','list_course_media_with_clubs','list_club_content_reports','resolve_club_content_report'])) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public,anon,authenticated,service_role',r.oid::regprocedure);
 END LOOP; END $acl$;
grant execute on function public.save_club_post(uuid,text,uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.create_club_photo_upload(uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_club_photo(uuid,integer,uuid,jsonb) to authenticated;
grant execute on function public.get_club_gallery(text) to anon,authenticated;
grant execute on function public.get_club_photo_file(uuid) to anon,authenticated;
grant execute on function public.get_club_post(uuid) to anon,authenticated;
grant execute on function public.list_club_activities(text,integer,integer,boolean) to anon,authenticated;
grant execute on function public.moderate_course_club_share(uuid,integer,uuid,boolean) to authenticated;
grant execute on function public.report_club_content(text,uuid,text,uuid) to authenticated;
grant execute on function public.read_course_stories_with_clubs(text,text,integer,boolean) to anon,authenticated;
grant execute on function public.list_course_media_with_clubs(text,integer,integer) to anon,authenticated;
grant execute on function public.list_club_content_reports(text) to authenticated;
grant execute on function public.resolve_club_content_report(uuid,uuid) to authenticated;
