-- A scope: pure course guards only. No withdrawal DDL, Auth triggers, or Control.
begin;

-- Source: supabase/migrations/20261020000125_course_withdrawal_runtime.sql; exact body 06a745e8188831d65242eba8c04be4c50230172a210e7505f3d80385ae704d60
create or replace function private.course_invitation_resolve(p_id uuid,p_action text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();i private.course_operator_invitations%rowtype;r jsonb;
begin
 perform private.course_next_lock();perform private.course_expire_invitations();
 if p_action is null or p_action not in ('accept','decline','cancel') or p_request_id is null then raise exception '수락 요청을 확인해 주세요.' using errcode='22023';end if;
 select * into i from private.course_operator_invitations where id=p_id for update;
 if not found or (p_action='cancel' and i.inviter_id is distinct from a) or (p_action<>'cancel' and i.target_id is distinct from a) then raise exception '본인 요청만 처리할 수 있습니다.' using errcode='42501';end if;
 r:=private.course_next_claim(a,p_request_id,'course.invitation_resolve',jsonb_build_array(p_id,p_action));if r is not null then return r;end if;
 if i.status<>'pending' then raise exception '요청이 만료되었거나 이미 처리되었습니다.' using errcode='PT409';end if;
 if p_action='accept' then
  if not private.course_can_manage(i.course_id,i.inviter_id) or not exists(select 1 from public.courses where id=i.course_id and course_status='active') then raise exception '운영자 지정 조건이 변경되었습니다.' using errcode='PT409';end if;
  update private.course_operator_invitations set status='accepted',resolved_at=clock_timestamp() where id=i.id;
  if i.kind='transfer' then
   update private.course_stewards set active=false,updated_at=clock_timestamp() where course_id=i.course_id and user_id=i.inviter_id and slot_no=i.slot_no and active;
   if not found then raise exception '넘겨줄 운영권이 변경되었습니다.' using errcode='PT409';end if;
  end if;
  if exists(select 1 from private.course_stewards where course_id=i.course_id and user_id=a and active) then raise exception '이미 이 구장 운영자입니다.' using errcode='PT409';end if;
  insert into private.course_stewards(course_id,user_id,granted_by) values(i.course_id,a,i.inviter_id) on conflict(course_id,user_id) do update set active=true,granted_by=excluded.granted_by,updated_at=clock_timestamp();
 else update private.course_operator_invitations set status=case when p_action='cancel' then 'cancelled' else 'declined' end,resolved_at=clock_timestamp() where id=i.id;
 end if;
 insert into private.course_operator_audit(course_id,actor_id,target_id,action,request_id)values(i.course_id,a,i.target_id,p_action,p_request_id);
 r:=jsonb_build_object('id',p_id,'status',case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end);
 perform private.course_complete_request(a,p_request_id,r);return r;
end $$;

-- Source: supabase/migrations/20261020000125_course_withdrawal_runtime.sql; exact body 97d4deb652fbdcc4163a2f5a548be0cc46d88e50d1380f15f703d69b1dfd5ad5
create or replace function private.course_shared_access(t private.course_shared_threads,a uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.messaging_account_available(a) and coalesce(t.requester_id=a or private.course_current_operator(t.course_id,a),false)
$$;

-- Source: supabase/migrations/20261020000125_course_withdrawal_runtime.sql; exact body 06a194d88d51e41f0a75ad23d7ffe8830c9f6abdfb0dafbc5d7cca5b23e37454
create or replace function private.course_shared_read(p_thread uuid,p_mark boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();t private.course_shared_threads%rowtype;c public.courses%rowtype;messages jsonb;
begin
 select * into t from private.course_shared_threads where id=p_thread;
 if not found or not private.course_shared_access(t,a) then raise exception '문의 열람 권한이 없습니다.' using errcode='42501';end if;
 select * into c from public.courses where id=t.course_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'name',private.messaging_display_name(m.sender_user_id),'at',m.created_at,'operator',x.operator_reply,'seq',x.seq) order by x.seq),'[]') into messages from private.course_shared_messages x join public.messaging_messages m on m.id=x.message_id where x.thread_id=t.id;
 if p_mark then insert into private.course_shared_reads(thread_id,user_id,last_seq)values(t.id,a,t.version) on conflict(thread_id,user_id)do update set last_seq=greatest(course_shared_reads.last_seq,excluded.last_seq),read_at=clock_timestamp();end if;
 return jsonb_build_object('id',t.id,'course_key',c.course_key,'course_name',case when c.course_status='active' then c.name else '비공개 구장' end,'version',t.version,'status',t.status,
 'answered_by',case when t.answered_by is not null then private.messaging_display_name(t.answered_by) end,'answered_at',t.answered_at,
 'member',coalesce(t.requester_id=a,false),'can_send',private.messaging_account_available(t.requester_id) and c.course_status='active' and exists(select 1 from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)),
 'messages',messages);
