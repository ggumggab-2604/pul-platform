begin;

-- Old rows and payloads retain their original 48-hour schedule.
alter table private.market_lost_reports
  add column publication_delay_hours smallint not null default 48
    check (publication_delay_hours in (24,36,48));

create function private.market_lost_visible(
  p_publication text, p_created_at timestamptz, p_status text, p_resolved_at timestamptz, p_delay_hours integer
) returns boolean language sql stable set search_path='' as $$
  select p_publication='immediate' or (
    p_publication='scheduled' and statement_timestamp() >= deadline
    and (p_status='unresolved' or p_resolved_at >= deadline)
  ) from (select p_created_at + make_interval(hours => p_delay_hours) as deadline) as schedule;
$$;
revoke all on function private.market_lost_visible(text,timestamptz,text,timestamptz,integer)
  from public,anon,authenticated,service_role;

create or replace function private.market_lost_public()
returns table(report private.market_lost_reports, course_key text, course_name text, post_key text,
              resolved boolean, handled_at timestamptz)
language sql stable set search_path='' as $$
  select r,c.course_key,c.name,p.post_key,
         case when r.story_id is null then r.resolved_at is not null else p.processing_status='resolved' end,
         coalesce(r.resolved_at,p.lost_found_resolved_at)
  from private.market_lost_reports r
  left join public.courses c on c.id=r.course_id
  left join public.course_discussion_posts p on p.id=r.story_id
  where private.messaging_account_available(r.author_id)
    and private.market_lost_visible(r.publication,p.created_at,p.processing_status,p.lost_found_resolved_at,r.publication_delay_hours)
    and (r.story_id is null or (c.course_status='active' and p.course_id=c.id
      and p.post_status='published' and p.moderation_hidden_at is null
      and p.author_user_id=r.author_id and p.category='lost' and p.lost_found_kind='lost'));
$$;

