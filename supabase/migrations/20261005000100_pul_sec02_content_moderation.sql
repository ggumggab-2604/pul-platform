-- SEC-02: explicit operator restriction; no automatic moderation or account penalties.
-- Reuse community.reports.manage (currently platform_admin only) and audit_logs.
-- moderation_hidden_at distinguishes operator restriction from pre-existing hidden/removal.
-- Separate revision prevents stale restrict/restore requests from overwriting a newer decision.
alter table public.community_posts
  add column moderation_hidden_at timestamptz,
  add column moderation_version integer not null default 0 check (moderation_version >= 0);
alter table public.community_comments
  add column moderation_hidden_at timestamptz,
  add column moderation_version integer not null default 0 check (moderation_version >= 0);
alter table public.course_discussion_posts
  add column moderation_hidden_at timestamptz,
  add column moderation_version integer not null default 0 check (moderation_version >= 0);
alter table public.certification_study_posts
  add column moderation_hidden_at timestamptz,
  add column moderation_version integer not null default 0 check (moderation_version >= 0);
alter table public.course_discussion_posts drop constraint course_discussion_posts_status_check;
alter table public.course_discussion_posts add constraint course_discussion_posts_status_check
  check (post_status in ('published', 'hidden', 'removed'));
alter table public.certification_study_posts drop constraint certification_study_posts_status_check;
alter table public.certification_study_posts add constraint certification_study_posts_status_check
  check (post_status in ('published', 'hidden', 'removed'));

-- Existing public post/course/study reads already require post_status = 'published'.
-- Only comment filtering/counts need replacement; original signatures and ACLs survive.
create or replace function public.list_community_posts(
  p_category_code text default null,
  p_keyword text default null,
  p_sort_order text default 'latest',
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
  v_viewer_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null
     and p_category_code not in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview') then
    raise exception '게시글 카테고리를 확인해 주세요.';
  end if;
  if p_sort_order not in ('latest', 'comments') then
    raise exception '게시글 정렬 방식을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 30 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_posts as post
  where post.post_status = 'published'
    and (p_category_code is null or post.category_code = p_category_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
    );

  with eligible as (
    select
      post.*,
      (
        select count(*)::integer
        from public.community_comments as comment
        where comment.post_id = post.id
          and comment.removed_at is null and comment.moderation_hidden_at is null
      ) as comment_count
    from public.community_posts as post
    where post.post_status = 'published'
      and (p_category_code is null or post.category_code = p_category_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
      )
  ), page as (
    select eligible.*
    from eligible
    order by
      case when p_sort_order = 'comments' then eligible.comment_count end desc,
      eligible.created_at desc,
      eligible.id desc
    limit p_limit
    offset p_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'title', page.title,
        'summary', pg_catalog.left(page.body, 180),
        'category', page.category_code,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false),
        'comment_count', page.comment_count,
        'question_type', page.question_type,
        'question_status', case
          when page.category_code <> 'question' then null
          when page.question_resolved_at is not null then 'resolved'
          when page.comment_count > 0 then 'answered'
          else 'waiting'
        end,
        'review_type', page.review_type,
        'rating', page.rating,
        'lost_found_kind', page.lost_found_kind,
        'lost_found_item_name', page.lost_found_item_name,
        'lost_found_place', page.lost_found_place,
        'lost_found_date', page.lost_found_date,
        'lost_found_status', page.lost_found_status
      )
      order by
        case when p_sort_order = 'comments' then page.comment_count end desc,
        page.created_at desc,
        page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

create or replace function public.get_community_post(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.community_posts%rowtype;
  v_comment_count integer;
begin
  select post.*
  into v_post
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published';

  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_comment_count
  from public.community_comments as comment
  where comment.post_id = v_post.id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  return jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'status', v_post.post_status,
    'author_display_name', private.community_actor_display_name(v_post.author_user_id, v_viewer_id),
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'version', v_post.version,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false),
    'comment_count', v_comment_count,
    'question_type', v_post.question_type,
    'question_status', case
      when v_post.category_code <> 'question' then null
      when v_post.question_resolved_at is not null then 'resolved'
      when v_comment_count > 0 then 'answered'
      else 'waiting'
    end,
    'review_type', v_post.review_type,
    'rating', v_post.rating,
    'lost_found_kind', v_post.lost_found_kind,
    'lost_found_item_name', v_post.lost_found_item_name,
    'lost_found_place', v_post.lost_found_place,
    'lost_found_date', v_post.lost_found_date,
    'lost_found_status', v_post.lost_found_status
  );
