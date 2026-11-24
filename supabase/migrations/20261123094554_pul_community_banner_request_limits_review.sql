-- Bound banner intake independently of editable dates; keep the original migration intact.
create index community_banner_request_post_window_idx
  on private.community_banner_requests(post_id, requested_at);
create index community_banner_request_review_idx
  on private.community_banner_requests(requested_at, id);

create function private.community_banner_period_conflicts(p_slot text,p_start timestamptz,p_end timestamptz)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.promotion_placements p
    where p.publication_status='published'
      and pg_catalog.tstzrange(p.starts_at,p.ends_at,'[)') && pg_catalog.tstzrange(p_start,p_end,'[)')
      and (p.slot_code=p_slot
        or (p_slot in ('home.rail_left.01','home.rail_right.01')
          and p.slot_code=any(case p_slot when 'home.rail_left.01' then
            array['home.rail_left.short.01','home.rail_left.short.02','home.rail_left.short.03']
            else array['home.rail_right.short.01','home.rail_right.short.02','home.rail_right.short.03'] end))
        or (p_slot=any(array['home.rail_left.short.01','home.rail_left.short.02','home.rail_left.short.03']) and p.slot_code='home.rail_left.01')
        or (p_slot=any(array['home.rail_right.short.01','home.rail_right.short.02','home.rail_right.short.03']) and p.slot_code='home.rail_right.01'))
  );
$$;

create function private.assert_community_banner_period(p_slot text,p_start timestamptz,p_end timestamptz)
returns void language plpgsql volatile security invoker set search_path = '' as $$
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception '신청을 다시 시도해 주세요.' using errcode='40001';
  end if;
  -- Same slot-row lock as mutate_promotion_placement; the rail lock also matches its trigger.
  perform 1 from public.promotion_slots where slot_code=p_slot and is_enabled
    and 'advertisement'=any(allowed_content_kinds) for update;
  if not found then raise exception '신청 가능한 배너 자리를 확인해 주세요.'; end if;
  if p_slot=any(array['home.rail_left.01','home.rail_left.short.01','home.rail_left.short.02','home.rail_left.short.03']) then
    perform pg_catalog.pg_advisory_xact_lock(920260919,1);
  elsif p_slot=any(array['home.rail_right.01','home.rail_right.short.01','home.rail_right.short.02','home.rail_right.short.03']) then
    perform pg_catalog.pg_advisory_xact_lock(920260919,2);
  end if;
  if private.community_banner_period_conflicts(p_slot,p_start,p_end) then
    raise exception 'PUL_BANNER_PERIOD_CONFLICT' using errcode='P0001';
  end if;
