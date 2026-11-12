begin;

do $$
declare
  manager uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  other_teacher uuid := gen_random_uuid();
  other_member uuid := gen_random_uuid();
  actor uuid;
  application uuid;
  other_application uuid;
  instructor uuid;
  other_instructor uuid;
  question uuid := gen_random_uuid();
  proposal jsonb;
  current_channel jsonb;
begin
  foreach actor in array array[manager, teacher, member, other_teacher, other_member] loop
    insert into auth.users (id, instance_id, aud, role, email)
    values (actor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', actor || '@channel-local.test');
  end loop;
  update public.user_accounts set platform_role = 'platform_admin' where id = manager;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', teacher::text, true);
  perform public.publish_shared_lesson_video('CH123456789', 'tee_shot', '기존 티샷 영상', '교습 채널');
  application := public.apply_lesson_instructor_channel('교습 채널', '교습가', 'https://www.youtube.com/@lesson-test', '파크골프 레슨 채널입니다.');
  proposal := public.get_my_lesson_instructor_channel();
  assert proposal->>'status' = 'pending';
  assert public.list_public_lesson_instructor_channels() = '[]'::jsonb;
  begin
    perform public.publish_lesson_instructor_channel_video('NO123456789', 'putting', '승인 전 영상', '교습 채널', true);
    raise exception 'pending applicant could publish to a channel';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.review_lesson_instructor_channel(application, 'activate', proposal, true);
    raise exception 'an applicant approved their own application';
  exception when raise_exception then
    if sqlerrm <> '레슨·교육 운영 권한이 없습니다.' then raise; end if;
  end;
  perform public.apply_lesson_instructor_channel('교습 채널', '교습가', 'https://www.youtube.com/@lesson-test', '채널 소개를 수정했습니다.');

  perform set_config('request.jwt.claim.sub', manager::text, true);
  begin
    perform public.review_lesson_instructor_channel(application, 'activate', proposal, true);
    raise exception 'a superseded application was approved';
  exception when sqlstate 'PT409' then null;
  end;
  proposal := (public.list_lesson_instructor_channel_applications()->0) - 'existing_instructors';
  begin
    perform public.review_lesson_instructor_channel(application, 'activate', proposal, false);
    raise exception 'channel activated without payment confirmation';
  exception when sqlstate 'PT409' then null;
  end;
  perform public.review_lesson_instructor_channel(application, 'activate', proposal, true);
  instructor := (public.list_public_lesson_instructor_channels()->0->>'instructor_id')::uuid;
  assert instructor is not null;
  assert public.get_public_lesson_video('yt-CH123456789', null, null)->>'instructor_id' = instructor::text;
  assert not (public.get_lesson_video_for_management('yt-CH123456789')->'video' ? 'instructor_id');

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  perform public.publish_lesson_instructor_channel_video('DU123456789', 'putting', '양쪽 퍼팅 영상', '교습 채널', false);
  perform public.publish_lesson_instructor_channel_video('EX123456789', 'putting', '단독 퍼팅 영상', '교습 채널', true);
  perform public.mutate_lesson_instructor_channel_board(instructor, gen_random_uuid(), 'notice', '교습가 공지입니다.');
  assert jsonb_array_length(public.get_public_lesson_instructor_channel(instructor)->'videos') = 3;
  current_channel := public.get_public_lesson_instructor_channel(instructor, 'putting');
  assert current_channel->>'is_owner' = 'true';
  assert jsonb_array_length(current_channel->'videos') = 2;
  assert (current_channel->'videos') @> '[{"title":"단독 퍼팅 영상","exclusive":true},{"title":"양쪽 퍼팅 영상","exclusive":false}]';
  assert (public.list_public_lesson_videos('putting')->'items') @> '[{"video_key":"yt-DU123456789"}]';
  assert not ((public.list_public_lesson_videos('putting')->'items') @> '[{"title":"단독 퍼팅 영상"}]');
  assert public.get_public_lesson_video('yt-EX123456789', null, null) is null;

  begin
    perform public.publish_shared_lesson_video('EX123456789', 'putting', '단독 링크 중복 등록', '다른 채널');
    raise exception 'instructor published the same exclusive entry in both directories';
  exception when unique_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', member::text, true);
  begin
    perform public.mutate_lesson_instructor_channel_board(instructor, question, 'question', '관심 저장 전 질문');
    raise exception 'unsaved member posted a question';
  exception when insufficient_privilege then null;
  end;
  perform public.set_lesson_instructor_bookmark(instructor, true);
  assert public.get_public_lesson_instructor_channel(instructor)->>'can_write' = 'true';
  perform public.mutate_lesson_instructor_channel_board(instructor, question, 'question', '퍼팅 자세가 궁금합니다.');
  perform public.mutate_lesson_instructor_channel_board(instructor, question, 'question', '퍼팅 자세가 궁금합니다.');
  assert jsonb_array_length(public.get_public_lesson_instructor_channel(instructor)->'posts') = 2;
  begin
    perform public.mutate_lesson_instructor_channel_board(instructor, question, 'reply', '일반 회원의 답변');
    raise exception 'ordinary member posted as instructor';
  exception when insufficient_privilege then null;
  end;
  perform public.set_lesson_instructor_bookmark(instructor, false);
  assert public.get_public_lesson_instructor_channel(instructor)->>'can_write' = 'false';
  begin
    perform public.mutate_lesson_instructor_channel_board(instructor, gen_random_uuid(), 'question', '관심 해제 뒤 질문');
    raise exception 'member who unsaved the channel posted a question';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  perform public.mutate_lesson_instructor_channel_board(instructor, question, 'reply', '퍼터 페이스부터 확인하세요.');
  assert (public.get_public_lesson_instructor_channel(instructor)->'posts') @> '[{"reply":"퍼터 페이스부터 확인하세요."}]';

  perform set_config('request.jwt.claim.sub', other_teacher::text, true);
  other_application := public.apply_lesson_instructor_channel('다른 채널', '다른 교습가', 'https://www.youtube.com/@another-test', '별도 채널입니다.');
  proposal := public.get_my_lesson_instructor_channel();
  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform public.review_lesson_instructor_channel(other_application, 'activate', proposal, true);
  select (item->>'instructor_id')::uuid into strict other_instructor
  from jsonb_array_elements(public.list_public_lesson_instructor_channels()) item where item->>'instructor_name' = '다른 교습가';
  perform set_config('request.jwt.claim.sub', member::text, true);
  perform public.set_lesson_instructor_bookmark(other_instructor, true);
  assert public.get_public_lesson_instructor_channel(other_instructor)->>'can_write' = 'true';
  perform set_config('request.jwt.claim.sub', other_teacher::text, true);
  begin
    perform public.mutate_lesson_instructor_channel_board(other_instructor, question, 'reply', '다른 교습가의 답변');
    raise exception 'instructor replied to a question on another channel';
  exception when no_data_found then null;
  end;
  assert public.get_public_lesson_instructor_channel(other_instructor)->'videos' = '[]'::jsonb;

  reset role;
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  assert public.get_public_lesson_instructor_channel(instructor)->>'can_write' = 'false';
  assert jsonb_array_length(public.get_public_lesson_instructor_channel(instructor)->'posts') = 2;
  begin
    perform public.mutate_lesson_instructor_channel_board(instructor, gen_random_uuid(), 'question', '익명 글쓰기');
    raise exception 'anonymous member posted a question';
  exception when insufficient_privilege then null;
  end;

  reset role;
  set local role authenticated;
  foreach actor in array array[manager, teacher, member, other_teacher, other_member] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform public.report_lesson_video('yt-DU123456789');
  end loop;
  assert not ((public.get_public_lesson_instructor_channel(instructor)->'videos') @> '[{"title":"양쪽 퍼팅 영상"}]');
  assert (public.get_public_lesson_instructor_channel(instructor)->'videos') @> '[{"title":"단독 퍼팅 영상"}]';

  perform set_config('request.jwt.claim.sub', teacher::text, true);
  proposal := public.get_my_lesson_instructor_channel();
  perform set_config('request.jwt.claim.sub', manager::text, true);
  perform public.review_lesson_instructor_channel(application, 'pause', proposal, false);
  assert public.get_public_lesson_instructor_channel(instructor) is null;
  assert public.get_public_lesson_video('yt-CH123456789', null, null) is not null;

  -- A channel's exclusive entry does not reserve someone else's public YouTube URL.
  perform set_config('request.jwt.claim.sub', other_member::text, true);
  perform public.publish_shared_lesson_video('EX123456789', 'putting', '독립적인 회원 공유', '다른 채널');
  assert public.get_public_lesson_video('yt-EX123456789', null, null)->>'title' = '독립적인 회원 공유';
  reset role;
end $$;

-- Existing profiles keep their UUID, curated videos and pre-approval member bookmarks.
do $$
declare
  manager uuid := gen_random_uuid();
  member uuid := gen_random_uuid();
  teacher uuid;
  other_teacher uuid := gen_random_uuid();
  actor uuid;
  fixture record;
  profile_id uuid;
  application_id uuid;
  proposal jsonb;
  reviewed jsonb;
  current_channel jsonb;
  question_id uuid;
  conflict_reason text;
  instructor_name text;
  video_key text;
  video_draft jsonb := '{
    "title":"채널 연동 회귀 영상", "category":"basic_stance", "channel_name":"연동 회귀 채널",
    "level":"intro", "duration_text":"08:30", "description":"기존 교습가 영상입니다.",
    "youtube_url":"https://youtu.be/M1123456789", "thumbnail_type":"green", "tags":[], "is_featured":false
  }';
