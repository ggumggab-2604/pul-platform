-- AP: additive buy/exchange candidate. Requires AO 20261019000100.
-- Legacy write entrypoints share policy enforcement. Coordinate code/DB rollout.
alter table public.market_buy_requests
 add column request_type text not null default 'buy' check(request_type in ('buy','exchange')),
 add column budget_negotiable boolean not null default false,
 add column exchange_wanted text,
 add column trade_type text not null default 'negotiable' check(trade_type in ('direct','delivery','negotiable')),
 add column publication_status text not null default 'published' check(publication_status in ('published','hidden','removed')),
 add column trade_notice_version text,
 add column trade_notice_confirmed_at timestamptz,
 alter column budget_amount drop not null,
 drop constraint market_buy_requests_budget_check,
 drop constraint market_buy_requests_region_check,
 add constraint market_buy_exchange_budget_check check(
   (request_type='buy' and exchange_wanted is null and
     ((budget_negotiable and budget_amount is null) or (not budget_negotiable and budget_amount between 1 and 1000000000 and budget_amount is not null)))
   or (request_type='exchange' and budget_amount is null and not budget_negotiable and exchange_wanted=trim(exchange_wanted) and char_length(exchange_wanted) between 10 and 1000 and exchange_wanted is not null)),
 add constraint market_buy_exchange_region_check check(region_code in ('전국','서울','경기','인천','충청','강원','전라','경상','제주')),
 add constraint market_buy_exchange_policy_check check((trade_notice_version is null and trade_notice_confirmed_at is null) or (trade_notice_version='market-policy-v1' and trade_notice_confirmed_at is not null));
