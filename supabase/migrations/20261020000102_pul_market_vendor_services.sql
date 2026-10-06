-- Independent local candidate. AS through 20261020000100 and final 1B required.
begin;
insert into public.platform_permission_definitions(code,description) values('market.vendor.manage','장터 업체 검토·공개 관리');
insert into public.platform_role_permissions(platform_role,permission_code) values('platform_admin','market.vendor.manage');
create table public.market_vendors (
 id uuid primary key, owner_id uuid not null unique references auth.users(id),
 draft jsonb not null default '{}', approved jsonb,
 state text not null default 'draft' check(state in ('draft','pending','approved','rejected')),
 reason text not null default '', visible boolean not null default false, restricted boolean not null default false,
 version integer not null default 1, updated_at timestamptz not null default now()
);
create table public.market_vendor_requests(actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id));
create table public.market_vendor_assets(id uuid primary key, vendor_id uuid not null references public.market_vendors(id),owner_id uuid not null,
 mime text not null check(mime in ('image/png','image/jpeg')),bytes integer not null check(bytes between 1 and 5242880),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),ready boolean not null default false);
create table public.market_vendor_bookmarks(user_id uuid not null references auth.users(id),vendor_id uuid not null references public.market_vendors(id),created_at timestamptz not null default now(),primary key(user_id,vendor_id));
create table public.messaging_vendor_contexts(message_id uuid primary key references public.messaging_messages(id) on delete cascade,vendor_id uuid references public.market_vendors(id) on delete set null);
alter table public.market_vendors enable row level security;
alter table public.market_vendor_requests enable row level security;
alter table public.market_vendor_assets enable row level security;
alter table public.market_vendor_bookmarks enable row level security;
alter table public.messaging_vendor_contexts enable row level security;
revoke all on public.market_vendors,public.market_vendor_requests,public.market_vendor_assets,public.market_vendor_bookmarks,public.messaging_vendor_contexts from public,anon,authenticated,service_role;

create function private.vendor_public(v public.market_vendors) returns jsonb language sql stable security definer set search_path='' as $$
 select case when v.visible and not v.restricted and v.approved is not null and private.messaging_account_available(v.owner_id)
 then jsonb_build_object('id',v.id,'profile',v.approved) end;
