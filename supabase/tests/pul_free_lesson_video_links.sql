begin;

do $$
declare
  sharer uuid := gen_random_uuid();
  reporters uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  actor uuid;
  shared_id uuid;
  shared_key constant text := 'yt-PA123456789';
  list_entry jsonb := jsonb_build_array(jsonb_build_object('video_key', shared_key));
begin
  foreach actor in array array[sharer] || reporters loop
    insert into auth.users (id, instance_id, aud, role, email)
    values (actor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', actor || '@lesson-local.test');
  end loop;

  set local role anon;
  begin
    perform public.publish_shared_lesson_video('PA123456789', 'tee_shot', '공유 영상', '테스트 채널');
    raise exception 'anonymous publishing unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.report_lesson_video(shared_key);
    raise exception 'anonymous reporting unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', sharer::text, true);
  assert public.publish_shared_lesson_video('PA123456789', 'tee_shot', '공유 영상', '테스트 채널') = shared_key;
  assert public.get_public_lesson_video(shared_key, null, null)->>'category' = 'tee_shot';
  assert not (public.get_public_lesson_video(shared_key, null, null) ? 'instructor_id');
  assert (public.list_public_lesson_videos('tee_shot')->'items') @> list_entry;
  perform public.set_lesson_video_bookmark(shared_key, true);

  for report_index in 1..4 loop
    perform set_config('request.jwt.claim.sub', reporters[report_index]::text, true);
    assert public.report_lesson_video(shared_key) = 'reported';
    assert public.report_lesson_video(shared_key) = 'already_reported';
    assert public.get_public_lesson_video(shared_key, null, null) is not null;
  end loop;

  perform set_config('request.jwt.claim.sub', reporters[5]::text, true);
  assert public.report_lesson_video(shared_key) = 'hidden';
  assert public.get_public_lesson_video(shared_key, null, null) is null;
  assert not ((public.list_public_lesson_videos('tee_shot')->'items') @> list_entry);

  begin
    perform public.publish_shared_lesson_video('PA123456789', 'putting', '다른 제목', '테스트 채널');
    raise exception 'the hidden link was registered again';
  exception when unique_violation then null;
  end;

  reset role;
  select video.id into strict shared_id from public.lesson_videos as video
  where video.video_key = shared_key and video.publication_status = 'hidden';
  assert (select count(*) from private.lesson_video_reports as report where report.video_id = shared_id) = 5;
  assert exists (select 1 from public.lesson_video_bookmarks where lesson_video_id = shared_id and user_id = sharer);
end $$;

rollback;