end $$;

-- Source: supabase/migrations/20261020000125_course_withdrawal_runtime.sql; exact body bec29d40b3a6f633ef87e9e65cd4ad8891d89ff0c81ead212c0edd967fb52898
create or replace function private.course_shared_send(p_course_key text,p_thread uuid,p_body text,p_version integer,p_policy text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c public.courses%rowtype;t private.course_shared_threads%rowtype;r jsonb;body text:=private.messaging_trim(p_body);operator boolean;other uuid;mid uuid;stamp timestamptz;
begin
 perform private.course_next_lock();
 perform pg_advisory_xact_lock(1297303345,hashtext(a::text));
 if p_request_id is null or body is null or char_length(body) not between 1 and 2000 or p_policy is distinct from 'course-shared-v1' then raise exception '문의 안내와 1~2,000자 내용을 확인해 주세요.' using errcode='22023';end if;
 select * into c from public.courses where course_key=p_course_key;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_thread is not null then
  select * into t from private.course_shared_threads where id=p_thread and course_id=c.id for update;
  if not found or not private.course_shared_access(t,a) then raise exception '문의 권한이 변경되었습니다.' using errcode='42501';end if;
 end if;
 -- A replay only acknowledges the original event; never sends again.
 r:=private.course_next_claim(a,p_request_id,'course.shared_send',jsonb_build_array(c.id,p_thread,body,p_version,p_policy));
 if r is not null then return r;end if;
 if c.course_status<>'active' or not exists(select 1 from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id)) then raise exception '현재 구장 운영자가 없어 문의를 보낼 수 없습니다. 내용을 보관하고 나중에 직접 다시 보내 주세요.' using errcode='PT409';end if;
 operator:=p_thread is not null and t.requester_id is distinct from a;
 if p_thread is null then
  if p_version is distinct from 0 then raise exception '문의 작성 상태를 확인해 주세요.' using errcode='PT409';end if;
  insert into private.course_shared_threads(course_id,requester_id,policy_version)values(c.id,a,p_policy)returning * into t;
 elsif t.version is distinct from p_version then raise exception '다른 답변이 먼저 등록되었습니다. 최신 대화를 확인한 뒤 직접 다시 보내 주세요.' using errcode='PT409';end if;
 -- Preserve personal blocking. A new send is refused if any current participant pair is blocked.
 for other in select s.user_id from private.course_stewards s where s.course_id=c.id and private.course_current_operator(c.id,s.user_id) order by s.user_id loop
  if other<>t.requester_id then
   perform private.messaging_lock_pair(other,t.requester_id);
   if exists(select 1 from public.messaging_blocks where (blocker_user_id=other and blocked_user_id=t.requester_id)or(blocker_user_id=t.requester_id and blocked_user_id=other)) then raise exception '현재 이 문의를 보낼 수 없습니다.' using errcode='42501';end if;
  end if;
 end loop;
 if not private.messaging_account_available(t.requester_id) then raise exception '현재 이 문의를 보낼 수 없습니다.' using errcode='42501';end if;
 stamp:=clock_timestamp();
 if exists(select 1 from public.messaging_messages where sender_user_id=a and created_at>stamp-interval '3 seconds') then raise exception '잠시 뒤 직접 다시 보내 주세요.' using errcode='P0001';end if;
 if (select count(*) from public.messaging_messages where sender_user_id=a and created_at>stamp-interval '24 hours')>=100 then raise exception '오늘 보낼 수 있는 쪽지 수를 넘었습니다.' using errcode='P0001';end if;
 insert into public.messaging_messages(kind,sender_user_id,body,body_hash,recipient_key,request_id,request_fingerprint,first_contact,created_at)
 values('course_inquiry',a,body,encode(sha256(convert_to(private.messaging_normalize(body),'UTF8')),'hex'),'course:'||t.id,p_request_id,encode(sha256(convert_to(jsonb_build_array(t.id,body,p_version)::text,'UTF8')),'hex'),p_thread is null,stamp) returning id into mid;
 insert into private.course_shared_messages(message_id,thread_id,seq,operator_reply)values(mid,t.id,t.version+1,operator);
 update private.course_shared_threads set version=t.version+1,status=case when operator then 'answered' when t.version=0 then 'pending' else 'reopened' end,
 answered_by=case when operator then a else answered_by end,answered_at=case when operator then stamp else answered_at end,updated_at=stamp where id=t.id;
 insert into private.course_shared_reads(thread_id,user_id,last_seq)values(t.id,a,t.version+1)on conflict(thread_id,user_id)do update set last_seq=excluded.last_seq,read_at=clock_timestamp();
 r:=jsonb_build_object('id',t.id,'message_id',mid,'version',t.version+1);perform private.course_complete_request(a,p_request_id,r);return r;
