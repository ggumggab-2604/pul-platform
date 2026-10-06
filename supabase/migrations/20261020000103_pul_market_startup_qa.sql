-- Independent 3A candidate. Requires existing AS foundation and final 2 vendor candidate.
-- Not a migration; no existing function/table/policy is replaced.
begin;
create table public.startup_qa_questions(
 id uuid primary key, author_id uuid not null references auth.users(id),
 category text not null check(category in ('space','equipment','cost','operation','experience')),
 title text not null check(char_length(btrim(title))>0 and char_length(title)<=120),
 body text not null check(char_length(btrim(body))>0 and char_length(body)<=5000),
 deleted boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.startup_qa_answers(
 id uuid primary key, question_id uuid not null references public.startup_qa_questions(id),
 author_id uuid not null references auth.users(id), body text not null check(char_length(btrim(body))>0 and char_length(body)<=5000),
 deleted boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.startup_qa_bookmarks(
 user_id uuid not null references auth.users(id), question_id uuid not null references public.startup_qa_questions(id),
 created_at timestamptz not null default now(),primary key(user_id,question_id)
);
create table private.startup_qa_requests(
 actor_id uuid not null, request_id uuid not null,input jsonb not null,result jsonb not null,primary key(actor_id,request_id)
);
create index startup_qa_questions_public on public.startup_qa_questions(created_at desc,id) where not deleted;
create index startup_qa_questions_category on public.startup_qa_questions(category,created_at desc,id) where not deleted;
create index startup_qa_answers_public on public.startup_qa_answers(question_id,created_at,id) where not deleted;
alter table public.startup_qa_questions enable row level security;
alter table public.startup_qa_answers enable row level security;
alter table public.startup_qa_bookmarks enable row level security;
alter table private.startup_qa_requests enable row level security;
-- Deny direct Data API access: all writes/read projections go through guarded RPCs.
revoke all on public.startup_qa_questions,public.startup_qa_answers,public.startup_qa_bookmarks,private.startup_qa_requests from public,anon,authenticated,service_role;

create function private.startup_qa_question_json(q public.startup_qa_questions) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when not q.deleted and private.messaging_account_available(q.author_id) then
 jsonb_build_object('id',q.id,'category',q.category,'title',q.title,'body',q.body,
 'author',private.market_actor_display_name(q.author_id,auth.uid()),'mine',coalesce(q.author_id=auth.uid(),false),
 'version',q.version,'createdAt',q.created_at,'updatedAt',q.updated_at,
 'answerCount',(select count(*) from public.startup_qa_answers a where a.question_id=q.id and not a.deleted and private.messaging_account_available(a.author_id)),
 'lastAnswerAt',(select max(a.created_at) from public.startup_qa_answers a where a.question_id=q.id and not a.deleted and private.messaging_account_available(a.author_id))) end;
$$;
create function private.list_startup_qa_questions(p_query text,p_category text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_query is null or char_length(p_query)>100 or p_category is null or p_category not in ('','space','equipment','cost','operation','experience')
 or p_offset is null or p_offset not between 0 and 10000 then raise exception 'qa_invalid'; end if;
 select coalesce(jsonb_agg(x.value order by x.created_at desc,x.id),'[]') into result from (
 select private.startup_qa_question_json(q) as value,q.created_at,q.id from public.startup_qa_questions q
 where not q.deleted and private.messaging_account_available(q.author_id)
 and (p_category='' or q.category=p_category)
 and (p_query='' or position(lower(p_query) in lower(q.title||' '||q.body))>0)
 order by q.created_at desc,q.id limit 13 offset p_offset) x;
 return jsonb_build_object('items',case when jsonb_array_length(result)>12 then result-12 else result end,
 'hasMore',jsonb_array_length(result)>12,'detail',null,'answers','[]'::jsonb,'answerHasMore',false);
end $$;
create function private.get_startup_qa_question(p_id uuid,p_answer_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare detail jsonb; answers jsonb;
begin
 if p_answer_offset is null or p_answer_offset not between 0 and 10000 then raise exception 'qa_invalid'; end if;
 select private.startup_qa_question_json(q) into detail from public.startup_qa_questions q where q.id=p_id;
 if detail is not null then
 select coalesce(jsonb_agg(x.value order by x.created_at,x.id),'[]') into answers from (
  select a.created_at,a.id,jsonb_build_object('id',a.id,'questionId',a.question_id,'body',a.body,
   'author',private.market_actor_display_name(a.author_id,auth.uid()),'mine',coalesce(a.author_id=auth.uid(),false),
   'version',a.version,'createdAt',a.created_at,'updatedAt',a.updated_at,
   'vendor',case when private.vendor_public(v) is not null then jsonb_build_object('id',v.id,'name',v.approved->>'name') end) as value
  from public.startup_qa_answers a left join public.market_vendors v on v.owner_id=a.author_id
  where a.question_id=p_id and not a.deleted and private.messaging_account_available(a.author_id)
  order by a.created_at,a.id limit 21 offset p_answer_offset) x;
 end if;
 answers:=coalesce(answers,'[]'::jsonb);
 return jsonb_build_object('items','[]'::jsonb,'hasMore',false,'detail',detail,
 'answers',case when jsonb_array_length(answers)>20 then answers-20 else answers end,'answerHasMore',jsonb_array_length(answers)>20);
end $$;
create function private.mutate_startup_qa(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor(); rid uuid; item_id uuid; qid uuid;
 kind text; op text; ver integer; q public.startup_qa_questions%rowtype; a public.startup_qa_answers%rowtype;
 previous private.startup_qa_requests%rowtype; result jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in ('target','operation','id','requestId','version','questionId','category','title','body'))
 then raise exception 'qa_invalid'; end if;
 rid:=(p_input->>'requestId')::uuid;item_id:=(p_input->>'id')::uuid;kind:=p_input->>'target';op:=p_input->>'operation';ver:=(p_input->>'version')::integer;
 if rid is null or item_id is null or kind is null or kind not in ('question','answer') or op is null or op not in ('create','update','delete')
 or ver is null or (op='create' and ver<>0) or (op<>'create' and ver<1) then raise exception 'qa_invalid'; end if;
 if op<>'delete' then
  if jsonb_typeof(p_input->'body') is distinct from 'string' or (char_length(btrim(p_input->>'body'))<1 or char_length(p_input->>'body')>5000) then raise exception 'qa_invalid'; end if;
  if kind='question' and (jsonb_typeof(p_input->'title') is distinct from 'string' or (char_length(btrim(p_input->>'title'))<1 or char_length(p_input->>'title')>120) or coalesce(p_input->>'category','') not in ('space','equipment','cost','operation','experience')) then raise exception 'qa_invalid'; end if;
 end if;
 perform pg_advisory_xact_lock(728411,hashtext(actor::text));
 select * into previous from private.startup_qa_requests where actor_id=actor and request_id=rid;
 if found then
  if previous.input<>p_input then raise exception 'qa_conflict'; end if;
  return previous.result;
 end if;
 if kind='question' then
  qid:=item_id;
  if op='create' then
   insert into public.startup_qa_questions(id,author_id,category,title,body) values(item_id,actor,p_input->>'category',p_input->>'title',p_input->>'body');
  else
   select * into q from public.startup_qa_questions where id=item_id for update;
   if not found or q.author_id<>actor or q.deleted then raise exception 'qa_permission' using errcode='42501'; end if;
   if q.version<>ver then raise exception 'qa_conflict'; end if;
   if op='delete' then update public.startup_qa_questions set deleted=true,version=version+1,updated_at=now() where id=item_id;
   else update public.startup_qa_questions set category=p_input->>'category',title=p_input->>'title',body=p_input->>'body',version=version+1,updated_at=now() where id=item_id; end if;
  end if;
 else
  qid:=(p_input->>'questionId')::uuid;
  -- Same question lock serializes answer changes against question hiding.
  select * into q from public.startup_qa_questions where id=qid for update;
  if not found or q.deleted or not private.messaging_account_available(q.author_id) then raise exception 'qa_missing'; end if;
  if op='create' then
   insert into public.startup_qa_answers(id,question_id,author_id,body) values(item_id,qid,actor,p_input->>'body');
  else
   select * into a from public.startup_qa_answers where id=item_id for update;
   if not found or a.author_id<>actor or a.question_id<>qid or a.deleted then raise exception 'qa_permission' using errcode='42501'; end if;
   if a.version<>ver then raise exception 'qa_conflict'; end if;
   if op='delete' then update public.startup_qa_answers set deleted=true,version=version+1,updated_at=now() where id=item_id;
   else update public.startup_qa_answers set body=p_input->>'body',version=version+1,updated_at=now() where id=item_id; end if;
  end if;
 end if;
 result:=jsonb_build_object('id',item_id,'questionId',qid,'deleted',op='delete');
 insert into private.startup_qa_requests values(actor,rid,p_input,result);
 return result;
end $$;
create function private.set_startup_question_interest(p_question_id uuid,p_saved boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader(); item jsonb;
begin
 if p_saved is null then raise exception 'qa_invalid'; end if;
 if p_saved then
  select private.startup_qa_question_json(q) into item from public.startup_qa_questions q where id=p_question_id for share;
  if item is null then raise exception 'qa_missing'; end if;
  insert into public.startup_qa_bookmarks values(actor,p_question_id,now()) on conflict do nothing;
 else delete from public.startup_qa_bookmarks where user_id=actor and question_id=p_question_id; end if;
 return jsonb_build_object('id',p_question_id,'saved',p_saved);
end $$;
create function private.startup_question_interest_state(p_question_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.require_active_lesson_video_bookmark_reader();
begin return exists(select 1 from public.startup_qa_bookmarks where user_id=actor and question_id=p_question_id); end $$;

-- Public invoker wrappers; private definer functions own the guarded table access.
create function public.list_startup_qa_questions(p_query text default '',p_category text default '',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_startup_qa_questions(p_query,p_category,p_offset); $$;
create function public.get_startup_qa_question(p_id uuid,p_answer_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select private.get_startup_qa_question(p_id,p_answer_offset); $$;
create function public.mutate_startup_qa(p_input jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_startup_qa(p_input); $$;
create function public.set_startup_question_interest(p_question_id uuid,p_saved boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_startup_question_interest(p_question_id,p_saved); $$;
create function public.startup_question_interest_state(p_question_id uuid) returns boolean language sql stable security invoker set search_path='' as $$ select private.startup_question_interest_state(p_question_id); $$;
revoke all on function private.startup_qa_question_json(public.startup_qa_questions) from public,anon,authenticated,service_role;


create function private.list_my_interests_v4(p_kind text,p_limit integer,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid; v_items jsonb; v_total integer;
begin
 v_actor:=private.require_active_lesson_video_bookmark_reader();
 if p_kind is null or p_kind not in ('all','market','lesson_video','vendor','startup_question')
    or p_limit is null or p_limit not between 1 and 24 or p_offset is null or p_offset<0 or p_offset>10000 then
   raise exception '관심목록 조회 범위를 확인해 주세요.';
 end if;
 select count(*)::integer into v_total from (
  select 1 from public.market_listing_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all select 1 from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all select 1 from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all select 1 from public.lesson_video_bookmarks where user_id=v_actor and p_kind in ('all','lesson_video')
 ) q;
 with saved as (
  select 'market'::text kind,listing_id id,created_at from public.market_listing_bookmarks
   where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'buy_request',buy_request_id,created_at from public.market_buy_request_bookmarks where user_id=v_actor and p_kind in ('all','market')
  union all
  select 'vendor',vendor_id,created_at from public.market_vendor_bookmarks where user_id=v_actor and p_kind in ('all','market','vendor')
  union all
  select 'startup_question',question_id,created_at from public.startup_qa_bookmarks where user_id=v_actor and p_kind in ('all','market','startup_question')
  union all
  select 'lesson_video',lesson_video_id,created_at from public.lesson_video_bookmarks
   where user_id=v_actor and p_kind in ('all','lesson_video')
 ), page as (
  select * from saved order by created_at desc,kind,id limit p_limit offset p_offset
 ), resolved as (
  select page.*,case when kind='startup_question' then (select private.startup_qa_question_json(q) from public.startup_qa_questions q where q.id=page.id) end question,
   case when kind='vendor' then public.get_market_vendor(page.id) end vendor,
   case when kind='market' then public.get_market_listing(page.id) end market,
   case when kind='buy_request' then public.get_market_buy_request_v3(page.id) end wanted,
   case when kind='lesson_video' and v.publication_status='published'
    then private.public_lesson_video_json(v) end video,
   v.video_key
  from page left join public.lesson_videos v on kind='lesson_video' and v.id=page.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
   'kind',kind,'id',case when kind in ('market','buy_request','vendor','startup_question') then id::text else video_key end,
   'saved_at',created_at,'available',case when kind='startup_question' then question is not null when kind='vendor' then vendor is not null when kind='market' then market is not null when kind='buy_request' then wanted is not null else video is not null end,
   'title',case when kind='startup_question' then question->>'title' when kind='vendor' then vendor->'profile'->>'name' when kind='market' then market->>'name' when kind='buy_request' then wanted->>'title' else video->>'title' end,
   'image_path',case when kind='market' then market->'image_paths'->>0 when kind='buy_request' then wanted->'image_paths'->>0 end,
   'price',case when kind='market' then market->'price' when kind='buy_request' then wanted->'budget' end,
   'region',case when kind='vendor' then vendor->'profile'->>'region' when kind='market' then market->>'region' when kind='buy_request' then wanted->>'region' end,
   'status',case when kind='market' then market->>'sale_status' when kind='buy_request' then wanted->>'request_status' end,
   'url',case when kind='lesson_video' then video->>'youtube_url' end,
   'request_type',case when kind='buy_request' then wanted->>'request_type' end,
   'summary',case when kind='startup_question' then question->>'author' when kind='vendor' then vendor->'profile'->>'summary' when kind='lesson_video' then (video->>'channel_name') || ' · ' || (video->>'duration_text') end
 ) order by created_at desc,kind,id),'[]'::jsonb) into v_items from resolved;
 return jsonb_build_object('items',v_items,'has_more',p_offset+jsonb_array_length(v_items)<v_total);
end $$;
create function public.list_my_interests_v4(p_kind text default 'all',p_limit integer default 12,p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.list_my_interests_v4(p_kind,p_limit,p_offset);
$$;
revoke all on function private.list_my_interests_v4(text,integer,integer),public.list_my_interests_v4(text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_my_interests_v4(text,integer,integer),public.list_my_interests_v4(text,integer,integer) to authenticated;


revoke all on function private.list_startup_qa_questions(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.list_startup_qa_questions(text,text,integer) to anon,authenticated;

revoke all on function public.list_startup_qa_questions(text,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_startup_qa_questions(text,text,integer) to anon,authenticated;

revoke all on function private.get_startup_qa_question(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function private.get_startup_qa_question(uuid,integer) to anon,authenticated;

revoke all on function public.get_startup_qa_question(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_startup_qa_question(uuid,integer) to anon,authenticated;

revoke all on function private.mutate_startup_qa(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.mutate_startup_qa(jsonb) to authenticated;

revoke all on function public.mutate_startup_qa(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_startup_qa(jsonb) to authenticated;

revoke all on function private.set_startup_question_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.set_startup_question_interest(uuid,boolean) to authenticated;

revoke all on function public.set_startup_question_interest(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_startup_question_interest(uuid,boolean) to authenticated;

revoke all on function private.startup_question_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function private.startup_question_interest_state(uuid) to authenticated;

revoke all on function public.startup_question_interest_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.startup_question_interest_state(uuid) to authenticated;

commit;