create or replace function private.market_lost_publish(p_course_key text,p_post_key text,p_version integer,p_request_id uuid,p_input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
<<draft>>
declare
  a uuid:=private.community_assert_active_actor();
  c public.courses%rowtype;
  p public.course_discussion_posts%rowtype;
  r private.market_lost_reports%rowtype;
  item text:=btrim(coalesce(p_input->>'item',''));
  brand text:=btrim(coalesce(p_input->>'brand',''));
  model text:=btrim(coalesce(p_input->>'model',''));
  color text:=btrim(coalesce(p_input->>'color',''));
  features text:=btrim(coalesce(p_input->>'features',''));
  region text:=btrim(coalesce(p_input->>'region',''));
  place text:=btrim(coalesce(p_input->>'place',''));
  cat text:=p_input->>'category';
  d date;
  ids uuid[];
  prior jsonb;
  story jsonb;
begin
  if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object'
     or p_input->'confirmed' is distinct from 'true'::jsonb then
    raise exception '장터에 공개할 내용을 확인해 주세요.' using errcode='22023';
  end if;
  if p_course_key is not null then
    select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
    if not found then raise exception '공개 구장을 선택해 주세요.' using errcode='P0002'; end if;
    region:=c.region;
  end if;
  if p_post_key is not null then
    select * into p from public.course_discussion_posts
      where course_id=c.id and post_key=p_post_key for update;
    if not found or p.author_user_id is distinct from a or p.category<>'lost'
      or p.lost_found_kind='found' or p.post_status<>'published' or p.moderation_hidden_at is not null then
      raise exception '본인이 작성한 공개 분실 신고만 장터에 표시할 수 있습니다.' using errcode='42501';
    end if;
    select * into r from private.market_lost_reports where story_id=p.id;
    if found then
      if private.market_lost_visible(r.publication,p.created_at,p.processing_status,p.lost_found_resolved_at,r.publication_delay_hours) then
        return r.id;
      end if;
      raise exception '이 신고는 아직 장터에 공개되지 않았습니다. 구장 글에서 장터 공개 설정을 확인해 주세요.' using errcode='22023';
    end if;
    if p.processing_status='resolved' then
      raise exception '찾음 완료된 신고는 장터에 새로 공개할 수 없습니다.' using errcode='22023';
    end if;
    if p.lost_found_kind is null and p_input->'legacy_lost' is distinct from 'true'::jsonb then
      raise exception '기존 글이 분실 신고인지 확인해 주세요.' using errcode='22023';
    end if;
    if p.version is distinct from p_version then
      raise exception '원본 글이 바뀌었습니다. 새로고침 후 공개 내용을 확인해 주세요.' using errcode='PT409';
    end if;
  end if;

  if coalesce(p_input->>'lost_on','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '분실일을 확인해 주세요.' using errcode='22023';
  end if;
  d:=(p_input->>'lost_on')::date;
  if d>(now() at time zone 'Asia/Seoul')::date or cat is null or cat not in ('club','ball','bag','apparel','shoes','practice','other')
     or char_length(item) not between 2 and 100 or char_length(features) not between 10 and 600
     or greatest(char_length(brand),char_length(model),char_length(color))>80 or char_length(place)>160
     or (c.id is null and (region not in ('서울','경기','인천','충청','강원','전라','경상','제주') or char_length(place)<2)) then
    raise exception '품목·분실일·공개 특징과 지역 및 장소를 확인해 주세요.' using errcode='22023';
  end if;
  if concat_ws(' ',item,brand,model,color,place,features) ~* '(@|[0-9]{2,3}[ .-]?[0-9]{3,4}[ .-]?[0-9]{4}|(일련번호|이름표|연락처|serial|s/n)[[:space:]]*[:：=])' then
    raise exception '공개 내용에서 연락처와 소유 확인 정보를 빼 주세요.' using errcode='22023';
  end if;
  if jsonb_typeof(p_input->'photos') is distinct from 'array' then
    raise exception '공개 사진을 확인해 주세요.' using errcode='22023';
  end if;
  select coalesce(array_agg(value::uuid order by ordinality),'{}') into ids
    from jsonb_array_elements_text(p_input->'photos') with ordinality;
  if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then
    raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pul.market_lost:'||a::text,0));
  prior:=private.course_claim_request(a,p_request_id,'course.market_lost_publish',
    jsonb_build_object('course',p_course_key,'post',p_post_key,'input',p_input));
  if prior is not null then return (prior->>'id')::uuid; end if;

  if p.id is null then
    select x.* into r from private.market_lost_reports x
    left join public.course_discussion_posts origin on origin.id=x.story_id
    where x.author_id=a and x.created_at>now()-interval '10 minutes'
      and private.market_lost_visible(x.publication,origin.created_at,origin.processing_status,origin.lost_found_resolved_at,x.publication_delay_hours)
      and (x.story_id is null or origin.post_status='published' and origin.moderation_hidden_at is null)
      and (x.course_id,x.category,x.item,x.brand,x.model,x.color,x.place,x.lost_on,x.features,x.region)
          is not distinct from (c.id,cat,draft.item,draft.brand,draft.model,draft.color,draft.place,d,draft.features,draft.region)
    order by x.created_at desc limit 1;
    if found then
      perform private.course_complete_request(a,p_request_id,jsonb_build_object('id',r.id));
      return r.id;
    end if;
  end if;

  perform id from private.course_story_images where id=any(ids) order by id for update;
  if (select count(*) from private.course_story_images i where i.id=any(ids) and i.ready and i.owner_id=a and (
       p.id is not null and (i.course_id=c.id and i.post_id=p.id or i.course_id is null and i.post_id is null)
       or p.id is null and i.course_id is not distinct from c.id and i.post_id is null))<>cardinality(ids) then
    raise exception '본인이 올린 공개 대상 사진만 선택해 주세요.' using errcode='42501';
  end if;

  if p.id is null and c.id is not null then
    story:=private.course_story_mutate(c.course_key,null,'save',0,gen_random_uuid(),jsonb_build_object(
      'category','lost','lost_found_kind','lost','title',item||' 분실 신고',
      'body',private.lost_story_body(c.name,p_input),
      'images',to_jsonb(ids)));
    select * into strict p from public.course_discussion_posts where post_key=story->>'post_key';
  elsif p.id is not null then
    update public.course_discussion_posts set lost_found_kind='lost',processing_status=coalesce(processing_status,'unresolved'),
      version=version+1 where id=p.id;
  elsif (select count(*) from private.market_lost_reports x where x.author_id=a and x.created_at>now()-interval '10 minutes')>=5 then
    raise exception '잠시 후 새 분실 신고를 등록해 주세요.' using errcode='22023';
  end if;

  insert into private.market_lost_reports(author_id,story_id,course_id,category,item,brand,model,color,region,place,lost_on,features,photo_ids)
    values(a,p.id,c.id,cat,item,brand,model,color,region,place,d,features,ids) returning * into r;
  perform private.course_complete_request(a,p_request_id,jsonb_build_object('id',r.id));
  return r.id;
end $$;

create or replace function private.configure_course_lost_item(
  p_course_key text, p_post_key text, p_version integer, p_request_id uuid, p_input jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=private.community_assert_active_actor();
  story public.course_discussion_posts%rowtype;
  report private.market_lost_reports%rowtype;
  choice text:=p_input->>'publication';
  delay_hours smallint;
  selected uuid[];
  prior jsonb;
begin
  if p_request_id is null or choice is null or choice not in ('hidden','immediate','scheduled')
    or (choice<>'hidden' and p_input->'confirmed' is distinct from 'true'::jsonb) then
    raise exception '장터 공개 방식과 공개 내용을 확인해 주세요.' using errcode='22023';
  end if;
  if p_input ? 'publication_delay_hours' and (
    jsonb_typeof(p_input->'publication_delay_hours') is distinct from 'number'
    or p_input->>'publication_delay_hours' not in ('24','36','48')
  ) then
    raise exception '예약 공개 시간은 24시간, 36시간, 48시간 중에서 선택해 주세요.' using errcode='22023';
  end if;
  select p.* into story from public.course_discussion_posts p join public.courses c on c.id=p.course_id
    where c.course_key=p_course_key and c.course_status='active' and c.course_type='field' and p.post_key=p_post_key
    for update of p;
  if not found or story.author_user_id is distinct from actor or story.category<>'lost'
    or story.lost_found_kind='found' or story.post_status<>'published' or story.moderation_hidden_at is not null then
    raise exception '본인이 작성한 공개 분실 신고만 설정할 수 있습니다.' using errcode='42501';
  end if;
  prior:=private.course_claim_request(actor,p_request_id,'course.lost_publication',
    jsonb_build_object('course',p_course_key,'post',p_post_key,'version',p_version,'input',p_input));
  if prior is not null then return (prior->>'id')::uuid; end if;
  if story.version is distinct from p_version then
    raise exception '글이 바뀌었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='PT409';
  end if;
  if story.processing_status='resolved' and choice<>'hidden' then
    raise exception '찾음 완료된 신고는 장터에 새로 공개할 수 없습니다.' using errcode='22023';
  end if;

  select r.* into report from private.market_lost_reports r where r.story_id=story.id;
  delay_hours:=coalesce(case when choice='scheduled' then (p_input->>'publication_delay_hours')::smallint end,
    report.publication_delay_hours,48);
  if report.id is null then
    report.id:=private.market_lost_publish(p_course_key,p_post_key,p_version,gen_random_uuid(),
      p_input || jsonb_build_object('confirmed',true) ||
        case when choice='hidden' then jsonb_build_object('photos','[]'::jsonb) else '{}'::jsonb end);
    update private.market_lost_reports set publication=choice, publication_delay_hours=delay_hours where id=report.id;
  else
    selected:=report.photo_ids;
    if choice<>'hidden' then
      if jsonb_typeof(p_input->'photos') is distinct from 'array' then
        raise exception '공개 사진을 확인해 주세요.' using errcode='22023';
      end if;
      select coalesce(array_agg(value::uuid order by ordinality),'{}') into selected
        from jsonb_array_elements_text(p_input->'photos') with ordinality;
      if cardinality(selected)>5 or cardinality(selected)<>(select count(distinct x) from unnest(selected)x) then
        raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';
      end if;
      if (select count(*) from private.course_story_images i where i.id=any(selected)
        and i.ready and i.owner_id=actor and (
          i.course_id=story.course_id and i.post_id=story.id or i.course_id is null and i.post_id is null
        ))<>cardinality(selected) then
        raise exception '본인이 올린 공개 대상 사진만 선택해 주세요.' using errcode='42501';
      end if;
    end if;
    update private.market_lost_reports set publication=choice, publication_delay_hours=delay_hours, photo_ids=selected where id=report.id;
    update public.course_discussion_posts set version=version+1 where id=story.id;
  end if;
  perform private.course_complete_request(actor,p_request_id,jsonb_build_object('id',report.id));
  return report.id;
end $$;

create or replace function private.course_story_json(p public.course_discussion_posts)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'post_key',p.post_key,'title',p.title,'body',p.body,
    'author_display_name',private.read_posting_name_snapshot(p.posted_as,p.author_user_id,p.posted_name_generation),
    'created_at',p.created_at,'category',p.category,'lost_found_kind',p.lost_found_kind,
    'market_lost_id',(select r.id from private.market_lost_reports r where r.story_id=p.id
      and p.post_status='published' and p.moderation_hidden_at is null
      and private.market_lost_visible(r.publication,p.created_at,p.processing_status,p.lost_found_resolved_at,r.publication_delay_hours)),
    'lost_details',(select jsonb_build_object('item',r.item,'category',r.category,'lost_on',r.lost_on,
      'place',r.place,'features',r.features) from private.market_lost_reports r where r.story_id=p.id),
    'lost_settings',case when p.author_user_id=auth.uid() then (
      select jsonb_build_object('report_id',r.id,'publication',r.publication,'publication_delay_hours',r.publication_delay_hours,
        'publish_at',p.created_at + make_interval(hours => r.publication_delay_hours),
        'photos',coalesce((select jsonb_agg(i.id order by array_position(r.photo_ids,i.id))
          from private.course_story_images i where i.id=any(r.photo_ids) and private.market_lost_photo_allowed(r,i)),'[]'::jsonb))
      from private.market_lost_reports r where r.story_id=p.id
    ) end,
    'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_at',p.pinned_at,
    'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id)
      and not exists(select 1 from public.messaging_blocks b where
        (b.blocker_user_id,b.blocked_user_id) in ((auth.uid(),p.author_user_id),(p.author_user_id,auth.uid()))),
    'can_edit',coalesce(p.author_user_id=auth.uid(),false),'can_manage',private.course_can_manage(p.course_id),
    'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position)
      from private.course_story_images where post_id=p.id and ready),'[]'),
    'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden
      and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden)))
  );
$$;

drop function private.market_lost_visible(text,timestamptz,text,timestamptz);

commit;
