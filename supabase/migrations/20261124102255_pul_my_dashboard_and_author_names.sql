begin;

create table private.member_posting_names (
  user_id uuid primary key references public.user_accounts(id) on delete cascade,
  nickname_number bigint generated always as identity (start with 482) unique,
  real_name text check (char_length(real_name) between 1 and 100 and real_name !~ '[[:cntrl:]]'),
  use_real_name boolean not null default false,
  check (not use_real_name or real_name is not null)
);
alter table private.member_posting_names enable row level security;
revoke all on private.member_posting_names from public, anon, authenticated, service_role;

insert into private.member_posting_names (user_id)
select id from public.user_accounts where account_status <> 'withdrawn' order by created_at, id;

create function private.issue_member_posting_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.member_posting_names (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
create trigger issue_member_posting_name after insert on public.user_accounts
for each row when (new.account_status <> 'withdrawn') execute function private.issue_member_posting_name();

create function private.clear_withdrawn_posting_name() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update private.member_posting_names set real_name = null, use_real_name = false where user_id = new.id;
  return new;
end $$;
create trigger clear_withdrawn_posting_name after update of account_status on public.user_accounts
for each row when (new.account_status = 'withdrawn' and old.account_status is distinct from new.account_status)
execute function private.clear_withdrawn_posting_name();

create function public.get_my_posting_name() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nickname', '잔디친구' || n.nickname_number,
    'real_name', n.real_name, 'use_real_name', n.use_real_name, 'profile_visibility', p.profile_visibility)
  from private.member_posting_names n join public.user_profiles p on p.user_id = n.user_id
  where n.user_id = auth.uid()
$$;

create function public.save_my_posting_name(p_real_name text, p_use_real_name boolean, p_visibility text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  real_name_input text := nullif(btrim(p_real_name), '');
begin
  perform 1 from public.user_accounts where id = actor and account_status = 'active' for share;
  if not found then
    raise exception '현재 계정에서는 프로필을 수정할 수 없습니다.' using errcode = '42501';
  end if;
  if p_use_real_name is null or p_visibility is null or p_visibility not in ('public','members','private')
    or (p_use_real_name and real_name_input is null)
    or char_length(real_name_input) > 100 or real_name_input ~ '[[:cntrl:]]' then
    raise exception '이름과 공개 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  update private.member_posting_names set real_name = real_name_input, use_real_name = p_use_real_name where user_id = actor;
  if not found then raise exception '이름 설정을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  update public.user_profiles set profile_visibility = p_visibility where user_id = actor;
  if not found then raise exception '프로필을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
end $$;

create function private.save_posting_name_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (to_jsonb(new)->>tg_argv[0])::uuid;
begin
  select case when n.use_real_name then n.real_name else '잔디친구' || n.nickname_number end
    into new.posted_as from private.member_posting_names n where n.user_id = actor;
  new.posted_as := coalesce(new.posted_as, 'PUL 회원');
  return new;
end $$;

create function private.read_posting_name_snapshot(p_snapshot text, p_user_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.user_accounts where id = p_user_id and account_status <> 'withdrawn')
    then coalesce(p_snapshot, 'PUL 회원') else 'PUL 회원' end
$$;

revoke all on function private.issue_member_posting_name(), private.clear_withdrawn_posting_name(),
  private.save_posting_name_snapshot(), private.read_posting_name_snapshot(text,uuid),
  public.get_my_posting_name(), public.save_my_posting_name(text,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_posting_name(), public.save_my_posting_name(text,boolean,text) to authenticated;

-- Freeze the previous anonymous display while retaining post contents and revisions.
alter table public.community_posts add column posted_as text;
update public.community_posts set posted_as = private.community_actor_display_name(author_user_id, null);
alter table public.community_posts alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.community_posts
for each row execute function private.save_posting_name_snapshot('author_user_id');

alter table public.community_comments add column posted_as text;
update public.community_comments set posted_as = private.community_actor_display_name(author_user_id, null);
alter table public.community_comments alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.community_comments
for each row execute function private.save_posting_name_snapshot('author_user_id');

alter table public.course_discussion_posts add column posted_as text;
alter table public.course_discussion_posts disable trigger course_discussion_posts_set_updated_at;
update public.course_discussion_posts set posted_as = private.community_actor_display_name(author_user_id, null);
alter table public.course_discussion_posts enable trigger course_discussion_posts_set_updated_at;
alter table public.course_discussion_posts alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.course_discussion_posts
for each row execute function private.save_posting_name_snapshot('author_user_id');

alter table private.course_story_comments add column posted_as text;
update private.course_story_comments set posted_as = private.community_actor_display_name(author_id, null);
alter table private.course_story_comments alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on private.course_story_comments
for each row execute function private.save_posting_name_snapshot('author_id');

alter table public.market_listings add column posted_as text;
alter table public.market_listings disable trigger market_listings_set_updated_at;
update public.market_listings set posted_as = private.market_actor_display_name(seller_user_id, null);
alter table public.market_listings enable trigger market_listings_set_updated_at;
alter table public.market_listings alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.market_listings
for each row execute function private.save_posting_name_snapshot('seller_user_id');

alter table public.market_buy_requests add column posted_as text;
alter table public.market_buy_requests disable trigger market_buy_requests_set_updated_at;
update public.market_buy_requests set posted_as = private.market_actor_display_name(author_user_id, null);
alter table public.market_buy_requests enable trigger market_buy_requests_set_updated_at;
alter table public.market_buy_requests alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.market_buy_requests
for each row execute function private.save_posting_name_snapshot('author_user_id');

alter table public.market_startup_posts add column posted_as text;
alter table public.market_startup_posts disable trigger market_startup_posts_set_updated_at;
update public.market_startup_posts set posted_as = private.market_actor_display_name(author_user_id, null);
alter table public.market_startup_posts enable trigger market_startup_posts_set_updated_at;
alter table public.market_startup_posts alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.market_startup_posts
for each row execute function private.save_posting_name_snapshot('author_user_id');

alter table public.startup_qa_questions add column posted_as text;
update public.startup_qa_questions set posted_as = private.market_actor_display_name(author_id, null);
alter table public.startup_qa_questions alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.startup_qa_questions
for each row execute function private.save_posting_name_snapshot('author_id');

alter table public.startup_qa_answers add column posted_as text;
update public.startup_qa_answers set posted_as = private.market_actor_display_name(author_id, null);
alter table public.startup_qa_answers alter column posted_as set not null;
create trigger save_posting_name_snapshot before insert on public.startup_qa_answers
for each row execute function private.save_posting_name_snapshot('author_id');

CREATE OR REPLACE FUNCTION private.course_story_json(p public.course_discussion_posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.read_posting_name_snapshot(p.posted_as, p.author_user_id),'created_at',p.created_at,
 'category',p.category,'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_by',case when p.pinned then private.messaging_display_name(p.pinned_by) end,'pinned_at',p.pinned_at,
 'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id) and not exists(select 1 from public.messaging_blocks b where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.author_user_id)or(b.blocker_user_id=p.author_user_id and b.blocked_user_id=auth.uid())),
 'can_edit',coalesce(p.author_user_id=auth.uid(),false),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$function$;

CREATE OR REPLACE FUNCTION private.course_story_read(p_course_key text, p_post_key text, p_category text, p_offset integer, p_preview boolean, p_manage boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.courses%rowtype;p public.course_discussion_posts%rowtype;items jsonb;total integer;comments jsonb;notices jsonb;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field';if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_manage and not private.course_can_manage(c.id) then raise exception '담당 구장 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_category is not null and p_category not in ('free','question','lost') then raise exception '목록 범위를 확인해 주세요.' using errcode='22023';end if;
 if p_post_key is not null then
  select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id and post_status='published' and moderation_hidden_at is null;
  if not found then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'parent_id',x.parent_id,'body',x.body,'author',private.read_posting_name_snapshot(x.posted_as, x.author_id),'created_at',x.created_at,'steward',exists(select 1 from private.course_stewards where course_id=c.id and user_id=x.author_id and active),'can_delete',coalesce(x.author_id=auth.uid(),false)) order by x.created_at,x.id),'[]') into comments from private.course_story_comments x where x.post_id=p.id and not x.hidden and (x.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=x.parent_id and not parent.hidden));
  return private.course_story_json(p)||jsonb_build_object('comments',comments);
 end if;
 select count(*) into total from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category);
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned desc,x.created_at desc,x.id),'[]') into items from (select * from public.course_discussion_posts where course_id=c.id and (p_manage and post_status<>'removed' or post_status='published' and moderation_hidden_at is null) and (p_category is null or category=p_category) and (not p_preview or not pinned) order by pinned desc,created_at desc,id limit case when p_preview then 4 else 20 end offset p_offset)x;
 select coalesce(jsonb_agg(private.course_story_json(x) order by x.pinned_at desc,x.id),'[]') into notices from (select * from public.course_discussion_posts where course_id=c.id and pinned and post_status='published' and moderation_hidden_at is null order by pinned_at desc,id limit case when p_preview then 20 else 1 end)x;
 return jsonb_build_object('items',items,'total',total,'notice',notices,'can_manage',private.course_can_manage(c.id),'reports',case when p_manage then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'post_key',reported.post_key,'comment_id',r.comment_id,'reason',r.reason,'resolved',r.resolved) order by r.created_at desc) from private.course_story_reports r join public.course_discussion_posts reported on reported.id=r.post_id where reported.course_id=c.id),'[]') else '[]'::jsonb end);
