-- Independent stage 4 candidate, NOT applied and NOT a migration.
-- Requires AS messaging/interest foundation, stage 2 and stage 3A candidates.
-- No replacement of foundation functions, existing policy/consent or older SQL.
begin;
create table public.market_stores(
 id uuid primary key, owner_id uuid references auth.users(id) on delete set null,
 profile jsonb, status text not null default 'selling' check(status in ('selling','negotiating','completed')),
 deleted boolean not null default false, version integer not null default 0 check(version>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- An upload reservation creates an owner-only draft (profile NULL, version 0).
-- Published content survives account deletion; its author link becomes NULL.
create table public.market_store_assets(
 id uuid primary key,store_id uuid not null references public.market_stores(id),
 owner_id uuid references auth.users(id) on delete set null,
 mime text not null check(mime in ('image/jpeg','image/png')), bytes integer not null check(bytes between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),ready boolean not null default false
);
create table public.market_store_bookmarks(
 user_id uuid not null references auth.users(id) on delete cascade,store_id uuid not null references public.market_stores(id),
 created_at timestamptz not null default now(),primary key(user_id,store_id)
);
create table private.market_store_requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id));
create table public.messaging_store_contexts(message_id uuid primary key references public.messaging_messages(id),store_id uuid not null references public.market_stores(id));
create index market_stores_public on public.market_stores(created_at desc,id) where not deleted and profile is not null;
create index market_stores_owner on public.market_stores(owner_id,created_at desc,id);
create index market_store_assets_store on public.market_store_assets(store_id,owner_id);
alter table public.market_stores enable row level security;
alter table public.market_store_assets enable row level security;
alter table public.market_store_bookmarks enable row level security;
alter table private.market_store_requests enable row level security;
alter table public.messaging_store_contexts enable row level security;
revoke all on public.market_stores,public.market_store_assets,public.market_store_bookmarks,private.market_store_requests,public.messaging_store_contexts from public,anon,authenticated,service_role;

create function private.store_public(s public.market_stores) returns jsonb language sql stable security definer set search_path='' as $$
 select case when s.profile is not null and not s.deleted and (s.owner_id is null or private.messaging_account_available(s.owner_id)) then
 jsonb_build_object('id',s.id,'profile',s.profile,'status',s.status,'version',s.version,'createdAt',s.created_at,
 'mine',coalesce(s.owner_id=auth.uid(),false),'author',case when s.owner_id is null then '탈퇴회원' else private.market_actor_display_name(s.owner_id,auth.uid()) end,
 'contactable',s.owner_id is not null and s.status<>'completed' and private.messaging_account_available(s.owner_id)) end;
