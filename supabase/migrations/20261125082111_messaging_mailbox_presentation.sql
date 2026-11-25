-- Presentation metadata is only projected after the mailbox or detail ownership check.
create function private.messaging_mailbox_type(p_id uuid, p_kind text) returns text
language sql stable set search_path = '' as $$
  select case
    when p_kind = 'direct' then case
      when exists (select 1 from private.tournament_correction_messages where message_id = p_id) then 'correction'
      when exists (select 1 from private.course_inquiry_contexts where message_id = p_id) then 'course_inquiry'
      when exists (select 1 from public.messaging_market_contexts where message_id = p_id)
        or exists (select 1 from public.messaging_buy_request_contexts where message_id = p_id)
        or exists (select 1 from public.messaging_vendor_contexts where message_id = p_id)
        or exists (select 1 from public.messaging_store_contexts where message_id = p_id) then 'market'
      else 'direct' end
    when p_kind = 'platform_broadcast'
      and exists (select 1 from private.hall_special_applications where companion_message_id = p_id) then 'companion'
    when p_kind = 'club_broadcast'
      and exists (select 1 from private.club_participation_notices where message_id = p_id) then 'participation'
    else p_kind end
$$;
revoke all on function private.messaging_mailbox_type(uuid, text) from public, anon, authenticated, service_role;

create function private.messaging_mailbox_page(p_box text, p_limit integer, p_cursor_at timestamptz, p_cursor_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.messaging_assert_actor();
  result jsonb;
  rows jsonb;
  more boolean;
begin
  if p_box is null or p_box not in ('inbox', 'unread', 'sent') then
    raise exception 'messaging_invalid' using errcode = '22023';
  end if;
  perform private.messaging_validate_page(p_limit, p_cursor_at, p_cursor_id);
  if p_box <> 'unread' then
    result := private.messaging_list(p_box, p_limit, p_cursor_at, p_cursor_id);
  else
    with eligible as (
      select m.id, m.kind, m.body, m.reply_to_message_id, m.sender_user_id, r.received_at
      from public.messaging_recipients r join public.messaging_messages m on m.id = r.message_id
      where r.recipient_user_id = actor and r.hidden_at is null and r.read_at is null
        and (p_cursor_at is null or (r.received_at, r.message_id) < (p_cursor_at, p_cursor_id))
      order by r.received_at desc, r.message_id desc
      limit p_limit + 1
    ), numbered as (
      select *, row_number() over (order by received_at desc, id desc) as position from eligible
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'counterpart_display', case when kind = 'direct'
        then private.messaging_counterpart_name(sender_user_id) else kind end,
      'preview', left(body, 100), 'at', received_at, 'read_at', null,
      'is_reply', reply_to_message_id is not null
    ) order by position) filter (where position <= p_limit), '[]'), count(*) > p_limit
    into rows, more from numbered;
    result := jsonb_build_object('items', rows, 'has_more', more, 'next_cursor', case when more then
      jsonb_build_object('at', rows->(p_limit-1)->>'at', 'id', rows->(p_limit-1)->>'id') end);
  end if;
  select coalesce(jsonb_agg(item || jsonb_build_object('mailbox_type',
    private.messaging_mailbox_type((item->>'id')::uuid, item->>'kind')) order by position), '[]')
  into rows from jsonb_array_elements(result->'items') with ordinality as page(item, position);
  return jsonb_set(result, '{items}', rows);
end
$$;

