begin;

create function private.course_interest_states(p_course_keys text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid; result jsonb;
begin
  actor := private.require_active_lesson_video_bookmark_reader();
  if p_course_keys is null or coalesce(array_ndims(p_course_keys), 0) <> 1
    or cardinality(p_course_keys) not between 1 and 24
    or exists(select 1 from unnest(p_course_keys) k where k is null or k !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
    or (select count(distinct k) from unnest(p_course_keys) k) <> cardinality(p_course_keys) then
    raise exception '관심 구장 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  select coalesce(jsonb_object_agg(c.course_key, b.course_id is not null), '{}'::jsonb) into result
  from public.courses c
  left join public.course_bookmarks b on b.course_id = c.id and b.user_id = actor
  where c.course_key = any(p_course_keys) and c.course_status = 'active';
  return result;
end;
$$;

create function public.course_interest_states(p_course_keys text[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.course_interest_states(p_course_keys);
$$;

revoke all on function private.course_interest_states(text[]), public.course_interest_states(text[])
  from public, anon, authenticated, service_role;
grant execute on function private.course_interest_states(text[]), public.course_interest_states(text[]) to authenticated;

commit;