$$;
create function public.get_market_vendor(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select private.vendor_public(v) from public.market_vendors v where id=p_id;
$$;
create function public.list_market_vendors(p_query text default '',p_region text default '',p_field text default '',p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 if length(p_query)>100 or length(p_region)>80 or length(p_field)>30 or p_offset not between 0 and 10000 then raise exception 'vendor_invalid'; end if;
 select count(*) into total from public.market_vendors v where private.vendor_public(v) is not null
 and (p_query='' or position(lower(p_query) in lower(v.approved->>'name'||' '||(v.approved->>'summary')))>0)
 and (p_region='' or position(p_region in (v.approved->>'region')||' '||(v.approved->>'area'))>0)
 and (p_field='' or v.approved->'fields' ? p_field);
 select coalesce(jsonb_agg(x.value order by x.updated_at desc,x.id),'[]') into result from (
 select private.vendor_public(v) value,v.updated_at,v.id from public.market_vendors v where private.vendor_public(v) is not null
 and (p_query='' or position(lower(p_query) in lower(v.approved->>'name'||' '||(v.approved->>'summary')))>0)
 and (p_region='' or position(p_region in (v.approved->>'region')||' '||(v.approved->>'area'))>0)
 and (p_field='' or v.approved->'fields' ? p_field) order by updated_at desc,id limit 12 offset p_offset) x;
 return jsonb_build_object('items',result,'hasMore',p_offset+jsonb_array_length(result)<total);
end $$;
create function public.read_market_vendor_workspace(p_manage boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); result jsonb;
begin
 if p_manage then perform private.market_require_platform_permission('market.vendor.manage'); end if;
 select coalesce(jsonb_agg(to_jsonb(v)-'owner_id' order by updated_at desc),'[]') into result from public.market_vendors v where p_manage or owner_id=actor;
 return result;
end $$;
create function private.vendor_profile(p jsonb, vid uuid, actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f text; a text;
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('name','region','area','primary','fields','summary','services','before','photos')) then raise exception 'vendor_invalid'; end if;
 foreach f in array array['name','region','area','primary','summary','services','before'] loop
 if jsonb_typeof(p->f) is distinct from 'string' or length(trim(p->>f))<1 or length(p->>f)>(case when f in ('services','before') then 2000 when f='summary' then 180 else 80 end) then raise exception 'vendor_invalid'; end if;
 end loop;
 if jsonb_typeof(p->'fields') is distinct from 'array' or jsonb_array_length(p->'fields') not between 1 and 6 or not (p->'fields' ? (p->>'primary')) then raise exception 'vendor_invalid'; end if;
 for f in select jsonb_array_elements_text(p->'fields') loop
 if f not in ('restore','head','grip','shaft','custom','fit') then raise exception 'vendor_invalid'; end if; end loop;
 if jsonb_typeof(p->'photos') is distinct from 'array' or jsonb_array_length(p->'photos')>5 then raise exception 'vendor_invalid'; end if;
 for a in select jsonb_array_elements_text(p->'photos') loop
 if not exists(select 1 from public.market_vendor_assets where id=a::uuid and vendor_id=vid and owner_id=actor and ready) then raise exception 'vendor_photo_permission' using errcode='42501'; end if; end loop;
 return p;
end $$;
create function public.mutate_market_vendor(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); vid uuid:=(p_input->>'id')::uuid; rid uuid:=(p_input->>'requestId')::uuid;
 op text:=p_input->>'operation'; v public.market_vendors%rowtype; prev public.market_vendor_requests%rowtype; result jsonb; profile jsonb;
begin
 if vid is null or rid is null or op is null then raise exception 'vendor_invalid'; end if;
 perform pg_advisory_xact_lock(728410,hashtext(actor::text));
 select * into prev from public.market_vendor_requests where actor_id=actor and request_id=rid;
 if found then if prev.input<>p_input then raise exception 'vendor_replay_conflict'; end if; return prev.result; end if;
 if op in ('approve','reject','publish','restrict','restore') then perform private.market_require_platform_permission('market.vendor.manage'); end if;
 select * into v from public.market_vendors where id=vid for update;
 if not found then
 if op<>'save' or (p_input->>'version')::integer<>0 then raise exception 'vendor_missing'; end if;
 insert into public.market_vendors(id,owner_id) values(vid,actor) returning * into v;
 elsif (p_input->>'version')::integer is distinct from v.version then raise exception 'vendor_conflict'; end if;
 if op in ('save','submit','hide') and v.owner_id<>actor then raise exception 'vendor_permission' using errcode='42501'; end if;
 if op in ('save','submit') then
 profile:=private.vendor_profile(p_input->'profile',vid,actor);
 update public.market_vendors set draft=profile,state=case when op='submit' then 'pending' else 'draft' end,reason='' where id=vid;
 elsif op='approve' then
 if v.state<>'pending' then raise exception 'vendor_conflict'; end if;
 update public.market_vendors set approved=draft,state='approved',reason='' where id=vid;
 elsif op='reject' then
 if v.state<>'pending' or length(trim(coalesce(p_input->>'reason',''))) not between 1 and 500 then raise exception 'vendor_invalid'; end if;
 update public.market_vendors set state='rejected',reason=trim(p_input->>'reason') where id=vid;
 elsif op='publish' then
 if v.approved is null or v.restricted then raise exception 'vendor_restricted'; end if;
 update public.market_vendors set visible=true where id=vid;
 elsif op='hide' then update public.market_vendors set visible=false where id=vid;
 elsif op='restrict' then update public.market_vendors set visible=false,restricted=true where id=vid;
 elsif op='restore' then update public.market_vendors set restricted=false where id=vid;
 else raise exception 'vendor_invalid'; end if;
 update public.market_vendors set version=version+1,updated_at=now() where id=vid returning to_jsonb(market_vendors)-'owner_id' into result;
 insert into public.market_vendor_requests values(actor,rid,p_input,result);
 return result;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('market-vendor-assets','market-vendor-assets',false,5242880,array['image/png','image/jpeg']);
create function private.vendor_asset_access(path text,writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.market_vendor_assets%rowtype; v public.market_vendors%rowtype;
begin
 select * into a from public.market_vendor_assets where id::text=path; if not found then return false; end if;
 select * into v from public.market_vendors where id=a.vendor_id;
 if writing then return a.owner_id=auth.uid() and v.owner_id=auth.uid() and not a.ready and private.messaging_account_available(auth.uid()); end if;
 if auth.uid()=a.owner_id and private.messaging_account_available(auth.uid()) then return true; end if;
 if a.ready and private.vendor_public(v) is not null and v.approved->'photos' ? a.id::text then return true; end if;
 begin perform private.market_require_platform_permission('market.vendor.manage'); return a.ready; exception when others then return false; end;
end $$;
create policy vendor_asset_read on storage.objects for select to anon,authenticated using(bucket_id='market-vendor-assets' and private.vendor_asset_access(name,false));
create policy vendor_asset_insert on storage.objects for insert to authenticated with check(bucket_id='market-vendor-assets' and private.vendor_asset_access(name,true));
create function public.prepare_market_vendor_asset(p_id uuid,p_vendor_id uuid,p_mime text,p_bytes integer,p_sha256 text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); a public.market_vendor_assets%rowtype;
begin
 perform 1 from public.market_vendors where id=p_vendor_id and owner_id=actor for update;
 if not found then raise exception 'vendor_permission' using errcode='42501'; end if;
 insert into public.market_vendor_assets(id,vendor_id,owner_id,mime,bytes,sha256) values(p_id,p_vendor_id,actor,p_mime,p_bytes,p_sha256) on conflict(id) do nothing;
 select * into a from public.market_vendor_assets where id=p_id;
 if a.vendor_id<>p_vendor_id or a.owner_id<>actor or a.mime<>p_mime or a.bytes<>p_bytes or a.sha256<>p_sha256 then raise exception 'vendor_replay_conflict'; end if;
 return jsonb_build_object('ready',a.ready);
end $$;
create function public.complete_market_vendor_asset(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor();
begin
 update public.market_vendor_assets a set ready=true where a.id=p_id and owner_id=actor and exists(select 1 from storage.objects o where o.bucket_id='market-vendor-assets' and o.name=a.id::text and (o.metadata->>'size')::integer=a.bytes and o.metadata->>'mimetype'=a.mime);
 if not found then raise exception 'vendor_photo_missing'; end if; return jsonb_build_object('id',p_id);
end $$;
create function public.set_vendor_interest(p_vendor_id uuid,p_saved boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader();
begin
 if p_saved is null then raise exception 'vendor_invalid'; end if;
 if p_saved then
 if public.get_market_vendor(p_vendor_id) is null then raise exception 'vendor_missing'; end if;
 insert into public.market_vendor_bookmarks values(actor,p_vendor_id,now()) on conflict do nothing;
 else delete from public.market_vendor_bookmarks where user_id=actor and vendor_id=p_vendor_id; end if;
 return jsonb_build_object('id',p_vendor_id,'saved',p_saved);
end $$;
create function public.vendor_interest_state(p_vendor_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader();
begin return exists(select 1 from public.market_vendor_bookmarks where user_id=actor and vendor_id=p_vendor_id); end $$;


create function private.list_my_interests_v3(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video','vendor')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
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
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='vendor' then public.get_market_vendor(page.id) end vendor,
   case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind in ('market','buy_request','vendor') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='vendor' then vendor is not null when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'title',case when kind='vendor' then vendor->'profile'->>'name' when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='vendor' then vendor->'profile'->>'region' when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='vendor' then vendor->'profile'->>'summary' when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
create function public.list_my_interests_v3(p_kind text default 'all',p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.list_my_interests_v3(p_kind,p_limit,p_offset);
$$;
revoke all on function private.list_my_interests_v3(text,integer,integer),public.list_my_interests_v3(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v3(text,integer,integer),public.list_my_interests_v3(text,integer,integer) to authenticated;

create function public.send_market_vendor_message(p_vendor_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_listing record;
  v_previous public.messaging_messages%rowtype;
  v_fingerprint text; v_receipt jsonb;
begin
  perform private.messaging_assert_read_committed();
  if p_vendor_id is null or p_request_id is null or p_body is null
    or pg_catalog.char_length(private.messaging_trim(p_body)) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  -- Same sender lock as generic send/reply: no separate quota or replay channel.
  perform pg_catalog.pg_advisory_xact_lock(1297303345, pg_catalog.hashtext(v_actor::text));
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('vendor',p_vendor_id,private.messaging_normalize(p_body))::text,'UTF8')),'hex');
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
  select l.id,l.owner_id,private.vendor_public(l) as profile into v_listing from public.market_vendors l where l.id=p_vendor_id for share;
  if v_listing.id is null or v_listing.profile is null then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  v_receipt := private.messaging_create(v_listing.owner_id,null,p_body,p_request_id);
  -- The foundation has inserted the message/receipt under its ordinary account,
  -- pair, spam and concurrency guards. Replace only this new operation's replay
  -- fingerprint before commit; generic send/reply can never replay/convert it.
  update public.messaging_messages set request_fingerprint = v_fingerprint
    where id = (v_receipt->>'id')::uuid;
  insert into public.messaging_vendor_contexts(message_id,vendor_id)
    values ((v_receipt->>'id')::uuid,v_listing.id);
  return v_receipt;
end;
$$;


create function public.get_vendor_message_compose_context(p_vendor_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); v public.market_vendors%rowtype;
begin
 select * into v from public.market_vendors where id=p_vendor_id;
 if v.id is null or v.owner_id=actor or private.vendor_public(v) is null then raise exception 'messaging_recipient_unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('available',true,'vendor_id',v.id,'title',v.approved->>'name','status','selling');
end $$;
create function private.messaging_inherit_vendor_context() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.messaging_vendor_contexts select new.id,vendor_id from public.messaging_vendor_contexts where message_id=new.reply_to_message_id; return new; end $$;
create trigger messaging_reply_vendor_context after insert on public.messaging_messages for each row when(new.reply_to_message_id is not null) execute function private.messaging_inherit_vendor_context();
create function public.get_message_vendor_context(p_message_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare vid uuid; v jsonb;
begin
 perform public.get_messaging_message(p_message_id,false);
 select vendor_id into vid from public.messaging_vendor_contexts where message_id=p_message_id;
 if not found then return null; end if;
 v:=public.get_market_vendor(vid);
 if v is null then return jsonb_build_object('available',false); end if;
 return jsonb_build_object('available',true,'vendor_id',vid,'title',v->'profile'->>'name','status','selling');
end $$;

revoke all on function private.vendor_public(public.market_vendors) from public,anon,authenticated,service_role;
revoke all on function public.get_market_vendor(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_market_vendor(uuid) to anon,authenticated;
revoke all on function public.list_market_vendors(text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_market_vendors(text,text,text,integer) to anon,authenticated;
revoke all on function public.read_market_vendor_workspace(boolean) from public,anon,authenticated,service_role;
grant execute on function public.read_market_vendor_workspace(boolean) to authenticated;
revoke all on function private.vendor_profile(jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mutate_market_vendor(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_vendor(jsonb) to authenticated;
revoke all on function private.vendor_asset_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.vendor_asset_access(text,boolean) to anon,authenticated;
revoke all on function public.prepare_market_vendor_asset(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_market_vendor_asset(uuid,uuid,text,integer,text) to authenticated;
revoke all on function public.complete_market_vendor_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_market_vendor_asset(uuid) to authenticated;
revoke all on function public.set_vendor_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_vendor_interest(uuid,boolean) to authenticated;
revoke all on function public.vendor_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.vendor_interest_state(uuid) to authenticated;
revoke all on function private.list_my_interests_v3(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v3(text,integer,integer) to authenticated;
revoke all on function public.list_my_interests_v3(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_my_interests_v3(text,integer,integer) to authenticated;
revoke all on function public.send_market_vendor_message(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.send_market_vendor_message(uuid,text,uuid) to authenticated;
revoke all on function public.get_vendor_message_compose_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_vendor_message_compose_context(uuid) to authenticated;
revoke all on function private.messaging_inherit_vendor_context() from public,anon,authenticated,service_role;
revoke all on function public.get_message_vendor_context(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_message_vendor_context(uuid) to authenticated;
commit;