create function private.messaging_mailbox_detail(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := private.messaging_assert_actor();
  message jsonb := public.get_messaging_message(p_message_id, false);
  category text := private.messaging_mailbox_type(p_message_id, message->>'kind');
  other uuid := (message->>'counterpart_user_id')::uuid;
  result jsonb;
  room_id uuid;
  footer text;
begin
  result := jsonb_build_object('mailbox_type', category);
  if message->>'kind' = 'direct' then
    result := result || jsonb_build_object(
      'blocked_by_me', exists (select 1 from public.messaging_blocks where blocker_user_id = actor and blocked_user_id = other),
      'can_reply', category <> 'correction' and private.messaging_account_available(other)
        and not exists (select 1 from public.messaging_blocks where
          (blocker_user_id = actor and blocked_user_id = other) or (blocker_user_id = other and blocked_user_id = actor)),
      'related', (
        select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body, 'created_at', created_at,
          'is_recipient', is_recipient, 'before', before, 'has_photos', has_photos) order by before desc, created_at, id), '[]')
        from (
          select m.id, m.body, m.created_at, coalesce(r.recipient_user_id = actor, false) as is_recipient,
            coalesce(m.id = (message->>'reply_to_message_id')::uuid, false) as before,
            exists (select 1 from public.messaging_photo_assets a where a.message_id = m.id and a.sent and a.ready) as has_photos
          from public.messaging_messages m left join public.messaging_recipients r on r.message_id = m.id
          where m.kind = 'direct' and (m.id = (message->>'reply_to_message_id')::uuid or m.reply_to_message_id = p_message_id)
            and ((m.sender_user_id = actor and m.sender_hidden_at is null)
              or (r.recipient_user_id = actor and r.hidden_at is null))
          order by (m.id = (message->>'reply_to_message_id')::uuid) desc nulls last, m.created_at desc, m.id desc
          limit 21
        ) related
      ));
  elsif message->>'kind' = 'club_broadcast' then
    select n.room_id into room_id from private.club_participation_notices n where n.message_id = p_message_id;
    select substring(message->>'body' from E'\\n\\n(/club-participation/[a-f0-9-]{36})$') into footer;
    if room_id is null and footer ~ '^/club-participation/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
      select r.id into room_id from private.club_participation_rooms r
      join public.messaging_club_broadcast_contexts c on c.club_id = r.club_id and c.message_id = p_message_id
      where r.id = right(footer, 36)::uuid;
    end if;
    if room_id is not null then
      result := result || jsonb_build_object('mailbox_type', 'participation', 'room_id', room_id,
        'strip_room_footer', coalesce(footer = '/club-participation/' || room_id, false));
    elsif category = 'participation' then
      result := result || jsonb_build_object('strip_room_footer', footer is not null);
    end if;
  elsif message->>'kind' = 'tournament_broadcast' then
    result := result || coalesce((
      select jsonb_build_object('tournament_linked', true, 'tournament_purpose', tm.purpose,
        'tournament_title', case when e.publication_status = 'published' then e.title end)
      from private.tournament_messages tm join public.events e on e.id = tm.event_id
      where tm.message_id = p_message_id
    ), '{}');
  elsif message->>'kind' = 'club_event_broadcast' then
    -- Reuse the event reader's permission check before exposing the event location.
    result := result || coalesce((
      select jsonb_build_object('event_location', e.location)
      from public.club_official_events e
      where e.id = (public.get_message_club_event_context(p_message_id)->>'event_id')::uuid
    ), '{}');
  end if;
  return result;
end
$$;

create function public.get_messaging_mailbox_page(p_box text, p_limit integer, p_cursor_at timestamptz, p_cursor_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.messaging_mailbox_page(p_box, p_limit, p_cursor_at, p_cursor_id)
$$;
create function public.get_messaging_mailbox_detail(p_message_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.messaging_mailbox_detail(p_message_id)
$$;
revoke all on function private.messaging_mailbox_page(text, integer, timestamptz, uuid),
  private.messaging_mailbox_detail(uuid), public.get_messaging_mailbox_page(text, integer, timestamptz, uuid),
  public.get_messaging_mailbox_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function private.messaging_mailbox_page(text, integer, timestamptz, uuid),
  private.messaging_mailbox_detail(uuid), public.get_messaging_mailbox_page(text, integer, timestamptz, uuid),
  public.get_messaging_mailbox_detail(uuid) to authenticated;