end $function$;

CREATE OR REPLACE FUNCTION private.get_startup_qa_question(p_id uuid, p_answer_offset integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare detail jsonb; answers jsonb;
begin
 if p_answer_offset is null or p_answer_offset not between 0 and 10000 then raise exception 'qa_invalid'; end if;
 select private.startup_qa_question_json(q) into detail from public.startup_qa_questions q where q.id=p_id;
 if detail is not null then
 select coalesce(jsonb_agg(x.value order by x.created_at,x.id),'[]') into answers from (
  select a.created_at,a.id,jsonb_build_object('id',a.id,'questionId',a.question_id,'body',a.body,
   'author',case when a.author_id is null then '탈퇴회원' else private.read_posting_name_snapshot(a.posted_as, a.author_id) end,'mine',coalesce(a.author_id=auth.uid(),false),
   'version',a.version,'createdAt',a.created_at,'updatedAt',a.updated_at,
   'vendor',case when private.vendor_public(v) is not null then jsonb_build_object('id',v.id,'name',v.approved->>'name') end) as value
  from public.startup_qa_answers a left join public.market_vendors v on v.owner_id=a.author_id
  where a.question_id=p_id and not a.deleted and (a.author_id is null or private.messaging_account_available(a.author_id))
  order by a.created_at,a.id limit 21 offset p_answer_offset) x;
 end if;
 answers:=coalesce(answers,'[]'::jsonb);
 return jsonb_build_object('items','[]'::jsonb,'hasMore',false,'detail',detail,
 'answers',case when jsonb_array_length(answers)>20 then answers-20 else answers end,'answerHasMore',jsonb_array_length(answers)>20);
end $function$;

CREATE OR REPLACE FUNCTION private.market_buy_exchange_json(r public.market_buy_requests)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',r.id,'title',r.title,'category',r.category_code,'region',r.region_code,'budget',r.budget_amount,'summary',r.summary,
 'author_display_name',private.read_posting_name_snapshot(r.posted_as, r.author_user_id),'request_status',r.request_status,'created_at',r.created_at,'updated_at',r.updated_at,'version',r.version,
 'can_edit',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active(),false),
 'request_type',r.request_type,'budget_negotiable',r.budget_negotiable,'exchange_wanted',r.exchange_wanted,'trade_type',r.trade_type,
 'public_contact_method',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_method end,
 'public_contact_value',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_value end,
 'public_contact_consent_valid',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active() and r.public_contact_consent_at is not null,false),
 'trade_notice_confirmed',coalesce(r.author_user_id=auth.uid() and r.trade_notice_version=(select cr.consent_version from public.market_content_documents cd join public.market_content_revisions cr on cr.id=cd.current_id where cd.key='policy') and r.trade_notice_confirmed_at is not null,false),
 'trade_notice_version',case when r.author_user_id=auth.uid() then r.trade_notice_version end,
 'image_paths',coalesce((select jsonb_agg(m.storage_path order by m.sort_order,m.id) from public.market_exchange_media m where m.post_id=r.id and m.media_status='available'),'[]'::jsonb)); $function$;

