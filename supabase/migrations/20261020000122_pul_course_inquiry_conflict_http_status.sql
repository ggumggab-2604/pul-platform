-- Intentional recipient/version conflicts are HTTP 409, not serialization failures.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely. Keep 00121 immutable.
-- Preserve actor checks, locks, committed-request replay and existing EXECUTE ACL.
begin;
create or replace function private.course_inquiry_send(p_course_key text,p_body text,p_request_id uuid,p_recipient uuid,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=private.messaging_assert_actor();c uuid;r private.course_inquiry_recipients%rowtype;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 -- An already committed request returns its original receipt without delivering to a new representative.
 if exists(select 1 from public.messaging_messages m join private.course_inquiry_contexts x on x.message_id=m.id where m.sender_user_id=a and m.request_id=p_request_id and x.course_id=c) then return private.course_content_send_inquiry(p_course_key,p_body,p_request_id);end if;
 select * into r from private.course_inquiry_recipients where course_id=c for share;
 if r.user_id is null or r.user_id is distinct from p_recipient or r.version is distinct from p_version then raise exception '문의 수신자가 변경되었습니다. 작성 내용은 유지됩니다. 새 수신자를 확인해 주세요.' using errcode='PT409';end if;
 return private.course_content_send_inquiry(p_course_key,p_body,p_request_id);
end $$;

-- F1: permanent conflicts in the other course RPCs also return HTTP 409.
-- Definitions below are the final catalog definitions after migrations 00000..00121,
-- not historical copies. Only explicit conflict SQLSTATE values change;
-- CREATE OR REPLACE retains ownership and EXECUTE ACLs.

-- private.course_content_event_occurrence: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_content_event_occurrence(p_event_key text, p_status text DEFAULT NULL::text, p_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.require_course_applicant(); e public.events%rowtype;
begin
 if not private.event_actor_has_management_permission(a) then raise exception '대회 관리 권한이 없습니다.' using errcode='42501';end if;
 select * into e from public.events where event_key=p_event_key for update;if not found then raise exception '대회를 찾을 수 없습니다.';end if;
 if p_status is not null then
 if p_status not in ('scheduled','cancelled') or p_version is distinct from e.version then raise exception '현재 대회 상태를 확인해 주세요.' using errcode='PT409';end if;
 update public.events set occurrence_status=p_status,version=version+1,updated_at=now(),updated_by=a where id=e.id returning * into e;
 end if;
 return jsonb_build_object('status',e.occurrence_status,'version',e.version);
end $function$
;

-- private.course_content_mutate: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_content_mutate(p_course_key text, p_action text, p_id uuid, p_version integer, p_request_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.require_course_applicant(); c public.courses%rowtype; r private.course_resources%rowtype; manager boolean; result jsonb; ids uuid[]; k text; url text;
begin
 if not private.messaging_account_available(a) then raise exception '정상 활동 회원만 등록할 수 있습니다.' using errcode='42501';end if;
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 manager:=private.course_can_manage(c.id,a);if p_action in ('hide','represent') then perform private.course_require_scope(c.id);end if;
 if p_action not in ('save','delete','represent','hide') then raise exception '자료 작업을 확인해 주세요.';end if;
 if p_id is not null then
 select * into r from private.course_resources where id=p_id and course_id=c.id for update;
 if not found then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action in ('save','delete') and r.author_id<>a or p_action in ('represent','hide') and not manager then raise exception '자료 관리 권한이 없습니다.' using errcode='42501';end if;
 elsif p_action<>'save' then raise exception '자료를 확인해 주세요.';end if;
 result:=private.course_claim_request(a,p_request_id,'course.resource_'||p_action,jsonb_build_object('course',c.id,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if r.id is not null and (r.version<>p_version or r.status<>'published') then raise exception '자료가 변경되었거나 공개되지 않았습니다. 새로고침해 주세요.' using errcode='PT409';end if;
 if p_action='save' then
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) x where x not in ('kind','title','scope','description','video_url','reference_date','source','images')) then raise exception '자료 입력 항목을 확인해 주세요.';end if;
 k:=p_input->>'kind';url:=nullif(btrim(p_input->>'video_url'),'');
 if k not in ('video','yardage') or k is null or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'scope',''))) not between 1 and 100 or char_length(coalesce(p_input->>'description',''))>3000 or char_length(coalesce(p_input->>'reference_date',''))>100 or char_length(coalesce(p_input->>'source',''))>300 then raise exception '자료 제목·분류·설명을 확인해 주세요.';end if;
 if c.course_type='screen' and (k<>'video' or not private.course_content_youtube(url)) then raise exception '스크린은 유튜브 동영상 링크만 등록할 수 있습니다.';end if;
 if k='video' and (url is null or char_length(url)>1000 or url !~ '^https?://[^/@[:space:]]+[^[:space:]]*$') then raise exception '영상 링크를 확인해 주세요.';end if;
 if k='yardage' and url is not null then raise exception '야디지북에는 이미지 자료를 선택해 주세요.';end if;
 if jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '이미지 목록을 확인해 주세요.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
 if cardinality(ids)>8 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or k='yardage' and cardinality(ids)=0 or k='video' and cardinality(ids)>0 then raise exception '야디지북은 중복 없이 1~8장을 선택해 주세요.';end if;
 perform id from private.course_resource_images where id=any(ids) order by id for update;
 if (select count(*) from private.course_resource_images i where i.id=any(ids) and i.owner_id=a and i.course_id=c.id and i.ready and (i.resource_id is null or i.resource_id=r.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 이미지만 연결할 수 있습니다.' using errcode='42501';end if;
 if r.id is null then insert into private.course_resources(course_id,author_id,kind,title,scope,description,video_url,reference_date,source) values(c.id,a,k,btrim(p_input->>'title'),btrim(p_input->>'scope'),coalesce(p_input->>'description',''),url,nullif(btrim(p_input->>'reference_date'),''),nullif(btrim(p_input->>'source'),'')) returning * into r;
 else update private.course_resources set kind=k,title=btrim(p_input->>'title'),scope=btrim(p_input->>'scope'),description=coalesce(p_input->>'description',''),video_url=url,reference_date=nullif(btrim(p_input->>'reference_date'),''),source=nullif(btrim(p_input->>'source'),''),version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 update private.course_resource_images set resource_id=null,position=null where resource_id=r.id and not(id=any(ids));
 update private.course_resource_images set resource_id=r.id,position=array_position(ids,id) where id=any(ids);
 elsif p_action='represent' then
 if c.course_type<>'field' then raise exception '스크린에는 대표 자료 기능이 없습니다.';end if;
 if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '대표 상태를 확인해 주세요.';end if;
 update private.course_resources set representative=(p_input->>'enabled')::boolean,version=version+1,updated_at=now() where id=r.id returning * into r;
 else update private.course_resources set status=case when p_action='delete' then 'deleted' else 'hidden' end,representative=false,version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 result:=jsonb_build_object('id',r.id,'version',r.version,'status',r.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_content_notice_mutate: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_content_notice_mutate(p_course_key text, p_action text, p_id uuid, p_version integer, p_request_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.require_course_applicant();c uuid;manager boolean;steward boolean;n private.course_public_notices%rowtype;result jsonb;draft jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' and course_type='screen' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
 manager:=private.course_actor_has_permission(a,'courses.manage');if p_action in ('publish','hide') then perform private.course_require_scope(c);manager:=true;end if;
 perform user_id from private.course_stewards where course_id=c and user_id=a and active for share;steward:=found;
 if not(manager or steward) or p_action not in ('submit','publish','approve','reject','hide') or p_action<>'submit' and not manager then raise exception '공지 관리 권한이 없습니다.' using errcode='42501';end if;
 if p_id is not null then select * into n from private.course_public_notices where id=p_id and course_id=c for update;if not found then raise exception '공지를 찾을 수 없습니다.';end if;end if;
 result:=private.course_claim_request(a,p_request_id,'course.notice_'||p_action,jsonb_build_object('course',c,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if n.id is not null and n.version<>p_version then raise exception '공지가 변경되었습니다. 새로고침해 주세요.' using errcode='PT409';end if;
 if p_action in ('submit','publish') then
 if jsonb_typeof(p_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_input)x where x not in ('title','body')) or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'body',''))) not between 2 and 1800 then raise exception '제목 2~120자·내용 2~1800자를 입력해 주세요.';end if;
 draft:=jsonb_build_object('title',btrim(p_input->>'title'),'body',btrim(p_input->>'body'));
 if n.id is null then insert into private.course_public_notices(course_id) values(c) returning * into n;end if;
 if p_action='submit' then update private.course_public_notices set pending_input=draft,submitted_by=a,version=version+1,updated_at=now() where id=n.id returning * into n;
 else update private.course_public_notices set title=draft->>'title',body=draft->>'body',status='published',published_at=coalesce(published_at,now()),pending_input=null,submitted_by=null,published_version=version+1,version=version+1,updated_at=now() where id=n.id returning * into n;end if;
 elsif p_action='approve' then
 if n.pending_input is null then raise exception '검토할 제출본이 없습니다.';end if;
 perform user_id from private.course_stewards where course_id=c and user_id=n.submitted_by and active for share;
 if not found or not private.messaging_account_available(n.submitted_by) then raise exception '제출자의 현재 담당 권한을 확인해 주세요.' using errcode='42501';end if;
 update private.course_public_notices set title=pending_input->>'title',body=pending_input->>'body',status='published',published_at=coalesce(published_at,now()),pending_input=null,submitted_by=null,published_version=version+1,version=version+1,updated_at=now() where id=n.id returning * into n;
 elsif p_action='reject' then update private.course_public_notices set pending_input=null,submitted_by=null,version=version+1,updated_at=now() where id=n.id returning * into n;
 else update private.course_public_notices set status='hidden',version=version+1,updated_at=now() where id=n.id returning * into n;end if;
 if n.id is null then raise exception '공지를 확인해 주세요.';end if;
 result:=jsonb_build_object('id',n.id,'version',n.version,'status',n.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_content_notice_send: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_content_notice_send(p_id uuid, p_version integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n private.course_public_notices%rowtype;d private.course_notice_deliveries%rowtype;result jsonb;
begin
 select * into n from private.course_public_notices where id=p_id for update;if not found then raise exception '공지를 찾을 수 없습니다.';end if;
 perform private.messaging_lock_course_broadcaster(n.course_id);
 if n.status<>'published' or n.published_version<>p_version then raise exception '현재 공개 공지 버전을 확인해 주세요.' using errcode='PT409';end if;
 select * into d from private.course_notice_deliveries where notice_id=n.id and version=n.published_version;
 if found then select jsonb_build_object('id',id,'created_at',created_at,'recipient_count',broadcast_recipient_count) into result from public.messaging_messages where id=d.message_id;return result;end if;
 result:=public.send_course_broadcast(n.course_id,'[운영공지] '||n.title||E'\n'||n.body,p_request_id);
 insert into private.course_notice_deliveries(notice_id,version,message_id,title,body) values(n.id,n.published_version,(result->>'id')::uuid,n.title,n.body);
 return result;
end $function$
;

-- private.course_content_set_recipient: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_content_set_recipient(p_course_key text, p_user_id uuid, p_version integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid;c uuid;r private.course_inquiry_recipients%rowtype;result jsonb;
begin
 select actor_id into a from private.require_course_manager();select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '스크린 구장을 확인해 주세요.';end if;
 perform pg_advisory_xact_lock(813614,hashtext(c::text));
 select * into r from private.course_inquiry_recipients where course_id=c for update;
 result:=private.course_claim_request(a,p_request_id,'course.inquiry_recipient',jsonb_build_object('course',c,'user',p_user_id,'version',p_version));if result is not null then return result;end if;
 if coalesce(r.version,0)<>p_version then raise exception '문의 담당자가 변경되었습니다. 새로고침해 주세요.' using errcode='PT409';end if;
 if p_user_id is not null then
 perform user_id from private.course_stewards where course_id=c and user_id=p_user_id and active for share;
 if not found or not private.messaging_account_available(p_user_id) then raise exception '활성 상태인 확인된 구장 담당자를 선택해 주세요.' using errcode='42501';end if;end if;
 insert into private.course_inquiry_recipients(course_id,user_id) values(c,p_user_id) on conflict(course_id) do update set user_id=excluded.user_id,version=course_inquiry_recipients.version+1,updated_at=now() returning * into r;
 result:=jsonb_build_object('version',r.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_management_save: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_management_save(p_course_key text, p_updated_at timestamp with time zone, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.courses%rowtype; a uuid; d jsonb; state jsonb; result jsonb; today date:=(now() at time zone 'Asia/Seoul')::date; cf date;ct date;pf date;pt date;os text;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' for update;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c.id);
 if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.direct_information',jsonb_build_object('course',c.id,'base',p_updated_at,'input',p_input));if result is not null then return result;end if;
 if c.updated_at is distinct from p_updated_at then raise exception '다른 변경이 먼저 저장되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 d:=private.course_application_draft(p_input->'course');state:=p_input->'state';
 if d->>'reservation_url' ~ '^https://[^/]*@' or d->>'reservation_url' ~ '[[:space:]\\]' then raise exception '예약 링크는 인증정보 없는 HTTPS 주소를 확인해 주세요.' using errcode='22023';end if;
 if d->>'course_type' is distinct from c.course_type or d->>'region' is distinct from c.region or d->>'city' is distinct from c.city then raise exception '유형·지역 변경은 기존 PUL 관리에서 처리해 주세요.' using errcode='22023';end if;
 if state is null or jsonb_typeof(state)<>'object' or exists(select 1 from jsonb_object_keys(state) k where k not in ('operating_status','closed_from','closed_to','closed_reason','planned_closed_from','planned_closed_to','planned_closed_reason')) then raise exception '운영 상태를 확인해 주세요.' using errcode='22023';end if;
 os:=nullif(state->>'operating_status','');cf:=nullif(state->>'closed_from','')::date;ct:=nullif(state->>'closed_to','')::date;pf:=nullif(state->>'planned_closed_from','')::date;pt:=nullif(state->>'planned_closed_to','')::date;
 if os is not null and os not in ('open','closed') or (cf is null)<>(ct is null) or (pf is null)<>(pt is null) or cf>ct or pf>pt
 or cf is not null and (os is distinct from 'closed' or cf>today or ct<today)
 or pf is not null and pf<=today or char_length(coalesce(state->>'closed_reason',''))>500 or char_length(coalesce(state->>'planned_closed_reason',''))>500
 or pf is not null and char_length(btrim(coalesce(state->>'planned_closed_reason','')))<2 then raise exception '현재 상태와 휴장 기간·사유를 확인해 주세요. 예정 휴장은 미래 기간으로 입력합니다.' using errcode='22023';end if;
 update public.courses set name=d->>'name',address=d->>'address',holes=(d->>'holes')::smallint,bay_count=(d->>'bay_count')::integer,
 operating_hours=d->>'operating_hours',operation_code=d->>'operation_code',phone=d->>'phone',parking_available=(d->>'parking_available')::boolean,
 description=d->>'description',reservation_url=d->>'reservation_url',reservation_guide=d->>'reservation_guide',fee_guide=d->>'fee_guide',
 operating_status=os,closed_from=cf,closed_to=ct,closed_reason=nullif(btrim(state->>'closed_reason'),''),planned_closed_from=pf,planned_closed_to=pt,planned_closed_reason=nullif(btrim(state->>'planned_closed_reason'),''),updated_at=clock_timestamp() where id=c.id returning * into c;
 result:=jsonb_build_object('course_key',c.course_key,'updated_at',c.updated_at);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_media_hide: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_media_hide(p_course_key text, p_media_key text, p_version integer, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid;a uuid;m public.course_media%rowtype;result jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c);select * into m from public.course_media where course_id=c and media_key=p_media_key for update;if not found then raise exception '사진을 찾을 수 없습니다.' using errcode='P0002';end if;
 result:=private.course_claim_request(a,p_request_id,'course.media_hide',jsonb_build_object('course',c,'media',p_media_key,'version',p_version));if result is not null then return result;end if;
 if m.version is distinct from p_version or m.media_status<>'available' then raise exception '사진 상태가 변경되었습니다.' using errcode='PT409';end if;
 update public.course_media set media_status='removed',removed_at=now(),version=version+1 where id=m.id;
 result:=jsonb_build_object('media_key',p_media_key);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_report_process: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_report_process(p_course_key text, p_report_id uuid, p_updated_at timestamp with time zone, p_resolution text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c uuid;a uuid;r public.course_information_reports%rowtype;result jsonb;
begin
 select id into c from public.courses where course_key=p_course_key and course_status='active' for share;if c is null then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 a:=private.course_require_scope(c);
 select * into r from public.course_information_reports where id=p_report_id and target_course_id=c for update;if not found then raise exception '담당 구장 제보를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_resolution is null or p_resolution not in ('handled','dismissed') or p_request_id is null then raise exception '처리 상태를 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.scoped_report',jsonb_build_object('course',c,'report',p_report_id,'base',p_updated_at,'resolution',p_resolution));if result is not null then return result;end if;
 if r.updated_at is distinct from p_updated_at or r.report_status<>'received' then raise exception '제보 상태가 변경되었습니다. 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 update public.course_information_reports set report_status=p_resolution,resolved_at=now(),resolved_by=a,resolution_note=null where id=r.id;
 result:=jsonb_build_object('id',r.id);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.course_story_mutate: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION private.course_story_mutate(p_course_key text, p_post_key text, p_action text, p_version integer, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.community_assert_active_actor();c public.courses%rowtype;p public.course_discussion_posts%rowtype;cm private.course_story_comments%rowtype;manager boolean;result jsonb;ids uuid[];cat text;state text;cid uuid;parent uuid;
begin
 select * into c from public.courses where course_key=p_course_key and course_status='active' and course_type='field' for share;if not found then raise exception '야외 구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action is null or p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023';end if;
 manager:=private.course_can_manage(c.id,a);if p_action='save' and coalesce((p_input->>'pin')::boolean,false) then perform private.course_require_scope(c.id);end if;
 if p_post_key is not null then select * into p from public.course_discussion_posts where post_key=p_post_key and course_id=c.id for update;if not found then raise exception '글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
 if p_action in ('hide','unhide','pin','status','report_resolve') then perform private.course_require_scope(c.id);end if;
 if p_action in ('save','delete') and p.id is not null and p.author_user_id<>a then raise exception '본인 글만 수정·삭제할 수 있습니다.' using errcode='42501';end if;
 if p_action<>'save' and p.id is null then raise exception '글을 확인해 주세요.' using errcode='22023';end if;
 if p_action not in ('unhide','report_resolve') and p.id is not null and (p.post_status<>'published' or p.moderation_hidden_at is not null) then raise exception '공개 글을 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action='unhide' and not private.course_actor_has_permission(a,'courses.manage') then raise exception '숨김 해제 권한이 없습니다.' using errcode='42501';end if;
 result:=private.course_claim_request(a,p_request_id,'course.story_'||p_action,jsonb_build_object('course',c.id,'key',p_post_key,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if p_action in ('save','delete','hide','unhide','pin','status') and p.id is not null and p.version is distinct from p_version then raise exception '글이 변경되었습니다. 입력을 유지하고 최신 내용을 확인해 주세요.' using errcode='PT409';end if;
 if p_action='save' then
  cat:=p_input->>'category';if cat is null or cat not in ('free','question','lost') or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(btrim(coalesce(p_input->>'body',''))) not between 10 and 1000 or jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '제목 2~120자·본문 10~1000자·분류를 확인해 주세요.' using errcode='22023';end if;
  select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
  if cardinality(ids)>5 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) then raise exception '사진은 중복 없이 최대 5장입니다.' using errcode='22023';end if;
  perform id from private.course_story_images where id=any(ids) order by id for update;
  if (select count(*) from private.course_story_images where id=any(ids) and owner_id=a and course_id=c.id and ready and (post_id is null or post_id=p.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 사진만 연결할 수 있습니다.' using errcode='42501';end if;
  state:=case when cat='question' then 'received' when cat='lost' then 'unresolved' end;
  if p.id is null then perform private.check_public_create_limit('course_discussion',btrim(p_input->>'body'));insert into public.course_discussion_posts(course_id,author_user_id,title,body,category,processing_status) values(c.id,a,btrim(p_input->>'title'),btrim(p_input->>'body'),cat,state) returning * into p;
  else update public.course_discussion_posts set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),category=cat,processing_status=case when cat=category then processing_status else state end,version=version+1 where id=p.id returning * into p;end if;
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
  update public.course_discussion_posts set processing_status=state,version=version+1 where id=p.id returning * into p;
 elsif p_action='comment' then
  parent:=nullif(p_input->>'parent_id','')::uuid;
  if char_length(btrim(coalesce(p_input->>'body',''))) not between 1 and 1000 then raise exception '댓글은 1~1000자로 입력해 주세요.' using errcode='22023';end if;
  if parent is not null then perform id from private.course_story_comments where id=parent and post_id=p.id and parent_id is null and not hidden for share;if not found then raise exception '이 글의 공개 댓글에만 답글을 달 수 있습니다.' using errcode='22023';end if;end if;
  insert into private.course_story_comments(post_id,parent_id,author_id,body) values(p.id,parent,a,btrim(p_input->>'body'));
 elsif p_action in ('comment_hide','comment_delete') then
  select * into cm from private.course_story_comments where id=(p_input->>'comment_id')::uuid and post_id=p.id for update;if not found then raise exception '댓글을 찾을 수 없습니다.' using errcode='P0002';end if;
  if p_action='comment_hide' then perform private.course_require_scope(c.id);elsif cm.author_id<>a then raise exception '본인 댓글만 삭제할 수 있습니다.' using errcode='42501';end if;
  update private.course_story_comments set hidden=true where id=cm.id;
 elsif p_action='report' then
  cid:=nullif(p_input->>'comment_id','')::uuid;
  if cid is not null then select * into cm from private.course_story_comments where id=cid and post_id=p.id and not hidden;if not found or cm.parent_id is not null and exists(select 1 from private.course_story_comments where id=cm.parent_id and hidden) then raise exception '공개 댓글을 찾을 수 없습니다.' using errcode='P0002';end if;end if;
  if coalesce(cm.author_id,p.author_user_id)=a or char_length(btrim(coalesce(p_input->>'reason',''))) not between 2 and 1000 then raise exception '신고 대상·사유를 확인해 주세요.' using errcode='22023';end if;
  insert into private.course_story_reports(post_id,comment_id,reporter_id,reason) values(p.id,cid,a,btrim(p_input->>'reason'));
 elsif p_action='report_resolve' then update private.course_story_reports set resolved=true where id=(p_input->>'report_id')::uuid and post_id=p.id;if not found then raise exception '신고를 찾을 수 없습니다.' using errcode='P0002';end if;
 else raise exception '작업을 확인해 주세요.' using errcode='22023';end if;
 result:=jsonb_build_object('post_key',p.post_key,'version',p.version);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- private.mutate_course_application: 3 conflict branch(es).
CREATE OR REPLACE FUNCTION private.mutate_course_application(p_id uuid, p_action text, p_version integer, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid; r private.course_applications%rowtype; c public.courses%rowtype; d jsonb; replay jsonb; result jsonb; kind text; target uuid; base timestamptz; grant_role boolean; verified boolean;
begin
  a:=private.require_course_applicant();
  if p_id is null or p_request_id is null or p_action is null or p_action not in ('submit','resubmit','supplement','approve','reject','revoke') or p_input is null or jsonb_typeof(p_input)<>'object' then raise exception '요청을 확인해 주세요.' using errcode='22023'; end if;
  if p_action in ('supplement','approve','reject','revoke') then perform private.require_course_manager(); end if;
  replay:=private.course_claim_request(a,p_request_id,'course.application_'||p_action,jsonb_build_object('id',p_id,'version',p_version,'input',p_input));
  if replay is not null then return replay; end if;
  if p_action<>'submit' then
    select * into r from private.course_applications where id=p_id for update;
    if not found then raise exception '신청을 찾을 수 없습니다.' using errcode='P0002'; end if;
    if p_action='resubmit' and r.applicant_id<>a then raise exception '본인 신청만 보완할 수 있습니다.' using errcode='42501'; end if;
    if r.version is distinct from p_version then raise exception '신청이 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='PT409'; end if;
    if p_action='resubmit' and r.status<>'supplement' or p_action in ('supplement','approve','reject') and r.status<>'pending' or p_action='revoke' and (r.status<>'approved' or not r.permission_granted) then raise exception '이미 처리되었거나 처리할 수 없는 신청입니다.' using errcode='22023'; end if;
  end if;
  if p_action in ('submit','resubmit') then
    kind:=case when p_action='submit' then p_input->>'kind' else r.kind end;
    if kind is null or kind not in ('new','claim','edit') then raise exception '신청 종류를 확인해 주세요.' using errcode='22023'; end if;
    if kind<>'new' then
      select * into c from public.courses where (p_action='submit' and course_key=p_input->>'courseKey' or p_action='resubmit' and id=r.target_course_id) and course_status<>'removed' for update;
      if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if kind='claim' and c.course_status<>'active' then raise exception '공개 구장만 관리 권한을 신청할 수 있습니다.' using errcode='42501'; end if;
      if kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=a and active for share;
        if not found then raise exception '승인된 담당 구장만 수정 신청할 수 있습니다.' using errcode='42501'; end if;
        if (p_input->>'baseUpdatedAt')::timestamptz is distinct from c.updated_at then raise exception '공개 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.' using errcode='PT409'; end if;
      end if;
      target:=c.id; base:=c.updated_at;
    end if;
    if coalesce(char_length(btrim(p_input->>'relation')),0) not between 2 and 200 or coalesce(char_length(btrim(p_input->>'verificationContact')),0) not between 5 and 200 then raise exception '담당 관계와 확인 연락 수단을 입력해 주세요.' using errcode='22023'; end if;
    d:=case when kind='claim' then private.public_course_json(c) else private.course_application_draft(p_input->'draft') end;
    if kind='edit' and d->>'course_type'<>c.course_type then raise exception '구장 유형 변경은 PUL 운영자에게 요청해 주세요.' using errcode='22023'; end if;
    if kind<>'claim' and d->>'phone' is not null and (p_input->>'publicContactConfirmed')::boolean is distinct from true then raise exception '공개할 구장 연락처임을 확인해 주세요.' using errcode='22023'; end if;
    if p_action='submit' then
      insert into private.course_applications(id,applicant_id,kind,target_course_id,draft,relation,verification_contact,public_contact_confirmed,base_updated_at)
      values(p_id,a,kind,target,d,btrim(p_input->>'relation'),btrim(p_input->>'verificationContact'),coalesce((p_input->>'publicContactConfirmed')::boolean,false),base) returning * into r;
    else
      update private.course_applications set draft=d,relation=btrim(p_input->>'relation'),verification_contact=btrim(p_input->>'verificationContact'),public_contact_confirmed=coalesce((p_input->>'publicContactConfirmed')::boolean,false),base_updated_at=base,status='pending',version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
    end if;
  elsif p_action in ('supplement','reject') then
    if coalesce(char_length(btrim(p_input->>'note')),0) not between 2 and 500 then raise exception '처리 사유를 2~500자로 입력해 주세요.' using errcode='22023'; end if;
    update private.course_applications set status=case when p_action='supplement' then 'supplement' else 'rejected' end,review_note=btrim(p_input->>'note'),reviewed_by=a,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  elsif p_action='revoke' then
    update private.course_stewards set active=false,updated_at=clock_timestamp() where course_id=r.target_course_id and user_id=r.applicant_id;
    update private.course_applications set permission_granted=false,version=version+1,updated_at=clock_timestamp(),reviewed_by=a where id=r.id returning * into r;
  else
    if (p_input->>'duplicatesChecked')::boolean is distinct from true then raise exception '중복 정보를 확인해 주세요.' using errcode='22023'; end if;
    grant_role:=coalesce((p_input->>'grantPermission')::boolean,false);
    verified:=coalesce((p_input->>'relationVerified')::boolean,false);
    if (r.kind='claim' or grant_role) and not verified then raise exception '담당 관계를 확인해야 권한을 승인할 수 있습니다.' using errcode='22023'; end if;
    if r.kind='claim' and not grant_role then raise exception '관리 권한 신청의 담당 관계를 확인해 주세요.' using errcode='22023'; end if;
    perform 1 from public.user_accounts where id=r.applicant_id and account_status='active' for share;
    if not found then raise exception '비활성 회원의 신청은 승인할 수 없습니다.' using errcode='42501'; end if;
    if r.kind<>'new' then
      select * into c from public.courses where id=r.target_course_id for update;
      if not found or c.course_status='removed' then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002'; end if;
      if c.updated_at is distinct from r.base_updated_at then raise exception '공개 정보가 변경되었습니다. 보완 요청 후 최신 내용으로 다시 검토해 주세요.' using errcode='PT409'; end if;
      if r.kind='edit' then
        perform 1 from private.course_stewards where course_id=c.id and user_id=r.applicant_id and active for share;
        if not found then raise exception '담당 권한이 철회되었습니다.' using errcode='42501'; end if;
      end if;
    end if;
    if r.kind='new' then
      perform pg_advisory_xact_lock(hashtextextended(lower(r.draft->>'name')||'|'||lower(r.draft->>'address'),0));
      if exists(select 1 from public.courses where lower(name)=lower(r.draft->>'name') and lower(address)=lower(r.draft->>'address') and course_status<>'removed') then raise exception '같은 이름·주소의 구장이 있습니다. 기존 구장 관리 권한을 신청해 주세요.' using errcode='23505'; end if;
      d:=r.draft||jsonb_build_object('feature_codes','[]'::jsonb,'latitude',null,'longitude',null);
      result:=public.mutate_managed_course('create',null,null,gen_random_uuid(),d);
      result:=public.mutate_managed_course('activate',result->>'course_key',(result->>'updated_at')::timestamptz,gen_random_uuid(),'{}');
      select * into c from public.courses where course_key=result->>'course_key';
    elsif r.kind='edit' then
      d:=r.draft||jsonb_build_object('feature_codes',to_jsonb(c.feature_codes),'latitude',c.latitude,'longitude',c.longitude);
      perform public.mutate_managed_course('update',c.course_key,c.updated_at,gen_random_uuid(),d);
    end if;
    if grant_role then
      insert into private.course_stewards(course_id,user_id,granted_by) values(c.id,r.applicant_id,a)
      on conflict(course_id,user_id) do update set active=true,granted_by=a,updated_at=clock_timestamp();
    end if;
    update private.course_applications set target_course_id=c.id,status='approved',review_note=null,reviewed_by=a,permission_granted=grant_role,version=version+1,updated_at=clock_timestamp() where id=r.id returning * into r;
  end if;
  result:=jsonb_build_object('id',r.id,'status',r.status,'version',r.version);
  perform private.course_complete_request(a,p_request_id,result);
  return result;
end; $function$
;

-- public.course_operator_images_save: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION public.course_operator_images_save(p_course_key text, p_version integer, p_request_id uuid, p_images jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=auth.uid(); c uuid; v integer; ids uuid[]; entry jsonb; i integer:=0; result jsonb; removed jsonb;
begin
 c:=private.course_operator_assert(a,p_course_key);
 if p_images is null or jsonb_typeof(p_images)<>'array' or jsonb_array_length(p_images)>8 then raise exception '이미지는 최대 8장까지 저장할 수 있습니다.' using errcode='22023';end if;
 for entry in select value from jsonb_array_elements(p_images) loop
  if jsonb_typeof(entry)<>'object' or not(entry ? 'id') or jsonb_typeof(entry->'id')<>'string' or exists(select 1 from jsonb_object_keys(entry) k where k not in ('id','caption'))
   or (entry ? 'caption' and jsonb_typeof(entry->'caption')<>'string') or char_length(coalesce(entry->>'caption',''))>180 then raise exception '이미지 설명을 확인해 주세요.' using errcode='22023';end if;
 end loop;
 select coalesce(array_agg((value->>'id')::uuid),'{}') into ids from jsonb_array_elements(p_images);
 if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception '중복 이미지를 확인해 주세요.' using errcode='22023';end if;
 result:=private.course_claim_request(a,p_request_id,'course.operator_images_save',jsonb_build_object('course',c,'version',p_version,'images',p_images));
 if result is not null then return result;end if;
 insert into private.course_operator_image_sets(course_id) values(c) on conflict do nothing;
 select version into v from private.course_operator_image_sets where course_id=c for update;
 if p_version is distinct from v then raise exception '내용이 변경되었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='PT409';end if;
 if (select count(*) from private.course_operator_images where id=any(ids) and course_id=c and (status='ready' or status='uploaded' and owner_id=a))<>cardinality(ids) then raise exception '이 구장의 저장 완료 이미지만 선택해 주세요.' using errcode='42501';end if;
 select coalesce(jsonb_agg(id),'[]') into removed from private.course_operator_images where course_id=c and status='ready' and not(id=any(ids));
 update private.course_operator_images set status='removed',position=null where course_id=c and status='ready' and not(id=any(ids));
 update private.course_operator_images set position=null where course_id=c and id=any(ids);
 for entry in select value from jsonb_array_elements(p_images) loop
  update private.course_operator_images set status='ready',position=i,caption=btrim(coalesce(entry->>'caption','')) where id=(entry->>'id')::uuid and course_id=c;
  i:=i+1;
 end loop;
 update private.course_operator_image_sets set version=v+1 where course_id=c;
 result:=jsonb_build_object('version',v+1,'removed',removed);
 perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;

-- public.mutate_managed_course: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION public.mutate_managed_course(p_operation text, p_course_key text, p_expected_updated_at timestamp with time zone, p_request_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_action_code text;
  v_request_payload jsonb;
  v_replay jsonb;
  v_result jsonb;
  v_course public.courses%rowtype;
  v_before jsonb;
  v_key text := nullif(pg_catalog.btrim(p_course_key), '');
  v_payload_key_count integer;
  v_feature_codes text[];
begin
  select manager.actor_id, manager.platform_role
  into v_actor_id, v_actor_role
  from private.require_course_manager() as manager;

  if p_operation not in ('create', 'update', 'activate', 'deactivate') then
    raise exception '골프장 작업을 확인해 주세요.' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception '요청 식별자를 확인해 주세요.' using errcode = '22023';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception '골프장 입력값을 확인해 주세요.' using errcode = '22023';
  end if;

  v_action_code := 'course.' || p_operation;
  v_request_payload := pg_catalog.jsonb_build_object(
    'operation', p_operation,
    'course_key', v_key,
    'expected_updated_at', p_expected_updated_at,
    'payload', p_payload
  );
  v_replay := private.course_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    v_request_payload
  );
  if v_replay is not null then
    return v_replay;
  end if;

  if p_operation = 'create' then
    if v_key is not null or p_expected_updated_at is not null then
      raise exception '신규 등록에는 기존 골프장 식별자를 사용할 수 없습니다.' using errcode = '22023';
    end if;
  else
    if v_key is null or v_key !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'
       or p_expected_updated_at is null then
      raise exception '수정할 골프장과 최신 수정 시각을 확인해 주세요.' using errcode = '22023';
    end if;

    select course.*
    into v_course
    from public.courses as course
    where course.course_key = v_key
    for update;

    if not found then
      raise exception '골프장 정보를 찾을 수 없습니다.' using errcode = 'P0002';
    end if;
    if v_course.updated_at <> p_expected_updated_at then
      raise exception '골프장 정보가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
        using errcode = 'PT409';
    end if;
    if v_course.course_status = 'removed' then
      raise exception '제거된 골프장은 운영 화면에서 변경할 수 없습니다.' using errcode = '22023';
    end if;

    v_before := pg_catalog.jsonb_build_object(
      'name', v_course.name,
      'course_status', v_course.course_status,
      'updated_at', v_course.updated_at
    );
  end if;

  if p_operation in ('create', 'update') then
    if exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_payload) as supplied(key)
      where supplied.key not in (
        'name', 'course_type', 'region', 'city', 'address', 'holes', 'bay_count',
        'operating_hours', 'operation_code', 'phone', 'parking_available',
        'feature_codes', 'description', 'reservation_url',
        'reservation_guide', 'fee_guide', 'latitude', 'longitude'
      )
    ) then
      raise exception '지원하지 않는 골프장 입력값이 포함되어 있습니다.' using errcode = '22023';
    end if;
    select pg_catalog.count(*)::integer
    into v_payload_key_count
    from pg_catalog.jsonb_object_keys(p_payload);
    if v_payload_key_count <> (case when p_payload ? 'bay_count' then 18 else 17 end) then
      raise exception '필수 골프장 입력값을 모두 확인해 주세요.' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_typeof(p_payload -> 'holes') not in ('number', 'null')
       or (p_payload ? 'bay_count' and pg_catalog.jsonb_typeof(p_payload -> 'bay_count') not in ('number', 'null'))
       or pg_catalog.jsonb_typeof(p_payload -> 'feature_codes') <> 'array'
       or pg_catalog.jsonb_typeof(p_payload -> 'parking_available') not in ('boolean', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'latitude') not in ('number', 'null')
       or pg_catalog.jsonb_typeof(p_payload -> 'longitude') not in ('number', 'null') then
      raise exception '골프장 숫자·선택 입력값을 확인해 주세요.' using errcode = '22023';
    end if;
    if (p_payload -> 'latitude' = 'null'::jsonb) <> (p_payload -> 'longitude' = 'null'::jsonb) then
      raise exception '위도와 경도는 함께 입력해 주세요.' using errcode = '22023';
    end if;

    if p_payload ->> 'course_type' = 'field' and (
      p_payload ->> 'holes' is null or (p_payload ->> 'holes')::numeric not between 1 and 32767
      or (p_payload ->> 'holes')::numeric <> pg_catalog.trunc((p_payload ->> 'holes')::numeric)) then
      raise exception '야외 홀 수는 1~32767의 정수로 입력해 주세요.' using errcode = '22023';
    end if;
    if p_payload ->> 'bay_count' is not null and (
      (p_payload ->> 'bay_count')::numeric not between 1 and 2147483647
      or (p_payload ->> 'bay_count')::numeric <> pg_catalog.trunc((p_payload ->> 'bay_count')::numeric)) then
      raise exception '타석 수는 양의 정수로 입력해 주세요.' using errcode = '22023';
    end if;

    select coalesce(pg_catalog.array_agg(feature.value order by feature.value), '{}'::text[])
    into v_feature_codes
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'feature_codes') as feature(value);

    if p_operation = 'create' then
      v_key := 'course-' || pg_catalog.replace(
        pg_catalog.gen_random_uuid()::text,
        '-',
        ''
      );

      insert into public.courses (
        course_key,
        name,
        course_type,
        region,
        city,
        address,
        holes,
        bay_count,
        operating_hours,
        operation_code,
        phone,
        parking_available,
        feature_codes,
        description,
        reservation_url,
        reservation_guide,
        fee_guide,
        latitude,
        longitude,
        course_status
      ) values (
        v_key,
        pg_catalog.btrim(p_payload ->> 'name'),
        p_payload ->> 'course_type',
        p_payload ->> 'region',
        pg_catalog.btrim(p_payload ->> 'city'),
        pg_catalog.btrim(p_payload ->> 'address'),
        case when p_payload ->> 'course_type' = 'field' then (p_payload ->> 'holes')::smallint else null end,
        (p_payload ->> 'bay_count')::integer,
        nullif(pg_catalog.btrim(p_payload ->> 'operating_hours'), ''),
        p_payload ->> 'operation_code',
        nullif(pg_catalog.btrim(p_payload ->> 'phone'), ''),
        case when p_payload -> 'parking_available' = 'null'::jsonb then null else (p_payload ->> 'parking_available')::boolean end,
        v_feature_codes,
        pg_catalog.btrim(p_payload ->> 'description'),
        nullif(pg_catalog.btrim(p_payload ->> 'reservation_url'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'reservation_guide'), ''),
        nullif(pg_catalog.btrim(p_payload ->> 'fee_guide'), ''),
        case when p_payload -> 'latitude' = 'null'::jsonb then null else (p_payload ->> 'latitude')::numeric end,
        case when p_payload -> 'longitude' = 'null'::jsonb then null else (p_payload ->> 'longitude')::numeric end,
        'inactive'
      )
      returning * into v_course;
    else
      update public.courses as course
      set name = pg_catalog.btrim(p_payload ->> 'name'),
          course_type = p_payload ->> 'course_type',
          region = p_payload ->> 'region',
          city = pg_catalog.btrim(p_payload ->> 'city'),
          address = pg_catalog.btrim(p_payload ->> 'address'),
          holes = case when p_payload ->> 'course_type' = 'field' then (p_payload ->> 'holes')::smallint else course.holes end,
          bay_count = case when p_payload ? 'bay_count' then (p_payload ->> 'bay_count')::integer else course.bay_count end,
          operating_hours = nullif(pg_catalog.btrim(p_payload ->> 'operating_hours'), ''),
          operation_code = p_payload ->> 'operation_code',
          phone = nullif(pg_catalog.btrim(p_payload ->> 'phone'), ''),
          parking_available = case when p_payload -> 'parking_available' = 'null'::jsonb then null else (p_payload ->> 'parking_available')::boolean end,
          feature_codes = v_feature_codes,
          description = pg_catalog.btrim(p_payload ->> 'description'),
          reservation_url = nullif(pg_catalog.btrim(p_payload ->> 'reservation_url'), ''),
          reservation_guide = nullif(pg_catalog.btrim(p_payload ->> 'reservation_guide'), ''),
          fee_guide = nullif(pg_catalog.btrim(p_payload ->> 'fee_guide'), ''),
          latitude = case when p_payload -> 'latitude' = 'null'::jsonb then null else (p_payload ->> 'latitude')::numeric end,
          longitude = case when p_payload -> 'longitude' = 'null'::jsonb then null else (p_payload ->> 'longitude')::numeric end
      where course.id = v_course.id
      returning * into v_course;
    end if;
  elsif p_payload <> '{}'::jsonb then
    raise exception '공개 상태 변경에는 추가 입력값을 사용할 수 없습니다.' using errcode = '22023';
  elsif p_operation = 'activate' then
    update public.courses as course
    set course_status = 'active'
    where course.id = v_course.id
    returning * into v_course;
  elsif p_operation = 'deactivate' then
    update public.courses as course
    set course_status = 'inactive'
    where course.id = v_course.id
    returning * into v_course;
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'course_key', v_course.course_key,
    'course_status', v_course.course_status,
    'updated_at', v_course.updated_at,
    'request_id', p_request_id
  );

  perform private.course_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'course',
    v_course.course_key,
    v_before,
    pg_catalog.jsonb_build_object(
      'name', v_course.name,
      'course_status', v_course.course_status,
      'updated_at', v_course.updated_at
    ),
    p_request_id
  );
  perform private.course_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$function$
;

-- public.resolve_course_information_report_for_management: 1 conflict branch(es).
CREATE OR REPLACE FUNCTION public.resolve_course_information_report_for_management(p_report_id uuid, p_resolution text, p_expected_updated_at timestamp with time zone, p_resolution_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_report public.course_information_reports%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_resolution_note), '');
  v_action_code text;
  v_replay jsonb;
  v_result jsonb;
begin
  select manager.actor_id, manager.platform_role
  into v_actor_id, v_actor_role
  from private.require_course_manager() as manager;

  if p_report_id is null or p_expected_updated_at is null or p_request_id is null
     or p_resolution not in ('handled', 'dismissed') then
    raise exception '제보 처리 요청을 확인해 주세요.' using errcode = '22023';
  end if;
  if v_note is not null and pg_catalog.char_length(v_note) not between 2 and 500 then
    raise exception '운영 메모는 2~500자로 입력해 주세요.' using errcode = '22023';
  end if;

  v_action_code := 'course.information_report.' || p_resolution;
  v_replay := private.course_claim_request(
    v_actor_id,
    p_request_id,
    v_action_code,
    pg_catalog.jsonb_build_object(
      'report_id', p_report_id,
      'resolution', p_resolution,
      'expected_updated_at', p_expected_updated_at,
      'resolution_note', v_note
    )
  );
  if v_replay is not null then
    return v_replay;
  end if;

  select report.*
  into v_report
  from public.course_information_reports as report
  where report.id = p_report_id
  for update;

  if not found then
    raise exception '제보를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_report.updated_at <> p_expected_updated_at then
    raise exception '제보 상태가 변경되었습니다. 최신 내용을 다시 확인해 주세요.'
      using errcode = 'PT409';
  end if;
  if v_report.report_status <> 'received' then
    raise exception '이미 처리된 제보입니다.' using errcode = '22023';
  end if;

  update public.course_information_reports as report
  set report_status = p_resolution,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor_id,
      resolution_note = v_note
  where report.id = v_report.id
  returning * into v_report;

  v_result := pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'report_status', v_report.report_status,
    'updated_at', v_report.updated_at,
    'request_id', p_request_id
  );

  perform private.course_write_audit(
    v_actor_id,
    v_actor_role,
    v_action_code,
    'course_information_report',
    v_report.id::text,
    pg_catalog.jsonb_build_object('report_status', 'received'),
    pg_catalog.jsonb_build_object('report_status', v_report.report_status),
    p_request_id
  );
  perform private.course_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$function$
;

-- Permanent moderation business conflicts; retain NOWAIT serialization handling.
CREATE OR REPLACE FUNCTION public.moderate_public_content(p_target_type text, p_target_id uuid, p_action text, p_reason text, p_expected_version integer, p_expected_moderation_version integer, p_report_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := private.community_assert_report_manager();
  v_report public.community_reports%rowtype;
  v_state text;
  v_hidden timestamptz;
  v_version integer;
  v_moderation_version integer;
  v_parent uuid;
  v_parent_visible boolean;
  v_now timestamptz;
begin
  if p_target_type is null or p_target_type not in ('post','comment','course','certification')
    or p_target_id is null or p_action is null or p_action not in ('restrict','restore')
    or p_reason is null or p_reason not in ('spam','harassment','inappropriate','fraud','other')
    or p_expected_version is null or p_expected_version < 0
    or p_expected_moderation_version is null or p_expected_moderation_version < 0 then
    raise exception 'moderation_invalid' using errcode = '22023';
  end if;
  -- Lock target first, matching owner comment edits. Restore alone additionally
  -- takes a non-waiting parent SHARE lock below; restrict keeps target -> report.
  case p_target_type
    when 'post' then
      select post_status, moderation_hidden_at, version, moderation_version
      into v_state,v_hidden,v_version,v_moderation_version from public.community_posts where id=p_target_id for update;
    when 'comment' then
      select case when removed_at is null then 'published' else 'removed' end,
        moderation_hidden_at, version, moderation_version, post_id
      into v_state,v_hidden,v_version,v_moderation_version,v_parent from public.community_comments where id=p_target_id for update;
    when 'course' then
      select post_status,moderation_hidden_at,0,moderation_version,course_id
      into v_state,v_hidden,v_version,v_moderation_version,v_parent from public.course_discussion_posts where id=p_target_id for update;
    when 'certification' then
      select post_status,moderation_hidden_at,0,moderation_version
      into v_state,v_hidden,v_version,v_moderation_version from public.certification_study_posts where id=p_target_id for update;
  end case;
  if v_state is null then raise exception 'moderation_missing' using errcode = 'P0002'; end if;
  -- Report + restriction is one transaction. A closed/stale/mismatched report cannot alter content.
  -- Lock target before report: report submission also locks content before inserting.
  -- This prevents a report-row/content-row lock cycle with concurrent submissions.
  if p_report_id is not null then
    if p_action <> 'restrict' or p_target_type not in ('post','comment') then
      raise exception 'moderation_invalid' using errcode = '22023';
    end if;
    select * into v_report from public.community_reports where id = p_report_id for update;
    if not found or v_report.status <> 'open' then
      raise exception 'moderation_conflict' using errcode = 'PT409';
    end if;
    if (p_target_type = 'post' and (v_report.comment_id is not null or v_report.post_id <> p_target_id))
      or (p_target_type = 'comment' and v_report.comment_id is distinct from p_target_id) then
      raise exception 'moderation_target_mismatch' using errcode = '22023';
    end if;
  end if;
  if p_report_id is not null and p_target_type = 'comment' and v_report.post_id <> v_parent then
    raise exception 'moderation_target_mismatch' using errcode = '22023';
  end if;
  if v_version <> p_expected_version or v_moderation_version <> p_expected_moderation_version then
    raise exception 'moderation_conflict' using errcode = 'PT409';
  end if;
  if p_action = 'restrict' and (v_state <> 'published' or v_hidden is not null) then
    raise exception 'moderation_state' using errcode = '22023';
  end if;
  if p_action = 'restore' and (v_hidden is null or v_state <> case when p_target_type='comment' then 'published' else 'hidden' end) then
    raise exception 'moderation_state' using errcode = '22023';
  end if;
  if p_action = 'restore' and p_target_type in ('comment','course') then
    -- SHARE blocks parent UPDATE/DELETE through commit (KEY SHARE is insufficient).
    -- NOWAIT avoids adding a target -> parent wait edge against report submission
    -- (parent -> comment) or a queued parent writer. A busy parent requires retry.
    -- Read eligibility from the locked row, never from the management-page snapshot.
    begin
      if p_target_type = 'comment' then
        select p.post_status = 'published' and p.moderation_hidden_at is null
        into v_parent_visible from public.community_posts p where p.id = v_parent for share nowait;
      else
        select c.course_status = 'active'
        into v_parent_visible from public.courses c where c.id = v_parent for share nowait;
      end if;
    exception when lock_not_available then
      raise exception 'moderation_conflict' using errcode = '40001';
    end;
    if v_parent_visible is distinct from true then
      raise exception 'moderation_parent_unavailable' using errcode = '22023';
    end if;
  end if;
  v_now := pg_catalog.clock_timestamp();
  case p_target_type
    when 'post' then
      update public.community_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'comment' then
      update public.community_comments set
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'course' then
      update public.course_discussion_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
    when 'certification' then
      update public.certification_study_posts set
        post_status = case when p_action='restrict' then 'hidden' else 'published' end,
        moderation_hidden_at = case when p_action='restrict' then v_now else null end,
        moderation_version = moderation_version + 1, updated_at = v_now where id=p_target_id;
  end case;
  insert into public.audit_logs(actor_id,actor_type,action,target_type,target_id,reason,before_summary,after_summary,metadata,created_at)
  values(v_actor,'operator','content.'||p_action,'content.'||p_target_type,p_target_id::text,p_reason,
    pg_catalog.jsonb_build_object('restricted',v_hidden is not null,'moderation_version',v_moderation_version),
    pg_catalog.jsonb_build_object('restricted',p_action='restrict','moderation_version',v_moderation_version+1),
    pg_catalog.jsonb_build_object('report_id',p_report_id),v_now);
  if p_report_id is not null then
    update public.community_reports set status='resolved',resolved_by=v_actor,resolved_at=v_now where id=p_report_id;
  end if;
  return pg_catalog.jsonb_build_object('id',p_target_id,'restricted',p_action='restrict',
    'moderation_version',v_moderation_version+1,'report_resolved',p_report_id is not null);
end;
$function$;

commit;
