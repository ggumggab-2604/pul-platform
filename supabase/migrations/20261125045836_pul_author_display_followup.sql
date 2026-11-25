begin;

-- Keep the existing award comment label as the historical snapshot, with unknown name type.
alter table private.tournament_award_comments rename column display_name to posted_as;
alter table private.tournament_award_comments add column posted_name_generation bigint default -1;
create trigger save_posting_name_snapshot before insert on private.tournament_award_comments
for each row execute function private.save_posting_name_snapshot('author_id');

CREATE OR REPLACE FUNCTION private.course_story_json(p public.course_discussion_posts)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('post_key',p.post_key,'title',p.title,'body',p.body,'author_display_name',private.read_posting_name_snapshot(p.posted_as, p.author_user_id, p.posted_name_generation),'created_at',p.created_at,
 'category',p.category,'processing_status',p.processing_status,'version',p.version,'pinned',p.pinned,'pinned_at',p.pinned_at,
 'can_message',p.author_user_id is distinct from auth.uid() and private.messaging_account_available(p.author_user_id) and not exists(select 1 from public.messaging_blocks b where (b.blocker_user_id=auth.uid() and b.blocked_user_id=p.author_user_id)or(b.blocker_user_id=p.author_user_id and b.blocked_user_id=auth.uid())),
 'can_edit',coalesce(p.author_user_id=auth.uid(),false),'can_manage',private.course_can_manage(p.course_id),'hidden',p.post_status<>'published' or p.moderation_hidden_at is not null,
 'images',coalesce((select jsonb_agg(jsonb_build_object('id',id,'position',position) order by position) from private.course_story_images where post_id=p.id and ready),'[]'),
 'comment_count',(select count(*) from private.course_story_comments c where c.post_id=p.id and not c.hidden and (c.parent_id is null or exists(select 1 from private.course_story_comments parent where parent.id=c.parent_id and not parent.hidden))))
$function$;

CREATE OR REPLACE FUNCTION public.comment_tournament_award(p_request_id uuid, p_news_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; input jsonb:=jsonb_build_object('id',p_news_id,'body',p_body); begin
 perform id from public.user_accounts where id=auth.uid() for share;
 perform user_id from public.user_profiles where user_id=auth.uid() for share;
 perform id from public.consent_records where user_id=auth.uid() for share;
 if not private.messaging_account_available(auth.uid()) or jsonb_array_length(public.get_tournament_award_news(null,null,p_news_id))=0 then raise exception '로그인 상태와 공개 소식을 확인해 주세요.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,17));
 result:=private.club_extension_previous(auth.uid(),p_request_id,'tournament.comment',input);if result is not null then return result;end if;
 insert into private.tournament_award_comments(news_id,author_id,body) values(p_news_id,auth.uid(),btrim(p_body)) returning jsonb_build_object('id',id) into result;
 perform private.club_extension_complete(auth.uid(),p_request_id,'tournament.comment',input,result);return result;
end $function$;

CREATE OR REPLACE FUNCTION public.get_tournament_award_news(p_club_key text DEFAULT NULL::text, p_course_key text DEFAULT NULL::text, p_news_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_id',e.id,'version',n.version,'tournament_version',t.version,'tournament_id',t.id,
 'title',t.title,'date',t.played_on,'course',t.course_name,'course_key',co.course_key,'club',c.name,'club_key',c.legacy_key,'name',private.hall_viewer_name(p.user_id, e.display_name),'division',e.division,
 'place',n.place,'tied',n.tied,'score',n.score,'award_name',n.award_name,'sentiment',n.sentiment,'photo_id',n.photo_id,'confirmed',n.confirmed and not exists (
    select 1 from private.tournament_hosts h where h.event_id=t.event_id
      and num_nonnulls(h.host_club_id,h.host_course_id)>0 and h.finalized_at is null
  ),'format_note',t.format_note,'approval_pending',private.tournament_approval_pending(e.id),
 'can_edit',not private.tournament_approval_pending(e.id) and private.messaging_account_available(auth.uid()) and exists(select 1 from public.club_memberships m where m.club_id=c.id and m.user_id=auth.uid() and m.membership_status='active') and (p.user_id=auth.uid() or private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id)),
 'can_confirm',not private.tournament_approval_pending(e.id) and private.messaging_account_available(auth.uid()) and private.club_user_is_active_admin_or_vice_admin(auth.uid(),c.id),
 'can_pin_course',private.messaging_account_available(auth.uid()) and private.course_actor_has_permission(auth.uid(),'courses.manage'),
 'can_pin_national',private.messaging_account_available(auth.uid()) and public.current_user_has_platform_permission('hall_of_fame.records.correct'),
 'pins',coalesce((select jsonb_agg(scope) from private.tournament_award_pins where news_id=n.id),'[]'::jsonb),
 'comments',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id', comment.id,
     'name', case when snapshot.name in ('PUL 회원','탈퇴회원') then snapshot.name
       else private.hall_viewer_name(comment.author_id, snapshot.name) end,
     'body', comment.body, 'date', comment.created_at
   ) order by comment.created_at)
   from private.tournament_award_comments comment
   cross join lateral (select private.read_posting_name_snapshot(
     comment.posted_as, comment.author_id, comment.posted_name_generation
   ) as name) snapshot
   where comment.news_id = n.id
 ),'[]'::jsonb)) order by n.published_at desc,n.id),'[]'::jsonb)
 from private.tournament_award_news n join private.club_tournament_entries e on e.id=n.entry_id join private.club_score_people p on p.id=e.person_id
 join private.club_tournaments t on t.id=e.tournament_id join public.clubs c on c.id=t.club_id left join public.courses co on co.id=t.course_id
 where private.tournament_scope_visible(t) and not n.hidden and not e.excluded and not p.anonymized and c.club_status='active' and (c.directory_is_public or ((p_club_key=c.legacy_key or p_news_id=n.id) and private.club_user_has_permission(auth.uid(), c.id, 'club.posts.read'))) and (p_club_key is null or c.legacy_key=p_club_key) and (p_course_key is null or co.course_key=p_course_key) and (p_news_id is null or n.id=p_news_id);
