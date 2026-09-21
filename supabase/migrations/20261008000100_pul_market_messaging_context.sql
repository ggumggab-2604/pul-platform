-- Messaging 1D: apply the whole file in one transaction, before the new UI.
-- The 92 official migrations and all existing RPC definitions remain unchanged.
create table public.messaging_market_contexts (
  message_id uuid primary key references public.messaging_messages(id) on delete cascade,
  market_listing_id uuid references public.market_listings(id) on delete set null
);
create index messaging_market_context_listing_idx on public.messaging_market_contexts(market_listing_id)
  where market_listing_id is not null;
alter table public.messaging_market_contexts enable row level security;
alter table public.messaging_market_contexts force row level security;
revoke all on public.messaging_market_contexts from public, anon, authenticated, service_role;

-- A missing listing leaves a context tombstone; it never deletes personal messages.
-- Reply authorization stays entirely in the existing messaging foundation.
create function private.messaging_inherit_market_context()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.messaging_market_contexts(message_id, market_listing_id)
    select new.id, c.market_listing_id from public.messaging_market_contexts c
    where c.message_id = new.reply_to_message_id;
  return new;
end;
$$;
create trigger messaging_reply_market_context after insert on public.messaging_messages
  for each row when (new.reply_to_message_id is not null)
  execute function private.messaging_inherit_market_context();

create function public.get_market_message_compose_context(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := private.messaging_assert_actor(); v_listing record;
begin
  select l.id,l.seller_user_id,l.title,l.listing_status into v_listing
    from public.market_listings l where l.id = p_listing_id;
  if v_listing.id is null or v_listing.listing_status not in ('selling','reserved')
    or v_listing.seller_user_id = v_actor
    or not private.messaging_account_available(v_listing.seller_user_id) then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  return pg_catalog.jsonb_build_object('available',true,'listing_id',v_listing.id,
    'title',v_listing.title,'status',v_listing.listing_status);
end;
$$;

create function public.send_market_listing_message(p_listing_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_listing record;
  v_previous public.messaging_messages%rowtype;
  v_fingerprint text; v_receipt jsonb;
begin
  perform private.messaging_assert_read_committed();
  if p_listing_id is null or p_request_id is null or p_body is null
    or pg_catalog.char_length(private.messaging_trim(p_body)) not between 1 and 2000 then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  -- Same sender lock as generic send/reply: no separate quota or replay channel.
  perform pg_catalog.pg_advisory_xact_lock(1297303345, pg_catalog.hashtext(v_actor::text));
  v_fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_array('market',p_listing_id,private.messaging_normalize(p_body))::text,'UTF8')),'hex');
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
  select l.id,l.seller_user_id,l.listing_status into v_listing
    from public.market_listings l where l.id = p_listing_id for share;
  if v_listing.id is null or v_listing.listing_status not in ('selling','reserved') then
    raise exception 'messaging_recipient_unavailable' using errcode = 'P0002';
  end if;
  v_receipt := private.messaging_create(v_listing.seller_user_id,null,p_body,p_request_id);
  -- The foundation has inserted the message/receipt under its ordinary account,
  -- pair, spam and concurrency guards. Replace only this new operation's replay
  -- fingerprint before commit; generic send/reply can never replay/convert it.
  update public.messaging_messages set request_fingerprint = v_fingerprint
    where id = (v_receipt->>'id')::uuid;
  insert into public.messaging_market_contexts(message_id,market_listing_id)
    values ((v_receipt->>'id')::uuid,v_listing.id);
  return v_receipt;
end;
$$;

create function public.get_message_market_context(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_listing_id uuid; v_result jsonb;
begin
  -- Reuse the exact active/participant/own-hidden guard, without marking read.
  perform public.get_messaging_message(p_message_id,false);
  select c.market_listing_id into v_listing_id from public.messaging_market_contexts c
    where c.message_id = p_message_id;
  if not found then return null; end if;
  -- Same visibility as canonical public get_market_listing, but never its contact,
  -- body, images or management metadata. No participant-only listing privilege.
  select pg_catalog.jsonb_build_object('available',true,'listing_id',l.id,'title',l.title,'status',l.listing_status)
    into v_result from public.market_listings l
    where l.id = v_listing_id and l.listing_status in ('selling','reserved','sold');
  return coalesce(v_result,pg_catalog.jsonb_build_object('available',false));
end;
$$;

alter table public.messaging_market_contexts owner to postgres;
alter function private.messaging_inherit_market_context() owner to postgres;
alter function public.get_market_message_compose_context(uuid) owner to postgres;
alter function public.send_market_listing_message(uuid,text,uuid) owner to postgres;
alter function public.get_message_market_context(uuid) owner to postgres;
revoke all on function private.messaging_inherit_market_context(),
  public.get_market_message_compose_context(uuid), public.send_market_listing_message(uuid,text,uuid),
  public.get_message_market_context(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_market_message_compose_context(uuid),
  public.send_market_listing_message(uuid,text,uuid), public.get_message_market_context(uuid) to authenticated;