end;
$$;

create or replace function public.list_community_comments(
  p_post_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_total integer;
  v_items jsonb;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception '댓글 페이지 범위를 확인해 주세요.';
  end if;

  perform 1
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published';
  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_comments as comment
  where comment.post_id = p_post_id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'body', page.body,
        'author_display_name', private.community_actor_display_name(page.author_user_id, v_viewer_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false)
      )
      order by page.created_at, page.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select comment.*
    from public.community_comments as comment
    where comment.post_id = p_post_id
      and comment.removed_at is null and comment.moderation_hidden_at is null
    order by comment.created_at, comment.id
    limit p_limit
    offset p_offset
  ) as page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$$;

create or replace function public.submit_community_report(
  p_target_type text, p_target_id uuid, p_reason text, p_detail text default ''
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_active_actor();
  v_post_id uuid;
  v_author uuid;
  v_report_id uuid;
begin
  if p_target_type is null or p_target_type not in ('post', 'comment')
    or p_target_id is null or p_reason is null
    or p_reason not in ('spam', 'harassment', 'inappropriate', 'fraud', 'other')
    or pg_catalog.char_length(pg_catalog.btrim(coalesce(p_detail, ''))) > 1000 then
    raise exception 'community_report_invalid' using errcode = '22023';
  end if;

  if p_target_type = 'post' then
    v_post_id := p_target_id;
  else
    select c.post_id into v_post_id from public.community_comments c where c.id = p_target_id;
  end if;
  -- Lock parent before comment, matching the existing content mutation order.
  select p.author_user_id into v_author from public.community_posts p
  where p.id = v_post_id and p.post_status = 'published' for share;
  if not found then
    raise exception 'community_report_target_unavailable' using errcode = 'P0002';
  end if;
  if p_target_type = 'comment' then
    select c.author_user_id into v_author from public.community_comments c
    where c.id = p_target_id and c.post_id = v_post_id and c.removed_at is null and c.moderation_hidden_at is null for share;
    if not found then
      raise exception 'community_report_target_unavailable' using errcode = 'P0002';
    end if;
  end if;
  if v_author = v_actor then
    raise exception 'community_report_self' using errcode = '22023';
  end if;

  insert into public.community_reports (reporter_user_id, post_id, comment_id, reason, detail)
  values (v_actor, v_post_id, case when p_target_type = 'comment' then p_target_id end,
    p_reason, pg_catalog.btrim(coalesce(p_detail, '')))
  on conflict do nothing returning id into v_report_id;
  return pg_catalog.jsonb_build_object('duplicate', v_report_id is null);
end;
$$;

create or replace function public.list_community_reports(
  p_status text default 'open', p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_total bigint;
begin
  perform private.community_assert_report_manager();
  if p_status is null or p_status not in ('open', 'resolved', 'all')
    or p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 then
    raise exception 'community_report_invalid' using errcode = '22023';
  end if;
  -- One snapshot for count and rows. Content is visible to authorized operators after soft deletion.
  with filtered as (
    select r.* from public.community_reports r where p_status = 'all' or r.status = p_status
  ), page as (
    select r.* from filtered r order by r.created_at desc, r.id desc limit p_limit offset p_offset
  )
  select (select pg_catalog.count(*) from filtered), coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', r.id, 'target_type', case when r.comment_id is null then 'post' else 'comment' end,
      'post_id', r.post_id, 'comment_id', r.comment_id,
      'title', p.title, 'body', case when r.comment_id is null then p.body else c.body end,
      'target_state', case when p.post_status <> 'published' then p.post_status
        when r.comment_id is not null and c.removed_at is not null then 'removed'
        when r.comment_id is not null and c.moderation_hidden_at is not null then 'hidden' else 'published' end,
      'reason', r.reason, 'detail', r.detail, 'status', r.status,
      'created_at', r.created_at, 'resolved_at', r.resolved_at
    ) order by r.created_at desc, r.id desc
  ), '[]'::jsonb) into v_total, v_items
  from page r join public.community_posts p on p.id = r.post_id
  left join public.community_comments c on c.id = r.comment_id;
  return pg_catalog.jsonb_build_object('items', v_items, 'total', v_total,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total);
