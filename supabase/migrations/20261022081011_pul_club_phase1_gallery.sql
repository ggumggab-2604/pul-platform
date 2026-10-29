-- Phase 1: additive gallery; no object deletion on hide or selection.
alter table public.club_media drop constraint club_media_kind_check;
alter table public.club_media add constraint club_media_kind_check check(media_kind in('representative','activity','gallery'));
alter table public.club_media drop constraint club_media_activity_type_check;
alter table public.club_media add constraint club_media_activity_type_check check((media_kind in('representative','gallery') and activity_type is null) or (media_kind='activity' and activity_type in('monthly_meeting','tournament','friendly_match','screen_event','outing','training','community_event','other')));
alter table public.club_media add column gallery_hidden boolean not null default false;
alter table public.club_media add column gallery_order integer not null default 0;
create table private.club_galleries(club_id uuid primary key references public.clubs(id) on delete restrict,primary_id uuid references public.club_media(id) on delete restrict,version integer not null default 1 check(version>0));
create table private.club_gallery_requests(actor_id uuid not null references public.user_accounts(id),request_id uuid not null,club_id uuid not null references public.clubs(id),fingerprint text not null,result jsonb not null,primary key(actor_id,request_id));
alter table private.club_galleries enable row level security;
alter table private.club_gallery_requests enable row level security;
revoke all on private.club_galleries,private.club_gallery_requests from public,anon,authenticated,service_role;
create index club_gallery_requests_club_idx on private.club_gallery_requests(club_id);
create or replace function public.create_club_media_upload_intent(
  p_club_id uuid,
  p_media_kind text,
  p_caption text,
  p_activity_type text,
  p_taken_on date,
  p_declared_mime_type text,
  p_declared_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_status text;
  v_club_status text;
  v_media_id uuid := gen_random_uuid();
  v_caption text := nullif(pg_catalog.btrim(p_caption), '');
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select account.account_status
  into v_actor_status
  from public.user_accounts as account
  where account.id = v_actor_id
  for share;

  if v_actor_status is distinct from 'active' then
    raise exception '정상 활동 계정만 사진을 등록할 수 있습니다.';
  end if;

  select club.club_status
  into v_club_status
  from public.clubs as club
  where club.id = p_club_id
  for update;

  if v_club_status is null then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;
  if v_club_status <> 'active' then
    raise exception '활동 중인 동호회에만 사진을 등록할 수 있습니다.';
  end if;
  if not private.club_user_has_permission(v_actor_id, p_club_id, 'club.media.review') then
    raise exception '동호회 사진 관리 권한이 없습니다.';
  end if;

  if p_media_kind not in ('representative', 'activity', 'gallery') then
    raise exception '사진 종류 입력을 확인해 주세요.';
  end if;
  if v_caption is not null and pg_catalog.char_length(v_caption) > 180 then
    raise exception '사진 설명은 180자 이하여야 합니다.';
  end if;
  if p_media_kind in ('representative','gallery') and p_activity_type is not null then
    raise exception '대표사진에는 활동 종류를 지정할 수 없습니다.';
  end if;
  if p_media_kind = 'activity' and p_activity_type not in (
    'monthly_meeting', 'tournament', 'friendly_match', 'screen_event',
    'outing', 'training', 'community_event', 'other'
  ) then
    raise exception '활동사진 종류 입력을 확인해 주세요.';
  end if;
  if p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes < 1 or p_declared_size_bytes > 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;

  insert into public.club_media (
    id, club_id, media_kind, storage_path, caption, activity_type, taken_on,
    uploaded_by_user_id, declared_mime_type, declared_size_bytes
  )
  values (
    v_media_id, p_club_id, p_media_kind,
    p_club_id::text || '/' || v_media_id::text || '/original',
    v_caption, p_activity_type, p_taken_on, v_actor_id,
    p_declared_mime_type, p_declared_size_bytes
  );

  return pg_catalog.jsonb_build_object(
    'media_id', v_media_id,
    'media_status', 'pending_upload',
    'version', 1
  );
end;
$$;
CREATE OR REPLACE FUNCTION public.get_club_media_content(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_notices boolean := false;
  v_can_read_events boolean := false;
  v_can_read_posts boolean := false;
  v_can_manage_media boolean := false;
  v_representative jsonb;
  v_activity_photos jsonb := '[]'::jsonb;
  v_recent_activities jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
      and (club.directory_is_public or exists (
        select 1 from public.club_memberships as membership
        join public.user_accounts as account on account.id = membership.user_id
        where membership.club_id = club.id
          and membership.user_id = (select auth.uid())
          and membership.membership_status = 'active'
          and account.account_status = 'active'
      ))
  ) then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    v_can_read_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.read');
    v_can_read_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.read');
    v_can_read_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.read');
    v_can_manage_media := private.club_user_has_permission(v_actor_id, p_club_id, 'club.media.review');
  end if;

  select pg_catalog.jsonb_build_object(
    'id', media.id,
    'media_kind', media.media_kind,
    'storage_bucket', media.storage_bucket,
    'storage_path', media.storage_path,
    'caption', media.caption,
    'activity_type', media.activity_type,
    'taken_on', media.taken_on,
    'created_at', media.created_at,
    'version', media.version,
    'can_manage', v_can_manage_media
  )
  into v_representative
  from public.club_media as media
  where media.club_id = p_club_id
    and not media.gallery_hidden
    and media.media_kind = 'representative'
    and media.media_status = 'available'
  limit 1;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', media.id,
        'media_kind', media.media_kind,
        'storage_bucket', media.storage_bucket,
        'storage_path', media.storage_path,
        'caption', media.caption,
        'activity_type', media.activity_type,
        'taken_on', media.taken_on,
        'created_at', media.created_at,
        'version', media.version,
        'can_manage', v_can_manage_media
      )
      order by coalesce(media.taken_on, media.created_at::date) desc, media.created_at desc, media.id
    ),
    '[]'::jsonb
  )
  into v_activity_photos
  from public.club_media as media
  where media.club_id = p_club_id
    and media.media_kind = 'activity'
    and media.media_status = 'available';

  with recent_source as (
    select
      'notice:' || notice.id::text as id,
      'notice'::text as source_type,
      case when notice.importance in ('important', 'urgent') then '중요 공지가 등록되었습니다' else '새 공지가 등록되었습니다' end as title,
      notice.title as summary,
      notice.created_at as occurred_at,
      case when notice.notice_type = 'event' then 'community_event' else 'other' end as activity_type,
      notice.visibility
    from public.club_notices as notice
    where notice.club_id = p_club_id
      and notice.notice_status = 'published'
      and (notice.visibility = 'public' or (notice.visibility = 'club_members' and v_can_read_notices))

    union all

    select
      'event:' || event.id::text,
      'event'::text,
      case event.event_type
        when 'monthly_meeting' then '월례회 일정이 등록되었습니다'
        when 'friendly_match' then '친선 경기 일정이 등록되었습니다'
        else '새 공식 일정이 등록되었습니다'
      end,
      event.title,
      event.created_at,
      case event.event_type
        when 'monthly_meeting' then 'monthly_meeting'
        when 'club_tournament' then 'tournament'
        when 'screen_tournament' then 'screen_event'
        when 'friendly_match' then 'friendly_match'
        when 'outing' then 'outing'
        when 'training' then 'training'
        else 'other'
      end,
      event.visibility
    from public.club_official_events as event
    where event.club_id = p_club_id
      and event.event_status <> 'cancelled'
      and event.moderation_status = 'visible'
      and (event.visibility = 'public' or (event.visibility = 'club_members' and v_can_read_events))

    union all

    select
      'post:' || post.id::text,
      'post'::text,
      case post.post_type
        when 'flash_meeting' then '새 번개 모임이 등록되었습니다'
        when 'companion' then '새 같이 가요 글이 등록되었습니다'
        when 'round_review' then '라운드 후기가 올라왔습니다'
        else '새 게시글이 등록되었습니다'
      end,
      post.title,
      post.created_at,
      'other'::text,
      post.visibility
    from public.club_posts as post
    where post.club_id = p_club_id
      and post.post_status in ('published', 'edited')
      and post.moderation_status = 'visible'
      and (post.visibility = 'public' or (post.visibility = 'club_members' and v_can_read_posts))

    union all

    select
      'photo:' || media.id::text,
      'photo'::text,
      '새 활동사진이 등록되었습니다',
      coalesce(media.caption, '동호회 활동사진'),
      media.created_at,
      media.activity_type,
      'public'::text
    from public.club_media as media
    where media.club_id = p_club_id
      and media.media_kind = 'activity'
      and media.media_status = 'available'
  ), limited_recent as (
    select *
    from recent_source
    order by occurred_at desc, id
    limit 5
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', recent.id,
        'source_type', recent.source_type,
        'title', recent.title,
        'summary', recent.summary,
        'occurred_at', recent.occurred_at,
        'activity_type', recent.activity_type,
        'visibility', recent.visibility
      )
      order by recent.occurred_at desc, recent.id
    ),
    '[]'::jsonb
  )
  into v_recent_activities
  from limited_recent as recent;

  return pg_catalog.jsonb_build_object(
    'representative_photo', v_representative,
    'activity_photos', v_activity_photos,
    'recent_activities', v_recent_activities,
    'capabilities', pg_catalog.jsonb_build_object(
      'can_manage_media', v_can_manage_media
    )
  );
