-- Messaging 1B-1: bounded, actor-owned block settings read. Apply atomically.
-- Existing messaging functions, table ACLs and policies remain unchanged.

-- The PK orders by target only; this supports latest-first keyset pagination.
create index messaging_blocks_recent_idx
  on public.messaging_blocks(blocker_user_id, created_at desc, blocked_user_id desc);

create function public.list_messaging_blocks(
  p_limit integer default 20,
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := private.messaging_assert_actor();
  v_rows jsonb;
  v_more boolean;
begin
  perform private.messaging_validate_page(p_limit, p_cursor_at, p_cursor_id);
  with page as (
    select b.blocked_user_id, b.created_at
    from public.messaging_blocks b
    where b.blocker_user_id = v_actor
      and (p_cursor_at is null or (b.created_at, b.blocked_user_id) < (p_cursor_at, p_cursor_id))
    order by b.created_at desc, b.blocked_user_id desc
    limit p_limit + 1
  ), numbered as (
    select *, row_number() over (order by created_at desc, blocked_user_id desc) as n from page
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'blocked_user_id', blocked_user_id,
      'counterpart_display', private.messaging_display_name(blocked_user_id),
      'blocked_at', created_at
    ) order by created_at desc, blocked_user_id desc) filter (where n <= p_limit), '[]'::jsonb),
    count(*) > p_limit
    into v_rows, v_more
  from numbered;
  return jsonb_build_object(
    'items', v_rows,
    'has_more', v_more,
    'next_cursor', case when v_more then jsonb_build_object(
      'at', v_rows->(p_limit-1)->>'blocked_at',
      'id', v_rows->(p_limit-1)->>'blocked_user_id'
    ) else null end
  );
end;
$$;
alter function public.list_messaging_blocks(integer,timestamptz,uuid) owner to postgres;
revoke all on function public.list_messaging_blocks(integer,timestamptz,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_messaging_blocks(integer,timestamptz,uuid) to authenticated;
