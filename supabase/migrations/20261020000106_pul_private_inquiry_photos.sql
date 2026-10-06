-- Independent LOCAL ONLY candidate. Apply after current AS foundation, stage 2 and stage 4.
-- No existing message send/read function, policy or migration is replaced.
begin;
create table public.messaging_photo_assets(
 id uuid primary key,
 owner_id uuid references public.user_accounts(id) on delete set null,
 draft_id uuid not null,
 mime text not null check(mime in ('image/jpeg','image/png')),
 bytes integer not null check(bytes between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 ready boolean not null default false,
 sent boolean not null default false,
 message_id uuid references public.messaging_messages(id) on delete set null,
 position integer check(position between 0 and 2),
 check(sent or (message_id is null and position is null))
);
create index messaging_photo_message on public.messaging_photo_assets(message_id,position) where message_id is not null;
create index messaging_photo_owner on public.messaging_photo_assets(owner_id,draft_id);
create table private.messaging_photo_requests(
 actor_id uuid not null,request_id uuid not null,input jsonb not null,result jsonb not null,
 primary key(actor_id,request_id)
);
alter table public.messaging_photo_assets enable row level security;
alter table private.messaging_photo_requests enable row level security;
revoke all on public.messaging_photo_assets,private.messaging_photo_requests from public,anon,authenticated,service_role;

create function private.messaging_photo_access(p_path text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare a public.messaging_photo_assets%rowtype; actor uuid:=auth.uid();
begin
 if actor is null or not private.messaging_account_available(actor) then return false; end if;
 select * into a from public.messaging_photo_assets where id::text=p_path;
 if not found then return false; end if;
 if p_write then return false; end if; -- Writes are server-only.
 if not a.sent then return a.owner_id=actor; end if;
 -- Participant identity belongs to the message, never to the current listing/vendor owner.
 -- A purged message leaves sent=true/message_id=NULL, so it cannot become a draft again.
 return a.ready and exists(
  select 1 from public.messaging_messages m where m.id=a.message_id and m.kind='direct' and
  ((m.sender_user_id=actor and m.sender_hidden_at is null) or exists(
   select 1 from public.messaging_recipients r where r.message_id=m.id and r.recipient_user_id=actor and r.hidden_at is null))
 );
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('private-message-photos','private-message-photos',false,5242880,array['image/jpeg','image/png']);
create policy private_message_photo_read on storage.objects for select to authenticated
using(bucket_id='private-message-photos'
 and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated'])
 and private.messaging_photo_access(name,false));
-- Restrictive guards also prevent an unrelated permissive policy from allowing
-- user replacement between server byte verification and completion.
create policy private_message_photo_server_insert on storage.objects as restrictive
for insert to anon,authenticated with check(bucket_id<>'private-message-photos');
create policy private_message_photo_server_update on storage.objects as restrictive
for update to anon,authenticated using(bucket_id<>'private-message-photos') with check(bucket_id<>'private-message-photos');
create policy private_message_photo_server_delete on storage.objects as restrictive
for delete to anon,authenticated using(bucket_id<>'private-message-photos');
-- No public/signed/list or user write access is granted. Server uploads never upsert.

create function private.prepare_message_photo(p_id uuid,p_draft_id uuid,p_mime text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); a public.messaging_photo_assets%rowtype;
begin
 if p_id is null or p_draft_id is null or p_mime is null or p_mime not in ('image/jpeg','image/png')
 or p_bytes is null or p_bytes not between 1 and 5242880 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$'
 then raise exception 'photo_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(1297303345,hashtext(actor::text));
 insert into public.messaging_photo_assets(id,owner_id,draft_id,mime,bytes,sha256)
 values(p_id,actor,p_draft_id,p_mime,p_bytes,p_sha256) on conflict(id) do nothing;
 select * into a from public.messaging_photo_assets where id=p_id for update;
 if a.owner_id is distinct from actor or a.draft_id<>p_draft_id or a.sent
 then raise exception 'photo_permission' using errcode='42501'; end if;
 if a.mime<>p_mime or a.bytes<>p_bytes or a.sha256<>p_sha256
 then raise exception 'photo_conflict' using errcode='22023'; end if;
 return jsonb_build_object('ready',a.ready);
end $$;
create function private.complete_message_photo_server(
 p_actor_user_id uuid,p_id uuid,p_draft_id uuid,p_verified_mime text,p_verified_bytes integer,p_verified_sha256 text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.messaging_photo_assets%rowtype;
begin
 -- Only service_role has EXECUTE. Actor comes from the server's authenticated
 -- context, never a browser-supplied owner; explicitly verify it again here.
 if p_actor_user_id is null or not private.messaging_account_available(p_actor_user_id)
 then raise exception 'photo_permission' using errcode='42501'; end if;
 if p_id is null or p_draft_id is null or p_verified_mime is null or p_verified_bytes is null or p_verified_sha256 is null
 then raise exception 'photo_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(1297303345,hashtext(p_actor_user_id::text));
 select * into a from public.messaging_photo_assets where id=p_id for update;
 if not found or a.owner_id is distinct from p_actor_user_id or a.draft_id<>p_draft_id or a.sent
 then raise exception 'photo_permission' using errcode='42501'; end if;
 -- These values are measured from downloaded bytes by the trusted route.
 -- Direct user declarations can prepare an intent, but cannot mark it ready.
 if a.mime<>p_verified_mime or a.bytes<>p_verified_bytes or a.sha256<>p_verified_sha256
 then raise exception 'photo_conflict' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='private-message-photos'
 and o.name=a.id::text and (o.metadata->>'size')::integer=p_verified_bytes and o.metadata->>'mimetype'=p_verified_mime)
 then raise exception 'photo_missing' using errcode='22023'; end if;
 update public.messaging_photo_assets set ready=true where id=p_id;
 return jsonb_build_object('id',p_id);
end $$;

create function private.send_message_with_photos(p_kind text,p_target_id uuid,p_body text,p_request_id uuid,p_draft_id uuid,p_photo_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); payload jsonb; prior private.messaging_photo_requests%rowtype;
 result jsonb; sent_id uuid; asset_id uuid; a public.messaging_photo_assets%rowtype;
begin
 perform private.messaging_assert_read_committed();
 if p_kind is null or p_kind not in ('direct','reply','listing','buy_request','vendor','store')
 or p_target_id is null or p_request_id is null or p_draft_id is null or p_body is null
 or char_length(private.messaging_trim(p_body)) not between 1 and 2000
 or p_photo_ids is null or cardinality(p_photo_ids) not between 1 and 3
 or array_position(p_photo_ids,null) is not null
 or (select count(distinct x) from unnest(p_photo_ids) x)<>cardinality(p_photo_ids)
 then raise exception 'photo_invalid' using errcode='22023'; end if;
 payload:=jsonb_build_array(p_kind,p_target_id,private.messaging_trim(p_body),p_draft_id,to_jsonb(p_photo_ids));
 -- Same sender lock and actual foundation functions preserve block/quota/reply guards.
 perform pg_advisory_xact_lock(1297303345,hashtext(actor::text));
 select * into prior from private.messaging_photo_requests where actor_id=actor and request_id=p_request_id;
 if found then
  if prior.input<>payload then raise exception 'photo_conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 -- Never retrofit photos onto a text-only or other successful request.
 if exists(select 1 from public.messaging_messages m where m.sender_user_id=actor and m.request_id=p_request_id)
 then raise exception 'photo_conflict' using errcode='22023'; end if;
 for asset_id in select x from unnest(p_photo_ids) x order by x loop
  select * into a from public.messaging_photo_assets where id=asset_id for update;
  if not found or a.owner_id is distinct from actor or a.draft_id<>p_draft_id or not a.ready or a.sent
  then raise exception 'photo_permission' using errcode='42501'; end if;
 end loop;
 case p_kind
 when 'direct' then result:=public.send_messaging_message(p_target_id,p_body,p_request_id);
 when 'reply' then result:=public.reply_messaging_message(p_target_id,p_body,p_request_id);
 when 'listing' then result:=public.send_market_listing_message(p_target_id,p_body,p_request_id);
 when 'buy_request' then result:=public.send_market_buy_request_message(p_target_id,p_body,p_request_id);
 when 'vendor' then result:=public.send_market_vendor_message(p_target_id,p_body,p_request_id);
 when 'store' then result:=public.send_market_store_message(p_target_id,p_body,p_request_id);
 end case;
 sent_id:=(result->>'id')::uuid;
 if sent_id is null then raise exception 'photo_result'; end if;
 update public.messaging_photo_assets asset set sent=true,message_id=(result->>'id')::uuid,position=p.ordinality-1
 from unnest(p_photo_ids) with ordinality as p(id,ordinality) where asset.id=p.id;
 -- Prevent a text-only facade from acknowledging this photo operation as its own.
 update public.messaging_messages set request_fingerprint=encode(sha256(convert_to(jsonb_build_array('photos',payload)::text,'UTF8')),'hex')
 where id=sent_id;
 result:=result||jsonb_build_object('photo_ids',to_jsonb(p_photo_ids));
 insert into private.messaging_photo_requests values(actor,p_request_id,payload,result);
 return result;
end $$;
create function private.list_message_photos(p_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare detail jsonb; result jsonb;
begin
 detail:=public.get_messaging_message(p_message_id,false);
 if detail->>'kind'<>'direct' then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id) order by a.position),'[]'::jsonb) into result
 from public.messaging_photo_assets a where a.message_id=p_message_id and a.sent and a.ready
 and private.messaging_photo_access(a.id::text,false);
 return result;