-- Existing rows retain IDs, text, contacts, status and NULL policy evidence.
create or replace function private.mutate_market_buy_exchange(
  p_operation text,
  p_buy_request_id uuid,
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
  v_action text := 'market.buy_request.' || coalesce(p_operation, '');
  v_claim record;
  v_request public.market_buy_requests%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_summary text := nullif(pg_catalog.btrim(p_payload->>'summary'), '');
  v_budget bigint;
  v_next_status text;
  v_type text:=coalesce(p_payload->>'request_type','buy');
  v_neg boolean:=coalesce((p_payload->>'budget_negotiable')::boolean,false);
  v_trade text:=coalesce(p_payload->>'trade_type','negotiable');
  v_wanted text:=nullif(trim(p_payload->>'exchange_wanted'),'');
  v_method text:=nullif(p_payload->>'public_contact_method','');
  v_contact text; v_consent_at timestamptz; v_policy_at timestamptz;
begin
  if p_operation is null or p_operation not in ('create', 'update', 'close', 'delete') then
    raise exception '지원하지 않는 구매요청 작업입니다.';
  end if;
  if p_operation = 'create' and p_buy_request_id is not null then
    raise exception '새 구매요청에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_buy_request_id is null then
    raise exception '구매요청 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id, p_request_id, v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation, 'buy_request_id', p_buy_request_id,
      'expected_version', p_expected_version, 'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  -- Lock ownership/version before comparing old contact/policy evidence.
  if p_operation<>'create' then
    select * into v_request from public.market_buy_requests where id=p_buy_request_id for update;
    if v_request.id is null or v_request.request_status='removed' or v_request.publication_status<>'published' then raise exception '글을 찾을 수 없습니다.'; end if;
    if v_request.author_user_id<>v_actor_id then raise exception '본인 글만 변경할 수 있습니다.'; end if;
    if p_expected_version is null or p_expected_version<>v_request.version then raise exception '글이 변경되었습니다. 다시 확인해 주세요.'; end if;
  end if;
  if p_operation in ('create', 'update') then
    if v_type not in ('buy','exchange') or (p_operation='update' and v_type<>v_request.request_type) then raise exception '등록한 글 유형은 변경할 수 없습니다.'; end if;
    if v_trade not in ('direct','delivery','negotiable') then raise exception '거래 방식을 확인해 주세요.'; end if;
    if v_type='exchange' then
      if v_wanted is null or char_length(v_wanted) not between 10 and 1000 or v_neg or p_payload->>'budget' is not null then raise exception '교환 조건을 확인해 주세요.'; end if;
    elsif v_wanted is not null then raise exception '삽니다에는 교환 조건을 저장할 수 없습니다.'; end if;
    if p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb or p_payload->>'trade_notice_version' is distinct from 'market-policy-v1' then raise exception '장터 이용안내 및 운영정책을 읽고 동의해 주세요.'; end if;
    v_policy_at:=case when v_request.trade_notice_version='market-policy-v1' then v_request.trade_notice_confirmed_at end;
    v_policy_at:=coalesce(v_policy_at,now());
    if v_method is not null then
      v_contact:=private.market_normalize_public_contact(v_method,p_payload->>'public_contact_value');
      if p_operation='update' and v_request.public_contact_method=v_method and v_request.public_contact_value=v_contact and v_request.public_contact_consent_at is not null then
        v_consent_at:=v_request.public_contact_consent_at;
      elsif p_payload->'public_contact_consent'='true'::jsonb then v_consent_at:=now();
      else raise exception '공개 연락처 안내에 동의해 주세요.'; end if;
      if v_method='external_url' and (p_operation='create' or v_request.public_contact_method is distinct from v_method or v_request.public_contact_value is distinct from v_contact) then raise exception '새 외부 문의 링크는 등록할 수 없습니다.'; end if;
    elsif nullif(p_payload->>'public_contact_value','') is not null or p_payload->'public_contact_consent'='true'::jsonb then raise exception '연락 방법을 확인해 주세요.';
    end if;
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '구매 희망 제목은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if v_type='buy' and not v_neg then
      if coalesce(p_payload->>'budget','') !~ '^[0-9]{1,10}$' then raise exception '희망 예산은 숫자로 입력해 주세요.'; end if;
      v_budget:=(p_payload->>'budget')::bigint;
      if v_budget not between 1 and 1000000000 then raise exception '희망 예산 입력 범위를 확인해 주세요.'; end if;
    elsif p_payload->>'budget' is not null then raise exception '협의 또는 교환에는 금액을 저장하지 않습니다.'; end if;
    if v_region not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 1000 then
      raise exception '구매 희망 내용은 10~1000자로 입력해 주세요.';
    end if;
  end if;

  if p_operation = 'create' then
    insert into public.market_buy_requests (
      author_user_id, title, category_code, budget_amount, region_code, summary, request_type,budget_negotiable,exchange_wanted,trade_type,public_contact_method,public_contact_value,public_contact_consent_at,trade_notice_version,trade_notice_confirmed_at
    ) values (
      v_actor_id, v_title, v_category, v_budget, v_region, v_summary,v_type,v_neg,v_wanted,v_trade,v_method,v_contact,v_consent_at,'market-policy-v1',v_policy_at
    ) returning * into v_request;
  else
    select request.* into v_request
    from public.market_buy_requests as request
    where request.id = p_buy_request_id
    for update;
    if v_request.id is null or v_request.request_status = 'removed' then
      raise exception '구매요청을 찾을 수 없습니다.';
    end if;
    if v_request.author_user_id <> v_actor_id then
      raise exception '본인의 구매요청만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_request.version then
      raise exception '구매요청이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_before := pg_catalog.jsonb_build_object('request_status',v_request.request_status,'version',v_request.version);
    if p_operation = 'update' then
      if v_request.request_status <> 'open' then
        raise exception '종료된 구매요청은 수정할 수 없습니다.';
      end if;
      update public.market_buy_requests
      set title = v_title, category_code = v_category, budget_amount = v_budget,
          region_code=v_region,summary=v_summary,budget_negotiable=v_neg,exchange_wanted=v_wanted,trade_type=v_trade,
          public_contact_method=v_method,public_contact_value=v_contact,public_contact_consent_at=v_consent_at,
          trade_notice_version='market-policy-v1',trade_notice_confirmed_at=v_policy_at,version=version+1
      where id = v_request.id returning * into v_request;
    elsif p_operation = 'close' then
      if v_request.request_status <> 'open' then
        raise exception '진행중인 구매요청만 종료할 수 있습니다.';
      end if;
      v_next_status := 'closed';
    else
      v_next_status := 'removed';
    end if;
    if v_next_status is not null then
      update public.market_buy_requests
      set request_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then now() else null end,
          version = version + 1
      where id = v_request.id returning * into v_request;
    end if;
  end if;

  if p_operation in ('create','update') then
    if coalesce(jsonb_typeof(p_payload->'remove_media_ids'),'array')<>'array' or coalesce(jsonb_array_length(p_payload->'remove_media_ids'),0)>5 then raise exception '삭제할 사진을 확인해 주세요.'; end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'remove_media_ids','[]'::jsonb)) x(id) where not exists(select 1 from public.market_exchange_media m where m.id::text=x.id and m.post_id=v_request.id and m.uploaded_by_user_id=v_actor_id and m.media_status='available')) then raise exception '본인 글의 등록 사진만 삭제할 수 있습니다.'; end if;
    update public.market_exchange_media set media_status='removed',removed_at=now(),version=version+1 where post_id=v_request.id and id::text in (select jsonb_array_elements_text(coalesce(p_payload->'remove_media_ids','[]'::jsonb)));
  end if;
  if p_operation = 'create' or v_before->>'request_status' is distinct from v_request.request_status then
    insert into public.market_status_history (
      entity_kind, buy_request_id, entity_version, from_status, to_status, actor_user_id, request_id
    ) values (
      'buy_request', v_request.id, v_request.version,
      case when p_operation = 'create' then null else v_before->>'request_status' end,
      v_request.request_status, v_actor_id, p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'buy_request_id', v_request.id,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'replayed', false
  );
  insert into private.market_audit_log (
    actor_user_id, request_id, action_code, entity_kind, entity_id, before_data, after_data
  ) values (
    v_actor_id, p_request_id, v_action, 'buy_request', v_request.id, v_before,
    pg_catalog.jsonb_build_object('status', v_request.request_status, 'version', v_request.version)
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

revoke all on function private.mutate_market_buy_exchange(text,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function private.mutate_market_buy_exchange(text,uuid,integer,jsonb,uuid) to authenticated;
create or replace function public.mutate_market_buy_request(p_operation text,p_buy_request_id uuid,p_expected_version integer,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_market_buy_exchange(p_operation,p_buy_request_id,p_expected_version,p_payload,p_request_id); $$;
revoke all on function public.mutate_market_buy_request(text,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_buy_request(text,uuid,integer,jsonb,uuid) to authenticated;
create or replace function public.mutate_market_buy_request_v2(p_operation text,p_buy_request_id uuid,p_expected_version integer,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_market_buy_exchange(p_operation,p_buy_request_id,p_expected_version,p_payload,p_request_id); $$;
revoke all on function public.mutate_market_buy_request_v2(text,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_buy_request_v2(text,uuid,integer,jsonb,uuid) to authenticated;
create or replace function public.mutate_market_buy_request_v3(p_operation text,p_buy_request_id uuid,p_expected_version integer,p_payload jsonb,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_market_buy_exchange(p_operation,p_buy_request_id,p_expected_version,p_payload,p_request_id); $$;
revoke all on function public.mutate_market_buy_request_v3(text,uuid,integer,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_buy_request_v3(text,uuid,integer,jsonb,uuid) to authenticated;
create table public.market_exchange_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.market_buy_requests (id) on delete cascade,
  uploaded_by_user_id uuid not null references public.user_accounts (id),
  storage_bucket text not null default 'market-exchange-media',
  storage_path text not null unique,
  sort_order smallint not null,
  media_status text not null default 'pending_upload',
  declared_mime_type text not null,
  declared_size_bytes bigint not null,
  verified_mime_type text,
  verified_size_bytes bigint,
  available_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleanup_checked_at timestamptz,
  version integer not null default 1,
  request_id uuid not null,
  unique(uploaded_by_user_id,request_id),
  constraint market_exchange_media_bucket_check check (storage_bucket = 'market-exchange-media'),
  constraint market_exchange_media_path_check
    check (storage_path = post_id::text || '/' || id::text || '/original'),
  constraint market_exchange_media_sort_check check (sort_order between 0 and 4),
  constraint market_exchange_media_status_check
    check (media_status in ('pending_upload', 'available', 'failed', 'removed')),
  constraint market_exchange_media_mime_check
    check (declared_mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint market_exchange_media_size_check check (declared_size_bytes between 1 and 8388608),
  constraint market_exchange_media_verified_check
    check (
      (media_status = 'pending_upload' and verified_mime_type is null and verified_size_bytes is null and available_at is null and removed_at is null)
      or (media_status = 'failed' and available_at is null and removed_at is null)
      or (media_status = 'available' and verified_mime_type = declared_mime_type and verified_size_bytes = declared_size_bytes and available_at is not null and removed_at is null)
      or (media_status = 'removed' and removed_at is not null)
    ),
  constraint market_exchange_media_version_check check (version >= 1)
);

create unique index market_exchange_media_active_order_uidx
  on public.market_exchange_media (post_id, sort_order)
  where media_status in ('pending_upload', 'available');
create index market_exchange_media_available_idx
  on public.market_exchange_media (post_id, sort_order)
  where media_status = 'available';

alter table public.market_exchange_media enable row level security;
alter table public.market_exchange_media force row level security;
revoke all on table public.market_exchange_media from public,anon,authenticated,service_role;
create trigger market_exchange_media_set_updated_at before update on public.market_exchange_media for each row execute function public.set_user_foundation_updated_at();
-- Every media writer takes account -> post -> media. The first lookup is not a lock.
create function private.market_lock_exchange_media(p_actor uuid,p_media uuid,p_require_active boolean default true)
returns public.market_exchange_media language plpgsql security definer set search_path='' as $$
declare v_account text; v_post_id uuid; v_post public.market_buy_requests%rowtype; v_media public.market_exchange_media%rowtype;
begin
 select account_status into v_account from public.user_accounts where id=p_actor for share;
 if v_account is null or (p_require_active and v_account<>'active') then raise exception '정상 활동 계정만 사진을 처리할 수 있습니다.'; end if;
 select post_id into v_post_id from public.market_exchange_media where id=p_media and uploaded_by_user_id=p_actor;
 select * into v_post from public.market_buy_requests where id=v_post_id for update;
 select * into v_media from public.market_exchange_media where id=p_media for update;
 if v_post.id is null or v_media.id is null or v_media.post_id<>v_post.id or
   v_post.author_user_id<>p_actor or v_media.uploaded_by_user_id<>p_actor then
   raise exception '사진 업로드 정보를 찾을 수 없습니다.';
 end if;
 return v_media;
end;
$$;
revoke all on function private.market_lock_exchange_media(uuid,uuid,boolean) from public,anon,authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('market-exchange-media','market-exchange-media',false,8388608,array['image/jpeg','image/png','image/webp']);
create function public.create_market_exchange_media_upload_intent(
  p_buy_request_id uuid,
  p_declared_mime_type text,
  p_declared_size_bytes bigint,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_listing public.market_buy_requests%rowtype;
  v_media_id uuid := gen_random_uuid();
  p_post_id uuid;
  v_sort_order smallint;
  v_existing public.market_exchange_media;
begin
  select listing.* into v_listing
  from public.market_buy_requests as listing
  where listing.id = p_buy_request_id
  for update;
  p_post_id := v_listing.id;
  if v_listing.id is null or v_listing.publication_status <> 'published' or v_listing.request_type <> 'exchange' then
    raise exception '교환 글을 찾을 수 없습니다.';
  end if;
  if v_listing.author_user_id <> v_actor_id then
    raise exception '본인의 교환 글에만 사진을 등록할 수 있습니다.';
  end if;
  if v_listing.request_status <> 'open' then
    raise exception '거래 완료된 교환 글에는 사진을 등록할 수 없습니다.';
  end if;
  if p_declared_mime_type is null or p_declared_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'JPG, PNG, WebP 이미지만 등록할 수 있습니다.';
  end if;
  if p_declared_size_bytes is null or p_declared_size_bytes not between 1 and 8388608 then
    raise exception '사진 파일은 8MB 이하여야 합니다.';
  end if;

  if p_request_id is null then raise exception '사진 요청 식별자가 필요합니다.'; end if;
  select * into v_existing from public.market_exchange_media where uploaded_by_user_id=v_actor_id and request_id=p_request_id;
  if found then
    if v_existing.post_id<>p_post_id or v_existing.declared_mime_type<>p_declared_mime_type or v_existing.declared_size_bytes<>p_declared_size_bytes then raise exception '사진 요청 내용이 다릅니다.'; end if;
    return jsonb_build_object('media_id',v_existing.id,'media_status',v_existing.media_status,'sort_order',v_existing.sort_order,'version',v_existing.version);
  end if;
  select candidate.sort_order into v_sort_order
  from pg_catalog.generate_series(0, 4) as candidate(sort_order)
  where not exists (
    select 1 from public.market_exchange_media as media
    where media.post_id = p_post_id
      and media.sort_order = candidate.sort_order
      and media.media_status in ('pending_upload', 'available')
  )
  order by candidate.sort_order limit 1;
  if v_sort_order is null then
    raise exception '교환 사진은 최대 5장까지 등록할 수 있습니다.';
  end if;

  insert into public.market_exchange_media (
    id, post_id, uploaded_by_user_id, storage_path, sort_order,
    declared_mime_type, declared_size_bytes, request_id
  ) values (
    v_media_id, p_post_id, v_actor_id,
    p_post_id::text || '/' || v_media_id::text || '/original', v_sort_order,
    p_declared_mime_type, p_declared_size_bytes, p_request_id
  );
  return pg_catalog.jsonb_build_object(
    'media_id', v_media_id, 'media_status', 'pending_upload',
    'sort_order', v_sort_order, 'version', 1
  );
end;
$$;

comment on function public.create_market_exchange_media_upload_intent(uuid, text, bigint, uuid) is
  'Creates one owner-scoped metadata intent for a server-signed market image upload.';
revoke all on function public.create_market_exchange_media_upload_intent(uuid, text, bigint, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_market_exchange_media_upload_intent(uuid, text, bigint, uuid)
  to authenticated;

create function public.get_market_exchange_media_upload_context_server(
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
language sql
security definer
set search_path = ''
as $$
  select media.id, media.storage_bucket, media.storage_path,
    media.declared_mime_type, media.declared_size_bytes, media.version
  from public.market_exchange_media as media
  join public.market_buy_requests as listing on listing.id = media.post_id
  join public.user_accounts as account on account.id = p_actor_user_id
  where media.id = p_media_id
    and media.uploaded_by_user_id = p_actor_user_id
    and media.media_status in ('pending_upload','available')
    and listing.author_user_id = p_actor_user_id
    and listing.request_status='open' and listing.publication_status='published' and listing.request_type='exchange'
    and account.account_status = 'active';
$$;

comment on function public.get_market_exchange_media_upload_context_server(uuid, uuid) is
  'Service-only owner-scoped market upload context.';
revoke all on function public.get_market_exchange_media_upload_context_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_exchange_media_upload_context_server(uuid, uuid)
  to service_role;

create function public.finalize_market_exchange_media_upload_server(
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
  v_media public.market_exchange_media%rowtype;
  v_listing public.market_buy_requests%rowtype;
begin
  v_media := private.market_lock_exchange_media(p_actor_user_id,p_media_id);
  select listing.* into v_listing
  from public.market_buy_requests as listing
  where listing.id = v_media.post_id;
  if v_listing.author_user_id <> p_actor_user_id or v_listing.request_status <> 'open' or v_listing.publication_status <> 'published' or v_listing.request_type <> 'exchange' then
    raise exception '사진 등록을 완료할 권한이 없습니다.';
  end if;
  if v_media.media_status = 'available' then
    if v_media.verified_mime_type = p_verified_mime_type and v_media.verified_size_bytes = p_verified_size_bytes then
      return pg_catalog.jsonb_build_object('media_id', v_media.id, 'media_status', 'available', 'version', v_media.version, 'replayed', true);
    end if;
    raise exception '이미 완료된 사진 정보와 검증 값이 다릅니다.';
  end if;
  if v_media.media_status <> 'pending_upload' then
    raise exception '완료할 수 없는 사진 업로드 상태입니다.';
  end if;
  if p_verified_mime_type is null or p_verified_size_bytes is null or p_verified_mime_type <> v_media.declared_mime_type or p_verified_size_bytes <> v_media.declared_size_bytes then
    raise exception '업로드한 사진 파일이 등록 정보와 일치하지 않습니다.';
  end if;
  update public.market_exchange_media
  set media_status = 'available', verified_mime_type = p_verified_mime_type,
      verified_size_bytes = p_verified_size_bytes, available_at = now(), version = version + 1
  where id = v_media.id;
  return pg_catalog.jsonb_build_object('media_id', v_media.id, 'media_status', 'available', 'version', v_media.version + 1, 'replayed', false);
end;
$$;

comment on function public.finalize_market_exchange_media_upload_server(uuid, uuid, text, bigint) is
  'Service-only byte-verified market photo finalize.';
revoke all on function public.finalize_market_exchange_media_upload_server(uuid, uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_market_exchange_media_upload_server(uuid, uuid, text, bigint)
  to service_role;

create function public.mark_market_exchange_media_upload_failed_server(
  p_actor_user_id uuid,
  p_media_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.market_lock_exchange_media(p_actor_user_id,p_media_id);
  update public.market_exchange_media
  set media_status = 'failed', version = version + 1
  where id = p_media_id and uploaded_by_user_id = p_actor_user_id and media_status = 'pending_upload';
end;
$$;

revoke all on function public.mark_market_exchange_media_upload_failed_server(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_market_exchange_media_upload_failed_server(uuid, uuid)
  to service_role;

-- Mark metadata removed even when the previous application uses its unchanged remove RPC.
create function private.market_exchange_remove_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.publication_status in ('hidden','removed') or new.request_status='removed' then
   update public.market_exchange_media set media_status='removed',removed_at=now(),version=version+1 where post_id=new.id and media_status<>'removed';
 end if;
 return new;
end;
$$;
revoke all on function private.market_exchange_remove_media() from public,anon,authenticated,service_role;
create trigger market_exchange_remove_media after update on public.market_buy_requests for each row execute function private.market_exchange_remove_media();

create function public.get_market_exchange_media_state_server(p_actor_user_id uuid,p_media_id uuid) returns text language sql stable security definer set search_path='' as $$
 select m.media_status from public.market_exchange_media m join public.market_buy_requests p on p.id=m.post_id join public.user_accounts a on a.id=p_actor_user_id
 where m.id=p_media_id and m.uploaded_by_user_id=p_actor_user_id and p.author_user_id=p_actor_user_id and a.account_status='active';
$$;
revoke all on function public.get_market_exchange_media_state_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_exchange_media_state_server(uuid,uuid) to service_role;

-- Read URLs are issued only by the server after this live visibility check.
create function public.get_market_exchange_media_read_context_server(p_buy_request_id uuid,p_media_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select m.storage_path from public.market_exchange_media m join public.market_buy_requests p on p.id=m.post_id
 where p.id=p_buy_request_id and m.id=p_media_id and p.publication_status='published'
 and p.request_status in ('open','closed') and p.request_type='exchange' and m.media_status='available';
$$;
revoke all on function public.get_market_exchange_media_read_context_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_exchange_media_read_context_server(uuid,uuid) to service_role;

-- Browser callers supply an ID, never a bucket/path. Terminal states cannot finalize.
create function public.get_market_exchange_media_cleanup_path_server(p_actor_user_id uuid,p_media_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_media public.market_exchange_media%rowtype;
begin
 v_media:=private.market_lock_exchange_media(p_actor_user_id,p_media_id);
 if v_media.media_status in ('failed','removed') then return v_media.storage_path; end if;
 return null;
end;
$$;
revoke all on function public.get_market_exchange_media_cleanup_path_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_exchange_media_cleanup_path_server(uuid,uuid) to service_role;

-- Repeatable cleanup of one deleted post and its authenticated owner only.
-- Keep terminal metadata so partial failures and late uploads can be retried.
create function public.reconcile_market_exchange_media_server(p_actor_user_id uuid, p_post_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_account text; v_candidate record; v_paths jsonb := '[]'::jsonb;
 v_media public.market_exchange_media%rowtype;
 v_post public.market_buy_requests%rowtype;
begin
 if p_actor_user_id is null or p_post_id is null then
   raise exception '사진 정리 범위가 필요합니다.';
 end if;
 select a.account_status into v_account from public.user_accounts a where a.id=p_actor_user_id for share;
 if v_account is distinct from 'active' then raise exception '정상 활동 계정만 사진을 처리할 수 있습니다.'; end if;
 select p.* into v_post from public.market_buy_requests p where p.id=p_post_id for update;
 if v_post.id is null or v_post.author_user_id is distinct from p_actor_user_id
   or v_post.request_status is distinct from 'removed' then
   raise exception '삭제한 본인 글만 사진을 정리할 수 있습니다.';
 end if;
 if exists(select 1 from public.market_exchange_media m where m.post_id=p_post_id
   and m.uploaded_by_user_id is distinct from p_actor_user_id) then
   raise exception '사진 소유 정보가 일치하지 않습니다.';
 end if;
 for v_candidate in
   select m.id from public.market_exchange_media m
   join public.market_buy_requests p on p.id=m.post_id
   where m.post_id=p_post_id and p.id=p_post_id
     and p.author_user_id=p_actor_user_id and m.uploaded_by_user_id=p_actor_user_id
     and p.request_status='removed' and m.media_status in ('failed','removed')
   order by m.id
 loop
   v_media:=private.market_lock_exchange_media(p_actor_user_id,v_candidate.id);
   select p.* into v_post from public.market_buy_requests p where p.id=p_post_id;
   if v_media.post_id is distinct from p_post_id or v_media.uploaded_by_user_id is distinct from p_actor_user_id
     or v_post.author_user_id is distinct from p_actor_user_id or v_post.request_status is distinct from 'removed'
     or v_media.media_status not in ('failed','removed') then
     raise exception '사진 정리 대상이 변경되었습니다.';
   end if;
   update public.market_exchange_media m set cleanup_checked_at=clock_timestamp()
     where m.id=v_media.id and m.post_id=p_post_id and m.uploaded_by_user_id=p_actor_user_id
       and m.media_status in ('failed','removed');
   v_paths := v_paths || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
     'media_id',v_media.id,'post_id',p_post_id,'uploaded_by_user_id',p_actor_user_id,'storage_path',v_media.storage_path));
 end loop;
 return v_paths;
end;
$$;
revoke all on function public.reconcile_market_exchange_media_server(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_market_exchange_media_server(uuid,uuid) to service_role;

-- Owner removal returns only its terminal metadata ID. Storage cleanup remains server-only.
create function public.remove_market_exchange_media(p_media_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=private.market_assert_active_actor(); m public.market_exchange_media;
begin m:=private.market_lock_exchange_media(a,p_media_id);
 if not exists(select 1 from public.market_buy_requests where id=m.post_id and request_type='exchange' and request_status='open' and publication_status='published') then raise exception '사진을 변경할 수 없습니다.'; end if;
 update public.market_exchange_media set media_status='removed',removed_at=coalesce(removed_at,now()),version=version+1 where id=m.id and media_status<>'removed';
end $$;
revoke all on function public.remove_market_exchange_media(uuid) from public,anon,authenticated,service_role;
grant execute on function public.remove_market_exchange_media(uuid) to authenticated;
create function private.market_buy_exchange_json(r public.market_buy_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'category',r.category_code,'region',r.region_code,'budget',r.budget_amount,'summary',r.summary,
 'author_display_name',private.market_actor_display_name(r.author_user_id,auth.uid()),'request_status',r.request_status,'created_at',r.created_at,'updated_at',r.updated_at,'version',r.version,
 'can_edit',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active(),false),
 'request_type',r.request_type,'budget_negotiable',r.budget_negotiable,'exchange_wanted',r.exchange_wanted,'trade_type',r.trade_type,
 'public_contact_method',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_method end,
 'public_contact_value',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_value end,
 'public_contact_consent_valid',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active() and r.public_contact_consent_at is not null,false),
 'trade_notice_confirmed',coalesce(r.author_user_id=auth.uid() and r.trade_notice_version='market-policy-v1' and r.trade_notice_confirmed_at is not null,false),
 'trade_notice_version',case when r.author_user_id=auth.uid() then r.trade_notice_version end,
 'image_paths',coalesce((select jsonb_agg(m.storage_path order by m.sort_order,m.id) from public.market_exchange_media m where m.post_id=r.id and m.media_status='available'),'[]'::jsonb)); $$;
revoke all on function private.market_buy_exchange_json(public.market_buy_requests) from public,anon,authenticated,service_role;
create function public.get_market_buy_request_v3(p_buy_request_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.market_buy_exchange_json(r) from public.market_buy_requests r where r.id=p_buy_request_id and r.request_status in ('open','closed') and r.publication_status='published'; $$;
revoke all on function public.get_market_buy_request_v3(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_buy_request_v3(uuid) to anon,authenticated;
create function public.list_market_buy_requests_v3(
  p_keyword text default null,
  p_category_code text default null,
  p_region_code text default null,
  p_request_status text default null,
  p_request_type text default null,
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword),'');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_request_type is not null and p_request_type not in ('buy','exchange') then raise exception '글 유형을 확인해 주세요.'; end if;
  if p_category_code is not null and p_category_code not in ('club','ball','bag','apparel','shoes','practice','other') then raise exception '카테고리 입력을 확인해 주세요.'; end if;
  if p_region_code is not null and p_region_code not in ('전국','서울','경기','인천','충청','강원','전라','경상','제주') then raise exception '지역 입력을 확인해 주세요.'; end if;
  if p_request_status is not null and p_request_status not in ('open','closed') then raise exception '구매요청 상태 입력을 확인해 주세요.'; end if;
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed' and request.publication_status='published' and (p_request_type is null or request.request_type=p_request_type)
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      private.market_buy_exchange_json(request) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed' and request.publication_status='published' and (p_request_type is null or request.request_type=p_request_type)
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%')
    order by request.created_at desc, request.id desc
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
$$;

comment on function public.list_market_buy_requests_v3(text, text, text, text, text, integer, integer) is
  'Public paginated wanted-post read without private author identifiers.';
revoke all on function public.list_market_buy_requests_v3(text, text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_requests_v3(text, text, text, text, text, integer, integer)
  to anon, authenticated;

create or replace function public.list_market_buy_requests_v2(
  p_keyword text default null,
  p_category_code text default null,
  p_region_code text default null,
  p_request_status text default null,
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
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword),'');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club','ball','bag','apparel','shoes','practice','other') then raise exception '카테고리 입력을 확인해 주세요.'; end if;
  if p_region_code is not null and p_region_code not in ('서울','경기','인천','충청','강원','전라','경상','제주') then raise exception '지역 입력을 확인해 주세요.'; end if;
  if p_request_status is not null and p_request_status not in ('open','closed') then raise exception '구매요청 상태 입력을 확인해 주세요.'; end if;
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'title', request.title,
        'category', request.category_code,
        'region', request.region_code,
        'budget', request.budget_amount,
        'summary', request.summary,
        'author_display_name', private.market_actor_display_name(request.author_user_id, v_actor_id),
        'request_status', request.request_status,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'version', request.version,
        'can_edit', coalesce(request.author_user_id = v_actor_id,false)
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%')
    order by request.created_at desc, request.id desc
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
$$;

comment on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer) is
  'Public paginated wanted-post read without private author identifiers.';
revoke all on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_requests_v2(text, text, text, text, integer, integer)
  to anon, authenticated;

create table public.market_buy_request_bookmarks (
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  buy_request_id uuid not null references public.market_buy_requests(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, buy_request_id)
);
create index market_buy_request_bookmarks_page_idx on public.market_buy_request_bookmarks(user_id, created_at desc, buy_request_id);
alter table public.market_buy_request_bookmarks enable row level security;
alter table public.market_buy_request_bookmarks force row level security;
revoke all on public.market_buy_request_bookmarks from public, anon, authenticated, service_role;
-- Keep private tables inaccessible. Only the checked RPCs below can read/write them.
create function private.set_buy_request_interest(p_buy_request_id uuid, p_saved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_listing public.market_buy_requests;
begin
  v_actor := private.require_active_lesson_video_bookmark_actor();
  if p_buy_request_id is null or p_saved is null then raise exception '관심상품 요청을 확인해 주세요.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_buy_request_id::text,0));
  if p_saved then
    select * into v_listing from public.market_buy_requests where id=p_buy_request_id for share;
    if v_listing.id is null or public.get_market_buy_request_v3(p_buy_request_id) is null then
      raise exception '현재 저장할 수 없는 상품입니다.';
    end if;
    if v_listing.author_user_id=v_actor then raise exception '내 상품은 관심목록에 저장할 수 없습니다.'; end if;
    insert into public.market_buy_request_bookmarks(user_id,buy_request_id) values(v_actor,p_buy_request_id)
      on conflict(user_id,buy_request_id) do nothing;
  else
    -- Unsave remains possible after the target becomes unavailable.
    delete from public.market_buy_request_bookmarks where user_id=v_actor and buy_request_id=p_buy_request_id;
  end if;
  return pg_catalog.jsonb_build_object('id',p_buy_request_id,'saved',p_saved);
end $$;
create function public.set_buy_request_interest(p_buy_request_id uuid,p_saved boolean)
returns jsonb language sql security invoker set search_path='' as $$
 select private.set_buy_request_interest(p_buy_request_id,p_saved);
$$;
create function private.buy_request_interest_state(p_buy_request_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 return exists(select 1 from public.market_buy_request_bookmarks where user_id=v_actor and buy_request_id=p_buy_request_id);
end $$;
create function public.buy_request_interest_state(p_buy_request_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select private.buy_request_interest_state(p_buy_request_id);
$$;
revoke all on function private.set_buy_request_interest(uuid,boolean),private.buy_request_interest_state(uuid),public.set_buy_request_interest(uuid,boolean),public.buy_request_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function private.set_buy_request_interest(uuid,boolean),private.buy_request_interest_state(uuid),public.set_buy_request_interest(uuid,boolean),public.buy_request_interest_state(uuid) to authenticated;
create function private.list_my_interests_v2(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.lesson_video_bookmarks where user_id=v_actor and p_kind in ('all','lesson_video')
 ) q;
 with saved as (
  select 'market'::text kind,listing_id id,created_at from public.market_listing_bookmarks
   where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'buy_request',buy_request_id,created_at from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind in ('market','buy_request') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'title',case when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
create function public.list_my_interests_v2(p_kind text default 'all',p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.list_my_interests_v2(p_kind,p_limit,p_offset);
$$;
revoke all on function private.list_my_interests_v2(text,integer,integer),public.list_my_interests_v2(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v2(text,integer,integer),public.list_my_interests_v2(text,integer,integer) to authenticated;
create table public.messaging_buy_request_contexts (
  message_id uuid primary key references public.messaging_messages(id) on delete cascade,
  buy_request_id uuid references public.market_buy_requests(id) on delete set null
);
create index messaging_buy_request_context_idx on public.messaging_buy_request_contexts(buy_request_id)
  where buy_request_id is not null;
alter table public.messaging_buy_request_contexts enable row level security;
alter table public.messaging_buy_request_contexts force row level security;
revoke all on public.messaging_buy_request_contexts from public, anon, authenticated, service_role;

-- A missing listing leaves a context tombstone; it never deletes personal messages.
-- Reply authorization stays entirely in the existing messaging foundation.
create function private.messaging_inherit_buy_request_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.messaging_buy_request_contexts(message_id, buy_request_id)
    select new.id, c.buy_request_id from public.messaging_buy_request_contexts c
    where c.message_id = new.reply_to_message_id;
  return new;
end;
$$;
create trigger messaging_reply_buy_request_context after insert on public.messaging_messages
  for each row when (new.reply_to_message_id is not null)
  execute function private.messaging_inherit_buy_request_context();

create function public.get_buy_request_message_compose_context(p_buy_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_listing record;
begin
  select l.id,l.author_user_id,l.title,l.request_status,l.request_type,l.publication_status into v_listing
    from public.market_buy_requests l where l.id = p_buy_request_id;
  if v_listing.id is null or (v_listing.request_status<>'open' or v_listing.publication_status<>'published')
    or v_listing.author_user_id = v_actor
    or not private.messaging_account_available(v_listing.author_user_id) then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('available',true,'buy_request_id',v_listing.id,'request_type',v_listing.request_type,
    'title',v_listing.title,'status',v_listing.request_status);
end;
$$;

create function public.send_market_buy_request_message(p_buy_request_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_listing record;
  v_previous public.messaging_messages%rowtype;
  v_fingerprint text; v_receipt jsonb;
begin
  perform private.messaging_assert_read_committed();
  if p_buy_request_id is null or p_request_id is null or p_body is null
    or pg_catalog.char_length(private.messaging_trim(p_body)) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  -- Same sender lock as generic send/reply: no separate quota or replay channel.
  perform pg_catalog.pg_advisory_xact_lock(1297303345, pg_catalog.hashtext(v_actor::text));
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('buy_request',p_buy_request_id,private.messaging_normalize(p_body))::text,'UTF8')),'hex');
  select m.* into v_previous from public.messaging_messages m
    where m.sender_user_id = v_actor and m.request_id = p_request_id;
  if found then
    if v_previous.request_fingerprint <> v_fingerprint then
      raise exception 'messaging_replay_conflict' using errcode = '22023';
    end if;
    perform private.messaging_assert_actor();
    -- Acknowledgement only, even after sold/removed/hide/block/hard-delete.
    return pg_catalog.jsonb_build_object('id',v_previous.id,'created_at',v_previous.created_at);
  end if;
  -- Canonical owner is not mutable through the market API. SHARE also serializes
  -- status updates/removal: a committed non-contactable state winning first denies.
  select l.id,l.author_user_id,l.request_status,l.request_type,l.publication_status into v_listing
    from public.market_buy_requests l where l.id = p_buy_request_id for share;
  if v_listing.id is null or (v_listing.request_status<>'open' or v_listing.publication_status<>'published') then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  v_receipt := private.messaging_create(v_listing.author_user_id,null,p_body,p_request_id);
  -- The foundation has inserted the message/receipt under its ordinary account,
  -- pair, spam and concurrency guards. Replace only this new operation's replay
  -- fingerprint before commit; generic send/reply can never replay/convert it.
  update public.messaging_messages set request_fingerprint = v_fingerprint
    where id = (v_receipt->>'id')::uuid;
  insert into public.messaging_buy_request_contexts(message_id,buy_request_id)
    values ((v_receipt->>'id')::uuid,v_listing.id);
  return v_receipt;
end;
$$;

create function public.get_message_buy_request_context(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_listing_id uuid; v_result jsonb;
begin
  -- Reuse the exact active/participant/own-hidden guard, without marking read.
  perform public.get_messaging_message(p_message_id,false);
  select c.buy_request_id into v_listing_id from public.messaging_buy_request_contexts c
    where c.message_id = p_message_id;
  if not found then return null; end if;
  -- Same visibility as canonical public get_market_buy_request, but never its contact,
  -- body, images or management metadata. No participant-only listing privilege.
  select pg_catalog.jsonb_build_object('available',true,'buy_request_id',l.id,'request_type',l.request_type,'title',l.title,'status',l.request_status)
    into v_result from public.market_buy_requests l
    where l.id = v_listing_id and l.publication_status='published' and l.request_status in ('open','closed');
  return coalesce(v_result,pg_catalog.jsonb_build_object('available',false));
end;
$$;

alter table public.messaging_buy_request_contexts owner to postgres;
alter function private.messaging_inherit_buy_request_context() owner to postgres;
alter function public.get_buy_request_message_compose_context(uuid) owner to postgres;
alter function public.send_market_buy_request_message(uuid,text,uuid) owner to postgres;
alter function public.get_message_buy_request_context(uuid) owner to postgres;
revoke all on function private.messaging_inherit_buy_request_context(),
  public.get_buy_request_message_compose_context(uuid), public.send_market_buy_request_message(uuid,text,uuid),
  public.get_message_buy_request_context(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_buy_request_message_compose_context(uuid),
  public.send_market_buy_request_message(uuid,text,uuid), public.get_message_buy_request_context(uuid) to authenticated;
create table public.market_buy_request_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_key text not null default pg_catalog.encode(extensions.gen_random_bytes(16), 'hex'),
  buy_request_id uuid not null references public.market_buy_requests (id) on delete restrict,
  reporter_user_id uuid references public.user_accounts (id) on delete set null,
  submit_request_id uuid not null,
  reason_code text not null,
  note text not null,
  report_status text not null default 'received',
  version integer not null default 1,
  resolved_by uuid references public.user_accounts (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  resolved_at timestamptz,
  constraint market_buy_request_reports_report_key_key unique (report_key),
  constraint market_buy_request_reports_reporter_request_key unique (reporter_user_id, submit_request_id),
  constraint market_buy_request_reports_report_key_check check (report_key ~ '^[0-9a-f]{32}$'),
  constraint market_buy_request_reports_reason_check check (
    reason_code in (
      'fraud_or_false',
      'prohibited_or_inappropriate',
      'spam_or_duplicate',
      'privacy_exposure',
      'other'
    )
  ),
  constraint market_buy_request_reports_note_check check (
    note = private.market_trim_text(note)
    and pg_catalog.char_length(note) between 10 and 1000
  ),
  constraint market_buy_request_reports_status_check check (
    report_status in ('received', 'handled', 'dismissed')
  ),
  constraint market_buy_request_reports_version_check check (version >= 1),
  constraint market_buy_request_reports_resolution_note_check check (
    resolution_note is null
    or (
      resolution_note = private.market_trim_text(resolution_note)
      and pg_catalog.char_length(resolution_note) between 2 and 500
    )
  ),
  constraint market_buy_request_reports_resolution_check check (
    (
      report_status = 'received'
      and resolved_by is null
      and resolved_at is null
      and resolution_note is null
    )
    or (
      report_status in ('handled', 'dismissed')
      and resolved_at is not null
      and resolution_note is not null
    )
  )
);

create unique index market_buy_request_reports_one_received_reporter_buy_request_idx
  on public.market_buy_request_reports (reporter_user_id, buy_request_id)
  where report_status = 'received' and reporter_user_id is not null;
create index market_buy_request_reports_status_created_idx
  on public.market_buy_request_reports (report_status, created_at desc, report_key);
create index market_buy_request_reports_listing_created_idx
  on public.market_buy_request_reports (buy_request_id, created_at desc);
create index market_buy_request_reports_reporter_created_idx
  on public.market_buy_request_reports (reporter_user_id, created_at desc)
  where reporter_user_id is not null;
create index market_buy_request_reports_resolved_by_idx
  on public.market_buy_request_reports (resolved_by)
  where resolved_by is not null;

create trigger market_buy_request_reports_set_updated_at
before update on public.market_buy_request_reports
for each row execute function public.set_user_foundation_updated_at();

alter table public.market_buy_request_reports enable row level security;
alter table public.market_buy_request_reports force row level security;
revoke all on table public.market_buy_request_reports
  from public, anon, authenticated, service_role;

comment on table public.market_buy_request_reports is
  'Private active-member reports about visible market listings. Resolution never changes the listing automatically.';
comment on column public.market_buy_request_reports.report_key is
  'Opaque management identifier used instead of the internal report UUID.';
comment on column public.market_buy_request_reports.note is
  'Private report statement; it must not be copied into audit or request result metadata.';

create function public.submit_market_buy_request_report(
  p_buy_request_id uuid,
  p_reason_code text,
  p_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_note text := nullif(private.market_trim_text(p_note), '');
  v_payload jsonb;
  v_replay jsonb;
  v_listing public.market_buy_requests%rowtype;
  v_report public.market_buy_request_reports%rowtype;
  v_result jsonb;
begin
  if p_buy_request_id is null then
    raise exception '신고할 장터 글을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_reason_code is null or p_reason_code not in (
    'fraud_or_false',
    'prohibited_or_inappropriate',
    'spam_or_duplicate',
    'privacy_exposure',
    'other'
  ) then
    raise exception '신고 사유를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is null or pg_catalog.char_length(v_note) not between 10 and 1000 then
    raise exception '신고 내용은 10~1000자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'market.buy_request_report.submit',
    'buy_request_id', p_buy_request_id,
    'reporter_user_id', v_actor_id,
    'reason_code', p_reason_code,
    'note', v_note
  );
  v_replay := private.market_claim_sha256_request(
    v_actor_id,
    p_request_id,
    'market.buy_request_report.submit',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select listing.*
  into v_listing
  from public.market_buy_requests as listing
  where listing.id = p_buy_request_id
  for share;
  if not found or (v_listing.request_status = 'removed' or v_listing.publication_status<>'published') then
    raise exception '신고할 장터 글을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_listing.author_user_id = v_actor_id then
    raise exception '본인의 장터 글은 신고할 수 없습니다.' using errcode = '42501';
  end if;

  insert into public.market_buy_request_reports (
    buy_request_id,
    reporter_user_id,
    submit_request_id,
    reason_code,
    note
  ) values (
    v_listing.id,
    v_actor_id,
    p_request_id,
    p_reason_code,
    v_note
  ) returning * into v_report;

  v_result := pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'request_id', p_request_id,
    'replayed', false
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
    'market.buy_request_report.submit',
    'buy_request_report',
    v_report.id,
    null,
    pg_catalog.jsonb_build_object(
      'report_status', v_report.report_status,
      'reason_code', v_report.reason_code,
      'version', v_report.version,
      'buy_request_id', v_listing.id
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
exception
  when unique_violation then
    raise exception '이미 확인 대기 중인 장터 글 신고가 있습니다.' using errcode = '40901';
end;
$$;

comment on function public.submit_market_buy_request_report(uuid, text, text, uuid) is
  'Active non-owner report submission with SHA-256 request replay, one received report per reporter/listing, and redacted audit.';
revoke all on function public.submit_market_buy_request_report(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_market_buy_request_report(uuid, text, text, uuid)
  to authenticated;

-- PUL 9-1: member-centered activity overview for the authenticated user's My page.
-- This is a read-only projection. It exposes only the caller's own activity and public/context labels.

create function public.get_my_activity_overview_v2(
  p_item_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
  ) then
    raise exception '계정 정보를 확인할 수 없습니다.' using errcode = '42501';
  end if;

  if p_item_limit is null or p_item_limit not between 1 and 12 then
    raise exception '내 활동 조회 범위를 확인해 주세요.';
  end if;

  return pg_catalog.jsonb_build_object(
    'clubs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'public_key', page.public_key,
          'name', page.name,
          'region_label', page.region_label,
          'membership_status', page.membership_status,
          'joined_at', page.joined_at
        )
        order by page.joined_at desc, page.membership_id desc
      )
      from (
        select
          membership.id as membership_id,
          club.legacy_key as public_key,
          club.name,
          coalesce(
            nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
            '지역 정보 미등록'
          ) as region_label,
          membership.membership_status,
          membership.joined_at
        from public.club_memberships as membership
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where membership.user_id = v_actor_id
          and membership.membership_status in ('active', 'suspended')
        order by membership.joined_at desc, membership.id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'upcoming_events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'club_public_key', page.club_public_key,
          'club_name', page.club_name,
          'title', page.title,
          'starts_at', page.starts_at,
          'ends_at', page.ends_at,
          'location', page.location,
          'event_status', page.event_status,
          'joined_at', page.joined_at
        )
        order by page.starts_at, page.event_sort_id
      )
      from (
        select
          event.id as event_sort_id,
          club.legacy_key as club_public_key,
          club.name as club_name,
          event.title,
          event.starts_at,
          event.ends_at,
          event.location,
          event.event_status,
          participation.joined_at
        from public.club_official_event_participations as participation
        join public.club_memberships as membership
          on membership.id = participation.membership_id
         and membership.user_id = v_actor_id
         and membership.membership_status = 'active'
        join public.club_official_events as event
          on event.id = participation.event_id
         and event.club_id = membership.club_id
         and event.moderation_status = 'visible'
         and event.event_status not in ('draft', 'cancelled', 'completed')
         and event.starts_at >= pg_catalog.now()
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where event.visibility = 'public'
           or private.club_user_has_permission(v_actor_id, event.club_id, 'club.events.read')
        order by event.starts_at, event.id
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'posts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'summary', page.summary,
          'context_label', page.context_label,
          'href', page.href,
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select activity.*
        from (
          select
            post.id as sort_id,
            'community'::text as kind,
            post.title,
            pg_catalog.left(post.body, 180) as summary,
            null::text as context_label,
            '/community/' || post.id::text as href,
            post.created_at
          from public.community_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'club'::text as kind,
            post.title,
            pg_catalog.left(post.content_summary, 180) as summary,
            club.name as context_label,
            '/clubs/' || club.legacy_key as href,
            post.created_at
          from public.club_posts as post
          join public.clubs as club
            on club.id = post.club_id
           and club.club_status = 'active'
           and club.legacy_key is not null
          where post.author_user_id = v_actor_id
            and post.moderation_status = 'visible'
            and post.post_status in ('published', 'edited')
            and (
              post.visibility = 'public'
              or private.club_user_has_permission(v_actor_id, post.club_id, 'club.posts.read')
            )

          union all

          select
            post.id as sort_id,
            'course'::text as kind,
            '골프장 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            course.name as context_label,
            '/courses/' || course.course_key || '/stories' as href,
            post.created_at
          from public.course_discussion_posts as post
          join public.courses as course
            on course.id = post.course_id
           and course.course_status = 'active'
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'certification'::text as kind,
            '자격증 시험 준비 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            '자격증·심판'::text as context_label,
            '/certification/study'::text as href,
            post.created_at
          from public.certification_study_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'
        ) as activity
        order by activity.created_at desc, activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'market_items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'amount', page.amount,
          'region', page.region,
          'status', page.status,
          'href', case when page.kind='listing' then '/market?view=sale&listing=' else '/market?view=buy&request=' end || page.sort_id::text,
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select market_activity.*
        from (
          select
            listing.id as sort_id,
            'listing'::text as kind,
            listing.title,
            listing.price_amount as amount,
            listing.region_code as region,
            listing.listing_status as status,
            listing.created_at
          from public.market_listings as listing
          where listing.seller_user_id = v_actor_id
            and listing.listing_status <> 'removed'

          union all

          select
            request.id as sort_id,
            case when request.request_type='exchange' then 'exchange' else 'buy_request' end as kind,
            request.title,
            request.budget_amount as amount,
            request.region_code as region,
            request.request_status as status,
            request.created_at
          from public.market_buy_requests as request
          where request.author_user_id = v_actor_id
            and request.request_status <> 'removed' and request.publication_status='published'
        ) as market_activity
        order by market_activity.created_at desc, market_activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_my_activity_overview_v2(integer) is
  'Returns bounded My-page activity for only the authenticated caller: memberships, joined upcoming club events, authored posts, and marketplace items.';

revoke all on function public.get_my_activity_overview_v2(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_activity_overview_v2(integer)
  to authenticated;
create or replace function public.list_market_buy_requests(
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
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable;

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'title', request.title,
        'category', request.category_code,
        'region', request.region_code,
        'budget', request.budget_amount,
        'summary', request.summary,
        'author_display_name', private.market_actor_display_name(request.author_user_id, v_actor_id),
        'request_status', request.request_status,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'version', request.version,
        'can_edit', request.author_user_id = v_actor_id
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    order by request.created_at desc, request.id desc
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
$$;

comment on function public.list_market_buy_requests(integer, integer) is
  'Public paginated wanted-post read without private author identifiers.';
revoke all on function public.list_market_buy_requests(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_requests(integer, integer)
  to anon, authenticated;

create or replace function public.get_market_buy_request(p_buy_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', request.id,
    'title', request.title,
    'category', request.category_code,
    'region', request.region_code,
    'budget', request.budget_amount,
    'summary', request.summary,
    'author_display_name', private.market_actor_display_name(request.author_user_id, auth.uid()),
    'request_status', request.request_status,
    'created_at', request.created_at,
    'updated_at', request.updated_at,
    'version', request.version,
    'can_edit', request.author_user_id = auth.uid()
  )
  from public.market_buy_requests as request
  where request.id = p_buy_request_id and request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable;
$$;

comment on function public.get_market_buy_request(uuid) is
  'Public detail read for one visible wanted post.';
revoke all on function public.get_market_buy_request(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_buy_request(uuid) to anon, authenticated;create or replace function public.get_market_buy_request_v2(p_buy_request_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select pg_catalog.jsonb_build_object('post',public.get_market_buy_request(r.id)||pg_catalog.jsonb_build_object('can_edit',coalesce(r.author_user_id=auth.uid(),false)),
 'public_contact_method',case when private.market_contact_viewer_active() and r.request_status='open' and r.public_contact_consent_at is not null then r.public_contact_method else null end,
 'public_contact_value',case when private.market_contact_viewer_active() and r.request_status='open' and r.public_contact_consent_at is not null then r.public_contact_value else null end)
 from public.market_buy_requests r where r.id=p_buy_request_id and r.request_status<>'removed' and r.publication_status='published' and r.request_type='buy' and not r.budget_negotiable;
$$;
revoke all on function public.get_market_buy_request_v2(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_buy_request_v2(uuid) to anon,authenticated;

-- PUL 9-1: member-centered activity overview for the authenticated user's My page.
-- This is a read-only projection. It exposes only the caller's own activity and public/context labels.

create or replace function public.get_my_activity_overview(
  p_item_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_accounts as account
    where account.id = v_actor_id
  ) then
    raise exception '계정 정보를 확인할 수 없습니다.' using errcode = '42501';
  end if;

  if p_item_limit is null or p_item_limit not between 1 and 12 then
    raise exception '내 활동 조회 범위를 확인해 주세요.';
  end if;

  return pg_catalog.jsonb_build_object(
    'clubs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'public_key', page.public_key,
          'name', page.name,
          'region_label', page.region_label,
          'membership_status', page.membership_status,
          'joined_at', page.joined_at
        )
        order by page.joined_at desc, page.membership_id desc
      )
      from (
        select
          membership.id as membership_id,
          club.legacy_key as public_key,
          club.name,
          coalesce(
            nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
            '지역 정보 미등록'
          ) as region_label,
          membership.membership_status,
          membership.joined_at
        from public.club_memberships as membership
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where membership.user_id = v_actor_id
          and membership.membership_status in ('active', 'suspended')
        order by membership.joined_at desc, membership.id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'upcoming_events', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'club_public_key', page.club_public_key,
          'club_name', page.club_name,
          'title', page.title,
          'starts_at', page.starts_at,
          'ends_at', page.ends_at,
          'location', page.location,
          'event_status', page.event_status,
          'joined_at', page.joined_at
        )
        order by page.starts_at, page.event_sort_id
      )
      from (
        select
          event.id as event_sort_id,
          club.legacy_key as club_public_key,
          club.name as club_name,
          event.title,
          event.starts_at,
          event.ends_at,
          event.location,
          event.event_status,
          participation.joined_at
        from public.club_official_event_participations as participation
        join public.club_memberships as membership
          on membership.id = participation.membership_id
         and membership.user_id = v_actor_id
         and membership.membership_status = 'active'
        join public.club_official_events as event
          on event.id = participation.event_id
         and event.club_id = membership.club_id
         and event.moderation_status = 'visible'
         and event.event_status not in ('draft', 'cancelled', 'completed')
         and event.starts_at >= pg_catalog.now()
        join public.clubs as club
          on club.id = membership.club_id
         and club.club_status = 'active'
         and club.legacy_key is not null
        where event.visibility = 'public'
           or private.club_user_has_permission(v_actor_id, event.club_id, 'club.events.read')
        order by event.starts_at, event.id
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'posts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'summary', page.summary,
          'context_label', page.context_label,
          'href', page.href,
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select activity.*
        from (
          select
            post.id as sort_id,
            'community'::text as kind,
            post.title,
            pg_catalog.left(post.body, 180) as summary,
            null::text as context_label,
            '/community/' || post.id::text as href,
            post.created_at
          from public.community_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'club'::text as kind,
            post.title,
            pg_catalog.left(post.content_summary, 180) as summary,
            club.name as context_label,
            '/clubs/' || club.legacy_key as href,
            post.created_at
          from public.club_posts as post
          join public.clubs as club
            on club.id = post.club_id
           and club.club_status = 'active'
           and club.legacy_key is not null
          where post.author_user_id = v_actor_id
            and post.moderation_status = 'visible'
            and post.post_status in ('published', 'edited')
            and (
              post.visibility = 'public'
              or private.club_user_has_permission(v_actor_id, post.club_id, 'club.posts.read')
            )

          union all

          select
            post.id as sort_id,
            'course'::text as kind,
            '골프장 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            course.name as context_label,
            '/courses/' || course.course_key || '/stories' as href,
            post.created_at
          from public.course_discussion_posts as post
          join public.courses as course
            on course.id = post.course_id
           and course.course_status = 'active'
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'

          union all

          select
            post.id as sort_id,
            'certification'::text as kind,
            '자격증 시험 준비 이야기'::text as title,
            pg_catalog.left(post.body, 180) as summary,
            '자격증·심판'::text as context_label,
            '/certification/study'::text as href,
            post.created_at
          from public.certification_study_posts as post
          where post.author_user_id = v_actor_id
            and post.post_status = 'published'
        ) as activity
        order by activity.created_at desc, activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb),

    'market_items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'kind', page.kind,
          'title', page.title,
          'amount', page.amount,
          'region', page.region,
          'status', page.status,
          'href', '/market',
          'created_at', page.created_at
        )
        order by page.created_at desc, page.sort_id desc
      )
      from (
        select market_activity.*
        from (
          select
            listing.id as sort_id,
            'listing'::text as kind,
            listing.title,
            listing.price_amount as amount,
            listing.region_code as region,
            listing.listing_status as status,
            listing.created_at
          from public.market_listings as listing
          where listing.seller_user_id = v_actor_id
            and listing.listing_status <> 'removed'

          union all

          select
            request.id as sort_id,
            'buy_request'::text as kind,
            request.title,
            request.budget_amount as amount,
            request.region_code as region,
            request.request_status as status,
            request.created_at
          from public.market_buy_requests as request
          where request.author_user_id = v_actor_id
            and request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
        ) as market_activity
        order by market_activity.created_at desc, market_activity.sort_id desc
        limit p_item_limit
      ) as page
    ), '[]'::jsonb)
  );
end;
$$;

comment on function public.get_my_activity_overview(integer) is
  'Returns bounded My-page activity for only the authenticated caller: memberships, joined upcoming club events, authored posts, and marketplace items.';

revoke all on function public.get_my_activity_overview(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_activity_overview(integer)
  to authenticated;


-- AQ: connect the existing market report operator page to buy/exchange reports.
create function public.list_market_buy_request_reports_for_management(
  p_status text default 'received',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_items jsonb;
begin
  perform private.market_require_platform_permission('market.listing_reports.manage');
  if p_status is null or p_status not in ('received', 'handled', 'dismissed', 'all') then
    raise exception '신고 상태를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.market_buy_request_reports as report
  where p_status = 'all' or report.report_status = p_status;

  with page as (
    select report.*, listing.title as listing_title, listing.request_status as listing_status, listing.request_type
    from public.market_buy_request_reports as report
    join public.market_buy_requests as listing on listing.id = report.buy_request_id
    where p_status = 'all' or report.report_status = p_status
    order by report.created_at desc, report.report_key
    limit p_limit offset p_offset
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'report_key', page.report_key,
      'listing_title', page.listing_title,
      'request_type', page.request_type,
      'listing_status', page.listing_status,
      'reason_code', page.reason_code,
      'report_status', page.report_status,
      'version', page.version,
      'created_at', page.created_at,
      'resolved_at', page.resolved_at
    ) order by page.created_at desc, page.report_key
  ), '[]'::jsonb)
  into v_items
  from page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;

comment on function public.list_market_buy_request_reports_for_management(text, integer, integer) is
  'Bounded platform-admin listing report inbox without reporter identifiers or listing contact data.';
revoke all on function public.list_market_buy_request_reports_for_management(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_market_buy_request_reports_for_management(text, integer, integer)
  to authenticated;

create function public.get_market_buy_request_report_for_management(p_report_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := nullif(pg_catalog.btrim(p_report_key), '');
  v_report public.market_buy_request_reports%rowtype;
  v_listing public.market_buy_requests%rowtype;
begin
  perform private.market_require_platform_permission('market.listing_reports.manage');
  if v_key is null or v_key !~ '^[0-9a-f]{32}$' then
    raise exception '조회할 신고를 확인해 주세요.' using errcode = '22023';
  end if;

  select report.*
  into v_report
  from public.market_buy_request_reports as report
  where report.report_key = v_key;
  if not found then
    raise exception '삽니다·교환 신고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select listing.*
  into v_listing
  from public.market_buy_requests as listing
  where listing.id = v_report.buy_request_id;

  return pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'reason_code', v_report.reason_code,
    'note', v_report.note,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'created_at', v_report.created_at,
    'resolved_at', v_report.resolved_at,
    'resolution_note', v_report.resolution_note,
    'listing', pg_catalog.jsonb_build_object(
      'id', v_listing.id,
      'name', v_listing.title,
      'seller_display_name', private.market_actor_display_name(v_listing.author_user_id, auth.uid()),
      'sale_status', v_listing.request_status,
      'request_type', v_listing.request_type,
      'version', v_listing.version
    )
  );
end;
$$;

comment on function public.get_market_buy_request_report_for_management(text) is
  'Platform-admin report detail with the private report statement and a minimal current listing snapshot.';
revoke all on function public.get_market_buy_request_report_for_management(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_market_buy_request_report_for_management(text)
  to authenticated;

create function public.resolve_market_buy_request_report(
  p_report_key text,
  p_expected_version integer,
  p_resolution_status text,
  p_resolution_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_require_platform_permission('market.listing_reports.manage');
  v_key text := nullif(pg_catalog.btrim(p_report_key), '');
  v_note text := nullif(private.market_trim_text(p_resolution_note), '');
  v_payload jsonb;
  v_replay jsonb;
  v_report public.market_buy_request_reports%rowtype;
  v_result jsonb;
begin
  if v_key is null or v_key !~ '^[0-9a-f]{32}$' then
    raise exception '처리할 신고를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception '신고 version을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_resolution_status is null
     or p_resolution_status not in ('handled', 'dismissed') then
    raise exception '신고 처리 결과를 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is null or pg_catalog.char_length(v_note) not between 2 and 500 then
    raise exception '처리 메모는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'action', 'market.buy_request_report.resolve',
    'report_key', v_key,
    'expected_version', p_expected_version,
    'resolution_status', p_resolution_status,
    'resolution_note', v_note
  );
  v_replay := private.market_claim_sha256_request(
    v_actor_id,
    p_request_id,
    'market.buy_request_report.resolve',
    v_payload
  );
  if v_replay is not null then
    return v_replay || pg_catalog.jsonb_build_object('replayed', true);
  end if;

  select report.*
  into v_report
  from public.market_buy_request_reports as report
  where report.report_key = v_key
  for update;
  if not found then
    raise exception '삽니다·교환 신고를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_report.version <> p_expected_version then
    raise exception '신고 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;
  if v_report.report_status <> 'received' then
    raise exception '이미 처리된 삽니다·교환 신고입니다.' using errcode = '40901';
  end if;

  update public.market_buy_request_reports
  set report_status = p_resolution_status,
      version = version + 1,
      resolved_by = v_actor_id,
      resolution_note = v_note,
      resolved_at = pg_catalog.now()
  where id = v_report.id
    and version = p_expected_version
    and report_status = 'received'
  returning * into v_report;
  if not found then
    raise exception '신고 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
      using errcode = '40901';
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'report_key', v_report.report_key,
    'report_status', v_report.report_status,
    'version', v_report.version,
    'resolved_at', v_report.resolved_at,
    'request_id', p_request_id,
    'replayed', false
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
    'market.buy_request_report.resolve',
    'buy_request_report',
    v_report.id,
    pg_catalog.jsonb_build_object(
      'report_status', 'received',
      'version', p_expected_version
    ),
    pg_catalog.jsonb_build_object(
      'report_status', v_report.report_status,
      'version', v_report.version,
      'resolution_note_present', true
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

comment on function public.resolve_market_buy_request_report(text, integer, text, text, uuid) is
  'Platform-admin received-to-terminal report resolution; never changes the listing.';
revoke all on function public.resolve_market_buy_request_report(text, integer, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_market_buy_request_report(text, integer, text, text, uuid)
  to authenticated;


-- AQ release gate: explicit post-switch grant is required (see release runbook).
revoke execute on function public.mutate_market_buy_request(text,uuid,integer,jsonb,uuid), public.mutate_market_buy_request_v2(text,uuid,integer,jsonb,uuid), public.mutate_market_buy_request_v3(text,uuid,integer,jsonb,uuid) from authenticated;
revoke execute on function private.mutate_market_buy_exchange(text,uuid,integer,jsonb,uuid) from authenticated;