begin
  foreach actor in array array[manager, member, other_teacher] loop
    insert into auth.users (id, instance_id, aud, role, email)
    values (actor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', actor || '@link-local.test');
  end loop;
  update public.user_accounts set platform_role = 'platform_admin' where id = manager;
  for fixture in select * from (values
    ('bare', 'https://youtube.com/@link-bare/', '@link-bare', false),
    ('mobile', 'https://m.youtube.com/@Link-Mobile', '@link-mobile', false),
    ('videos', 'https://www.youtube.com/@link-videos/videos/', '@link-videos', false),
    ('featured', 'https://youtube.com/channel/UCABCDEFGHIJKLMNOPQRSTUV/featured', 'channel/UCABCDEFGHIJKLMNOPQRSTUV', false),
    ('exact', 'https://www.youtube.com/@link-exact', '@link-exact', false),
    ('missing', null, '@link-missing', true),
    ('alias', 'https://youtube.com/c/link-alias/videos', '@link-alias', true),
    ('handle', 'https://youtube.com/@uczyxwvutsrqponmlkjihgfe', 'channel/UCZYXWVUTSRQPONMLKJIHGFE', true)
  ) as cases(slug, legacy_url, applied_path, manual) loop
    teacher := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email)
    values (teacher, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', teacher || '@link-local.test');
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', manager::text, true);
    video_key := 'channel-link-' || fixture.slug;
    instructor_name := '교습가 ' || fixture.slug;
    perform public.mutate_lesson_video('create', video_key, null, video_draft || jsonb_build_object(
      'instructor_name', instructor_name, 'youtube_channel_url', fixture.legacy_url
    ));
    perform public.mutate_lesson_video('publish', video_key, 1);
    profile_id := (public.get_public_lesson_video(video_key, null, null)->>'instructor_id')::uuid;
    assert profile_id is not null;
    if fixture.manual then
      perform public.mutate_lesson_video('create', video_key || '-two', null, video_draft || jsonb_build_object(
        'instructor_name', instructor_name, 'youtube_channel_url', fixture.legacy_url, 'title', '두 번째 연동 영상'
      ));
      perform public.mutate_lesson_video('publish', video_key || '-two', 1);
    end if;
    perform set_config('request.jwt.claim.sub', member::text, true);
    perform public.set_lesson_instructor_bookmark(profile_id, true);
    perform public.set_lesson_video_bookmark(video_key, true);
    assert public.list_my_lesson_instructor_bookmarks(array[profile_id]) = jsonb_build_array(profile_id);

    perform set_config('request.jwt.claim.sub', teacher::text, true);
    application_id := public.apply_lesson_instructor_channel(
      '연동 회귀 채널', instructor_name, 'https://www.youtube.com/' || fixture.applied_path, '채널 연결 회귀 신청'
    );
    proposal := public.get_my_lesson_instructor_channel();
    assert not (proposal ? 'existing_instructors');

    perform set_config('request.jwt.claim.sub', manager::text, true);
    select entry into strict reviewed from jsonb_array_elements(public.list_lesson_instructor_channel_applications()) entry
    where entry->>'id' = application_id::text;
    assert reviewed - 'existing_instructors' = proposal;
    assert reviewed->'existing_instructors' @> jsonb_build_array(jsonb_build_object(
      'id', profile_id, 'linked_to_other', false, 'videos', jsonb_build_array(jsonb_build_object(
        'video_key', video_key, 'youtube_channel_url', fixture.legacy_url
      ))
    ));

    if fixture.manual then
      begin
        perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true);
        raise exception '%: ambiguous URL was approved automatically', fixture.slug;
      exception when sqlstate 'PT409' then
        get stacked diagnostics conflict_reason = pg_exception_detail;
        assert conflict_reason = 'channel_url_confirmation';
      end;
      perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true, profile_id);
      assert public.get_public_lesson_video(video_key || '-two', null, null)->>'instructor_id' = profile_id::text;
    else
      perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true);
    end if;

    perform set_config('request.jwt.claim.sub', teacher::text, true);
    assert public.get_my_lesson_instructor_channel()->>'instructor_id' = profile_id::text;
    assert public.get_public_lesson_video(video_key, null, null)->>'instructor_id' = profile_id::text;
    perform set_config('request.jwt.claim.sub', member::text, true);
    assert public.list_my_lesson_instructor_bookmarks(array[profile_id]) = jsonb_build_array(profile_id);
    assert public.list_my_lesson_video_bookmarks(array[video_key])->'items'
      @> jsonb_build_array(jsonb_build_object('video_key', video_key));
    current_channel := public.get_public_lesson_instructor_channel(profile_id);
    assert jsonb_array_length(current_channel->'videos') = case when fixture.manual then 2 else 1 end;
    assert current_channel->>'can_write' = 'true';
    question_id := gen_random_uuid();
    perform public.mutate_lesson_instructor_channel_board(profile_id, question_id, 'question', '기존 관심 회원의 질문입니다.');
    assert public.get_public_lesson_instructor_channel(profile_id)->'posts'
      @> jsonb_build_array(jsonb_build_object('id', question_id, 'body', '기존 관심 회원의 질문입니다.'));
    reset role;
  end loop;

  -- A second application cannot attach a profile claimed by another owner.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', other_teacher::text, true);
  application_id := public.apply_lesson_instructor_channel(
    '새 채널 이름', instructor_name, 'https://www.youtube.com/@link-second-owner', '다른 신청 계정입니다.'
  );
  proposal := public.get_my_lesson_instructor_channel();
  perform public.apply_lesson_instructor_channel(
    '새 채널 이름', instructor_name, 'https://www.youtube.com/@link-second-owner', '신청 내용을 바꿨습니다.'
  );
  perform public.apply_lesson_instructor_channel(
    '새 채널 이름', instructor_name, 'https://www.youtube.com/@link-second-owner', '다른 신청 계정입니다.'
  );
  perform set_config('request.jwt.claim.sub', manager::text, true);
  begin
    perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true, profile_id);
    raise exception 'A changed-and-restored application passed the stale review';
  exception when sqlstate 'PT409' then
    get stacked diagnostics conflict_reason = pg_exception_detail;
    assert conflict_reason = 'application_changed';
  end;
  select entry into strict reviewed from jsonb_array_elements(public.list_lesson_instructor_channel_applications()) entry
  where entry->>'id' = application_id::text;
  assert reviewed->'existing_instructors' @> jsonb_build_array(jsonb_build_object('id', profile_id, 'linked_to_other', true));
  proposal := reviewed - 'existing_instructors';
  begin
    perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true, profile_id);
    raise exception 'a second owner linked the claimed profile';
  exception when sqlstate 'PT409' then
    get stacked diagnostics conflict_reason = pg_exception_detail;
    assert conflict_reason = 'instructor_linked';
  end;
  begin
    perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true);
    raise exception 'a homonym with another channel label opened without confirmation';
  exception when sqlstate 'PT409' then
    get stacked diagnostics conflict_reason = pg_exception_detail;
    assert conflict_reason = 'channel_url_confirmation';
  end;
  perform public.review_lesson_instructor_channel(application_id, 'activate', proposal, true, null, true);
  perform set_config('request.jwt.claim.sub', other_teacher::text, true);
  assert public.get_my_lesson_instructor_channel()->>'instructor_id' <> profile_id::text;
  assert public.get_public_lesson_video(video_key, null, null)->>'instructor_id' = profile_id::text;
  reset role;
end $$;

rollback;