end $$;

create function public.prepare_message_photo(p_id uuid,p_draft_id uuid,p_mime text,p_bytes integer,p_sha256 text) returns jsonb language sql security invoker set search_path='' as $$ select private.prepare_message_photo(p_id,p_draft_id,p_mime,p_bytes,p_sha256); $$;
revoke all on function private.prepare_message_photo(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.prepare_message_photo(uuid,uuid,text,integer,text) to authenticated;
revoke all on function public.prepare_message_photo(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_message_photo(uuid,uuid,text,integer,text) to authenticated;

create function public.complete_message_photo_server(p_actor_user_id uuid,p_id uuid,p_draft_id uuid,p_verified_mime text,p_verified_bytes integer,p_verified_sha256 text)
-- Match existing service-only server RPCs: service_role has no private schema USAGE.
-- EXECUTE is revoked from ordinary roles below; no schema-wide grant is added.
returns jsonb language sql security definer set search_path='' as $$
 select private.complete_message_photo_server(p_actor_user_id,p_id,p_draft_id,p_verified_mime,p_verified_bytes,p_verified_sha256);
$$;
revoke all on function private.complete_message_photo_server(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function private.complete_message_photo_server(uuid,uuid,uuid,text,integer,text) to service_role;
revoke all on function public.complete_message_photo_server(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_message_photo_server(uuid,uuid,uuid,text,integer,text) to service_role;

create function public.send_message_with_photos(p_kind text,p_target_id uuid,p_body text,p_request_id uuid,p_draft_id uuid,p_photo_ids uuid[]) returns jsonb language sql security invoker set search_path='' as $$ select private.send_message_with_photos(p_kind,p_target_id,p_body,p_request_id,p_draft_id,p_photo_ids); $$;
revoke all on function private.send_message_with_photos(text,uuid,text,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function private.send_message_with_photos(text,uuid,text,uuid,uuid,uuid[]) to authenticated;
revoke all on function public.send_message_with_photos(text,uuid,text,uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.send_message_with_photos(text,uuid,text,uuid,uuid,uuid[]) to authenticated;

create function public.list_message_photos(p_message_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.list_message_photos(p_message_id); $$;
revoke all on function private.list_message_photos(uuid) from public,anon,authenticated,service_role;
grant execute on function private.list_message_photos(uuid) to authenticated;
revoke all on function public.list_message_photos(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_message_photos(uuid) to authenticated;

revoke all on function private.messaging_photo_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.messaging_photo_access(text,boolean) to authenticated;
commit;