end;
$$;

create function public.list_content_for_moderation(
  p_target_type text, p_filter text default 'all', p_target_id uuid default null,
  p_limit integer default 20, p_offset integer default 0
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  perform private.community_assert_report_manager();
  if p_target_type is null or p_target_type not in ('post','comment','course','certification')
    or p_filter is null or p_filter not in ('all','published','restricted')
    or p_limit is null or p_limit not between 1 and 30 or p_offset is null or p_offset < 0 then
    raise exception 'moderation_invalid' using errcode = '22023';
  end if;
  with content as (
    select p.id, p.title, p.body, p.post_status as base_state,
      p.moderation_hidden_at is not null as restricted, p.version, p.moderation_version,
      p.created_at, true as parent_visible
    from public.community_posts p where p_target_type = 'post'
    union all
    select c.id, p.title, c.body, case when c.removed_at is null then 'published' else 'removed' end,
      c.moderation_hidden_at is not null, c.version, c.moderation_version, c.created_at,
      p.post_status = 'published' and p.moderation_hidden_at is null
    from public.community_comments c join public.community_posts p on p.id = c.post_id where p_target_type = 'comment'
    union all
    select p.id, c.name, p.body, p.post_status, p.moderation_hidden_at is not null, 0,
      p.moderation_version, p.created_at, c.course_status = 'active'
    from public.course_discussion_posts p join public.courses c on c.id = p.course_id where p_target_type = 'course'
    union all
    select p.id, '자격증 시험 준비 이야기', p.body, p.post_status, p.moderation_hidden_at is not null, 0,
      p.moderation_version, p.created_at, true
    from public.certification_study_posts p where p_target_type = 'certification'
  ), filtered as (
    select * from content where (p_target_id is null or id = p_target_id)
      and (p_filter = 'all' or (p_filter = 'restricted' and restricted)
        or (p_filter = 'published' and base_state = 'published' and not restricted and parent_visible))
  ), page as (
    select * from filtered order by created_at desc, id desc limit p_limit offset p_offset
  )
  select pg_catalog.jsonb_build_object(
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'total', (select count(*) from filtered),
    'has_more', p_offset + (select count(*) from page) < (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create function public.moderate_public_content(
  p_target_type text, p_target_id uuid, p_action text, p_reason text,
  p_expected_version integer, p_expected_moderation_version integer, p_report_id uuid default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_report_manager();
  v_report public.community_reports%rowtype;
  v_state text;
  v_hidden timestamptz;
  v_version integer;
  v_moderation_version integer;
  v_parent uuid;
  v_parent_visible boolean;
  v_now timestamptz;
begin
  if p_target_type is null or p_target_type not in ('post','comment','course','certification')
    or p_target_id is null or p_action is null or p_action not in ('restrict','restore')
    or p_reason is null or p_reason not in ('spam','harassment','inappropriate','fraud','other')
    or p_expected_version is null or p_expected_version < 0
    or p_expected_moderation_version is null or p_expected_moderation_version < 0 then
    raise exception 'moderation_invalid' using errcode = '22023';
  end if;
  -- Lock target first, matching owner comment edits. Restore alone additionally
  -- takes a non-waiting parent SHARE lock below; restrict keeps target -> report.
  case p_target_type
    when 'post' then
      select post_status, moderation_hidden_at, version, moderation_version
      into v_state,v_hidden,v_version,v_moderation_version from public.community_posts where id=p_target_id for update;
    when 'comment' then
      select case when removed_at is null then 'published' else 'removed' end,
        moderation_hidden_at, version, moderation_version, post_id
      into v_state,v_hidden,v_version,v_moderation_version,v_parent from public.community_comments where id=p_target_id for update;
    when 'course' then
      select post_status,moderation_hidden_at,0,moderation_version,course_id
      into v_state,v_hidden,v_version,v_moderation_version,v_parent from public.course_discussion_posts where id=p_target_id for update;
    when 'certification' then
      select post_status,moderation_hidden_at,0,moderation_version
      into v_state,v_hidden,v_version,v_moderation_version from public.certification_study_posts where id=p_target_id for update;
  end case;
  if v_state is null then raise exception 'moderation_missing' using errcode = 'P0002'; end if;
  -- Report + restriction is one transaction. A closed/stale/mismatched report cannot alter content.
  -- Lock target before report: report submission also locks content before inserting.
  -- This prevents a report-row/content-row lock cycle with concurrent submissions.
  if p_report_id is not null then
    if p_action <> 'restrict' or p_target_type not in ('post','comment') then
      raise exception 'moderation_invalid' using errcode = '22023';
    end if;
    select * into v_report from public.community_reports where id = p_report_id for update;
    if not found or v_report.status <> 'open' then
      raise exception 'moderation_conflict' using errcode = '40001';
    end if;
    if (p_target_type = 'post' and (v_report.comment_id is not null or v_report.post_id <> p_target_id))
      or (p_target_type = 'comment' and v_report.comment_id is distinct from p_target_id) then
      raise exception 'moderation_target_mismatch' using errcode = '22023';
    end if;
  end if;
  if p_report_id is not null and p_target_type = 'comment' and v_report.post_id <> v_parent then
    raise exception 'moderation_target_mismatch' using errcode = '22023';
  end if;
  if v_version <> p_expected_version or v_moderation_version <> p_expected_moderation_version then
    raise exception 'moderation_conflict' using errcode = '40001';
  end if;
  if p_action = 'restrict' and (v_state <> 'published' or v_hidden is not null) then
    raise exception 'moderation_state' using errcode = '22023';
  end if;
  if p_action = 'restore' and (v_hidden is null or v_state <> case when p_target_type='comment' then 'published' else 'hidden' end) then
    raise exception 'moderation_state' using errcode = '22023';
  end if;
  if p_action = 'restore' and p_target_type in ('comment','course') then
    -- SHARE blocks parent UPDATE/DELETE through commit (KEY SHARE is insufficient).
    -- NOWAIT avoids adding a target -> parent wait edge against report submission
    -- (parent -> comment) or a queued parent writer. A busy parent requires retry.
    -- Read eligibility from the locked row, never from the management-page snapshot.
    begin
      if p_target_type = 'comment' then
        select p.post_status = 'published' and p.moderation_hidden_at is null
        into v_parent_visible from public.community_posts p where p.id = v_parent for share nowait;
      else
        select c.course_status = 'active'
        into v_parent_visible from public.courses c where c.id = v_parent for share nowait;
      end if;
    exception when lock_not_available then
      raise exception 'moderation_conflict' using errcode = '40001';
    end;
    if v_parent_visible is distinct from true then
      raise exception 'moderation_parent_unavailable' using errcode = '22023';
    end if;
  end if;
  v_now := pg_catalog.clock_timestamp();
  case p_target_type
    when 'post' then
      update public.community_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'comment' then
      update public.community_comments set
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'course' then
      update public.course_discussion_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'certification' then
      update public.certification_study_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
  end case;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,reason,before_summary,after_summary,metadata,created_at)
  values(v_actor,'operator','content.'||p_action,'content.'||p_target_type,p_target_id::text,p_reason,
    pg_catalog.jsonb_build_object('restricted',v_hidden is not null,'moderation_version',v_moderation_version),
    pg_catalog.jsonb_build_object('restricted',p_action='restrict','moderation_version',v_moderation_version+1),
    pg_catalog.jsonb_build_object('report_id',p_report_id),v_now);
  if p_report_id is not null then
    update public.community_reports set status='resolved',resolved_by=v_actor,resolved_at=v_now where id=p_report_id;
  end if;
  return pg_catalog.jsonb_build_object('id',p_target_id,'restricted',p_action='restrict',
    'moderation_version',v_moderation_version+1,'report_resolved',p_report_id is not null);
end;
$$;

revoke all on function public.list_content_for_moderation(text,text,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.moderate_public_content(text,uuid,text,text,integer,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_content_for_moderation(text,text,uuid,integer,integer) to authenticated;
grant execute on function public.moderate_public_content(text,uuid,text,text,integer,integer,uuid) to authenticated;
-- No SEC-01 function, existing permission mapping, direct table ACL or RLS policy is changed.