CREATE OR REPLACE FUNCTION private.startup_qa_question_json(q public.startup_qa_questions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when not q.deleted and (q.author_id is null or private.messaging_account_available(q.author_id)) then
 jsonb_build_object('id',q.id,'category',q.category,'title',q.title,'body',q.body,
 'author',case when q.author_id is null then '탈퇴회원' else private.read_posting_name_snapshot(q.posted_as, q.author_id) end,'mine',coalesce(q.author_id=auth.uid(),false),
 'version',q.version,'createdAt',q.created_at,'updatedAt',q.updated_at,
 'answerCount',(select count(*) from public.startup_qa_answers a where a.question_id=q.id and not a.deleted and (a.author_id is null or private.messaging_account_available(a.author_id))),
 'lastAnswerAt',(select max(a.created_at) from public.startup_qa_answers a where a.question_id=q.id and not a.deleted and (a.author_id is null or private.messaging_account_available(a.author_id)))) end;
$function$;

CREATE OR REPLACE FUNCTION public.get_community_post(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.community_posts%rowtype;
  v_comment_count integer;
begin
  select post.*
  into v_post
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published'
    and (not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      or private.community_promotion_visible(post.id));

  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_comment_count
  from public.community_comments as comment
  where comment.post_id = v_post.id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  return jsonb_build_object(
    'id', v_post.id,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'status', v_post.post_status,
    'author_display_name', private.read_posting_name_snapshot(v_post.posted_as, v_post.author_user_id),
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'version', v_post.version,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false),
    'comment_count', v_comment_count,
    'question_type', v_post.question_type,
    'question_status', case
      when v_post.category_code <> 'question' then null
      when v_post.question_resolved_at is not null then 'resolved'
      when v_comment_count > 0 then 'answered'
      else 'waiting'
    end,
    'review_type', v_post.review_type,
    'rating', v_post.rating,
    'lost_found_kind', v_post.lost_found_kind,
    'lost_found_item_name', v_post.lost_found_item_name,
    'lost_found_place', v_post.lost_found_place,
    'lost_found_date', v_post.lost_found_date,
    'lost_found_status', v_post.lost_found_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_market_buy_request(p_buy_request_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', request.id,
    'title', request.title,
    'category', request.category_code,
    'region', request.region_code,
    'budget', request.budget_amount,
    'summary', request.summary,
    'author_display_name', private.read_posting_name_snapshot(request.posted_as, request.author_user_id),
    'request_status', request.request_status,
    'created_at', request.created_at,
    'updated_at', request.updated_at,
    'version', request.version,
    'can_edit', request.author_user_id = auth.uid()
  )
  from public.market_buy_requests as request
  where request.id = p_buy_request_id and request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable;
$function$;

CREATE OR REPLACE FUNCTION public.get_market_listing(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'id', listing.id,
    'name', listing.title,
    'category', listing.category_code,
    'seller_type', 'personal',
    'price', listing.price_amount,
    'region', listing.region_code,
    'condition', listing.condition_code,
    'trade_type', listing.trade_type_code,
    'sale_status', listing.listing_status,
    'description', listing.description,
    'seller_display_name', private.read_posting_name_snapshot(listing.posted_as, listing.seller_user_id),
    'created_at', listing.created_at,
    'updated_at', listing.updated_at,
    'version', listing.version,
    'can_edit', coalesce(listing.seller_user_id = auth.uid(), false),
    'image_paths', coalesce((
      select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
      from public.market_listing_media as media
      where media.listing_id = listing.id and media.media_status = 'available'
    ), '[]'::jsonb),
    'public_contact_consent_valid', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.listing_status in ('selling', 'reserved')
      and listing.public_contact_method is not null
      and listing.public_contact_consent_at is not null, false),
    'trade_notice_version', case when listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active() then listing.trade_notice_version else null end,
    'trade_notice_confirmed', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.trade_notice_version = (select r.consent_version from public.market_content_documents d join public.market_content_revisions r on r.id=d.current_id where d.key='policy')
      and listing.trade_notice_confirmed_at is not null, false),
    'public_contact_method', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_method
      else null
    end,
    'public_contact_value', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_value
      else null
    end
  )
  from public.market_listings as listing
  where listing.id = p_listing_id
    and listing.listing_status <> 'removed';
$function$;

