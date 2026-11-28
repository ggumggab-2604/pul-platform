begin;

alter table public.course_discussion_posts
  add column lost_found_kind text check (lost_found_kind is null or (category='lost' and lost_found_kind in ('lost','found'))),
  add column lost_found_resolved_at timestamptz;

create table private.market_lost_reports (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.user_accounts(id) on delete cascade,
  story_id uuid unique references public.course_discussion_posts(id) on delete cascade,
  course_id uuid references public.courses(id),
  category text not null check (category in ('club','ball','bag','apparel','shoes','practice','other')),
  item text not null check (char_length(item) between 2 and 100),
  brand text not null check (char_length(brand)<=80),
  model text not null check (char_length(model)<=80),
  color text not null check (char_length(color)<=80),
  region text not null check (char_length(region) between 2 and 40),
  place text not null check (char_length(place)<=160),
  lost_on date not null,
  features text not null check (char_length(features) between 10 and 600),
  photo_ids uuid[] not null check (cardinality(photo_ids)<=5),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((story_id is null and course_id is null and char_length(place)>=2) or
         (story_id is not null and course_id is not null and resolved_at is null))
);

alter table private.market_lost_reports enable row level security;
alter table private.market_lost_reports force row level security;
revoke all on table private.market_lost_reports from public,anon,authenticated,service_role;
create index market_lost_reports_author_idx on private.market_lost_reports(author_id, created_at desc);
create index market_lost_reports_browse_idx on private.market_lost_reports(lost_on desc, id desc);

-- A market-only draft uses the same private bucket, byte validation and upload receipt.
alter table private.course_story_images alter column course_id drop not null;

create function private.market_lost_public()
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
    and (r.story_id is null or (c.course_status='active' and p.course_id=c.id
      and p.post_status='published' and p.moderation_hidden_at is null
      and p.author_user_id=r.author_id and p.category='lost' and p.lost_found_kind='lost'));
$$;

create function private.market_lost_photo_allowed(r private.market_lost_reports,i private.course_story_images)
returns boolean language sql immutable set search_path='' as $$
  select i.ready and i.owner_id=r.author_id and i.id=any(r.photo_ids)
    and (i.course_id is null and i.post_id is null or
         i.course_id=r.course_id and i.post_id=r.story_id);
$$;

create function private.market_lost_read(p_id uuid,p_filters jsonb,p_offset integer)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',(b.report).id,'category',(b.report).category,'item',(b.report).item,
    'brand',(b.report).brand,'model',(b.report).model,'color',(b.report).color,
    'region',(b.report).region,'place',(b.report).place,'lost_on',(b.report).lost_on,
    'features',(b.report).features,'created_at',(b.report).created_at,
    'course_key',b.course_key,'course_name',b.course_name,'post_key',b.post_key,
    'resolved',b.resolved,'handled_at',b.handled_at,'mine',(b.report).author_id is not distinct from auth.uid(),
    'can_message', (b.report).author_id is distinct from auth.uid() and not exists (
      select 1 from public.messaging_blocks where (blocker_user_id,blocked_user_id) in
        ((auth.uid(),(b.report).author_id),((b.report).author_id,auth.uid()))),
    'photos',case when p_id is not null then coalesce((
      select jsonb_agg(image.id order by array_position((b.report).photo_ids,image.id))
      from private.course_story_images image where image.id=any((b.report).photo_ids)
        and private.market_lost_photo_allowed(b.report,image)),'[]'::jsonb) else '[]'::jsonb end
  ) order by (b.report).lost_on desc,(b.report).id desc),'[]'::jsonb)
  from (
    select v.* from private.market_lost_public() v
    where case when p_id is not null then (v.report).id=p_id else (
      (not v.resolved or p_filters->>'scope'='mine') and
      (coalesce(p_filters->>'scope','')<>'mine' or (v.report).author_id=auth.uid()) and
      (coalesce(p_filters->>'category','')='' or (v.report).category=p_filters->>'category') and
      (coalesce(p_filters->>'region','')='' or (v.report).region=p_filters->>'region') and
      (coalesce(p_filters->>'course','')='' or strpos(lower(coalesce(v.course_name,'')),lower(left(p_filters->>'course',100)))>0) and
      (coalesce(p_filters->>'from','')='' or (v.report).lost_on>=nullif(p_filters->>'from','')::date) and
      (coalesce(p_filters->>'to','')='' or (v.report).lost_on<=nullif(p_filters->>'to','')::date) and
      not exists (
        select 1 from regexp_split_to_table(trim(left(coalesce(p_filters->>'q',''),100)), '\s+') token
        where strpos(lower(concat_ws(' ',(v.report).item,(v.report).brand,(v.report).model,(v.report).color,(v.report).features)),lower(token))=0
      ) and not exists (
        select 1 from unnest(array['brand','model','color']) key
        where coalesce(p_filters->>key,'')<>'' and strpos(lower(concat_ws(' ',
          case key when 'brand' then (v.report).brand when 'model' then (v.report).model else (v.report).color end,
          (v.report).features,(v.report).item)),lower(left(p_filters->>key,80)))=0
      )
    ) end
    order by (v.report).lost_on desc,(v.report).id desc
    limit 21 offset greatest(0,least(coalesce(p_offset,0),20000))
  ) b;