end;
$function$;

create function private.club_gallery_finalized() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.media_kind in('representative','gallery') and new.media_status='available' and (tg_op='INSERT' or old.media_status is distinct from new.media_status) then
 insert into private.club_galleries(club_id,primary_id) values(new.club_id,case when not exists(select 1 from public.club_media where club_id=new.club_id and media_status='available' and media_kind='representative' and not gallery_hidden and id<>new.id) then new.id else null end)
 on conflict(club_id) do update set version=private.club_galleries.version+1;
 end if;
 return new;
end $$;
create trigger club_gallery_finalized after insert or update on public.club_media for each row execute function private.club_gallery_finalized();
create function public.get_club_gallery(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs;g private.club_galleries;manage boolean;items jsonb;primary_photo uuid;
begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' and directory_is_public;
 if not found then raise exception '동호회를 찾을 수 없습니다.';end if;
 manage:=auth.uid() is not null and exists(select 1 from public.user_accounts where id=auth.uid() and account_status='active') and private.club_user_has_permission(auth.uid(),c.id,'club.media.review');
 select * into g from private.club_galleries where club_id=c.id;
 primary_photo:=g.primary_id;
 if primary_photo is null then select id into primary_photo from public.club_media where club_id=c.id and media_kind='representative' and media_status='available' and not gallery_hidden;end if;
 if not exists(select 1 from public.club_media where id=primary_photo and club_id=c.id and media_status='available' and not gallery_hidden) then primary_photo:=null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'path',storage_path,'caption',caption,'hidden',gallery_hidden) order by gallery_order,created_at,id),'[]') into items from public.club_media where club_id=c.id and media_kind in('representative','gallery') and media_status='available' and (manage or not gallery_hidden);
 return jsonb_build_object('items',items,'primary_id',primary_photo,'can_manage',coalesce(manage,false),'version',case when manage then coalesce(g.version,1) else null end);
