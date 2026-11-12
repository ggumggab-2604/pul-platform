create table private.lesson_instructor_bookmarks (
  user_id uuid not null references public.user_accounts (id) on delete cascade,
  channel_name text not null,
  instructor_name text not null,
  primary key (user_id, channel_name, instructor_name)
);

alter table private.lesson_instructor_bookmarks enable row level security;
alter table private.lesson_instructor_bookmarks force row level security;
revoke all on table private.lesson_instructor_bookmarks from public, anon, authenticated, service_role;

create index lesson_videos_public_instructor_idx
  on public.lesson_videos (channel_name, instructor_name, is_featured desc, created_at desc, video_key)
  where publication_status = 'published';

create function public.get_public_lesson_video(
  p_video_key text,
  p_channel_name text,
  p_instructor_name text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.public_lesson_video_json(video)
  from public.lesson_videos as video
  where video.publication_status = 'published'
    and (
      (p_video_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' and video.video_key = p_video_key)
      or (
        p_video_key is null
        and pg_catalog.char_length(p_channel_name) between 1 and 120
        and pg_catalog.char_length(p_instructor_name) between 1 and 100
        and video.channel_name = p_channel_name
        and video.instructor_name = p_instructor_name
      )
    )
  order by video.is_featured desc, video.created_at desc, video.video_key
  limit 1;
$$;

revoke all on function public.get_public_lesson_video(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_lesson_video(text, text, text) to anon, authenticated;

create function public.list_my_lesson_instructor_bookmarks(p_instructors jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_active_lesson_video_bookmark_reader();
begin
  if pg_catalog.jsonb_typeof(p_instructors) is distinct from 'array' then
    raise exception '교습가 정보를 확인해 주세요.';
  end if;
  if pg_catalog.jsonb_array_length(p_instructors) > 24 then
    raise exception '조회할 교습가 수를 확인해 주세요.';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(bookmark.channel_name, bookmark.instructor_name))
    from private.lesson_instructor_bookmarks as bookmark
    where bookmark.user_id = v_actor_id
      and exists (
        select 1 from pg_catalog.jsonb_array_elements(p_instructors) as target(pair)
        where target.pair = pg_catalog.jsonb_build_array(bookmark.channel_name, bookmark.instructor_name)
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_lesson_instructor_bookmarks(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.list_my_lesson_instructor_bookmarks(jsonb) to authenticated;

create function public.set_lesson_instructor_bookmark(
  p_channel_name text,
  p_instructor_name text,
  p_saved boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.require_active_lesson_video_bookmark_actor();
begin
  if p_saved is null or p_channel_name is null or p_instructor_name is null
     or pg_catalog.char_length(p_channel_name) not between 1 and 120
     or pg_catalog.char_length(p_instructor_name) not between 1 and 100 then
    raise exception '관심 교습가 정보를 확인해 주세요.';
  end if;

  if p_saved then
    perform 1
    from public.lesson_videos as video
    where video.publication_status = 'published'
      and video.channel_name = p_channel_name
      and video.instructor_name = p_instructor_name
    limit 1
    for share;

    if not found then
      raise exception '공개된 교습가를 찾을 수 없습니다.';
    end if;

    insert into private.lesson_instructor_bookmarks (user_id, channel_name, instructor_name)
    values (v_actor_id, p_channel_name, p_instructor_name)
    on conflict (user_id, channel_name, instructor_name) do nothing;
  else
    delete from private.lesson_instructor_bookmarks as bookmark
    where bookmark.user_id = v_actor_id
      and bookmark.channel_name = p_channel_name
      and bookmark.instructor_name = p_instructor_name;
  end if;

  return p_saved;
end;
$$;

revoke all on function public.set_lesson_instructor_bookmark(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_lesson_instructor_bookmark(text, text, boolean) to authenticated;
