-- Follow-up to the applied activity/gallery migrations. Historical artifacts unchanged.

create or replace function private.club_share_target(c uuid,k text) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 perform 1 from public.clubs where id=c and club_status='active' and directory_is_public for share;
 if not found then raise exception '공개 상세를 제공하는 동호회만 구장에 함께 표시할 수 있습니다.' using errcode='22023';end if;
 select id into target from public.courses where course_key=k and course_type='field' and course_status='active' for share;
 if target is null then raise exception '연결 야외구장을 확인해 주세요.' using errcode='22023';end if;
 perform 1 from public.course_club_links where club_id=c and course_id=target for share;
 if not found then raise exception '활동 구장 연결이 변경되었습니다. 현재 연결 대상을 다시 확인해 주세요.' using errcode='40001';end if;
 return target;
end $$;

create or replace function private.club_set_share(c uuid,p uuid,m uuid,k text,v text,confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 if k is not null then
  perform 1 from public.clubs where id=c and club_status='active' and directory_is_public for share;
  if not found then raise exception '공개 상세를 제공하는 동호회만 구장에 함께 표시할 수 있습니다.' using errcode='22023';end if;
  if v is distinct from 'public' or confirmed is not true then raise exception '구장 방문자도 읽을 수 있도록 전체 공개 선택을 확인해 주세요.' using errcode='22023';end if;
  select course.id into target from public.courses course join private.club_course_shares s on s.course_id=course.id where course.course_key=k and course.course_type='field' and course.course_status='active' and s.club_id=c and s.post_id is not distinct from p and s.media_id is not distinct from m and not s.withdrawn;
  -- The same non-withdrawn relation keeps its ID/version and historical venue.
  -- New targets and withdrawn relations must pass the current link check.
  if target is null then target:=private.club_share_target(c,k);end if;
 end if;
 update private.club_course_shares set withdrawn=true,version=version+1 where club_id=c and post_id is not distinct from p and media_id is not distinct from m and not withdrawn and (target is null or course_id<>target);
 if target is not null then
  if p is not null then insert into private.club_course_shares(club_id,course_id,post_id) values(c,target,p) on conflict(post_id,course_id) where post_id is not null do update set withdrawn=false,version=private.club_course_shares.version+case when private.club_course_shares.withdrawn then 1 else 0 end;
  else insert into private.club_course_shares(club_id,course_id,media_id) values(c,target,m) on conflict(media_id,course_id) where media_id is not null do update set withdrawn=false,version=private.club_course_shares.version+case when private.club_course_shares.withdrawn then 1 else 0 end;end if;
 end if;
end $$;

create or replace function private.club_photo_readable(m public.club_media) returns boolean language sql stable security definer set search_path='' as $$
 select m.media_status='available' and exists(select 1 from public.clubs c where c.id=m.club_id and c.club_status='active') and (
  not m.gallery_hidden and m.visibility='public' and m.public_consent and exists(select 1 from public.clubs c where c.id=m.club_id and c.directory_is_public)
  or private.club_user_has_permission(auth.uid(),m.club_id,'club.posts.read') and (not m.gallery_hidden or m.uploaded_by_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),m.club_id,'club.media.review'))
 )
$$;