end $$;

-- Source: supabase/migrations/20261020000126_course_activity_photo_withdrawal.sql; exact body c80eba21d87c0a87a00333527f873d20b031d225f156927e580c75808bfa6bfe
create or replace function private.course_story_json(p public.course_discussion_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.community_actor_display_name(p.author_user_id,auth.uid()),'created_at',p.created_at,
 'category',p.category,'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_by',case when p.pinned then private.messaging_display_name(p.pinned_by) end,'pinned_at',p.pinned_at,
 'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id) and not exists(select 1 from public.messaging_blocks b where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.author_user_id)or(b.blocker_user_id=p.author_user_id and b.blocked_user_id=auth.uid())),
 'can_edit',coalesce(p.author_user_id=auth.uid(),false),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$$;

-- Source: supabase/migrations/20261020000126_course_activity_photo_withdrawal.sql; exact body fc069bb90fb8dfdfb1bddf11eff30c314977d36a152c5a663562949542125e0b
create or replace function private.course_story_read(p_course_key text,p_post_key text,p_category text,p_offset integer,p_preview boolean,p_manage boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.courses%rowtype;p public.course_discussion_posts%rowtype;items jsonb;total integer;comments jsonb;notices jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_manage and not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_category is not null and p_category not in ('free','question','lost') then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 if p_post_key is not null then
  select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id and post_status='published' and moderation_hidden_at is null;
  if not found then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'parent_id',x.parent_id,'body',x.body,'author',private.community_actor_display_name(x.author_id,auth.uid()),'created_at',x.created_at,'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=x.author_id and active),'can_delete',coalesce(x.author_id=auth.uid(),false)) order by x.created_at,x.id),'[]') into comments from private.course_story_comments x where x.post_id=p.id and not x.hidden and (x.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=x.parent_id and not parent.hidden));
  return private.course_story_json(p)||jsonb_build_object('comments',comments);
 end if;
 select count(*) into total from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category);
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned desc,x.created_at desc,x.id),'[]') into items from (select * from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category) and (not p_preview or not pinned) order by pinned desc,created_at desc,id limit case when p_preview then 3 else 20 end offset p_offset)x;
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned_at desc,x.id),'[]') into notices from (select * from public.course_discussion_posts where course_id=c.id and pinned and post_status='published' and moderation_hidden_at is null order by pinned_at desc,id limit 1)x;
 return jsonb_build_object('items',items,'total',total,'notice',notices,'can_manage',private.course_can_manage(c.id),'reports',case when p_manage then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'post_key',reported.post_key,'comment_id',r.comment_id,'reason',r.reason,'resolved',r.resolved) order by r.created_at desc) from private.course_story_reports r join public.course_discussion_posts reported on reported.id=r.post_id where reported.course_id=c.id),'[]') else '[]'::jsonb end);
end $$;

-- Source: supabase/migrations/20261020000126_course_activity_photo_withdrawal.sql; exact body ec3dbd98f845ae239c2168318c1147560b700ab8563b48c3b25b0c648582e7f3
create or replace function public.list_public_course_media(
  p_course_key text,
  p_limit integer default 12,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_active boolean := false;
  v_course_id uuid;
  v_course_key text := pg_catalog.btrim(p_course_key);
  v_total integer;
  v_items jsonb := '[]'::jsonb;
begin
  if v_course_key is null
     or v_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장을 찾을 수 없습니다.';
  end if;
  if p_limit is null or p_limit not between 1 and 24
     or p_offset is null or p_offset < 0 then
    raise exception '사진 목록 범위를 확인해 주세요.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = v_course_key
    and course.course_status = 'active';

  if v_course_id is null then
    raise exception '골프장을 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    select account.account_status = 'active'
    into v_actor_active
    from public.user_accounts as account
    where account.id = v_actor_id;
    v_actor_active := coalesce(v_actor_active, false);
  end if;

  select count(*)::integer
  into v_total
  from public.course_media as media
  where media.course_id = v_course_id
    and media.media_status = 'available';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'media_key', listed.media_key,
        'storage_bucket', listed.storage_bucket,
        'storage_path', listed.storage_path,
        'caption', listed.caption,
        'created_at', listed.created_at,
        'can_delete', coalesce(v_actor_active and listed.uploader_user_id = v_actor_id,false)
      )
      order by listed.available_at desc, listed.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select media.id, media.media_key, media.storage_bucket, media.storage_path,
      media.caption, media.created_at, media.available_at, media.uploader_user_id
    from public.course_media as media
    where media.course_id = v_course_id
      and media.media_status = 'available'
    order by media.available_at desc, media.id
    limit p_limit
    offset p_offset
  ) as listed;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + p_limit < v_total
  );
