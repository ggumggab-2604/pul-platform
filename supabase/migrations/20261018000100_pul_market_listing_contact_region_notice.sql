-- AH candidate revised locally in AJ for market-policy-v1. No remote apply or consent backfill.
-- CLI-created candidate moved after the existing 20261017 migrations so the
-- current detail response cannot be overwritten by 20261003.
alter table public.market_listings
  drop constraint market_listings_region_check,
  add constraint market_listings_region_check
    check (region_code in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주')),
  add column trade_notice_version text,
  add column trade_notice_confirmed_at timestamptz,
  add constraint market_listings_trade_notice_check check (
    (trade_notice_version is null and trade_notice_confirmed_at is null)
    or (trade_notice_version is not null and trade_notice_version in ('market-trade-v1', 'market-policy-v1') and trade_notice_confirmed_at is not null)
  );
comment on column public.market_listings.trade_notice_version is
  'Listing-only trade notice acknowledgement, independent of contact/marketing/privacy consent. No legacy backfill.';

create or replace function public.mutate_market_listing(
  p_operation text,
  p_listing_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_action text := 'market.listing.' || coalesce(p_operation, '');
  v_claim record;
  v_listing public.market_listings%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_condition text := p_payload->>'condition';
  v_trade_type text := p_payload->>'trade_type';
  v_description text := nullif(pg_catalog.btrim(p_payload->>'description'), '');
  v_contact_method text := p_payload->>'public_contact_method';
  v_contact_value text;
  v_previous_contact_method text;
  v_previous_contact_value text;
  v_contact_changed boolean := false;
  v_price bigint;
  v_next_status text;
  v_removed_paths jsonb := '[]'::jsonb;
begin
  if p_operation not in ('create', 'update', 'reserve', 'sell', 'delete') then
    raise exception '지원하지 않는 판매글 작업입니다.';
  end if;
  if p_operation = 'create' and p_listing_id is not null then
    raise exception '새 판매글에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_listing_id is null then
    raise exception '판매글 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id,
    p_request_id,
    v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation,
      'listing_id', p_listing_id,
      'expected_version', p_expected_version,
      'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  if p_operation in ('create', 'update') then
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '상품명은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if coalesce(p_payload->>'price', '') !~ '^[0-9]+$' then
      raise exception '가격은 숫자로 입력해 주세요.';
    end if;
    v_price := (p_payload->>'price')::bigint;
    if v_price not between 1 and 1000000000 then
      raise exception '가격 입력 범위를 확인해 주세요.';
    end if;
    if v_region not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_condition not in ('likeNew', 'lightUse', 'normal', 'needsRepair') then
      raise exception '상품 상태 입력을 확인해 주세요.';
    end if;
    if v_trade_type not in ('direct', 'delivery', 'negotiable') then
      raise exception '거래 방식 입력을 확인해 주세요.';
    end if;
    if v_description is null or pg_catalog.char_length(v_description) not between 10 and 2000 then
      raise exception '상품 설명은 10~2000자로 입력해 주세요.';
    end if;
    if p_payload->>'trade_notice_version' is distinct from 'market-policy-v1' then
      raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
    end if;
    if v_contact_method is null then
      if nullif(pg_catalog.btrim(p_payload->>'public_contact_value'), '') is not null
         or p_payload->'public_contact_consent' = 'true'::jsonb then
        raise exception '추가 연락을 해제한 경우 연락처를 함께 지워 주세요.' using errcode = '22023';
      end if;
      v_contact_value := null;
    else
      v_contact_value := private.market_normalize_public_contact(v_contact_method, p_payload->>'public_contact_value');
      if p_operation = 'create' and p_payload->'public_contact_consent' is distinct from 'true'::jsonb then
        raise exception '공개 연락처 안내를 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_operation = 'create' then
    if p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb then
      raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
    end if;
    insert into public.market_listings (
      seller_user_id,
      title,
      category_code,
      price_amount,
      region_code,
      condition_code,
      trade_type_code,
      description,
      public_contact_method,
      public_contact_value,
      public_contact_consent_at,
      trade_notice_version,
      trade_notice_confirmed_at
    ) values (
      v_actor_id,
      v_title,
      v_category,
      v_price,
      v_region,
      v_condition,
      v_trade_type,
      v_description,
      v_contact_method,
      v_contact_value,
      case when v_contact_method is not null then pg_catalog.now() else null end,
      'market-policy-v1',
      pg_catalog.now()
    ) returning * into v_listing;
    v_contact_changed := true;
  else
    select listing.*
    into v_listing
    from public.market_listings as listing
    where listing.id = p_listing_id
    for update;
    if v_listing.id is null or v_listing.listing_status = 'removed' then
      raise exception '판매글을 찾을 수 없습니다.';
    end if;
    if v_listing.seller_user_id <> v_actor_id then
      raise exception '본인의 판매글만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_listing.version then
      raise exception '판매글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    v_previous_contact_method := v_listing.public_contact_method;
    v_previous_contact_value := v_listing.public_contact_value;
    v_before := (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null
    );

    if p_operation = 'update' then
      if v_listing.listing_status = 'sold' then
        raise exception '거래 완료된 판매글은 수정할 수 없습니다.';
      end if;
      if (v_listing.trade_notice_version is distinct from 'market-policy-v1'
          or v_listing.trade_notice_confirmed_at is null)
         and p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb then
        raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
      v_contact_changed := v_previous_contact_method is distinct from v_contact_method
        or v_previous_contact_value is distinct from v_contact_value;
      if v_contact_method is not null
         and (v_contact_changed or v_listing.public_contact_consent_at is null)
         and p_payload->'public_contact_consent' is distinct from 'true'::jsonb then
        raise exception '공개 연락처 안내를 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
      update public.market_listings
      set title = v_title,
          category_code = v_category,
          price_amount = v_price,
          region_code = v_region,
          condition_code = v_condition,
          trade_type_code = v_trade_type,
          description = v_description,
          public_contact_method = v_contact_method,
          public_contact_value = v_contact_value,
          public_contact_consent_at = case
            when v_contact_method is null then null
            when v_contact_changed or public_contact_consent_at is null then pg_catalog.now()
            else public_contact_consent_at
          end,
          trade_notice_version = 'market-policy-v1',
          trade_notice_confirmed_at = case
            when trade_notice_version = 'market-policy-v1' and trade_notice_confirmed_at is not null then trade_notice_confirmed_at
            else pg_catalog.now()
          end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
    elsif p_operation = 'reserve' then
      if v_listing.listing_status <> 'selling' then
        raise exception '판매중인 글만 예약중으로 변경할 수 있습니다.';
      end if;
      v_next_status := 'reserved';
    elsif p_operation = 'sell' then
      if v_listing.listing_status <> 'reserved' then
        raise exception '예약중인 글만 거래완료로 변경할 수 있습니다.';
      end if;
      v_next_status := 'sold';
    else
      select coalesce(pg_catalog.jsonb_agg(media.storage_path), '[]'::jsonb)
      into v_removed_paths
      from public.market_listing_media as media
      where media.listing_id = v_listing.id
        and media.media_status = 'available';
      update public.market_listing_media
      set media_status = 'removed',
          removed_at = pg_catalog.now(),
          version = version + 1
      where listing_id = v_listing.id
        and media_status in ('pending_upload', 'available');
      v_next_status := 'removed';
    end if;

    if v_next_status is not null then
      update public.market_listings
      set listing_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then pg_catalog.now() else null end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
    end if;
  end if;

  if p_operation = 'create'
     or v_before->>'listing_status' is distinct from v_listing.listing_status then
    insert into public.market_status_history (
      entity_kind,
      listing_id,
      entity_version,
      from_status,
      to_status,
      actor_user_id,
      request_id
    ) values (
      'listing',
      v_listing.id,
      v_listing.version,
      case when p_operation = 'create' then null else v_before->>'listing_status' end,
      v_listing.listing_status,
      v_actor_id,
      p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'listing_id', v_listing.id,
    'sale_status', v_listing.listing_status,
    'version', v_listing.version,
    'replayed', false,
    'removed_storage_paths', v_removed_paths
  );
  insert into private.market_audit_log (
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    v_action,
    'listing',
    v_listing.id,
    v_before,
    (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'status', v_listing.listing_status,
      'version', v_listing.version,
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null,
      'contact_changed', v_contact_changed
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;


CREATE OR REPLACE FUNCTION public.list_market_listings(p_keyword text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_region_code text DEFAULT NULL::text, p_listing_status text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
    raise exception '카테고리 입력을 확인해 주세요.';
  end if;
  if p_region_code is not null and p_region_code not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역 입력을 확인해 주세요.';
  end if;
  if p_listing_status is not null and p_listing_status not in ('selling', 'reserved', 'sold') then
    raise exception '판매 상태 입력을 확인해 주세요.';
  end if;

  select pg_catalog.count(*) into v_total
  from public.market_listings as listing
  where listing.listing_status <> 'removed'
    and (p_category_code is null or listing.category_code = p_category_code)
    and (p_region_code is null or listing.region_code = p_region_code)
    and (p_listing_status is null or listing.listing_status = p_listing_status)
    and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select listing.id, listing.created_at,
      pg_catalog.jsonb_build_object(
        'id', listing.id,
        'name', listing.title,
        'category', listing.category_code,
        'seller_type', 'personal',
        'price', listing.price_amount,
        'region', listing.region_code,
        'condition', listing.condition_code,
        'trade_type', listing.trade_type_code,
        'sale_status', listing.listing_status,
        'description', listing.description,
        'seller_display_name', private.market_actor_display_name(listing.seller_user_id, v_actor_id),
        'created_at', listing.created_at,
        'updated_at', listing.updated_at,
        'version', listing.version,
        'can_edit', coalesce(listing.seller_user_id = v_actor_id, false),
        'image_paths', coalesce((
          select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
          from public.market_listing_media as media
          where media.listing_id = listing.id and media.media_status = 'available'
        ), '[]'::jsonb)
      ) as item
    from public.market_listings as listing
    where listing.listing_status <> 'removed'
      and (p_category_code is null or listing.category_code = p_category_code)
      and (p_region_code is null or listing.region_code = p_region_code)
      and (p_listing_status is null or listing.listing_status = p_listing_status)
      and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%')
    order by listing.created_at desc, listing.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + v_limit < v_total
  );
end;
$function$;


create or replace function public.get_market_listing(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', listing.id,
    'name', listing.title,
    'category', listing.category_code,
    'seller_type', 'personal',
    'price', listing.price_amount,
    'region', listing.region_code,
    'condition', listing.condition_code,
    'trade_type', listing.trade_type_code,
    'sale_status', listing.listing_status,
    'description', listing.description,
    'seller_display_name', private.market_actor_display_name(listing.seller_user_id, auth.uid()),
    'created_at', listing.created_at,
    'updated_at', listing.updated_at,
    'version', listing.version,
    'can_edit', coalesce(listing.seller_user_id = auth.uid(), false),
    'image_paths', coalesce((
      select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
      from public.market_listing_media as media
      where media.listing_id = listing.id and media.media_status = 'available'
    ), '[]'::jsonb),
    'public_contact_consent_valid', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.listing_status in ('selling', 'reserved')
      and listing.public_contact_method is not null
      and listing.public_contact_consent_at is not null, false),
    'trade_notice_version', case when listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active() then listing.trade_notice_version else null end,
    'trade_notice_confirmed', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.trade_notice_version = 'market-policy-v1'
      and listing.trade_notice_confirmed_at is not null, false),
    'public_contact_method', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_method
      else null
    end,
    'public_contact_value', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_value
      else null
    end
  )
  from public.market_listings as listing
  where listing.id = p_listing_id
    and listing.listing_status <> 'removed';
$$;

comment on function public.get_market_listing(uuid) is
  'Public detail read for one visible listing; listing-scoped contact is returned only while selling or reserved with explicit consent.';
revoke all on function public.get_market_listing(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_listing(uuid)
  to anon, authenticated;


-- Explicit new API prevents a pre-migration server from silently ignoring the notice.
create function public.mutate_market_listing_v2(
  p_operation text, p_listing_id uuid, p_expected_version integer,
  p_payload jsonb, p_request_id uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.mutate_market_listing(p_operation, p_listing_id, p_expected_version, p_payload, p_request_id);
$$;
revoke all on function public.mutate_market_listing_v2(text,uuid,integer,jsonb,uuid) from public, anon, authenticated, service_role;
grant execute on function public.mutate_market_listing_v2(text,uuid,integer,jsonb,uuid) to authenticated;