create or replace function private.club_post_readable(p public.club_posts) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clubs c where c.id=p.club_id and c.club_status='active') and (
 p.post_status in('published','edited') and p.moderation_status='visible' and (p.visibility='public' and exists(select 1 from public.clubs c where c.id=p.club_id and c.directory_is_public) or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.read'))
 or private.club_photo_writer(auth.uid(),p.club_id) and (p.author_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate'))
 )
$$;

create or replace function private.club_visible_course_shares(c uuid,kind text) returns setof private.club_course_shares language sql stable security definer set search_path='' as $$
 select s.* from private.club_course_shares s join public.clubs club on club.id=s.club_id
 where s.course_id=c and not s.withdrawn and not s.course_hidden and club.club_status='active' and club.directory_is_public and exists(select 1 from public.courses x where x.id=c and x.course_status='active' and x.course_type='field') and (
 kind='post' and exists(select 1 from public.club_posts p where p.id=s.post_id and p.club_id=s.club_id and p.visibility='public' and p.post_status in('published','edited') and p.moderation_status='visible')
 or kind='photo' and exists(select 1 from public.club_media m where m.id=s.media_id and m.club_id=s.club_id and m.visibility='public' and m.public_consent and m.media_status='available' and not m.gallery_hidden)
 )
$$;

create or replace function public.get_club_gallery(p_club_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.clubs;g private.club_galleries;manage boolean;items jsonb;primary_photo uuid;begin
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' and (directory_is_public or private.club_user_has_permission(auth.uid(),id,'club.posts.read'));if not found then raise exception '동호회를 찾을 수 없습니다.' using errcode='P0002';end if;
 manage:=private.club_user_has_permission(auth.uid(),c.id,'club.media.review');select * into g from private.club_galleries where club_id=c.id;primary_photo:=g.primary_id;
 if primary_photo is null then select id into primary_photo from public.club_media where club_id=c.id and media_kind='representative' and media_status='available' and visibility='public' and public_consent and not gallery_hidden limit 1;end if;
 if not exists(select 1 from public.club_media m where m.id=primary_photo and m.club_id=c.id and m.visibility='public' and m.public_consent and not m.gallery_hidden and private.club_photo_readable(m)) then primary_photo:=null;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'path',case when x.storage_bucket='club-media' then x.storage_path else null end,'can_restore',coalesce(x.gallery_hidden_by=auth.uid() or manage,false),'caption',x.caption,'hidden',x.gallery_hidden,'visibility',x.visibility,'version',x.version,'can_edit',coalesce((x.uploaded_by_user_id=auth.uid() and private.club_photo_writer(auth.uid(),c.id)) or manage,false),'is_owner',coalesce(x.uploaded_by_user_id=auth.uid(),false),'public_consent',x.public_consent,'shared_course',(select jsonb_build_object('key',course.course_key,'name',course.name) || case when x.uploaded_by_user_id=auth.uid() or manage then jsonb_build_object('course_hidden',s.course_hidden) else '{}'::jsonb end from private.club_course_shares s join public.courses course on course.id=s.course_id where s.media_id=x.id and not s.withdrawn limit 1)) order by x.gallery_order,x.created_at,x.id),'[]'::jsonb) into items from (select distinct on(m.storage_bucket,m.storage_path) m.* from public.club_media m where m.club_id=c.id and private.club_photo_readable(m) order by m.storage_bucket,m.storage_path,(m.id=primary_photo) desc,m.created_at,m.id)x;
 return jsonb_build_object('items',items,'primary_id',primary_photo,'can_manage',coalesce(manage,false),'can_upload',private.club_photo_writer(auth.uid(),c.id),'viewer_id',auth.uid(),'version',case when manage then coalesce(g.version,1) else null end);
end $$;

-- A terminal state under the same row lock used by finalize owns compensation.
-- A failed row cannot become available; an available row never grants deletion.
create function public.claim_club_media_upload_cleanup_server(p_actor_user_id uuid,p_media_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.club_media;
begin
 select * into m from public.club_media where id=p_media_id for update;
 if not found or m.uploaded_by_user_id is distinct from p_actor_user_id or p_actor_user_id is null then
  raise exception '사진 업로드 정보를 찾을 수 없습니다.' using errcode='42501';
 end if;
 if m.media_status='pending_upload' then
  update public.club_media set media_status='failed',version=version+1 where id=m.id returning * into m;
 end if;
 if m.media_status='failed' then
  return jsonb_build_object('media_id',m.id,'media_status',m.media_status,'cleanup_allowed',true,'storage_bucket',m.storage_bucket,'storage_path',m.storage_path,'version',m.version);
 end if;
 return jsonb_build_object('media_id',m.id,'media_status',m.media_status,'cleanup_allowed',false);
end $$;
revoke all on function public.claim_club_media_upload_cleanup_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_club_media_upload_cleanup_server(uuid,uuid) to service_role;
-- Preserve the original void API and its service-only ACL.
create or replace function public.mark_club_media_upload_failed_server(p_actor_user_id uuid,p_media_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin perform public.claim_club_media_upload_cleanup_server(p_actor_user_id,p_media_id);end $$;


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
    begin
      perform private.club_share_target(v_media.club_id,(select course_key from public.courses where id=v_media.intended_course_id));
    exception when sqlstate '40001' or sqlstate '22023' then
      raise exception '공유 대상이 변경되었습니다. 게시 위치를 다시 선택하거나 동호회에만 올려 주세요.' using errcode='PCL01';
    end;
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