end;
$$;

-- Source: supabase/migrations/20261020000126_course_activity_photo_withdrawal.sql; exact body 23a5533f527b7aad03fdbcbaeb8b8f45de8c722d3fdbdd9b57148666919e193d
create or replace function public.finalize_course_media_upload_server(
  p_actor_user_id uuid,
  p_media_key text,
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
  v_media public.course_media%rowtype;
  v_course_status text;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 회원만 사진 등록을 완료할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.course_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null or v_media.uploader_user_id is distinct from p_actor_user_id then
    raise exception '사진 업로드 정보를 찾을 수 없습니다.';
  end if;

  select course.course_status
  into v_course_status
  from public.courses as course
  where course.id = v_media.course_id
  for share;

  if v_course_status <> 'active' then
    raise exception '활동 중인 골프장 사진만 등록을 완료할 수 있습니다.';
  end if;

  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type
       and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object(
        'media_key', v_media.media_key,
        'media_status', 'available',
        'version', v_media.version,
        'replayed', true
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

  update public.course_media
  set media_status = 'available',
      verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes,
      available_at = now(),
      version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_key', v_media.media_key,
    'media_status', 'available',
    'version', v_media.version + 1,
    'replayed', false
  );
end;
$$;

-- Source: supabase/migrations/20261020000126_course_activity_photo_withdrawal.sql; exact body 4ae1ae3fa38c0755ebd5913397a156553496aae5f110c427b911e3ace66556ee
create or replace function public.remove_course_media_server(
  p_actor_user_id uuid,
  p_media_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_status text;
  v_media public.course_media%rowtype;
begin
  select account.account_status
  into v_account_status
  from public.user_accounts as account
  where account.id = p_actor_user_id
  for share;

  if v_account_status is distinct from 'active' then
    raise exception '정상 활동 회원만 본인 사진을 삭제할 수 있습니다.';
  end if;

  select media.*
  into v_media
  from public.course_media as media
  where media.media_key = p_media_key
  for update;

  if v_media.id is null then
    raise exception '사진을 찾을 수 없습니다.';
  end if;
  if v_media.uploader_user_id is distinct from p_actor_user_id then
    raise exception '본인이 등록한 사진만 삭제할 수 있습니다.';
  end if;

  if v_media.media_status = 'removed' then
    return pg_catalog.jsonb_build_object(
      'media_key', v_media.media_key,
      'media_status', 'removed',
      'version', v_media.version,
      'storage_bucket', v_media.storage_bucket,
      'storage_path', v_media.storage_path,
      'replayed', true
    );
  end if;
  if v_media.media_status <> 'available' then
    raise exception '삭제할 수 없는 사진 상태입니다.';
  end if;

  update public.course_media
  set media_status = 'removed',
      removed_at = now(),
      version = version + 1
  where id = v_media.id;

  return pg_catalog.jsonb_build_object(
    'media_key', v_media.media_key,
    'media_status', 'removed',
    'version', v_media.version + 1,
    'storage_bucket', v_media.storage_bucket,
    'storage_path', v_media.storage_path,
    'replayed', false
  );
end;
$$;

-- Source: supabase/migrations/20261020000127_withdrawal_regression_correction.sql; exact body 4b9a263c7ffd3e7d2756795801c95fcec9a35b45f6e43e44f97bae2d0c7d35fc
CREATE OR REPLACE FUNCTION private.course_story_mutate(p_course_key text, p_post_key text, p_action text, p_version integer, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.community_assert_active_actor();c public.courses%rowtype;p public.course_discussion_posts%rowtype;cm private.course_story_comments%rowtype;manager boolean;result jsonb;ids uuid[];cat text;state text;cid uuid;parent uuid;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field' for share;if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action is null or p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 manager:=private.course_can_manage(c.id,a);if p_action='save' and coalesce((p_input->>'pin')::boolean,false) then perform private.course_require_scope(c.id);end if;
 if p_post_key is not null then select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id for update;if not found then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
 if p_action in ('hide','unhide','pin','status','report_resolve') then perform private.course_require_scope(c.id);end if;
 if p_action in ('save','delete') and p.id is not null and p.author_user_id is distinct from a then raise exception '본인 글만 수정·삭제할 수 있습니다.' using errcode='42501';end if;
 if p_action<>'save' and p.id is null then raise exception '글을 확인해 주세요.' using errcode='22023';end if;
 if p_action not in ('unhide','report_resolve') and p.id is not null and (p.post_status<>'published' or p.moderation_hidden_at is not null) then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action='unhide' and not private.course_actor_has_permission(a,'courses.manage') then raise exception '숨김 해제 권한이 없습니다.' using errcode='42501';end if;
 result:=private.course_claim_request(a,p_request_id,'course.story_'||p_action,jsonb_build_object('course',c.id,'key',p_post_key,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if p_action in ('save','delete','hide','unhide','pin','status') and p.id is not null and p.version is distinct from p_version then raise exception '글이 변경되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
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
  if p_action='comment_hide' then perform private.course_require_scope(c.id);elsif cm.author_id is distinct from a then raise exception '본인 댓글만 삭제할 수 있습니다.' using errcode='42501';end if;
  update private.course_story_comments set hidden=true where id=cm.id;
 elsif p_action='report' then
  cid:=nullif(p_input->>'comment_id','')::uuid;
  if cid is not null then select * into cm from private.course_story_comments where id=cid and post_id=p.id and not hidden;if not found or cm.parent_id is not null and exists(select 1 from private.course_story_comments where id=cm.parent_id and hidden) then raise exception '공개 댓글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
  if (cid is not null and cm.author_id is not distinct from a or cid is null and p.author_user_id is not distinct from a) or char_length(btrim(coalesce(p_input->>'reason',''))) not between 2 and 1000 then raise exception '신고 대상·사유를 확인해 주세요.' using errcode='22023';end if;
  insert into private.course_story_reports(post_id,comment_id,reporter_id,reason) values(p.id,cid,a,btrim(p_input->>'reason'));
 elsif p_action='report_resolve' then update private.course_story_reports set resolved=true where id=(p_input->>'report_id')::uuid and post_id=p.id;if not found then raise exception '신고를 찾을 수 없습니다.' using errcode='P0002';end if;
 else raise exception '작업을 확인해 주세요.' using errcode='22023';end if;
 result:=jsonb_build_object('post_key',p.post_key,'version',p.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- Source: supabase/migrations/20261020000127_withdrawal_regression_correction.sql; exact body e16b31974919c38865114dd71aedc8a1f19bc06a725c8eff2e7f720a70646f38
CREATE OR REPLACE FUNCTION private.course_content_mutate(p_course_key text, p_action text, p_id uuid, p_version integer, p_request_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if p_action in ('save','delete') and r.author_id is distinct from a or p_action in ('represent','hide') and not manager then raise exception '자료 관리 권한이 없습니다.' using errcode='42501';end if;
 elsif p_action<>'save' then raise exception '자료를 확인해 주세요.';end if;
 result:=private.course_claim_request(a,p_request_id,'course.resource_'||p_action,jsonb_build_object('course',c.id,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if r.id is not null and (r.version<>p_version or r.status<>'published') then raise exception '자료가 변경되었거나 공개되지 않았습니다. 새로고침해 주세요.' using errcode='PT409';end if;
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
end $function$
;

-- Source: supabase/migrations/20261020000127_withdrawal_regression_correction.sql; exact body 505695d1abd69c845fa7fd60522f86d1a513009678df59e7637716ea96453302
create or replace function private.course_content_resource_json(r private.course_resources) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'course_id',r.course_id,'kind',r.kind,'title',r.title,'scope',r.scope,'description',r.description,'video_url',r.video_url,'reference_date',r.reference_date,'source',r.source,'representative',r.representative,'version',r.version,'created_at',r.created_at,'author',private.messaging_display_name(r.author_id),'can_edit',coalesce(r.author_id=auth.uid(),false),'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position) order by i.position) from private.course_resource_images i where i.resource_id=r.id and i.ready),'[]'::jsonb))
$$;

commit;