$$;
create function private.get_market_store(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$ select private.store_public(s) from public.market_stores s where s.id=p_id; $$;
create function private.list_market_stores(p_query text,p_region text,p_status text,p_offset integer,p_own boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid;result jsonb;
begin
 if p_query is null or char_length(p_query)>100 or p_region is null or p_region not in ('','서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') or p_status is null or p_status not in ('','selling','negotiating','completed') or p_offset is null or p_offset not between 0 and 10000 or p_own is null then raise exception 'store_invalid'; end if;
 if p_own then actor:=private.messaging_assert_actor(); end if;
 select coalesce(jsonb_agg(x.value order by x.created_at desc,x.id),'[]') into result from (
  select private.store_public(s) value,s.created_at,s.id from public.market_stores s
  where not s.deleted and s.profile is not null and (s.owner_id is null or private.messaging_account_available(s.owner_id))
  and (not p_own or s.owner_id=actor) and (p_region='' or s.profile->>'region'=p_region) and (p_status='' or s.status=p_status)
  and (p_query='' or position(lower(p_query) in lower((s.profile->>'title')||' '||(s.profile->>'equipment')||' '||(s.profile->>'description')))>0)
  order by s.created_at desc,s.id limit 13 offset p_offset) x;
 return jsonb_build_object('items',case when jsonb_array_length(result)>12 then result-12 else result end,'hasMore',jsonb_array_length(result)>12,'detail',null);
end $$;

create function private.validate_store_profile(p jsonb,sid uuid,actor uuid) returns void language plpgsql security definer set search_path='' as $$
declare spec record;value jsonb;photo text;
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('title','floor','equipment','parkingNote','hours','facilities','description','financePeriod','area','bays','askingPrice','deposit','rent','maintenance','revenue','cost','profit','region','areaUnit','negotiable','depositMode','parking','photos')) then raise exception 'store_invalid'; end if;
 for spec in select * from (values ('title',120,true),('floor',40,true),('equipment',300,true),('parkingNote',200,false),('hours',100,false),('facilities',1000,true),('description',3000,true),('financePeriod',100,false)) as t(k,maxlen,required) loop
  if jsonb_typeof(p->spec.k) is distinct from 'string' or char_length(p->>spec.k)>spec.maxlen or (spec.required and char_length(btrim(p->>spec.k))=0) then raise exception 'store_invalid'; end if;
 end loop;
 for spec in select * from (values ('area',0.01::numeric,100000::numeric,false,false),('bays',1,999,true,false),('askingPrice',0,9999999999999,true,false),('deposit',0,9999999999999,true,false),('rent',0,9999999999999,true,false),('maintenance',0,9999999999999,true,false),('revenue',0,9999999999999,true,true),('cost',0,9999999999999,true,true),('profit',-9999999999999,9999999999999,true,true)) as t(k,minval,maxval,whole,optional) loop
  value:=p->spec.k;
  if spec.optional and value='null'::jsonb then continue; end if;
  if jsonb_typeof(value) is distinct from 'number' then raise exception 'store_invalid'; end if;
  if (value::text)::numeric<spec.minval or (value::text)::numeric>spec.maxval or (spec.whole and trunc((value::text)::numeric)<>(value::text)::numeric) then raise exception 'store_invalid'; end if;
 end loop;
 if coalesce(p->>'region','') not in ('서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주') or coalesce(p->>'areaUnit','') not in ('sqm','pyeong') or jsonb_typeof(p->'negotiable') is distinct from 'boolean' or coalesce(p->>'depositMode','') not in ('included','excluded','discuss') or coalesce(p->>'parking','') not in ('yes','no','shared') then raise exception 'store_invalid'; end if;
 if (p->'revenue'<>'null'::jsonb or p->'cost'<>'null'::jsonb or p->'profit'<>'null'::jsonb) and btrim(p->>'financePeriod')='' then raise exception 'store_finance_period'; end if;
 if jsonb_typeof(p->'photos') is distinct from 'array' then raise exception 'store_photos'; end if;
 if jsonb_array_length(p->'photos') not between 1 and 5 or (select count(distinct v) from jsonb_array_elements(p->'photos') v)<>jsonb_array_length(p->'photos') then raise exception 'store_photos'; end if;
 for value in select * from jsonb_array_elements(p->'photos') loop
  photo:=value#>>'{}';
  if jsonb_typeof(value)<>'string' or photo!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'store_photos'; end if;
  perform 1 from public.market_store_assets where id=photo::uuid and store_id=sid and owner_id=actor and ready;
  if not found then raise exception 'store_photo_permission' using errcode='42501'; end if;
 end loop;
end $$;
create function private.mutate_market_store(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor();sid uuid;rid uuid;ver integer;op text;s public.market_stores%rowtype;previous private.market_store_requests%rowtype;result jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('id','requestId','version','operation','profile','status')) then raise exception 'store_invalid'; end if;
 sid:=(p_input->>'id')::uuid;rid:=(p_input->>'requestId')::uuid;ver:=(p_input->>'version')::integer;op:=p_input->>'operation';
 if sid is null or rid is null or ver is null or op is null or op not in ('create','update','status','delete') or (op='create' and ver<>0) or (op<>'create' and ver<1) or (op<>'delete' and coalesce(p_input->>'status','') not in ('selling','negotiating','completed')) or (op in ('status','delete') and p_input?'profile') then raise exception 'store_invalid'; end if;
 perform pg_advisory_xact_lock(728412,hashtext(actor::text));
 select * into previous from private.market_store_requests where actor_id=actor and request_id=rid;
 if found then if previous.input<>p_input then raise exception 'store_conflict'; end if;return previous.result;end if;
 select * into s from public.market_stores where id=sid for update;
 if not found or s.owner_id is distinct from actor or s.deleted then raise exception 'store_permission' using errcode='42501'; end if;
 if s.version<>ver or (op='create' and s.profile is not null) or (op<>'create' and s.profile is null) then raise exception 'store_conflict'; end if;
 if op in ('create','update') then
  perform private.validate_store_profile(p_input->'profile',sid,actor);
  update public.market_stores set profile=p_input->'profile',status=p_input->>'status',version=version+1,updated_at=now() where id=sid;
 elsif op='status' then update public.market_stores set status=p_input->>'status',version=version+1,updated_at=now() where id=sid;
 else update public.market_stores set deleted=true,version=version+1,updated_at=now() where id=sid;end if;
 result:=jsonb_build_object('id',sid,'deleted',op='delete');insert into private.market_store_requests values(actor,rid,p_input,result);return result;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('market-store-assets','market-store-assets',false,5242880,array['image/jpeg','image/png']);
create function private.store_asset_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.market_store_assets%rowtype;s public.market_stores%rowtype;
begin
 select * into a from public.market_store_assets where id::text=path;if not found then return false;end if;
 select * into s from public.market_stores where id=a.store_id;if not found or s.deleted then return false;end if;
 if writing then return a.owner_id=auth.uid() and s.owner_id=auth.uid() and not a.ready and private.messaging_account_available(auth.uid());end if;
 if auth.uid()=a.owner_id and auth.uid()=s.owner_id and private.messaging_account_available(auth.uid()) then return true;end if;
 return a.ready and private.store_public(s) is not null and s.profile->'photos' ? a.id::text;
end $$;
-- Authenticated object GET only, not bucket listing or public/signed URLs.
-- Deployment must provide Supabase's documented storage.allow_any_operation helper.
create policy store_asset_read on storage.objects for select to anon,authenticated using(bucket_id='market-store-assets' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']) and private.store_asset_access(name,false));
create policy store_asset_insert on storage.objects for insert to authenticated with check(bucket_id='market-store-assets' and private.store_asset_access(name,true));
create function private.prepare_market_store_asset(p_id uuid,p_store_id uuid,p_mime text,p_bytes integer,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor();s public.market_stores%rowtype;a public.market_store_assets%rowtype;
begin
 if p_id is null or p_store_id is null or p_mime is null or p_mime not in ('image/jpeg','image/png') or p_bytes is null or p_bytes not between 1 and 5242880 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'store_invalid';end if;
 insert into public.market_stores(id,owner_id) values(p_store_id,actor) on conflict(id) do nothing;
 select * into s from public.market_stores where id=p_store_id for update;
 if s.owner_id is distinct from actor or s.deleted then raise exception 'store_permission' using errcode='42501';end if;
 insert into public.market_store_assets(id,store_id,owner_id,mime,bytes,sha256) values(p_id,p_store_id,actor,p_mime,p_bytes,p_sha256) on conflict(id) do nothing;
 select * into a from public.market_store_assets where id=p_id;
 if a.owner_id is distinct from actor or a.store_id<>p_store_id or a.mime<>p_mime or a.bytes<>p_bytes or a.sha256<>p_sha256 then raise exception 'store_conflict';end if;
 return jsonb_build_object('ready',a.ready);
end $$;
create function private.complete_market_store_asset(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor();
begin
 perform 1 from public.market_stores s join public.market_store_assets a on a.store_id=s.id where a.id=p_id and s.owner_id=actor and not s.deleted for update of s;
 if not found then raise exception 'store_permission' using errcode='42501';end if;
 update public.market_store_assets a set ready=true where a.id=p_id and owner_id=actor and exists(select 1 from storage.objects o where o.bucket_id='market-store-assets' and o.name=a.id::text and (o.metadata->>'size')::integer=a.bytes and o.metadata->>'mimetype'=a.mime);
 if not found then raise exception 'store_photo_missing';end if;return jsonb_build_object('id',p_id);
end $$;
create function private.set_store_interest(p_store_id uuid,p_saved boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader();value jsonb;
begin
 if p_saved is null then raise exception 'store_invalid';end if;
 if p_saved then select private.store_public(s) into value from public.market_stores s where id=p_store_id for share;if value is null then raise exception 'store_missing';end if;insert into public.market_store_bookmarks values(actor,p_store_id,now()) on conflict do nothing;
 else delete from public.market_store_bookmarks where user_id=actor and store_id=p_store_id;end if;
 return jsonb_build_object('id',p_store_id,'saved',p_saved);
end $$;
create function private.store_interest_state(p_store_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader();begin return exists(select 1 from public.market_store_bookmarks where user_id=actor and store_id=p_store_id);end $$;

-- New v5 projection preserves every v4 branch and global ordering.
create function private.list_my_interests_v5(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video','vendor','startup_question','store')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all select 1 from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all select 1 from public.market_store_bookmarks where user_id=v_actor and p_kind in ('all','market','store')
  union all select 1 from public.lesson_video_bookmarks where user_id=v_actor and p_kind in ('all','lesson_video')
 ) q;
 with saved as (
  select 'market'::text kind,listing_id id,created_at from public.market_listing_bookmarks
   where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'buy_request',buy_request_id,created_at from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'vendor',vendor_id,created_at from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all
  select 'startup_question',question_id,created_at from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all
  select 'store',store_id,created_at from public.market_store_bookmarks where user_id=v_actor and p_kind in ('all','market','store')
  union all
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='store' then private.get_market_store(page.id) end store,case when kind='startup_question' then (select private.startup_qa_question_json(q) from public.startup_qa_questions q where q.id=page.id) end question,
   case when kind='vendor' then public.get_market_vendor(page.id) end vendor,
   case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind in ('market','buy_request','vendor','startup_question','store') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='store' then store is not null when kind='startup_question' then question is not null when kind='vendor' then vendor is not null when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'title',case when kind='store' then store->'profile'->>'title' when kind='startup_question' then question->>'title' when kind='vendor' then vendor->'profile'->>'name' when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'store_photo',case when kind='store' then store->'profile'->'photos'->>0 end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='store' then store->'profile'->'askingPrice' when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='store' then store->'profile'->>'region' when kind='vendor' then vendor->'profile'->>'region' when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='store' then store->>'status' when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='store' then case store->>'status' when 'selling' then '매매 중' when 'negotiating' then '협의 중' else '거래 완료' end when kind='startup_question' then question->>'author' when kind='vendor' then vendor->'profile'->>'summary' when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;

-- Narrow store context around existing messaging_create; foundation unchanged.
create function private.send_market_store_message(p_store_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_listing record;
  v_previous public.messaging_messages%rowtype;
  v_fingerprint text; v_receipt jsonb;
begin
  perform private.messaging_assert_read_committed();
  if p_store_id is null or p_request_id is null or p_body is null
    or pg_catalog.char_length(private.messaging_trim(p_body)) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  -- Same sender lock as generic send/reply: no separate quota or replay channel.
  perform pg_catalog.pg_advisory_xact_lock(1297303345, pg_catalog.hashtext(v_actor::text));
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('store',p_store_id,private.messaging_normalize(p_body))::text,'UTF8')),'hex');
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
  select l.id,l.owner_id,private.store_public(l) as profile into v_listing from public.market_stores l where l.id=p_store_id and l.owner_id is not null and l.status<>'completed' for share;
  if v_listing.id is null or v_listing.profile is null then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  v_receipt := private.messaging_create(v_listing.owner_id,null,p_body,p_request_id);
  -- The foundation has inserted the message/receipt under its ordinary account,
  -- pair, spam and concurrency guards. Replace only this new operation's replay
  -- fingerprint before commit; generic send/reply can never replay/convert it.
  update public.messaging_messages set request_fingerprint = v_fingerprint
    where id = (v_receipt->>'id')::uuid;
  insert into public.messaging_store_contexts(message_id,store_id)
    values ((v_receipt->>'id')::uuid,v_listing.id);
  return v_receipt;
end;
$$;


create function private.get_store_message_compose_context(p_store_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); v public.market_stores%rowtype;
begin
 select * into v from public.market_stores where id=p_store_id;
 if v.id is null or v.owner_id is null or v.owner_id=actor or v.status='completed' or private.store_public(v) is null then raise exception 'messaging_recipient_unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('available',true,'store_id',v.id,'title',v.profile->>'title','status',case v.status when 'negotiating' then 'reserved' else 'selling' end);
end $$;
create function private.messaging_inherit_store_context() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.messaging_store_contexts select new.id,store_id from public.messaging_store_contexts where message_id=new.reply_to_message_id; return new; end $$;
create trigger messaging_reply_store_context after insert on public.messaging_messages for each row when(new.reply_to_message_id is not null) execute function private.messaging_inherit_store_context();
create function private.get_message_store_context(p_message_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare vid uuid; v jsonb;
begin
 perform public.get_messaging_message(p_message_id,false);
 select store_id into vid from public.messaging_store_contexts where message_id=p_message_id;
 if not found then return null; end if;
 v:=private.get_market_store(vid);
 if v is null then return jsonb_build_object('available',false); end if;
 return jsonb_build_object('available',true,'store_id',vid,'title',v->'profile'->>'title','status',case v->>'status' when 'completed' then 'sold' when 'negotiating' then 'reserved' else 'selling' end);
end $$;


create function public.get_market_store(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_market_store(p_id); $$;
revoke all on function private.get_market_store(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_market_store(uuid) to anon,authenticated;
revoke all on function public.get_market_store(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_store(uuid) to anon,authenticated;

create function public.list_market_stores(p_query text,p_region text,p_status text,p_offset integer,p_own boolean) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_market_stores(p_query,p_region,p_status,p_offset,p_own); $$;
revoke all on function private.list_market_stores(text,text,text,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function private.list_market_stores(text,text,text,integer,boolean) to anon,authenticated;
revoke all on function public.list_market_stores(text,text,text,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.list_market_stores(text,text,text,integer,boolean) to anon,authenticated;

create function public.mutate_market_store(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_market_store(p_input); $$;
revoke all on function private.mutate_market_store(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.mutate_market_store(jsonb) to authenticated;
revoke all on function public.mutate_market_store(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_store(jsonb) to authenticated;

create function public.prepare_market_store_asset(p_id uuid,p_store_id uuid,p_mime text,p_bytes integer,p_sha256 text) returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_market_store_asset(p_id,p_store_id,p_mime,p_bytes,p_sha256); $$;
revoke all on function private.prepare_market_store_asset(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.prepare_market_store_asset(uuid,uuid,text,integer,text) to authenticated;
revoke all on function public.prepare_market_store_asset(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_market_store_asset(uuid,uuid,text,integer,text) to authenticated;

create function public.complete_market_store_asset(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.complete_market_store_asset(p_id); $$;
revoke all on function private.complete_market_store_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function private.complete_market_store_asset(uuid) to authenticated;
revoke all on function public.complete_market_store_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_market_store_asset(uuid) to authenticated;

create function public.set_store_interest(p_store_id uuid,p_saved boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_store_interest(p_store_id,p_saved); $$;
revoke all on function private.set_store_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.set_store_interest(uuid,boolean) to authenticated;
revoke all on function public.set_store_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_store_interest(uuid,boolean) to authenticated;

create function public.store_interest_state(p_store_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.store_interest_state(p_store_id); $$;
revoke all on function private.store_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function private.store_interest_state(uuid) to authenticated;
revoke all on function public.store_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.store_interest_state(uuid) to authenticated;

create function public.list_my_interests_v5(p_kind text,p_limit integer,p_offset integer) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_my_interests_v5(p_kind,p_limit,p_offset); $$;
revoke all on function private.list_my_interests_v5(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v5(text,integer,integer) to authenticated;
revoke all on function public.list_my_interests_v5(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_interests_v5(text,integer,integer) to authenticated;

create function public.send_market_store_message(p_store_id uuid,p_body text,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.send_market_store_message(p_store_id,p_body,p_request_id); $$;
revoke all on function private.send_market_store_message(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.send_market_store_message(uuid,text,uuid) to authenticated;
revoke all on function public.send_market_store_message(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.send_market_store_message(uuid,text,uuid) to authenticated;

create function public.get_store_message_compose_context(p_store_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_store_message_compose_context(p_store_id); $$;
revoke all on function private.get_store_message_compose_context(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_store_message_compose_context(uuid) to authenticated;
revoke all on function public.get_store_message_compose_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_store_message_compose_context(uuid) to authenticated;

create function public.get_message_store_context(p_message_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_message_store_context(p_message_id); $$;
revoke all on function private.get_message_store_context(uuid) from public,anon,authenticated,service_role;
grant execute on function private.get_message_store_context(uuid) to authenticated;
revoke all on function public.get_message_store_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_message_store_context(uuid) to authenticated;
revoke all on function private.store_public(public.market_stores) from public,anon,authenticated,service_role;
revoke all on function private.validate_store_profile(jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.store_asset_access(text,boolean) from public,anon,authenticated,service_role;
revoke all on function private.messaging_inherit_store_context() from public,anon,authenticated,service_role;
grant execute on function private.store_asset_access(text,boolean) to anon,authenticated;
commit;