$$;

create function private.market_lost_publish(p_course_key text,p_post_key text,p_version integer,p_request_id uuid,p_input jsonb)
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
    if found then return r.id; end if;
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
      'body',concat_ws(E'\n',d::text||' 분실',c.name,nullif(place,''),nullif(concat_ws(' ',nullif(brand,''),nullif(model,''),nullif(color,'')),''),features),
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

create function private.market_lost_complete(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid:=private.community_assert_active_actor(); r private.market_lost_reports%rowtype;
begin
  select (v.report).* into r from private.market_lost_public() v where (v.report).id=p_id and (v.report).author_id=a;
  if not found then raise exception '본인의 공개 분실 신고만 완료할 수 있습니다.' using errcode='42501'; end if;
  if r.story_id is null then
    update private.market_lost_reports set resolved_at=now() where id=r.id and resolved_at is null;
  else
    perform id from public.courses where id=r.course_id and course_status='active' for share;
    if not found then raise exception '공개 구장을 확인해 주세요.' using errcode='42501'; end if;
    perform private.market_lost_complete_story(r.story_id,a);
  end if;
end $$;

create function private.market_lost_complete_story(p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.course_discussion_posts%rowtype;
begin
  select * into p from public.course_discussion_posts where id=p_id for update;
  if not found or p.author_user_id is distinct from p_actor or p.category<>'lost'
    or p.lost_found_kind is distinct from 'lost' or p.post_status<>'published' or p.moderation_hidden_at is not null then
    raise exception '본인의 공개 분실 신고만 완료할 수 있습니다.' using errcode='42501';
  end if;
  if p.processing_status is distinct from 'resolved' then
    update public.course_discussion_posts set processing_status='resolved',lost_found_resolved_at=now(),version=version+1 where id=p.id;
  end if;
end $$;

create function private.market_lost_photo_read(p_id uuid,p_photo uuid)
returns text language sql stable security definer set search_path='' as $$
  select i.mime_type from private.market_lost_public() v
  join private.course_story_images i on i.id=p_photo and private.market_lost_photo_allowed(v.report,i)
  where (v.report).id=p_id;
$$;

create function private.market_lost_recipient(p_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor(); r private.market_lost_reports%rowtype;
begin
  select (v.report).* into r from private.market_lost_public() v where (v.report).id=p_id;
  if not found or r.author_id=a or exists (
    select 1 from public.messaging_blocks where (blocker_user_id,blocked_user_id) in ((a,r.author_id),(r.author_id,a))
  ) then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return r.author_id;
end $$;

create function private.market_lost_message_send(p_id uuid,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor(); r private.market_lost_reports%rowtype; result jsonb;
begin
  perform private.messaging_assert_read_committed();
  perform pg_advisory_xact_lock(1297303345,hashtext(a::text));
  result:=private.course_claim_request(a,p_request_id,'course.market_lost_message',jsonb_build_object('id',p_id,'body',p_body));
  if result is not null then return result; end if;
  select * into r from private.market_lost_reports where id=p_id for share;
  if r.course_id is not null then perform id from public.courses where id=r.course_id for share; end if;
  if r.story_id is not null then perform id from public.course_discussion_posts where id=r.story_id for share; end if;
  result:=private.messaging_create(private.market_lost_recipient(p_id),null,p_body,p_request_id);
  perform private.course_complete_request(a,p_request_id,result);
  return result;
end $$;

create function public.market_lost_read(p_id uuid,p_filters jsonb,p_offset integer) returns jsonb
language sql stable security definer set search_path='' as $$select private.market_lost_read(p_id,p_filters,p_offset)$$;
create function public.market_lost_publish(p_course_key text,p_post_key text,p_version integer,p_request_id uuid,p_input jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if p_post_key is not null and not exists (select 1 from public.courses where course_key=p_course_key and course_status='active' and course_type='field' for share) then
    raise exception '야외 구장 이야기방의 공개 분실 글만 연결할 수 있습니다.' using errcode='42501';
  end if;
  return private.market_lost_publish(p_course_key,p_post_key,p_version,p_request_id,p_input);
end $$;
create function public.market_lost_complete(p_id uuid) returns void
language sql security definer set search_path='' as $$select private.market_lost_complete(p_id)$$;
create function public.market_lost_photo_read(p_id uuid,p_photo uuid) returns text
language sql stable security definer set search_path='' as $$select private.market_lost_photo_read(p_id,p_photo)$$;
create function public.market_lost_message_context(p_id uuid) returns text
language sql security definer set search_path='' as $$select private.messaging_counterpart_name(private.market_lost_recipient(p_id))$$;
create function public.market_lost_message_send(p_id uuid,p_body text,p_request_id uuid) returns jsonb
language sql security definer set search_path='' as $$select private.market_lost_message_send(p_id,p_body,p_request_id)$$;

revoke all on function private.market_lost_public(),private.market_lost_photo_allowed(private.market_lost_reports,private.course_story_images),
  private.market_lost_read(uuid,jsonb,integer),private.market_lost_publish(text,text,integer,uuid,jsonb),private.market_lost_complete(uuid),
  private.market_lost_complete_story(uuid,uuid),private.market_lost_photo_read(uuid,uuid),private.market_lost_recipient(uuid),
  private.market_lost_message_send(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.market_lost_read(uuid,jsonb,integer),public.market_lost_photo_read(uuid,uuid),
  public.market_lost_publish(text,text,integer,uuid,jsonb),public.market_lost_complete(uuid),
  public.market_lost_message_context(uuid),public.market_lost_message_send(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.market_lost_read(uuid,jsonb,integer),public.market_lost_photo_read(uuid,uuid) to anon,authenticated;
grant execute on function public.market_lost_publish(text,text,integer,uuid,jsonb),public.market_lost_complete(uuid),
  public.market_lost_message_context(uuid),public.market_lost_message_send(uuid,text,uuid) to authenticated;

-- The marketplace can create a screen report internally. The public story RPC stays field-only.
create or replace function public.course_story_mutate(p_course_key text,p_post_key text,p_action text,p_version integer,p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform id from public.courses where course_key=p_course_key and course_status='active' and course_type='field' for share;
  if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
  return private.course_story_mutate(p_course_key,p_post_key,p_action,p_version,p_request_id,p_input);
end $$;

CREATE OR REPLACE FUNCTION private.course_story_mutate(p_course_key text, p_post_key text, p_action text, p_version integer, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.community_assert_active_actor();c public.courses%rowtype;p public.course_discussion_posts%rowtype;cm private.course_story_comments%rowtype;manager boolean;result jsonb;ids uuid[];cat text;state text;cid uuid;parent uuid;kind text;linked boolean;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action is null or p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 manager:=private.course_can_manage(c.id,a);if p_action='save' and coalesce((p_input->>'pin')::boolean,false) then perform private.course_require_scope(c.id);end if;
 if p_post_key is not null then select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id for update;if not found then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
 linked:=exists(select 1 from private.market_lost_reports where story_id=p.id);
 if c.course_type='screen' and (p.id is not null and p.category<>'lost' or p_action='save' and (p_input->>'category') is distinct from 'lost') then
  raise exception '이 구장에서 지원하는 이야기 분류를 선택해 주세요.' using errcode='P0002';
 end if;
 if p_action='status' and linked then raise exception '장터에 연결된 분실 신고는 작성자만 찾음 완료로 변경할 수 있습니다.' using errcode='42501'; end if;
 if p_action='lost_report_complete' then
  perform private.market_lost_complete_story(p.id,a);
  return jsonb_build_object('post_key',p.post_key,'version',(select version from public.course_discussion_posts where id=p.id));
 end if;
 if p_action in ('hide','unhide','pin','status','report_resolve') then perform private.course_require_scope(c.id);end if;
 if p_action in ('save','delete') and p.id is not null and p.author_user_id is distinct from a then raise exception '본인 글만 수정·삭제할 수 있습니다.' using errcode='42501';end if;
 if p_action<>'save' and p.id is null then raise exception '글을 확인해 주세요.' using errcode='22023';end if;
 if p_action not in ('unhide','report_resolve') and p.id is not null and (p.post_status<>'published' or p.moderation_hidden_at is not null) then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action='unhide' and not private.course_actor_has_permission(a,'courses.manage') then raise exception '숨김 해제 권한이 없습니다.' using errcode='42501';end if;
 result:=private.course_claim_request(a,p_request_id,'course.story_'||p_action,jsonb_build_object('course',c.id,'key',p_post_key,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if p_action in ('save','delete','hide','unhide','pin','status') and p.id is not null and p.version is distinct from p_version then raise exception '글이 변경되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 if p_action='save' then
  cat:=p_input->>'category';if cat is null or cat not in ('free','question','lost') or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'body',''))) not between 10 and 1000 or jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '제목 2~120자·본문 10~1000자·분류를 확인해 주세요.' using errcode='22023';end if;
  kind:=case when cat='lost' then coalesce(nullif(p_input->>'lost_found_kind',''),p.lost_found_kind) end;
  -- Older forms omit the key and can still save an unclassified story.
  if (kind is not null and kind not in ('lost','found'))
    or (cat='lost' and p.category is distinct from 'lost' and kind is null and p_input ? 'lost_found_kind')
    or (p.lost_found_kind is not null and (cat<>'lost' or kind is distinct from p.lost_found_kind)) then
    raise exception '신고 유형을 확인해 주세요. 확정된 신고 유형은 변경할 수 없습니다.' using errcode='22023';
  end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
  if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';end if;
  perform id from private.course_story_images where id=any(ids) order by id for update;
  if (select count(*) from private.course_story_images where id=any(ids) and owner_id=a and course_id=c.id and ready and (post_id is null or post_id=p.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 사진만 연결할 수 있습니다.' using errcode='42501';end if;
  state:=case when cat='question' then 'received' when cat='lost' then 'unresolved' end;
  if p.id is null then perform private.check_public_create_limit('course_discussion',btrim(p_input->>'body'));insert into public.course_discussion_posts(course_id,author_user_id,title,body,category,processing_status,lost_found_kind) values(c.id,a,btrim(p_input->>'title'),btrim(p_input->>'body'),cat,state,kind) returning * into p;
  else update public.course_discussion_posts set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),category=cat,lost_found_kind=kind,processing_status=case when cat=category then processing_status else state end,version=version+1 where id=p.id returning * into p;end if;
  update private.course_story_images set post_id=null,position=null where post_id=p.id and not(id=any(ids));update private.course_story_images set post_id=p.id,position=array_position(ids,id) where id=any(ids);
  if coalesce((p_input->>'pin')::boolean,false) then update public.course_discussion_posts set pinned=true,pinned_by=a,pinned_at=now() where id=p.id returning * into p;end if;
 elsif p_action in ('delete','hide','unhide') then
  if p_action='unhide' and (p.post_status<>'hidden' or p.moderation_hidden_at is null) then raise exception '숨김 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set post_status=case when p_action='delete' then 'removed' when p_action='hide' then 'hidden' else 'published' end,removed_at=case when p_action='delete' then now() end,moderation_hidden_at=case when p_action='hide' then now() end,moderation_version=moderation_version+case when p_action='delete' then 0 else 1 end,version=version+1,pinned=false where id=p.id returning * into p;
 elsif p_action='pin' then
  if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '공지 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set pinned=(p_input->>'enabled')::boolean,pinned_by=a,pinned_at=now(),version=version+1 where id=p.id returning * into p;
 elsif p_action='status' then
  state:=p_input->>'status';if state is null or p.category='free' or p.category='question' and state not in ('received','processing','done') or p.category='lost' and state not in ('unresolved','resolved') then raise exception '이 분류의 처리 상태를 확인해 주세요.' using errcode='22023';end if;
  update public.course_discussion_posts set processing_status=state,lost_found_resolved_at=case when p.category='lost' and state='resolved' then coalesce(p.lost_found_resolved_at,now()) end,version=version+1 where id=p.id returning * into p;
 elsif p_action='comment' then
  parent:=nullif(p_input->>'parent_id','')::uuid;
  if char_length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1000 then raise exception '댓글은 1~1000자로 입력해 주세요.' using errcode='22023';end if;
  if parent is not null then perform id from private.course_story_comments where id=parent and post_id=p.id and parent_id is null and not hidden for share;if not found then raise exception '이 글의 공개 댓글에만 답글을 달 수 있습니다.' using errcode='22023';end if;end if;
  insert into private.course_story_comments(post_id,parent_id,author_id,body) values(p.id,parent,a,btrim(p_input->>'body'));
 elsif p_action in ('comment_hide','comment_delete') then
  select * into cm from private.course_story_comments where id=(p_input->>'comment_id')::uuid and post_id=p.id for update;if not found then raise exception '댓글을 찾을 수 없습니다.' using errcode='P0002';end if;
  if p_action='comment_hide' then perform private.course_require_scope(c.id);elsif cm.author_id is distinct from a then raise exception '본인 댓글만 삭제할 수 있습니다.' using errcode='42501';end if;
  update private.course_story_comments set hidden=true where id=cm.id;
 elsif p_action='report' then
  cid:=nullif(p_input->>'comment_id','')::uuid;
  if cid is not null then select * into cm from private.course_story_comments where id=cid and post_id=p.id and not hidden;if not found or cm.parent_id is not null and exists(select 1 from private.course_story_comments where id=cm.parent_id and hidden) then raise exception '공개 댓글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
  if (cid is not null and cm.author_id is not distinct from a or cid is null and p.author_user_id is not distinct from a) or char_length(btrim(coalesce(p_input->>'reason',''))) not between 2 and 1000 then raise exception '신고 대상·사유를 확인해 주세요.' using errcode='22023';end if;
  insert into private.course_story_reports(post_id,comment_id,reporter_id,reason) values(p.id,cid,a,btrim(p_input->>'reason'));
 elsif p_action='report_resolve' then update private.course_story_reports set resolved=true where id=(p_input->>'report_id')::uuid and post_id=p.id;if not found then raise exception '신고를 찾을 수 없습니다.' using errcode='P0002';end if;
 else raise exception '작업을 확인해 주세요.' using errcode='22023';end if;
 result:=jsonb_build_object('post_key',p.post_key,'version',p.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$;

CREATE OR REPLACE FUNCTION private.course_story_json(p public.course_discussion_posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.read_posting_name_snapshot(p.posted_as, p.author_user_id, p.posted_name_generation),'created_at',p.created_at,
 'category',p.category,'lost_found_kind',p.lost_found_kind,
 'market_lost_id',(select id from private.market_lost_reports where story_id=p.id),'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_at',p.pinned_at,
 'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id) and not exists(select 1 from public.messaging_blocks b where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.author_user_id)or(b.blocker_user_id=p.author_user_id and b.blocked_user_id=auth.uid())),
 'can_edit',coalesce(p.author_user_id=auth.uid(),false),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$function$;

create or replace function private.course_story_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_mime text,p_bytes integer,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid;i private.course_story_images%rowtype;
begin
 if not private.messaging_account_available(p_actor) then raise exception '정상 회원 인증이 필요합니다.' using errcode='42501';end if;
 if p_course_key is not null then select id into c from public.courses where course_key=p_course_key and course_status='active';if c is null then raise exception '야외 구장을 확인해 주세요.' using errcode='P0002';end if;end if;
 insert into private.course_story_images(course_id,owner_id,request_id,mime_type,byte_size,content_hash) values(c,p_actor,p_request_id,p_mime,p_bytes,p_hash) on conflict(owner_id,request_id) do nothing;
 select * into i from private.course_story_images where owner_id=p_actor and request_id=p_request_id for update;
 if i.course_id is distinct from c or i.mime_type<>p_mime or i.byte_size<>p_bytes or i.content_hash<>p_hash then raise exception '동일 요청의 파일 내용이 다릅니다.' using errcode='22023';end if;
 return jsonb_build_object('id',i.id,'ready',i.ready);
end $$;

create or replace function private.send_message_with_photos(p_kind text,p_target_id uuid,p_body text,p_request_id uuid,p_draft_id uuid,p_photo_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); payload jsonb; prior private.messaging_photo_requests%rowtype;
 story_key text; course_key text; result jsonb; sent_id uuid; asset_id uuid; a public.messaging_photo_assets%rowtype;
begin
 perform private.messaging_assert_read_committed();
 if p_kind='story' then perform private.course_next_lock();end if;
 if p_kind is null or p_kind not in ('direct','reply','listing','buy_request','vendor','store','story','lost_item')
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
 if p_kind='story' then
 select p.post_key,c.course_key into story_key,course_key from public.course_discussion_posts p join public.courses c on c.id=p.course_id where p.id=p_target_id;
 if story_key is null then raise exception 'messaging_not_found' using errcode='P0002';end if;
 end if;
 case p_kind
 when 'lost_item' then result:=private.market_lost_message_send(p_target_id,p_body,p_request_id);
 when 'story' then result:=private.course_story_message_send(course_key,story_key,p_body,p_request_id);
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

create function public.market_lost_courses() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('course_key',course_key,'name',name,'region',region,'city',city)
    order by region,city,name,course_key),'[]'::jsonb)
  from public.courses where course_status='active';
$$;
revoke all on function public.market_lost_courses() from public,anon,authenticated,service_role;
grant execute on function public.market_lost_courses() to authenticated;

commit;