end;
$$;
revoke all on function private.community_banner_period_conflicts(text,timestamptz,timestamptz),
  private.assert_community_banner_period(text,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.request_community_banner(p_post_id uuid,p_slot text,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  v_actor uuid := private.community_assert_active_actor();
  v_id uuid;
  v_now timestamptz;
  v_count bigint;
  v_latest timestamptz;
begin
  if pg_catalog.current_setting('transaction_isolation')<>'read committed' then
    raise exception '신청을 다시 시도해 주세요.' using errcode='40001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pul.community.banner.member:'||v_actor::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pul.community.banner.post:'||p_post_id::text,0));
  perform 1 from public.community_posts where id=p_post_id and author_user_id=v_actor for share;
  if not found or not private.community_promotion_visible(p_post_id) then
    raise exception '본인의 공개 홍보 글만 신청할 수 있습니다.';
  end if;
  if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end<=p_start then
    raise exception '배너 자리와 게시 기간을 확인해 주세요.';
  end if;
  -- Authorized exact retries return the same ID even when the quota is full or availability changed.
  select id into v_id from private.community_banner_requests
    where post_id=p_post_id and slot_code=p_slot and starts_at=p_start and ends_at=p_end;
  if v_id is not null then return v_id; end if;
  v_now := pg_catalog.clock_timestamp();
  if p_end<=v_now then raise exception '배너 자리와 게시 기간을 확인해 주세요.'; end if;
  select count(*),max(r.requested_at) into v_count,v_latest
    from private.community_banner_requests r join public.community_posts p on p.id=r.post_id
    where p.author_user_id=v_actor and r.requested_at>v_now-interval '10 minutes';
  if v_count>=5 then raise exception 'PUL_BANNER_MEMBER_QUOTA' using errcode='P0001'; end if;
  select count(*) into v_count from private.community_banner_requests
    where post_id=p_post_id and requested_at>v_now-interval '10 minutes';
  if v_count>=3 then raise exception 'PUL_BANNER_POST_QUOTA' using errcode='P0001'; end if;
  if v_latest>v_now-interval '20 seconds' then raise exception 'PUL_BANNER_COOLDOWN' using errcode='P0001'; end if;
  perform private.assert_community_banner_period(p_slot,p_start,p_end);
  insert into private.community_banner_requests(post_id,slot_code,starts_at,ends_at,requested_at)
    values(p_post_id,p_slot,p_start,p_end,pg_catalog.clock_timestamp()) returning id into v_id;
  return v_id;
end;
$$;

-- Replace the no-argument endpoint (no overload ambiguity in PostgREST).
drop function public.list_community_banner_requests();
create function public.list_community_banner_requests(p_limit integer default 30,p_offset integer default 0)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_items jsonb; v_total bigint;
begin
  perform private.promotion_assert_manager();
  if p_limit is null or p_limit not between 1 and 60 or p_offset is null or p_offset<0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode='22023';
  end if;
  select count(*) into v_total from private.community_banner_requests;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.requested_at,q.id),'[]'::jsonb) into v_items from (
    select r.id,r.post_id,p.title,m.field,m.trade,r.slot_code,r.starts_at,r.ends_at,r.requested_at,b.promotion_key,
      private.community_promotion_visible(p.id) and s.is_enabled and 'advertisement'=any(s.allowed_content_kinds)
        and r.ends_at>now() and not private.community_banner_period_conflicts(r.slot_code,r.starts_at,r.ends_at) as available,
      private.community_banner_period_conflicts(r.slot_code,r.starts_at,r.ends_at) as period_conflict
    from private.community_banner_requests r join public.community_posts p on p.id=r.post_id
    join private.community_promotions m on m.post_id=r.post_id join public.promotion_slots s on s.slot_code=r.slot_code
    left join public.promotions b on b.id=r.promotion_id
    order by r.requested_at,r.id limit p_limit offset p_offset
  ) q;
  return jsonb_build_object('items',v_items,'total',v_total);
end;
$$;
revoke all on function public.list_community_banner_requests(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_community_banner_requests(integer,integer) to authenticated;

create or replace function public.accept_community_banner_request(p_request_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_request private.community_banner_requests%rowtype;
  v_post public.community_posts%rowtype;
  v_result jsonb;
  v_key text;
  v_banner_id uuid;
begin
  perform private.promotion_assert_manager();
  select * into v_request from private.community_banner_requests where id=p_request_id for update;
  if not found then raise exception '배너 신청을 찾을 수 없습니다.'; end if;
  if v_request.promotion_id is not null then
    return (select promotion_key from public.promotions where id=v_request.promotion_id);
  end if;
  select * into v_post from public.community_posts where id=v_request.post_id for share;
  if not private.community_promotion_visible(v_post.id) or v_request.ends_at<=now() then
    raise exception '공개 홍보 글과 신청 기간을 확인해 주세요.';
  end if;
  perform private.assert_community_banner_period(v_request.slot_code,v_request.starts_at,v_request.ends_at);
  v_result := public.mutate_promotion(gen_random_uuid(),'create',null,null,jsonb_build_object(
    'content_kind','advertisement','title',v_post.title,
    'summary',left(case when char_length(v_post.body)<10 then '커뮤니티 홍보 · '||v_post.body else v_post.body end,500),
    'link_type','none'
  ));
  v_key := v_result->'promotion'->>'promotion_key';
  update public.promotions set community_post_id=v_request.post_id where promotion_key=v_key returning id into v_banner_id;
  perform public.mutate_promotion_placement(gen_random_uuid(),'create',null,null,jsonb_build_object(
    'slot_code',v_request.slot_code,'promotion_key',v_key,'starts_at',v_request.starts_at,'ends_at',v_request.ends_at));
  update private.community_banner_requests set promotion_id=v_banner_id where id=p_request_id;
  return v_key;
end;
$$;
-- Existing publication exclusion constraint and rail trigger remain the final checks.
