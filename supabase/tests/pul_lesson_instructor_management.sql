begin;

do $$
declare
  admin uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  other_member uuid := gen_random_uuid();
  actor uuid;
  video_key text;
  entry record;
  source_id uuid;
  destination_id uuid;
  new_id uuid;
  single_id uuid;
  version_before_rename integer;
  watched_ids uuid[];
  draft jsonb := jsonb_build_object(
    'title', '교습가 정정 회귀 영상', 'category', 'basic_stance', 'channel_name', '회귀 채널A',
    'instructor_name', '김교습', 'level', 'intro', 'duration_text', '08:30', 'description', '교습가 정정 회귀 확인 영상',
    'youtube_url', 'https://youtu.be/QA123456789', 'youtube_channel_url', null,
    'thumbnail_type', 'green', 'tags', '[]'::jsonb, 'is_featured', true
  );
begin
  foreach actor in array array[admin, member, other_member] loop
    insert into auth.users (id, instance_id, aud, role, email)
    values (actor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', actor || '@lesson-local.test');
  end loop;
  update public.user_accounts set platform_role = 'platform_admin' where id = admin;

  perform set_config('request.jwt.claim.sub', admin::text, true);
  set local role authenticated;
  for entry in select * from (values
    ('identity-test-one', '김교습'),
    ('identity-test-two', '김교습'),
    ('identity-test-existing', '이교습'),
    ('identity-test-single', '박교습')
  ) as fixtures(key, name) loop
    perform public.mutate_lesson_video('create', entry.key, null, draft || jsonb_build_object('instructor_name', entry.name));
    perform public.mutate_lesson_video('publish', entry.key, 1);
  end loop;
  source_id := (public.get_public_lesson_video('identity-test-one', null, null)->>'instructor_id')::uuid;
  destination_id := (public.get_public_lesson_video('identity-test-existing', null, null)->>'instructor_id')::uuid;
  single_id := (public.get_public_lesson_video('identity-test-single', null, null)->>'instructor_id')::uuid;
  assert source_id <> destination_id and source_id <> single_id and destination_id <> single_id;

  perform set_config('request.jwt.claim.sub', member::text, true);
  perform public.set_lesson_instructor_bookmark(source_id, true);
  perform public.set_lesson_instructor_bookmark(destination_id, true);
  perform public.set_lesson_instructor_bookmark(single_id, true);
  perform set_config('request.jwt.claim.sub', other_member::text, true);
  assert public.list_my_lesson_instructor_bookmarks(array[source_id, destination_id, single_id]) = '[]'::jsonb;
  perform public.set_lesson_instructor_bookmark(destination_id, false);
  begin
    perform public.rename_lesson_instructor(source_id, '회귀 채널A', '김교습', '무단 변경', '김교습');
    raise exception 'member unexpectedly renamed a profile';
  exception when raise_exception then
    if sqlerrm <> '레슨·교육 운영 권한이 없습니다.' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.mutate_lesson_video('update', 'identity-test-two', 2, draft || '{"instructor_name":"새 교습가"}'::jsonb);
  new_id := (public.get_public_lesson_video('identity-test-two', null, null)->>'instructor_id')::uuid;
  assert new_id is not null and new_id <> source_id and new_id <> destination_id;
  assert public.get_public_lesson_instructor_video(source_id)->>'instructor_name' = '김교습';
  assert public.get_public_lesson_instructor_video(source_id)->>'video_key' = 'identity-test-one';

  perform set_config('request.jwt.claim.sub', other_member::text, true);
  perform public.set_lesson_instructor_bookmark(new_id, true);
  perform set_config('request.jwt.claim.sub', admin::text, true);
  perform public.mutate_lesson_video('update', 'identity-test-two', 3, draft);
  assert (public.get_public_lesson_video('identity-test-two', null, null)->>'instructor_id')::uuid = source_id;
  perform public.mutate_lesson_video('update', 'identity-test-two', 4, draft || '{"instructor_name":"이교습"}'::jsonb);
  assert (public.get_public_lesson_video('identity-test-two', null, null)->>'instructor_id')::uuid = destination_id;
  assert (public.get_public_lesson_video('identity-test-existing', null, null)->>'instructor_id')::uuid = destination_id;
  assert (public.get_public_lesson_video('identity-test-one', null, null)->>'instructor_id')::uuid = source_id;

  begin
    perform public.rename_lesson_instructor(destination_id, '회귀 채널A', '이교습', '회귀 채널A', '김교습');
    raise exception 'colliding names unexpectedly merged';
  exception when unique_violation then
    if sqlerrm <> '같은 채널명과 활동명을 사용 중인 다른 교습가가 있습니다.' then raise; end if;
  end;
  assert public.get_public_lesson_instructor_video(destination_id)->>'instructor_name' = '이교습';
  version_before_rename := (public.get_lesson_video_for_management('identity-test-two')->>'version')::integer;
  assert public.rename_lesson_instructor(destination_id, '회귀 채널A', '이교습', '회귀 채널 새 이름', '이교습 새 이름') = destination_id;

  foreach video_key in array array['identity-test-two', 'identity-test-existing'] loop
    assert (public.get_lesson_video_for_management(video_key)->'video'->>'instructor_id')::uuid = destination_id;
    assert public.get_lesson_video_for_management(video_key)->'video'->>'channel_name' = '회귀 채널 새 이름';
  end loop;
  begin
    perform public.mutate_lesson_video('update', 'identity-test-two', version_before_rename, draft || '{"instructor_name":"이교습"}'::jsonb);
    raise exception 'stale video edit unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm not like '무료 강의 영상 정보가 변경되었습니다.%' then raise; end if;
  end;
  perform public.mutate_lesson_video('update', 'identity-test-two', version_before_rename + 1,
    draft || '{"title":"다시 편집한 영상","channel_name":"회귀 채널 새 이름","instructor_name":"이교습 새 이름"}'::jsonb);
  assert public.get_public_lesson_instructor_video(destination_id)->>'channel_name' = '회귀 채널 새 이름';

  assert public.rename_lesson_instructor(single_id, '회귀 채널A', '박교습', '단일 새 채널', '단일 새 활동명') = single_id;
  assert public.get_public_lesson_instructor_video(single_id)->>'instructor_name' = '단일 새 활동명';
  assert public.get_public_lesson_instructor_video(single_id)->>'video_key' = 'identity-test-single';

  reset role;
  assert (select count(*) from public.lesson_videos where instructor_id = destination_id
    and channel_name = '회귀 채널 새 이름' and instructor_name = '이교습 새 이름') = 2;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', member::text, true);
  watched_ids := array[source_id, destination_id, single_id];
  assert public.list_my_lesson_instructor_bookmarks(watched_ids) @> to_jsonb(watched_ids);
  perform set_config('request.jwt.claim.sub', other_member::text, true);
  assert public.list_my_lesson_instructor_bookmarks(watched_ids || new_id) = jsonb_build_array(new_id);
  reset role;
end $$;

rollback;