CREATE OR REPLACE FUNCTION public.get_market_startup_post(p_post_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_post public.market_startup_posts%rowtype;
begin
  if p_post_key is null or p_post_key !~ '^[0-9a-f]{24}$' then
    raise exception '창업·매매 게시글 식별자를 확인해 주세요.';
  end if;

  select post.*
  into v_post
  from public.market_startup_posts as post
  where post.post_key = p_post_key
    and post.publication_status = 'published';

  if not found then
    raise exception '창업·매매 게시글을 찾을 수 없습니다.';
  end if;

  return pg_catalog.jsonb_build_object(
    'post_key', v_post.post_key,
    'title', v_post.title,
    'body', v_post.body,
    'category', v_post.category_code,
    'region', v_post.region_code,
    'desired_scale', v_post.desired_scale,
    'consultation_type', v_post.consultation_type,
    'author_display_name', private.read_posting_name_snapshot(v_post.posted_as, v_post.author_user_id),
    'board_status', v_post.board_status,
    'created_at', v_post.created_at,
    'updated_at', v_post.updated_at,
    'can_edit', coalesce(v_post.author_user_id = v_viewer_id, false)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_community_comments(p_post_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_total integer;
  v_items jsonb;
begin
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception '댓글 페이지 범위를 확인해 주세요.';
  end if;

  perform 1
  from public.community_posts as post
  where post.id = p_post_id
    and post.post_status = 'published'
      and (not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      or private.community_promotion_visible(post.id));
  if not found then
    raise exception '게시글을 찾을 수 없습니다.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_comments as comment
  where comment.post_id = p_post_id
    and comment.removed_at is null and comment.moderation_hidden_at is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'body', page.body,
        'author_display_name', private.read_posting_name_snapshot(page.posted_as, page.author_user_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false)
      )
      order by page.created_at, page.id
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select comment.*
    from public.community_comments as comment
    where comment.post_id = p_post_id
      and comment.removed_at is null and comment.moderation_hidden_at is null
    order by comment.created_at, comment.id
    limit p_limit
    offset p_offset
  ) as page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_community_posts(p_category_code text DEFAULT NULL::text, p_keyword text DEFAULT NULL::text, p_sort_order text DEFAULT 'latest'::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null
     and p_category_code not in ('free', 'question', 'review', 'equipment', 'course', 'club', 'lostFound', 'marketReview') then
    raise exception '게시글 카테고리를 확인해 주세요.';
  end if;
  if p_sort_order not in ('latest', 'comments') then
    raise exception '게시글 정렬 방식을 확인해 주세요.';
  end if;
  if p_limit not between 1 and 30 or p_offset < 0 then
    raise exception '페이지 범위를 확인해 주세요.';
  end if;

  select count(*)::integer
  into v_total
  from public.community_posts as post
  where post.post_status = 'published'
    and not exists (select 1 from private.community_promotions m where m.post_id=post.id)
    and (p_category_code is null or post.category_code = p_category_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
    );

  with eligible as (
    select
      post.*,
      (
        select count(*)::integer
        from public.community_comments as comment
        where comment.post_id = post.id
          and comment.removed_at is null and comment.moderation_hidden_at is null
      ) as comment_count
    from public.community_posts as post
    where post.post_status = 'published'
      and not exists (select 1 from private.community_promotions m where m.post_id=post.id)
      and (p_category_code is null or post.category_code = p_category_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
      )
  ), page as (
    select eligible.*
    from eligible
    order by
      case when p_sort_order = 'comments' then eligible.comment_count end desc,
      eligible.created_at desc,
      eligible.id desc
    limit p_limit
    offset p_offset
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', page.id,
        'title', page.title,
        'summary', pg_catalog.left(page.body, 180),
        'category', page.category_code,
        'author_display_name', private.read_posting_name_snapshot(page.posted_as, page.author_user_id),
        'created_at', page.created_at,
        'updated_at', page.updated_at,
        'version', page.version,
        'can_edit', coalesce(page.author_user_id = v_viewer_id, false),
        'comment_count', page.comment_count,
        'question_type', page.question_type,
        'question_status', case
          when page.category_code <> 'question' then null
          when page.question_resolved_at is not null then 'resolved'
          when page.comment_count > 0 then 'answered'
          else 'waiting'
        end,
        'review_type', page.review_type,
        'rating', page.rating,
        'lost_found_kind', page.lost_found_kind,
        'lost_found_item_name', page.lost_found_item_name,
        'lost_found_place', page.lost_found_place,
        'lost_found_date', page.lost_found_date,
        'lost_found_status', page.lost_found_status
      )
      order by
        case when p_sort_order = 'comments' then page.comment_count end desc,
        page.created_at desc,
        page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from page;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + jsonb_array_length(v_items) < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_market_buy_requests(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable;

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'title', request.title,
        'category', request.category_code,
        'region', request.region_code,
        'budget', request.budget_amount,
        'summary', request.summary,
        'author_display_name', private.read_posting_name_snapshot(request.posted_as, request.author_user_id),
        'request_status', request.request_status,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'version', request.version,
        'can_edit', request.author_user_id = v_actor_id
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    order by request.created_at desc, request.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + v_limit < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_market_buy_requests_v2(p_keyword text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_region_code text DEFAULT NULL::text, p_request_status text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword),'');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club','ball','bag','apparel','shoes','practice','other') then raise exception '카테고리 입력을 확인해 주세요.'; end if;
  if p_region_code is not null and p_region_code not in ('서울','경기','인천','충청','강원','전라','경상','제주') then raise exception '지역 입력을 확인해 주세요.'; end if;
  if p_request_status is not null and p_request_status not in ('open','closed') then raise exception '구매요청 상태 입력을 확인해 주세요.'; end if;
  select pg_catalog.count(*) into v_total
  from public.market_buy_requests as request
  where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select request.id, request.created_at,
      pg_catalog.jsonb_build_object(
        'id', request.id,
        'title', request.title,
        'category', request.category_code,
        'region', request.region_code,
        'budget', request.budget_amount,
        'summary', request.summary,
        'author_display_name', private.read_posting_name_snapshot(request.posted_as, request.author_user_id),
        'request_status', request.request_status,
        'created_at', request.created_at,
        'updated_at', request.updated_at,
        'version', request.version,
        'can_edit', coalesce(request.author_user_id = v_actor_id,false)
      ) as item
    from public.market_buy_requests as request
    where request.request_status <> 'removed' and request.publication_status='published' and request.request_type='buy' and not request.budget_negotiable
    and (p_category_code is null or request.category_code=p_category_code)
    and (p_region_code is null or request.region_code=p_region_code)
    and (p_request_status is null or request.request_status=p_request_status)
    and (v_keyword is null or request.title ilike '%'||v_keyword||'%' or request.summary ilike '%'||v_keyword||'%')
    order by request.created_at desc, request.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + v_limit < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_market_listings(p_keyword text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_region_code text DEFAULT NULL::text, p_listing_status text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_total integer;
begin
  if p_category_code is not null and p_category_code not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
    raise exception '카테고리 입력을 확인해 주세요.';
  end if;
  if p_region_code is not null and p_region_code not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
    raise exception '지역 입력을 확인해 주세요.';
  end if;
  if p_listing_status is not null and p_listing_status not in ('selling', 'reserved', 'sold') then
    raise exception '판매 상태 입력을 확인해 주세요.';
  end if;

  select pg_catalog.count(*) into v_total
  from public.market_listings as listing
  where listing.listing_status <> 'removed'
    and (p_category_code is null or listing.category_code = p_category_code)
    and (p_region_code is null or listing.region_code = p_region_code)
    and (p_listing_status is null or listing.listing_status = p_listing_status)
    and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%');

  select coalesce(pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc), '[]'::jsonb)
  into v_items
  from (
    select listing.id, listing.created_at,
      pg_catalog.jsonb_build_object(
        'id', listing.id,
        'name', listing.title,
        'category', listing.category_code,
        'seller_type', 'personal',
        'price', listing.price_amount,
        'region', listing.region_code,
        'condition', listing.condition_code,
        'trade_type', listing.trade_type_code,
        'sale_status', listing.listing_status,
        'description', listing.description,
        'seller_display_name', private.read_posting_name_snapshot(listing.posted_as, listing.seller_user_id),
        'created_at', listing.created_at,
        'updated_at', listing.updated_at,
        'version', listing.version,
        'can_edit', coalesce(listing.seller_user_id = v_actor_id, false),
        'image_paths', coalesce((
          select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
          from public.market_listing_media as media
          where media.listing_id = listing.id and media.media_status = 'available'
        ), '[]'::jsonb)
      ) as item
    from public.market_listings as listing
    where listing.listing_status <> 'removed'
      and (p_category_code is null or listing.category_code = p_category_code)
      and (p_region_code is null or listing.region_code = p_region_code)
      and (p_listing_status is null or listing.listing_status = p_listing_status)
      and (v_keyword is null or listing.title ilike '%' || v_keyword || '%' or listing.description ilike '%' || v_keyword || '%')
    order by listing.created_at desc, listing.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + v_limit < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_market_startup_posts(p_keyword text DEFAULT NULL::text, p_category_code text DEFAULT NULL::text, p_region_code text DEFAULT NULL::text, p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if p_category_code is not null and p_category_code not in (
    'screenStartup', 'screenResale', 'fieldCourseDevelopment',
    'idleLandUse', 'constructionFacility'
  ) then
    raise exception '창업·매매 카테고리를 확인해 주세요.';
  end if;
  if p_region_code is not null and p_region_code not in (
    '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  select pg_catalog.count(*)::integer
  into v_total
  from public.market_startup_posts as post
  where post.publication_status = 'published'
    and (p_category_code is null or post.category_code = p_category_code)
    and (p_region_code is null or post.region_code = p_region_code)
    and (
      v_keyword is null
      or post.title ilike '%' || v_keyword || '%'
      or post.body ilike '%' || v_keyword || '%'
      or post.desired_scale ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select post.id, post.created_at,
      pg_catalog.jsonb_build_object(
        'post_key', post.post_key,
        'title', post.title,
        'summary', pg_catalog.left(post.body, 220),
        'category', post.category_code,
        'region', post.region_code,
        'desired_scale', post.desired_scale,
        'consultation_type', post.consultation_type,
        'author_display_name', private.read_posting_name_snapshot(post.posted_as, post.author_user_id),
        'board_status', post.board_status,
        'created_at', post.created_at,
        'updated_at', post.updated_at,
        'can_edit', coalesce(post.author_user_id = v_viewer_id, false)
      ) as item
    from public.market_startup_posts as post
    where post.publication_status = 'published'
      and (p_category_code is null or post.category_code = p_category_code)
      and (p_region_code is null or post.region_code = p_region_code)
      and (
        v_keyword is null
        or post.title ilike '%' || v_keyword || '%'
        or post.body ilike '%' || v_keyword || '%'
        or post.desired_scale ilike '%' || v_keyword || '%'
      )
    order by post.created_at desc, post.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_public_course_discussion_posts(p_course_key text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_viewer_id uuid := auth.uid();
  v_course_id uuid;
  v_total integer;
  v_items jsonb;
begin
  if p_course_key is null
     or p_course_key <> pg_catalog.btrim(p_course_key)
     or p_course_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;
  if p_limit is null or p_limit not between 1 and 24
     or p_offset is null or p_offset < 0 then
    raise exception '이야기방 페이지 범위를 확인해 주세요.';
  end if;

  select course.id
  into v_course_id
  from public.courses as course
  where course.course_key = p_course_key
    and course.course_status = 'active';

  if not found then
    raise exception '골프장 정보를 찾을 수 없습니다.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.course_discussion_posts as post
  where post.course_id = v_course_id
    and post.post_status = 'published';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'post_key', page.post_key,
        'body', page.body,
        'author_display_name', private.read_posting_name_snapshot(page.posted_as, page.author_user_id),
        'created_at', page.created_at
      )
      order by page.created_at desc, page.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select post.*
    from public.course_discussion_posts as post
    where post.course_id = v_course_id
      and post.post_status = 'published'
    order by post.created_at desc, post.id desc
    limit p_limit
    offset p_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$function$;

create function public.get_my_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  result jsonb;
begin
  if not private.messaging_account_available(actor) then
    raise exception '현재 계정으로 내 정보를 조회할 수 없습니다.' using errcode = '42501';
  end if;

  with clubs as (
    select c.id, c.legacy_key as key, c.name, m.id as membership_id,
      case when private.club_user_is_active_admin_or_vice_admin(actor,c.id) then
        case when exists (select 1 from public.club_role_assignments a
          where a.membership_id = m.id and a.role_code = 'club_admin' and a.revoked_at is null)
          then '회장' else '부회장' end
        else '회원' end as role,
      private.club_user_has_permission(actor,c.id,'club.members.read') as members,
      private.club_user_has_permission(actor,c.id,'club.notices.manage') as notices,
      private.club_user_has_permission(actor,c.id,'club.events.manage') as events,
      private.club_user_is_active_admin_or_vice_admin(actor,c.id) as scores,
      private.club_user_has_permission(actor,c.id,'club.membership_applications.read')
        and private.club_user_has_permission(actor,c.id,'club.membership_applications.manage') as applications,
      private.club_user_has_permission(actor,c.id,'club.join_inquiries.read')
        and private.club_user_has_permission(actor,c.id,'club.join_inquiries.manage') as inquiries
    from public.club_memberships m join public.clubs c on c.id = m.club_id
    where m.user_id = actor and m.membership_status = 'active' and c.club_status = 'active'
  ), courses as (
    select c.id, c.course_key as key, c.name, c.operating_status
    from private.course_stewards s join public.courses c on c.id = s.course_id
    where s.user_id = actor and s.active and c.course_status = 'active'
      and private.course_current_operator(c.id,actor)
  ), tournaments as (
    select e.id, e.event_key as key, e.title as name, s.deadline, e.start_date, e.end_date,
      private.tournament_signup_open(e,s) as signup_open, s.attendance_closed, h.finalized_at,
      e.occurrence_status = 'cancelled' as cancelled
    from private.tournament_hosts h
    join public.events e on e.id = h.event_id
    join private.tournament_signup s on s.event_id = e.id
    where e.publication_status = 'published' and private.tournament_host_can_finalize(h,actor)
  ), universities as (
    select d.id, u.department_key as key, u.department_name as name, u.university_name as parent,
      u.can_manage, u.student_status
    from public.list_my_university_departments() u
    join public.lesson_university_departments d on d.department_key = u.department_key
  ), affiliations as (
    select 'club' as kind, key, name, role as label, null::text as parent from clubs
    union all select 'course', key, name,
      case operating_status when 'open' then '운영 중' when 'closed' then '휴장 중' else '운영 상태 미등록' end, null from courses
    union all select 'event', key, name, case when cancelled then '취소' when signup_open then '접수 중'
      when finalized_at is not null then '성적 확정' else '접수 마감' end, null from tournaments
    union all select 'university', key, name,
      concat_ws(' · ',case when can_manage then '담당자' end,
        case student_status when 'approved' then '재학생' when 'pending' then '승인 대기' end), parent
      from universities
  ), shortcuts as (
    select 'club' as kind, c.key, c.name, x.action
    from clubs c cross join lateral (values ('members',c.members),('notices',c.notices),
      ('schedule',c.events),('scores',c.scores),('applications',c.applications),('inquiries',c.inquiries)) x(action,allowed)
    where x.allowed
    union all select 'course', c.key, c.name, x.action from courses c cross join (values ('operations'),('reservation'),('inquiries')) x(action)
    union all select 'event', t.key, t.name, x.action from tournaments t
      cross join lateral (values ('applications',true),('notices',not t.cancelled),
        ('scores',not t.cancelled and coalesce(t.end_date,t.start_date) <= today)) x(action,allowed) where x.allowed
    union all select 'university', u.key, u.name, x.action from universities u
      cross join (values ('consultations'),('students'),('recruitment')) x(action) where u.can_manage
  ), tasks as (
    select 'club' as kind, c.key, c.name, 'applications' as action, count(*) as count, null::timestamptz as deadline
    from clubs c join public.club_membership_applications a on a.club_id = c.id
    where c.applications and a.status in ('submitted','reviewing','additional_info_required','interview_requested','waitlisted')
    group by c.key,c.name
    union all select 'club',c.key,c.name,'inquiries',count(*),null
    from clubs c join public.club_join_inquiries i on i.club_id = c.id
    where c.inquiries and i.inquiry_status in ('received','reviewing') group by c.key,c.name
    union all select 'club',c.key,c.name,'scores',count(*),null
    from clubs c join public.club_official_events e on e.club_id = c.id
    where c.scores and e.event_type = 'monthly_meeting' and e.event_status not in ('draft','cancelled')
      and e.moderation_status = 'visible' and coalesce(e.ends_at,e.starts_at) < statement_timestamp()
      and exists (select 1 from public.club_official_event_participations p where p.event_id = e.id)
      and not exists (select 1 from private.club_monthly_sheets s join private.club_monthly_scores r on r.sheet_id = s.id
        where s.event_id = e.id and r.score_entered_at is not null)
    group by c.key,c.name
    union all select 'course',c.key,c.name,'inquiries',count(*),null
    from courses c join private.course_shared_threads t on t.course_id = c.id
    where t.status in ('pending','reopened') group by c.key,c.name
    union all select 'event',t.key,t.name,'applications',count(r.id),t.deadline
    from tournaments t left join private.tournament_roster r on r.event_id = t.id and r.active
    where t.signup_open group by t.key,t.name,t.deadline
    union all select 'event',t.key,t.name,'scores',count(r.id),null
    from tournaments t join private.tournament_roster r on r.event_id = t.id and r.active and r.attendance = 'attended'
    where t.attendance_closed and not t.cancelled and t.finalized_at is null
      and coalesce(t.end_date,t.start_date) <= today and r.result_at is null group by t.key,t.name
    union all select 'university',u.key,u.parent || ' ' || u.name,'consultations',count(*),null
    from universities u join public.lesson_university_consultations q on q.department_id = u.id
    where u.can_manage and q.contact_status in ('received','contacting') group by u.key,u.name,u.parent
    union all select 'university',u.key,u.parent || ' ' || u.name,'students',count(*),null
    from universities u join public.lesson_university_students s on s.department_id = u.id
    where u.can_manage and s.approved_at is null and private.university_active(s.user_id) group by u.key,u.name,u.parent
  ), upcoming as (
    select 'club' as kind, c.key, c.name, e.title, e.starts_at as starts_at
    from clubs c join public.club_official_event_participations p on p.membership_id = c.membership_id
    join public.club_official_events e on e.id = p.event_id
    where e.club_id = c.id and e.moderation_status = 'visible'
      and e.event_status in ('scheduled','registration_open','registration_closed') and e.starts_at >= statement_timestamp()
    union all select 'university',u.key,u.name,e.title,
      (e.event_date + coalesce(e.event_time,time '00:00')) at time zone 'Asia/Seoul'
    from universities u join public.lesson_university_space_entries e on e.department_id = u.id
    where u.student_status = 'approved' and e.kind = 'event' and e.event_date >= today
    union all select 'event',e.event_key,e.title,e.title,e.start_date::timestamp at time zone 'Asia/Seoul'
    from public.events e
    where e.publication_status = 'published' and e.occurrence_status <> 'cancelled' and e.start_date >= today
      and exists (select 1 from private.tournament_roster r where r.event_id = e.id and r.user_id = actor and r.active)
  )
  select jsonb_build_object(
    'affiliations',coalesce((select jsonb_agg(to_jsonb(a) order by a.kind,a.name,a.key) from affiliations a),'[]'),
    'shortcuts',coalesce((select jsonb_agg(to_jsonb(s) order by s.kind,s.name,s.key,s.action) from shortcuts s),'[]'),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.deadline nulls last,
      case when t.action = 'scores' then 0 else 1 end,t.name,t.key,t.action) from tasks t),'[]'),
    'upcoming',coalesce((select jsonb_agg(to_jsonb(u) order by u.starts_at,u.title,u.key)
      from (select * from upcoming order by starts_at,title,key limit 12) u),'[]')
  ) into result;
  return result;
end $$;

revoke all on function public.get_my_dashboard() from public, anon, authenticated, service_role;
grant execute on function public.get_my_dashboard() to authenticated;

create table private.club_registered_name_corrections (
  membership_id uuid primary key references public.club_memberships(id) on delete cascade,
  registered_name text not null check (char_length(registered_name) between 1 and 60 and registered_name !~ '[[:cntrl:]]'),
  corrected_by uuid references public.user_accounts(id) on delete set null,
  corrected_at timestamptz not null default statement_timestamp()
);
alter table private.club_registered_name_corrections enable row level security;
revoke all on private.club_registered_name_corrections from public, anon, authenticated, service_role;

create function private.club_registered_name(p_club uuid, p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(case when c.corrected_at >= coalesce(a.finalized_at,'-infinity'::timestamptz)
    then c.registered_name end, a.name)
  from public.club_memberships m
  left join private.club_registered_name_corrections c on c.membership_id = m.id
  left join lateral (
    select nullif(btrim(d.details->>'fullName'),'') as name, a.finalized_at
    from public.club_membership_applications a
    join private.club_application_details d on d.application_id = a.id
    where a.club_id = m.club_id and a.applicant_id = m.user_id and a.status = 'approved'
    order by a.finalized_at desc nulls last, a.id desc limit 1
  ) a on true
  where m.club_id = p_club and m.user_id = p_user and private.messaging_account_available(p_user)
$$;

create function public.correct_club_registered_name(p_club uuid, p_membership uuid, p_expected text, p_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare target uuid; actor uuid := auth.uid(); name_input text := btrim(p_name);
begin
  if not private.messaging_account_available(actor)
     or not private.club_user_has_permission(actor,p_club,'club.members.manage') then
    raise exception '해당 동호회 회원 관리 권한이 필요합니다.' using errcode = '42501';
  end if;
  if name_input is null or char_length(name_input) not between 1 and 60 or name_input ~ '[[:cntrl:]]' then
    raise exception '등록 이름은 1~60자로 입력해 주세요.' using errcode = '22023';
  end if;
  select user_id into target from public.club_memberships
    where id = p_membership and club_id = p_club and membership_status in ('active','suspended') for update;
  if not found or not private.messaging_account_available(target) then
    raise exception '정정할 회원을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if private.club_registered_name(p_club,target) is distinct from p_expected then
    raise exception '등록 이름이 변경되었습니다. 회원 정보를 다시 열어 주세요.' using errcode = '40001';
  end if;
  insert into private.club_registered_name_corrections(membership_id,registered_name,corrected_by,corrected_at)
    values(p_membership,name_input,actor,clock_timestamp())
  on conflict(membership_id) do update set registered_name = excluded.registered_name,
    corrected_by = excluded.corrected_by, corrected_at = excluded.corrected_at;
  return name_input;
end $$;

create function public.get_club_registered_name_for_management(p_club uuid,p_membership uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.messaging_account_available(auth.uid())
     or not private.club_user_has_permission(auth.uid(),p_club,'club.members.read') then
    raise exception '해당 동호회 회원 조회 권한이 필요합니다.' using errcode = '42501';
  end if;
  return (select private.club_registered_name(p_club,m.user_id) from public.club_memberships m
    where m.id = p_membership and m.club_id = p_club);
end $$;

create function private.club_post_registered_author(p_club uuid,p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when private.messaging_account_available(auth.uid())
    and exists (select 1 from public.club_memberships m where m.club_id = p_club
      and m.user_id = auth.uid() and m.membership_status = 'active')
    then private.club_registered_name(p_club,p_user) end
$$;

revoke all on function private.club_registered_name(uuid,uuid), private.club_post_registered_author(uuid,uuid),
  public.correct_club_registered_name(uuid,uuid,text,text), public.get_club_registered_name_for_management(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.correct_club_registered_name(uuid,uuid,text,text),
  public.get_club_registered_name_for_management(uuid,uuid) to authenticated;

create or replace function private.club_post_safe_json(p public.club_posts) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'club_key',c.legacy_key,'club_name',c.name,'registered_author',private.club_post_registered_author(p.club_id,p.author_user_id),'title',p.title,'body',p.content_summary,'post_type',p.post_type,'location',p.location,'capacity',p.capacity,'participant_target',p.participant_target,'recruitment_status',p.recruitment_status,'linked_course_legacy_key',p.linked_course_legacy_key,'activity_category',p.activity_category,'is_notice',p.activity_notice,'starts_at',p.starts_at,'ends_at',p.ends_at,'event_id',p.activity_event_id,'visibility',p.visibility,'created_at',p.created_at,'version',p.version,'hidden',p.moderation_status<>'visible' or p.post_status not in('published','edited'),
 'can_edit',coalesce(p.author_user_id=auth.uid() and private.club_photo_writer(auth.uid(),p.club_id),false),'can_moderate',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate'),false),'can_notice',coalesce(private.club_user_has_permission(auth.uid(),p.club_id,'club.notices.manage'),false),
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'caption',m.caption,'visibility',m.visibility) order by a.position) from private.club_post_photos a join public.club_media m on m.id=a.media_id where a.post_id=p.id and private.club_photo_readable(m)),'[]'::jsonb),
 'shared_course',case when p.author_user_id=auth.uid() or private.club_user_has_permission(auth.uid(),p.club_id,'club.posts.moderate') then (select jsonb_build_object('key',x.course_key,'name',x.name,'course_hidden',s.course_hidden) from private.club_course_shares s join public.courses x on x.id=s.course_id where s.post_id=p.id and not s.withdrawn limit 1) else null end)
 from public.clubs c where c.id=p.club_id
$$;

CREATE OR REPLACE FUNCTION public.get_club_core_content(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_can_read_notices boolean := false;
  v_can_read_posts boolean := false;
  v_can_read_events boolean := false;
  v_can_create_notices boolean := false;
  v_can_manage_notices boolean := false;
  v_can_create_posts boolean := false;
  v_can_moderate_posts boolean := false;
  v_can_create_events boolean := false;
  v_can_manage_events boolean := false;
begin
  if p_club_id is null or not exists (
    select 1
    from public.clubs as club
    where club.id = p_club_id
      and club.club_status = 'active'
  ) then
    raise exception '동호회를 찾을 수 없습니다.';
  end if;

  if v_actor_id is not null then
    v_can_read_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.read');
    v_can_read_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.read');
    v_can_read_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.read');
    v_can_create_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.create');
    v_can_manage_notices := private.club_user_has_permission(v_actor_id, p_club_id, 'club.notices.manage');
    v_can_create_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.create');
    v_can_moderate_posts := private.club_user_has_permission(v_actor_id, p_club_id, 'club.posts.moderate');
    v_can_create_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.create');
    v_can_manage_events := private.club_user_has_permission(v_actor_id, p_club_id, 'club.events.manage');
  end if;

  return pg_catalog.jsonb_build_object(
    'notices', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(visible_notice) - 'importance_rank'
        order by visible_notice.importance_rank, visible_notice.published_at desc, visible_notice.id
      )
      from (
        select
          notice.id,
          notice.title,
          notice.content_summary,
          notice.notice_type,
          notice.importance,
          notice.visibility,
          notice.notice_status,
          notice.published_at,
          notice.created_at,
          notice.updated_at,
          notice.version,
          case notice.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as author_role,
          v_can_manage_notices as can_manage,
          case notice.importance when 'urgent' then 0 when 'important' then 1 else 2 end as importance_rank
        from public.club_notices as notice
        where notice.club_id = p_club_id
          and notice.notice_status = 'published'
          and (
            notice.visibility = 'public'
            or (notice.visibility = 'club_members' and v_can_read_notices)
          )
        order by importance_rank, notice.published_at desc, notice.id
        limit 50
      ) as visible_notice
    ), '[]'::jsonb),
    'posts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_post) order by visible_post.published_at desc, visible_post.id)
      from (
        select
          post.id,
          post.title,
          post.content_summary,
          post.post_type,
          post.starts_at,
          post.ends_at,
          post.linked_course_legacy_key,
          post.location,
          post.capacity,
          post.participant_target,
          post.recruitment_status,
          post.visibility,
          post.moderation_status,
          post.post_status,
          post.published_at,
          post.created_at,
          post.updated_at,
          post.version,
          case post.author_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            when 'club_manager' then 'clubManager'
            else 'member'
          end as author_role,
          case
            when post.visibility = 'club_members' and registered.name is not null then registered.name
            when profile.display_name is null then null
            when post.author_user_id = v_actor_id then profile.display_name
            when profile.profile_visibility = 'public' then profile.display_name
            when post.visibility = 'club_members'
             and v_can_read_posts
             and profile.profile_visibility = 'members' then profile.display_name
            else null
          end as author_display_name,
          (post.author_user_id = v_actor_id and v_can_create_posts) as can_edit,
          ((post.author_user_id = v_actor_id and v_can_create_posts) or v_can_moderate_posts) as can_delete
        from public.club_posts as post
        left join public.user_profiles as profile
          on profile.user_id = post.author_user_id
        left join lateral (select private.club_post_registered_author(post.club_id,post.author_user_id) as name) registered
          on post.visibility = 'club_members'
        where post.club_id = p_club_id
          and post.activity_category is null
          and post.moderation_status = 'visible'
          and post.post_status in ('published', 'edited')
          and (
            post.visibility = 'public'
            or (post.visibility = 'club_members' and v_can_read_posts)
          )
        order by post.published_at desc, post.id
        limit 50
      ) as visible_post
    ), '[]'::jsonb),
    'official_events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(visible_event) order by visible_event.starts_at, visible_event.id)
      from (
        select
          event.id,
          event.event_type,
          event.event_status,
          event.title,
          event.starts_at,
          event.ends_at,
          event.linked_course_legacy_key,
          event.location,
          event.participant_target,
          event.capacity,
          event.reservation_method,
          event.member_reservation_guidance,
          event.organizer_guidance,
          event.visibility,
          event.moderation_status,
          event.version,
          event.created_at,
          event.updated_at,
          case event.creator_role_code
            when 'club_admin' then 'clubAdmin'
            when 'club_vice_admin' then 'clubAdmin'
            else 'clubManager'
          end as creator_role,
          v_can_manage_events as can_manage
        from public.club_official_events as event
        where event.club_id = p_club_id
          and event.moderation_status = 'visible'
          and event.event_status <> 'draft'
          and (
            event.visibility = 'public'
            or (event.visibility = 'club_members' and v_can_read_events)
          )
        order by event.starts_at, event.id
        limit 50
      ) as visible_event
    ), '[]'::jsonb),
    'capabilities', pg_catalog.jsonb_build_object(
      'can_create_notice', v_can_create_notices,
      'can_manage_notice', v_can_manage_notices,
      'can_create_post', v_can_create_posts,
      'can_moderate_post', v_can_moderate_posts,
      'can_create_event', v_can_create_events,
      'can_manage_event', v_can_manage_events
    )
  );
end;
$function$;

commit;