end $$;
revoke all on function public.get_club_gallery(text) from public,anon,authenticated,service_role;
grant execute on function public.get_club_gallery(text) to anon,authenticated;
create function public.save_club_gallery(p_club_key text,p_expected_version integer,p_request_id uuid,p_order uuid[],p_hidden uuid[],p_primary uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
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
 if exists(select 1 from public.club_media where club_id=c.id and media_kind in('representative','gallery') and media_status='available' and not(id=any(p_order))) or exists(select 1 from unnest(p_order)x where not exists(select 1 from public.club_media where id=x and club_id=c.id and media_kind in('representative','gallery') and media_status='available')) then raise exception '다른 동호회 또는 변경된 사진은 사용할 수 없습니다.';end if;
 if p_primary is not null and (not(p_primary=any(p_order)) or p_primary=any(p_hidden)) then raise exception '대표사진은 공개된 사진에서 선택해 주세요.';end if;
 update public.club_media m set gallery_order=o.n::integer,gallery_hidden=m.id=any(p_hidden) from unnest(p_order) with ordinality o(id,n) where m.id=o.id and m.club_id=c.id;
 update private.club_galleries set primary_id=p_primary,version=version+1 where club_id=c.id;
 r:=jsonb_build_object('version',g.version+1);
 insert into private.club_gallery_requests values(auth.uid(),p_request_id,c.id,f,r);
 return r;
end $$;
revoke all on function public.save_club_gallery(text,integer,uuid,uuid[],uuid[],uuid) from public,anon,authenticated,service_role;
grant execute on function public.save_club_gallery(text,integer,uuid,uuid[],uuid[],uuid) to authenticated;

revoke all on function private.club_gallery_finalized() from public,anon,authenticated,service_role;