$function$;

CREATE OR REPLACE FUNCTION private.tournament_anonymize()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; begin
 if tg_table_name='user_accounts' then u:=old.id;if tg_op='UPDATE' and new.account_status<>'withdrawn' then return new;end if;
 else u:=old.user_id;if tg_op='UPDATE' and new.display_name is not null then return new;end if;end if;
 update private.club_tournament_entries set display_name='탈퇴 회원' where person_id in(select id from private.club_score_people where user_id=u);
 update private.tournament_award_news set hidden=true,sentiment='',award_name='',version=version+1 where author_id=u or entry_id in(select e.id from private.club_tournament_entries e join private.club_score_people p on p.id=e.person_id where p.user_id=u);
 update private.tournament_award_comments set posted_as='탈퇴 회원',body='삭제된 댓글' where author_id=u;
 if tg_op='DELETE' then return old;end if;return new;
end $function$;

CREATE OR REPLACE FUNCTION private.messaging_counterpart_name(p_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when a.id is null or a.account_status = 'withdrawn' then '탈퇴한 회원'
    when n.use_real_name then n.real_name
    else coalesce('잔디친구' || n.nickname_number, 'PUL 회원')
  end
  from (select 1) singleton
  left join public.user_accounts a on a.id = p_user_id
  left join private.member_posting_names n on n.user_id = a.id
$function$;

CREATE OR REPLACE FUNCTION public.get_club_broadcast(p_club_id uuid, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id); v_m public.messaging_messages%rowtype;
begin
  select m.* into v_m from public.messaging_messages m join public.messaging_club_broadcast_contexts c on c.message_id=m.id
    where c.club_id=p_club_id and m.id=p_message_id and m.kind='club_broadcast';
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('id',v_m.id,'body',v_m.body,'created_at',v_m.created_at,
    'sender_display',private.messaging_counterpart_name(v_m.sender_user_id),'recipient_count',v_m.broadcast_recipient_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_club_broadcasts(p_club_id uuid, p_limit integer DEFAULT 20, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := private.messaging_assert_club_broadcaster(p_club_id); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with page as (select m.* from public.messaging_messages m join public.messaging_club_broadcast_contexts c on c.message_id=m.id
    where c.club_id=p_club_id and m.kind='club_broadcast'
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id)) order by m.created_at desc,m.id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',created_at,'preview',left(body,100),
    'sender_display',private.messaging_counterpart_name(sender_user_id),'recipient_count',broadcast_recipient_count)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_club_event_broadcast(p_event_id uuid, p_message_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_club uuid := private.messaging_assert_event_operator(p_event_id); v_m public.messaging_messages%rowtype;
begin
  select m.* into v_m from public.messaging_messages m join public.messaging_club_event_broadcast_contexts c on c.message_id=m.id
    where c.club_event_id=p_event_id and c.club_id=v_club and m.id=p_message_id and m.kind='club_event_broadcast';
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('id',v_m.id,'body',v_m.body,'created_at',v_m.created_at,
    'sender_display',private.messaging_counterpart_name(v_m.sender_user_id),'recipient_count',v_m.broadcast_recipient_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_club_event_broadcasts(p_event_id uuid, p_limit integer DEFAULT 20, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_club uuid := private.messaging_assert_event_operator(p_event_id); v_rows jsonb; v_more boolean;
begin
  perform private.messaging_validate_page(p_limit,p_cursor_at,p_cursor_id);
  with page as (select m.* from public.messaging_messages m join public.messaging_club_event_broadcast_contexts c on c.message_id=m.id
    where c.club_event_id=p_event_id and c.club_id=v_club and m.kind='club_event_broadcast'
      and (p_cursor_at is null or (m.created_at,m.id)<(p_cursor_at,p_cursor_id)) order by m.created_at desc,m.id desc limit p_limit+1),
  numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'at',created_at,'preview',left(body,100),
    'sender_display',private.messaging_counterpart_name(sender_user_id),'recipient_count',broadcast_recipient_count)
    order by created_at desc,id desc) filter(where n<=p_limit),'[]'::jsonb),count(*)>p_limit into v_rows,v_more from numbered;
  return jsonb_build_object('items',v_rows,'has_more',v_more,'next_cursor',case when v_more then
    jsonb_build_object('at',v_rows->(p_limit-1)->>'at','id',v_rows->(p_limit-1)->>'id') else null end);
end;
$function$;

CREATE OR REPLACE FUNCTION private.course_inquiry_current(p_course_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid;r private.course_inquiry_recipients%rowtype;
begin
 perform private.require_course_applicant();select id into c from public.courses where course_key=p_course_key and course_status='active';if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 select * into r from private.course_inquiry_recipients where course_id=c;
 if r.user_id is null or not exists(select 1 from private.course_stewards where course_id=c and user_id=r.user_id and active) or not private.messaging_account_available(r.user_id) then return jsonb_build_object('user_id',null,'version',coalesce(r.version,0),'name',null);end if;
 return jsonb_build_object('user_id',r.user_id,'version',r.version,'name',private.messaging_counterpart_name(r.user_id));
end $function$;

CREATE OR REPLACE FUNCTION public.get_messaging_report(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := private.messaging_assert_report_manager(); v_r public.messaging_reports%rowtype; v_m public.messaging_messages%rowtype;
begin
  select * into v_r from public.messaging_reports where id=p_report_id;
  if not found then raise exception 'messaging_not_found' using errcode='P0002'; end if;
  select * into v_m from public.messaging_messages where id=v_r.message_id;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id)
    values(v_actor,'operator','messaging.report.view','messaging_report',p_report_id::text);
  return jsonb_build_object('id',v_r.id,'message_id',v_m.id,'body',v_m.body,
    'sender_display',private.messaging_counterpart_name(v_m.sender_user_id),'reporter_display',private.messaging_counterpart_name(v_r.reporter_user_id),
    'reason',v_r.reason,'detail',v_r.detail,'status',v_r.status,'created_at',v_r.created_at,'message_created_at',v_m.created_at,'resolved_at',v_r.resolved_at);
end;
$function$;

commit;
