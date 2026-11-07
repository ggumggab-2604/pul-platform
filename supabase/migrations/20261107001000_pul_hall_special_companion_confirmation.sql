-- President registration and witness certification are distinct. NULL preserves the previous workflow.
alter table private.hall_special_applications
  add column required_companions smallint check (required_companions between 0 and 2),
  add column companion_message_id uuid unique references public.messaging_messages(id) on delete set null;

create table private.hall_special_companions (
  application_record_id uuid not null references private.hall_special_applications(application_record_id),
  membership_id uuid not null references public.club_memberships(id),
  approved_at timestamptz,
  primary key (application_record_id, membership_id)
);
revoke all on private.hall_special_companions from public, anon, authenticated, service_role;

-- A PUL notice uses the existing inbox delivery and read receipts for this exact recipient snapshot.
create function private.invite_hall_special_companions(
  p_application uuid, p_club uuid, p_achiever uuid, p_required smallint, p_input jsonb
) returns void language plpgsql set search_path='' as $$
declare
  selected uuid[];
  memberships uuid[];
  notice_id uuid;
  notice_at timestamptz := clock_timestamp();
  notice_body text;
begin
  if jsonb_typeof(coalesce(p_input, '[]')) <> 'array' then
    raise exception 'SPECIAL_COMPANIONS_INVALID' using errcode='22023';
  end if;
  select array(select value::uuid from jsonb_array_elements_text(coalesce(p_input, '[]'))) into selected;
  if cardinality(selected) > 10000 or p_achiever = any(selected) then
    raise exception 'SPECIAL_COMPANIONS_INVALID' using errcode='22023';
  end if;

  select array_agg(m.id order by m.id) into memberships
  from public.club_memberships m
  join public.user_accounts u on u.id = m.user_id and u.account_status = 'active'
  where m.club_id = p_club and m.membership_status = 'active' and m.user_id = any(selected);

  if coalesce(cardinality(memberships), 0) <> cardinality(selected) then
    raise exception 'SPECIAL_COMPANIONS_INVALID' using errcode='22023';
  end if;
  if cardinality(selected) < p_required then
    raise exception 'SPECIAL_COMPANIONS_REQUIRED' using errcode='22023';
  end if;
  if p_required > 0 and not exists (
    select 1 from public.hall_of_fame_evidence_files e
    join private.hall_special_photo_purposes photo on photo.evidence_id = e.id
    where e.application_record_id = p_application and e.status = 'available' and photo.purpose = 'public_photo'
  ) then
    raise exception 'SPECIAL_PUBLIC_PHOTO_REQUIRED' using errcode='22023';
  end if;
  if cardinality(selected) = 0 then return; end if;

  select format('%s 회원이 %s 기록을 달성했습니다. 함께 경기하셨다면 기록을 확인하고 축하해 주세요.',
    private.hall_viewer_name(null, p.display_name),
    case a.record_type_code when 'condor' then '콘도르' when 'albatross' then '알바트로스' else '홀인원' end)
  into notice_body
  from public.hall_of_fame_application_records a
  left join public.user_profiles p on p.user_id = a.target_user_id
  where a.id = p_application;

  insert into public.messaging_messages(kind, body, body_hash, recipient_key, request_id,
    request_fingerprint, first_contact, created_at, broadcast_recipient_count)
  values ('platform_broadcast', notice_body, encode(sha256(convert_to(notice_body, 'UTF8')), 'hex'),
    'platform', gen_random_uuid(), encode(sha256(convert_to(p_application::text, 'UTF8')), 'hex'),
    false, notice_at, cardinality(selected))
  returning id into notice_id;

  insert into public.messaging_recipients(message_id, recipient_user_id, received_at)
  select notice_id, unnest(selected), notice_at;
  insert into private.hall_special_companions(application_record_id, membership_id)
  select p_application, unnest(memberships);
  update private.hall_special_applications set companion_message_id = notice_id where application_record_id = p_application;
end
$$;
revoke all on function private.invite_hall_special_companions(uuid, uuid, uuid, smallint, jsonb)
  from public, anon, authenticated, service_role;

create view private.hall_special_president_records as
select r.*, sp.required_companions, c.legacy_key, c.name as club_name, c.directory_is_public,
       p.display_name, p.profile_visibility, k.public_key
from public.hall_of_fame_records r
join private.hall_special_applications sp on sp.application_record_id = r.source_application_record_id
join public.clubs c on c.id = r.nominating_club_id and c.club_status = 'active'
join public.user_accounts u on u.id = r.target_user_id and u.account_status = 'active'
left join public.user_profiles p on p.user_id = r.target_user_id
left join private.hall_special_member_keys k on k.user_id = r.target_user_id
where sp.required_companions is not null and r.validity_status = 'active' and r.publication_status = 'published';
revoke all on private.hall_special_president_records from public, anon, authenticated, service_role;

create view private.hall_special_companion_status as
select sp.application_record_id, count(w.approved_at)::int as approved,
       sp.required_companions,
       coalesce(jsonb_agg(private.hall_viewer_name(m.user_id, p.display_name) order by w.approved_at, m.id)
         filter (where w.approved_at is not null and u.id is not null), '[]') as names
from private.hall_special_applications sp
left join private.hall_special_companions w on w.application_record_id = sp.application_record_id
left join public.club_memberships m on m.id = w.membership_id
left join public.user_accounts u on u.id = m.user_id and u.account_status = 'active'
left join public.user_profiles p on p.user_id = u.id
where sp.required_companions is not null
group by sp.application_record_id, sp.required_companions;
revoke all on private.hall_special_companion_status from public, anon, authenticated, service_role;

create function public.hall_special_companion_confirmation(p_message_id uuid, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  source_id uuid;
  member_id uuid;
  result jsonb;
begin
  if p_confirm then
    perform private.lock_active_hall_of_fame_actor(actor);
    perform private.lock_hall_of_fame_authorization_boundary();
  end if;

  select r.source_application_record_id, m.id,
    jsonb_build_object('id', r.id, 'type', r.record_type_code,
      'name', private.hall_viewer_name(r.target_user_id, r.display_name),
      'course', r.course_name_snapshot, 'date', r.played_on,
      'segment', r.course_segment_snapshot, 'hole', r.hole_number,
      'confirmed', w.approved_at is not null)
  into source_id, member_id, result
  from private.hall_special_president_records r
  join private.hall_special_applications sp on sp.application_record_id = r.source_application_record_id
  join private.hall_special_companions w on w.application_record_id = sp.application_record_id
  join public.club_memberships m on m.id = w.membership_id and m.membership_status = 'active'
    and m.club_id = r.nominating_club_id and m.user_id = actor
  where sp.companion_message_id = p_message_id and actor <> r.target_user_id
    and private.messaging_account_available(actor)
    and exists(select 1 from public.messaging_recipients receipt
      where receipt.message_id=p_message_id and receipt.recipient_user_id=actor);

  if result is null then
    if p_confirm then raise exception 'SPECIAL_COMPANION_FORBIDDEN' using errcode='42501'; end if;
    return null;
  end if;

  if p_confirm then
    perform 1 from public.hall_of_fame_records
    where id = (result->>'id')::uuid and validity_status = 'active' and publication_status = 'published'
    for share;
    if not found then raise exception 'SPECIAL_COMPANION_FORBIDDEN' using errcode='42501'; end if;
    update private.hall_special_companions set approved_at = now()
    where application_record_id = source_id and membership_id = member_id and approved_at is null;
    result := result || '{"confirmed":true}'::jsonb;
  end if;
  return result;
end
$$;
revoke all on function public.hall_special_companion_confirmation(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.hall_special_companion_confirmation(uuid, boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.mutate_hall_special_record(p_action text, p_request_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 u uuid:=auth.uid(); bid uuid; aid uuid; mid uuid; cid uuid; rid uuid; nextid uuid;
 b public.hall_of_fame_application_batches; a public.hall_of_fame_application_records; r public.hall_of_fame_records; s public.hall_of_fame_round_snapshots;
 claim record; fp bytea; payloadhash bytea; op text:='hall_of_fame.special.'||p_action; result jsonb; nextstatus text; reason text;
 target uuid; creator_membership uuid; required smallint; president_entry boolean;
 par integer; shots integer; kind text; started timestamptz; played date; course text; region text; segment text; env text; hole integer;
begin
 perform private.lock_active_hall_of_fame_actor(u);
 perform private.lock_hall_of_fame_authorization_boundary();
 if p_request_id is null or jsonb_typeof(p_input) is distinct from 'object' or p_action not in ('draft','submit','approve','reject','correct','revoke','photo_intent','cancel_draft') then raise exception 'SPECIAL_INVALID_REQUEST' using errcode='22023'; end if;
 payloadhash:=extensions.digest(convert_to(p_input::text,'UTF8'),'sha256');
 if p_action='draft' then
 bid:=gen_random_uuid(); aid:=gen_random_uuid();
 else
 aid:=(p_input->>'application_record_id')::uuid;
 select * into a from public.hall_of_fame_application_records where id=aid;
 bid:=a.application_batch_id;
 if bid is null or not exists(select 1 from private.hall_special_applications where batch_id=bid and application_record_id=aid) then raise exception 'SPECIAL_NOT_FOUND' using errcode='42501'; end if;
 end if;
 insert into private.hall_special_write_context values(pg_backend_pid(),txid_current(),u,p_request_id,bid,aid);
 -- The creation request has generated entity ids, so replay compares its immutable payload only.
 select * into claim from private.hall_of_fame_claim_request(u,p_request_id,op,case when p_action='draft' then null else bid end,case when p_action='draft' then null else aid end,case when p_action='draft' then u else a.target_user_id end,payloadhash);
 if claim.replayed then delete from private.hall_special_write_context where backend=pg_backend_pid() and transaction_id=txid_current(); return claim.result_payload; end if;
 if p_action='draft' then
 cid:=nullif(p_input->>'club_id','')::uuid;
 target:=u;
 president_entry:=cid is not null and nullif(p_input->>'target_user_id','') is not null;
 if cid is not null then
   select m.id into creator_membership from public.club_memberships m
   join public.clubs c on c.id=m.club_id and c.club_status='active'
   where m.user_id=u and m.club_id=cid and m.membership_status='active';
   mid:=creator_membership;
   if president_entry then
     if not private.club_user_is_active_admin(u,cid)
       or exists(select 1 from private.club_federations where club_id=cid) then
       raise exception 'SPECIAL_PRESIDENT_REQUIRED' using errcode='42501';
     end if;
     target:=(p_input->>'target_user_id')::uuid;
     select m.id into mid from public.club_memberships m
     join public.user_accounts ua on ua.id=m.user_id and ua.account_status='active'
     where m.user_id=target and m.club_id=cid and m.membership_status='active';
   end if;
   if mid is null then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 elsif exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=u and m.membership_status='active' and c.club_status='active' and not exists(select 1 from private.club_federations f where f.club_id=c.id)) then raise exception 'SPECIAL_SELECT_MEMBER_CLUB' using errcode='42501'; end if;
 par:=(p_input->>'hole_par')::integer; shots:=(p_input->>'strokes')::integer; kind:=p_input->>'record_type_code';
 if shots is distinct from 1 or par is null or par not in (3,4,5) or kind is distinct from (case par when 3 then 'hole_in_one' when 4 then 'albatross' when 5 then 'condor' end) then raise exception 'SPECIAL_PAR_STROKES_TYPE_MISMATCH' using errcode='22023'; end if;
 started:=(p_input->>'started_at')::timestamptz; played:=(p_input->>'played_on')::date;
 if started is null or played is null or (started at time zone 'Asia/Seoul')::date<>played or played> (now() at time zone 'Asia/Seoul')::date then raise exception 'SPECIAL_ROUND_START_REQUIRED' using errcode='22023'; end if;
 course:=btrim(p_input->>'course_name'); region:=btrim(p_input->>'course_region'); segment:=btrim(p_input->>'course_segment'); env:=p_input->>'course_environment'; hole:=(p_input->>'hole_number')::integer;
 required:=case when president_entry then par-3 end;
 fp:=private.hall_special_fingerprint(target,started,course,region,env,segment,hole);
 insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,created_by_membership_id,nominating_club_id) values(bid,case when cid is null then 'direct_application' else 'club_nomination' end,u,creator_membership,cid);
 insert into public.hall_of_fame_round_snapshots(application_batch_id,played_on,started_at,course_name_snapshot,course_region_snapshot,course_environment,round_type) values(bid,played,started,course,region,env,'casual') returning * into s;
 insert into public.hall_of_fame_application_records(id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,duplicate_fingerprint,member_consent_status,club_verification_status) values(aid,bid,s.id,target,mid,kind,segment,hole,par,shots,fp,case when required is null then 'granted' else 'pending' end,case when cid is null then 'not_applicable' else 'pending' end) returning * into a;
 insert into private.hall_special_applications(batch_id,application_record_id,required_companions) values(bid,aid,required);
 insert into private.hall_special_member_keys(user_id) values(target) on conflict do nothing;
 result:=jsonb_build_object('application_record_id',aid,'batch_id',bid,'version',1,'status','draft');
 else
 perform pg_advisory_xact_lock(hashtextextended(bid::text,8610));
 select * into b from public.hall_of_fame_application_batches where id=bid for update;
 select * into a from public.hall_of_fame_application_records where id=aid for update;
 select * into s from public.hall_of_fame_round_snapshots where application_batch_id=bid;
 if b.version is distinct from (p_input->>'version')::integer then raise exception 'SPECIAL_STALE_VERSION' using errcode='PT409'; end if;
 cid:=b.nominating_club_id;
 select required_companions into required from private.hall_special_applications where batch_id=bid;
 if required is not null and p_action='correct' then raise exception 'SPECIAL_PRESIDENT_CORRECTION_FORBIDDEN' using errcode='42501'; end if;
 if p_action in ('submit','photo_intent','cancel_draft') then
 if b.status<>'draft' or (required is null and u<>a.target_user_id)
   or (required is not null and (u<>b.created_by_user_id or not private.club_user_is_active_admin(u,cid))) then
   raise exception 'SPECIAL_OWNER_DRAFT_REQUIRED' using errcode='42501';
 end if;
 if cid is not null and not exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=u and m.club_id=cid and m.membership_status='active' and c.club_status='active') then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if cid is null and exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=u and m.membership_status='active' and c.club_status='active' and not exists(select 1 from private.club_federations f where f.club_id=c.id)) then raise exception 'SPECIAL_SELECT_MEMBER_CLUB' using errcode='42501'; end if;
 else
 if cid is null and p_action in ('correct','revoke') then
 perform private.require_hall_of_fame_platform_permission(u,case when p_action='correct' then 'hall_of_fame.records.correct' else 'hall_of_fame.records.revoke' end);
 elsif not private.hall_special_can_review(u,cid) then raise exception 'SPECIAL_REVIEW_FORBIDDEN' using errcode='42501'; end if;
 end if;
 if p_action='cancel_draft' then
 update public.hall_of_fame_application_batches set status='cancelled',version=version+1,submitted_at=now(),finalized_at=now() where id=bid returning * into b;
 update public.hall_of_fame_application_records set review_status='cancelled',version=version+1 where id=aid;
 insert into public.hall_of_fame_application_history(scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,request_id) values('record',bid,aid,'draft','cancelled',b.version,u,op,p_request_id);
 result:=jsonb_build_object('application_record_id',aid,'version',b.version,'status','cancelled');
 elsif p_action='photo_intent' then
 if p_input->>'purpose' not in ('public_photo','private_score','private_companion') or (cid is not null and p_input->>'purpose'<>'public_photo') then raise exception 'SPECIAL_INVALID_PHOTO_PURPOSE' using errcode='22023'; end if;
 if (select count(*) from public.hall_of_fame_evidence_files e where e.application_batch_id=bid)>=12 then raise exception 'SPECIAL_PHOTO_LIMIT' using errcode='22023'; end if;
 rid:=gen_random_uuid();
 insert into public.hall_of_fame_evidence_files(id,application_batch_id,application_record_id,evidence_type,storage_path,mime_type,uploaded_by_user_id,declared_mime_type,declared_byte_size,upload_expires_at,special_photo_purpose)
 values(rid,bid,aid,case when p_input->>'purpose'='private_score' or (p_input->>'purpose'='public_photo' and p_input->>'media_kind'='document') then 'scorecard' else 'round_photo' end,'applications/'||bid::text||'/'||rid::text||'/original',p_input->>'mime',u,p_input->>'mime',(p_input->>'size')::bigint,now()+interval '30 minutes',p_input->>'purpose');
 insert into private.hall_special_photo_purposes values(rid,p_input->>'purpose');
 result:=jsonb_build_object('evidence_id',rid,'path','applications/'||bid::text||'/'||rid::text||'/original','version',b.version);
 elsif p_action in ('submit','approve','reject') then
 if (p_action='submit' and b.status<>'draft') or (p_action<>'submit' and b.status<>'submitted') then raise exception 'SPECIAL_STATE_CONFLICT' using errcode='PT409'; end if;
 if p_action in ('submit','approve') then
 if a.strokes is distinct from 1 or a.hole_par is null or a.hole_par not in (3,4,5) or a.record_type_code is distinct from (case a.hole_par when 3 then 'hole_in_one' when 4 then 'albatross' when 5 then 'condor' end) then raise exception 'SPECIAL_PAR_STROKES_TYPE_MISMATCH' using errcode='22023'; end if;
 if not exists(select 1 from public.user_accounts where id=a.target_user_id and account_status='active') or (cid is not null and not exists(select 1 from public.club_memberships where user_id=a.target_user_id and club_id=cid and membership_status='active')) then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 end if;
 if p_action='submit' and required is not null then
   perform private.invite_hall_special_companions(aid,cid,a.target_user_id,required,p_input->'companion_ids');
 elsif p_action='submit' then
 if p_input->>'publication_consent' is distinct from 'true' then raise exception 'SPECIAL_PUBLICATION_CONSENT_REQUIRED' using errcode='22023'; end if;
 if cid is null then
 if nullif(btrim(p_input->>'companion_name'),'') is null or nullif(btrim(p_input->>'companion_contact'),'') is null or not exists(select 1 from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes p on p.evidence_id=e.id where e.application_record_id=aid and e.status='available' and p.purpose='private_score') or not exists(select 1 from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes p on p.evidence_id=e.id where e.application_record_id=aid and e.status='available' and p.purpose='private_companion') then raise exception 'SPECIAL_PRIVATE_PROOF_REQUIRED' using errcode='22023'; end if;
 update private.hall_special_applications set companion_name=btrim(p_input->>'companion_name'),companion_contact=btrim(p_input->>'companion_contact') where batch_id=bid;
 end if;
 insert into public.hall_of_fame_publication_consents(application_record_id,target_user_id,status,display_name_consent,masked_display_name_consent,full_display_name_consent,club_name_consent,record_date_consent,course_detail_consent,policy_version,consented_at,last_actor_user_id,last_request_id)
 values(aid,u,'granted',true,true,true,cid is not null,true,true,'special-records-20261028',now(),u,p_request_id);
 insert into public.hall_of_fame_publication_consent_history(application_record_id,target_user_id,display_name_consent,avatar_consent,club_name_consent,record_date_consent,course_detail_consent,from_status,to_status,version,actor_user_id,request_id,policy_version,masked_display_name_consent,full_display_name_consent,badge_consent)
 values(aid,u,true,false,cid is not null,true,true,null,'granted',1,u,p_request_id,'special-records-20261028',true,true,false);
 end if;
 nextstatus:=case when p_action='reject' then 'rejected' when p_action='approve' or (p_action='submit' and (required is not null or private.hall_special_can_review(u,cid))) then 'approved' else 'submitted' end;
 reason:=nullif(btrim(p_input->>'reason'),'');
 if p_action='reject' and (reason is null or char_length(reason)<2) then raise exception 'SPECIAL_REASON_REQUIRED' using errcode='22023'; end if;
 update public.hall_of_fame_application_batches set status=nextstatus,version=version+1,submitted_at=coalesce(submitted_at,now()),finalized_at=case when nextstatus in ('approved','rejected') then now() end where id=bid returning * into b;
 update public.hall_of_fame_application_records set review_status=nextstatus,version=version+1,club_verification_status=case when cid is null then 'not_applicable' when nextstatus='approved' then 'verified' when nextstatus='rejected' then 'rejected' else 'pending' end where id=aid;
 insert into public.hall_of_fame_application_history(scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,reason,request_id)
 values('record',bid,aid,a.review_status,nextstatus,b.version,u,op,reason,p_request_id);
 if nextstatus='approved' then
 if required is null and not exists(select 1 from public.hall_of_fame_publication_consents c where c.application_record_id=aid and c.status='granted' and c.withdrawn_at is null) then raise exception 'SPECIAL_PUBLICATION_CONSENT_REQUIRED'; end if;
 insert into public.hall_of_fame_records(source_application_record_id,target_user_id,record_type_code,played_on,course_name_snapshot,course_region_snapshot,course_environment,course_segment_snapshot,hole_number,hole_par,strokes,nominating_club_id,special_round_started_at,record_fingerprint,validity_status,publication_status,approved_by_user_id,approved_at,published_at)
 values(aid,a.target_user_id,a.record_type_code,s.played_on,s.course_name_snapshot,s.course_region_snapshot,s.course_environment,a.course_segment_snapshot,a.hole_number,a.hole_par,a.strokes,cid,s.started_at,a.duplicate_fingerprint,'active','published',u,now(),now()) returning * into r;
 insert into public.hall_of_fame_record_history(record_id,version,to_validity_status,to_publication_status,action,actor_user_id,request_id) values(r.id,1,'active','published',op,u,p_request_id);
 rid:=r.id;
 end if;
 result:=jsonb_build_object('application_record_id',aid,'batch_id',bid,'version',b.version,'status',nextstatus,'record_id',rid);
 else
 select * into r from public.hall_of_fame_records where id=(p_input->>'record_id')::uuid and source_application_record_id=aid for update;
 if r.id is null or r.validity_status<>'active' or r.version is distinct from (p_input->>'record_version')::integer then raise exception 'SPECIAL_STALE_RECORD' using errcode='PT409'; end if;
 reason:=btrim(p_input->>'reason'); if reason is null or char_length(reason) not between 2 and 500 then raise exception 'SPECIAL_REASON_REQUIRED' using errcode='22023'; end if;
 update public.hall_of_fame_badge_sources set status='inactive',deactivated_at=now(),deactivation_reason=reason where record_id=r.id and status='active';
 update public.hall_of_fame_records set validity_status=case when p_action='correct' then 'corrected' else 'revoked' end,publication_status='suppressed',suppression_reason=reason,version=version+1,
 revoked_at=case when p_action='revoke' then now() end,revoked_by_user_id=case when p_action='revoke' then u end,revocation_reason=case when p_action='revoke' then reason end,revocation_reason_code=case when p_action='revoke' then 'factual_error' end where id=r.id;
 insert into public.hall_of_fame_record_history(record_id,version,from_validity_status,to_validity_status,from_publication_status,to_publication_status,action,reason,reason_code,actor_user_id,request_id)
 values(r.id,r.version+1,r.validity_status,case when p_action='correct' then 'corrected' else 'revoked' end,r.publication_status,'suppressed',case when p_action='correct' then 'hall_of_fame.record.corrected' else 'hall_of_fame.record.revoked' end,reason,'factual_error',u,p_request_id);
 if p_action='correct' then
 par:=(p_input->>'hole_par')::integer; shots:=(p_input->>'strokes')::integer; kind:=p_input->>'record_type_code';
 if shots is distinct from 1 or par is null or par not in (3,4,5) or kind is distinct from (case par when 3 then 'hole_in_one' when 4 then 'albatross' when 5 then 'condor' end) then raise exception 'SPECIAL_PAR_STROKES_TYPE_MISMATCH' using errcode='22023'; end if;
 started:=(p_input->>'started_at')::timestamptz; played:=(p_input->>'played_on')::date;
 if started is null or played is null or (started at time zone 'Asia/Seoul')::date<>played or played>(now() at time zone 'Asia/Seoul')::date then raise exception 'SPECIAL_ROUND_START_REQUIRED' using errcode='22023'; end if;
 course:=btrim(p_input->>'course_name');region:=btrim(p_input->>'course_region');segment:=btrim(p_input->>'course_segment');env:=p_input->>'course_environment';hole:=(p_input->>'hole_number')::integer;
 fp:=private.hall_special_fingerprint(a.target_user_id,started,course,region,env,segment,hole);
 r.id:=gen_random_uuid();r.record_type_code:=kind;r.played_on:=played;r.course_name_snapshot:=course;r.course_region_snapshot:=region;r.course_segment_snapshot:=segment;r.course_environment:=env;r.hole_number:=hole;r.hole_par:=par;r.strokes:=shots;r.record_fingerprint:=fp;
 r.special_round_started_at:=started; r.corrected_from_record_id:=(p_input->>'record_id')::uuid;r.version:=1;r.created_at:=now();r.updated_at:=now();
 -- A correction must never republish a record whose consent or publication was withdrawn.
 if r.publication_status='published' and not exists(select 1 from public.hall_of_fame_publication_consents c where c.application_record_id=aid and c.status='granted' and c.withdrawn_at is null) then r.publication_status:='suppressed';r.suppression_reason:='publication_consent_withdrawn'; end if;
 insert into public.hall_of_fame_records select r.* returning id into nextid;
 insert into public.hall_of_fame_record_history(record_id,version,to_validity_status,to_publication_status,action,reason,reason_code,actor_user_id,request_id)
 values(nextid,1,'active',r.publication_status,'hall_of_fame.record.correction_successor_created',reason,'factual_error',u,p_request_id);
 end if;
 update public.hall_of_fame_application_batches set version=version+1 where id=bid returning * into b;
 result:=jsonb_build_object('application_record_id',aid,'batch_id',bid,'version',b.version,'record_id',nextid,'status',p_action);
 end if;
 end if;
 perform private.complete_hall_of_fame_request(u,p_request_id,op,bid,aid,payloadhash,result);
 delete from private.hall_special_write_context where backend=pg_backend_pid() and transaction_id=txid_current();
 return result;
end$function$;

CREATE OR REPLACE FUNCTION public.finalize_hall_special_photo_server(p_actor uuid, p_evidence uuid, p_sha256 text, p_size bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.hall_of_fame_evidence_files; b public.hall_of_fame_application_batches; aid uuid; req uuid:=gen_random_uuid(); fp bytea; claim record;
begin
 perform private.lock_active_hall_of_fame_actor(p_actor);
 perform private.lock_hall_of_fame_authorization_boundary();
 select * into e from public.hall_of_fame_evidence_files where id=p_evidence;
 select * into b from public.hall_of_fame_application_batches where id=e.application_batch_id for update;
 if e.uploaded_by_user_id is distinct from p_actor or b.status is distinct from 'draft' or e.upload_expires_at<now() or p_size<>e.declared_byte_size or e.status not in ('pending_upload','available') or not exists(select 1 from private.hall_special_applications where batch_id=b.id) then raise exception 'SPECIAL_PHOTO_FINALIZE_FORBIDDEN' using errcode='42501'; end if;
 if b.nominating_club_id is not null and not exists(select 1 from public.club_memberships where user_id=p_actor and club_id=b.nominating_club_id and membership_status='active') then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if exists(select 1 from private.hall_special_applications where batch_id=b.id and required_companions is not null)
   and (p_actor is distinct from b.created_by_user_id or not private.club_user_is_active_admin(p_actor,b.nominating_club_id)) then
   raise exception 'SPECIAL_PRESIDENT_REQUIRED' using errcode='42501';
 end if;
 if e.status='available' then if e.sha256=decode(p_sha256,'hex') then return; else raise exception 'SPECIAL_PHOTO_CHANGED'; end if; end if;
 aid:=e.application_record_id;fp:=extensions.digest(convert_to(p_evidence::text||p_sha256,'UTF8'),'sha256');
 insert into private.hall_special_write_context values(pg_backend_pid(),txid_current(),p_actor,req,b.id,aid);
 select * into claim from private.hall_of_fame_claim_request(p_actor,req,'hall_of_fame.special.photo_finalize',b.id,aid,p_actor,fp);
 update public.hall_of_fame_evidence_files set status='available',byte_size=p_size,sha256=decode(p_sha256,'hex'),finalized_at=now(),version=version+1 where id=p_evidence;
 perform private.complete_hall_of_fame_request(p_actor,req,'hall_of_fame.special.photo_finalize',b.id,aid,fp,jsonb_build_object('evidence_id',p_evidence));
 delete from private.hall_special_write_context where backend=pg_backend_pid() and transaction_id=txid_current();
end$function$;

CREATE OR REPLACE FUNCTION public.get_hall_special_photo_file(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.hall_of_fame_evidence_files; b public.hall_of_fame_application_batches; purpose text; u uuid:=auth.uid();
begin
 select f.* into e from public.hall_of_fame_evidence_files f join private.hall_special_photo_purposes p on p.evidence_id=f.id where f.id=p_id and f.status='available';
 if e.id is null then raise exception 'SPECIAL_PHOTO_NOT_FOUND' using errcode='42501'; end if;
 select p.purpose into purpose from private.hall_special_photo_purposes p where p.evidence_id=e.id;
 select * into b from public.hall_of_fame_application_batches where id=e.application_batch_id;
 if not (purpose='public_photo' and (exists(select 1 from private.hall_special_visible_records() r where r.source_application_record_id=e.application_record_id)
    or exists(select 1 from private.hall_special_president_records r where r.source_application_record_id=e.application_record_id))) then
 if b.status not in ('draft','submitted') or u is null or not exists(select 1 from public.user_accounts where id=u and account_status='active') or not (b.created_by_user_id=u or (b.status='submitted' and private.hall_special_can_review(u,b.nominating_club_id))) then raise exception 'SPECIAL_PHOTO_NOT_FOUND' using errcode='42501'; end if;
 end if;
 return jsonb_build_object('bucket',e.storage_bucket,'path',e.storage_path,'mime',e.mime_type);
end$function$;

CREATE OR REPLACE FUNCTION public.get_hall_special_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.user_accounts where id=u and account_status='active') then raise exception 'SPECIAL_LOGIN_REQUIRED' using errcode='42501'; end if;
 return jsonb_build_object('viewer_id',u,'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',cl.id,'key',cl.legacy_key,'name',cl.name,'can_register', reg.allowed,
   'members', case when reg.allowed then coalesce((
     select jsonb_agg(jsonb_build_object('id', cm.user_id, 'name', coalesce(nullif(btrim(cp.display_name),''),'이름 미등록'))
       order by cp.display_name, cm.user_id)
     from public.club_memberships cm
     join public.user_accounts cu on cu.id=cm.user_id and cu.account_status='active'
     left join public.user_profiles cp on cp.user_id=cm.user_id
     where cm.club_id=cl.id and cm.membership_status='active'
   ), '[]') else '[]'::jsonb end)) from public.club_memberships m join public.clubs cl on cl.id=m.club_id
 cross join lateral (select private.club_user_is_active_admin(u,cl.id) as allowed) reg where m.user_id=u and m.membership_status='active' and cl.club_status='active' and not exists(select 1 from private.club_federations f where f.club_id=cl.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('application_record_id',a.id,'version',b.version,'status',b.status,'name',p.display_name,'club_name',cl.name,'club_id',cl.id,'record_type_code',coalesce(r.record_type_code,a.record_type_code),'played_on',coalesce(r.played_on,s.played_on),'started_at',coalesce(r.special_round_started_at,s.started_at),'course_name',coalesce(r.course_name_snapshot,s.course_name_snapshot),'course_region',coalesce(r.course_region_snapshot,s.course_region_snapshot),'course_segment',coalesce(r.course_segment_snapshot,a.course_segment_snapshot),'course_environment',coalesce(r.course_environment,s.course_environment),'hole_number',coalesce(r.hole_number,a.hole_number),'hole_par',coalesce(r.hole_par,a.hole_par),'strokes',coalesce(r.strokes,a.strokes),'record_id',r.id,'record_version',r.version,'validity',r.validity_status,'can_review',private.hall_special_can_review(u,cl.id),'companion_status',case when r.validity_status='active' and cs.required_companions is not null
   then jsonb_build_object('approved',cs.approved,'required',cs.required_companions,'names',cs.names) end,
 'required_companions',sp.required_companions,'target_user_id',case when sp.required_companions is not null and b.created_by_user_id=u then a.target_user_id end,
 'can_correct',case when sp.required_companions is not null then false when cl.id is null then public.current_user_has_platform_permission('hall_of_fame.records.correct') else private.hall_special_can_review(u,cl.id) end,'can_revoke',case when cl.id is null then public.current_user_has_platform_permission('hall_of_fame.records.revoke') else private.hall_special_can_review(u,cl.id) end,'can_submit',b.status='draft' and case when sp.required_companions is null then a.target_user_id=u
   else b.created_by_user_id=u and private.club_user_is_active_admin(u,cl.id) end,
 'companion_name',case when b.nominating_club_id is null then sp.companion_name end,'companion_contact',case when b.nominating_club_id is null then sp.companion_contact end,
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'purpose',ph.purpose)) from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes ph on ph.evidence_id=e.id where e.application_record_id=a.id and e.status='available'),'[]')) order by b.created_at desc)
 from private.hall_special_applications sp join public.hall_of_fame_application_records a on a.id=sp.application_record_id join public.hall_of_fame_application_batches b on b.id=sp.batch_id join public.hall_of_fame_round_snapshots s on s.application_batch_id=b.id left join public.user_profiles p on p.user_id=a.target_user_id left join public.clubs cl on cl.id=b.nominating_club_id
 left join public.hall_of_fame_records r on r.source_application_record_id=a.id and r.validity_status in ('active','revoked')
 left join private.hall_special_companion_status cs on cs.application_record_id=a.id
 where (a.target_user_id=u and (sp.required_companions is null or b.status='approved'))
   or (sp.required_companions is not null and b.created_by_user_id=u and private.club_user_is_active_admin(u,cl.id))
   or (private.hall_special_can_review(u,b.nominating_club_id) and exists(select 1 from public.hall_of_fame_application_history h where h.application_record_id=a.id and h.to_status in ('submitted','under_review','additional_info_required','approved','rejected')))),'[]'));
end$function$;

CREATE OR REPLACE FUNCTION public.get_hall_national_special(p_type text DEFAULT NULL::text, p_period text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_type is not null and p_type not in ('condor', 'albatross', 'hole_in_one')
     or p_period is null or p_period not in ('all', 'year', 'month', 'week')
     or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception '특별 기록 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  return (
    with eligible as (
      select legacy.*, true as certified, 0 as approved, 0 as required, '[]'::jsonb as companions
      from private.hall_national_special_records legacy where played_on <= today
      union all
      select r.id, r.target_user_id, r.record_type_code, r.played_on, r.published_at, r.source_application_record_id,
        r.course_name_snapshot, r.course_segment_snapshot, r.hole_number,
        r.club_name, r.display_name,
        status.approved >= status.required_companions, status.approved, status.required_companions, status.names
      from private.hall_special_president_records r
      join private.hall_special_companion_status status on status.application_record_id=r.source_application_record_id
      where r.played_on <= today and r.course_environment = 'outdoor' and r.directory_is_public
    ), certified as (
      select * from eligible where certified
    ), scoped as (
      select * from eligible
      where (p_type is null or record_type_code = p_type)
        and (p_period = 'all' or played_on >= date_trunc(p_period, today)::date)
    ), condors as (
      select * from certified where record_type_code = 'condor' and played_on >= date_trunc('year', today)::date
    ), leaders as (
      select target_user_id, count(*) as total, rank() over (order by count(*) desc) as position
      from scoped where certified group by target_user_id
      order by total desc, target_user_id limit 20
    )
    select jsonb_build_object(
      'counts', jsonb_build_object(
        'condor', (select count(*) from certified where record_type_code = 'condor'),
        'albatross', (select count(*) from certified where record_type_code = 'albatross'),
        'hole_in_one', (select count(*) from certified where record_type_code = 'hole_in_one')
      ),
      'latestByType', coalesce((select jsonb_object_agg(record_type_code, jsonb_build_object(
        'date', played_on, 'name', private.hall_viewer_name(target_user_id, display_name), 'club', club_name, 'course', course_name
      )) from (select distinct on (record_type_code) * from certified
        order by record_type_code, played_on desc, published_at desc, id) latest), '{}'::jsonb),
      'yearCount', (select count(*) from condors),
      'yearCondor', (select jsonb_build_object(
        'date', played_on, 'name', private.hall_viewer_name(target_user_id, display_name),
        'club', club_name, 'course', course_name
      ) from condors order by played_on desc, published_at desc, id limit 1),
      'total', (select count(*) from scoped),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id, 'type', s.record_type_code, 'date', s.played_on,
          'name', private.hall_viewer_name(s.target_user_id, s.display_name),
          'club', s.club_name, 'course', s.course_name, 'segment', s.segment, 'hole', s.hole_number,
          'companion_status', jsonb_build_object('approved',s.approved,'required',s.required,'names',s.companions),
          'photos', coalesce((select jsonb_agg(f.id order by f.created_at, f.id)
            from public.hall_of_fame_evidence_files f
            join private.hall_special_photo_purposes ph on ph.evidence_id = f.id and ph.purpose = 'public_photo'
            where f.application_record_id = s.source_application_record_id and f.status = 'available'), '[]'::jsonb)
        ) order by s.played_on desc, s.published_at desc, s.id)
        from (select * from scoped order by played_on desc, published_at desc, id limit p_limit offset p_offset) s
      ), '[]'::jsonb),
      'leaders', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank', l.position, 'count', l.total, 'name', private.hall_viewer_name(l.target_user_id, p.display_name)
        ) order by l.total desc, l.target_user_id)
        from leaders l left join public.user_profiles p on p.user_id = l.target_user_id
      ), '[]'::jsonb)
    )
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.get_hall_special_member_summaries(p_keys uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(cardinality(p_keys),0)>100 then raise exception 'SPECIAL_SUMMARY_LIMIT'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',k.public_key,'name',private.hall_viewer_name(k.user_id, p.display_name),'primary_club',case when p.profile_visibility='public' then pc.name end,
 'hole_in_one',coalesce(n.h,0),'albatross',coalesce(n.a,0),'condor',coalesce(n.c,0)))
 from private.hall_special_member_keys k join public.user_accounts ua on ua.id=k.user_id and ua.account_status='active'
 join public.user_profiles p on p.user_id=k.user_id
 left join private.club_primary_memberships pm on pm.user_id=k.user_id
 left join public.club_memberships cm on cm.id=pm.membership_id and cm.membership_status='active'
 left join public.clubs pc on pc.id=cm.club_id and pc.club_status='active' and pc.directory_is_public
 left join (select target_user_id,count(*) filter(where record_type_code='hole_in_one') h,count(*) filter(where record_type_code='albatross') a,count(*) filter(where record_type_code='condor') c from (
   select target_user_id, record_type_code from private.hall_special_visible_records()
   union all
   select r.target_user_id, r.record_type_code from private.hall_special_president_records r
   join private.hall_special_companion_status s on s.application_record_id=r.source_application_record_id
   where s.approved>=s.required_companions
 ) eligible group by target_user_id) n on n.target_user_id=k.user_id
 where k.public_key=any(p_keys) and (p.profile_visibility='public' or exists(select 1 from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id where r.target_user_id=k.user_id and c.full_display_name_consent))), '[]'::jsonb);
end$function$;

create or replace function public.list_hall_special_records(
  p_club_key text default null, p_member_key uuid default null, p_type text default null,
  p_offset integer default 0, p_limit integer default 20
) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit not between 1 and 100 or p_offset<0 or p_limit is null or p_offset is null
    or (p_type is not null and p_type not in ('condor','albatross','hole_in_one')) then
    raise exception 'SPECIAL_INVALID_PAGE';
  end if;
  return (
    with eligible as (
      select r.id, r.source_application_record_id, r.target_user_id, r.record_type_code, r.played_on,
        r.course_name_snapshot, r.course_region_snapshot, r.course_environment, r.course_segment_snapshot,
        r.hole_number, r.hole_par, r.strokes, p.display_name,
        case when c.full_display_name_consent then k.public_key end as member_key,
        case when c.club_name_consent then cl.name end as club_name,
        0 as approved, 0 as required, '[]'::jsonb as companions
      from private.hall_special_visible_records() r
      join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id
      left join public.user_profiles p on p.user_id=r.target_user_id
      left join public.clubs cl on cl.id=r.nominating_club_id
      left join private.hall_special_member_keys k on k.user_id=r.target_user_id
      where (p_club_key is null or (cl.legacy_key=p_club_key and c.club_name_consent))
        and (p_member_key is null or (k.public_key=p_member_key and c.full_display_name_consent))
        and (p_type is null or r.record_type_code=p_type)
      union all
      select r.id, r.source_application_record_id, r.target_user_id, r.record_type_code, r.played_on,
        r.course_name_snapshot, r.course_region_snapshot, r.course_environment, r.course_segment_snapshot,
        r.hole_number, r.hole_par, r.strokes, r.display_name,
        case when r.profile_visibility='public' then r.public_key end,
        case when r.directory_is_public or p_club_key=r.legacy_key then r.club_name end,
        s.approved, s.required_companions, s.names
      from private.hall_special_president_records r
      join private.hall_special_companion_status s on s.application_record_id=r.source_application_record_id
      where (p_club_key is null or p_club_key=r.legacy_key)
        and (r.directory_is_public or (p_club_key=r.legacy_key
          and private.club_user_has_permission(auth.uid(), r.nominating_club_id, 'club.posts.read')))
        and (p_member_key is null or (r.public_key=p_member_key and r.profile_visibility='public'))
        and (p_type is null or r.record_type_code=p_type)
    )
    select jsonb_build_object(
      'total',(select count(*) from eligible),
      'certified',(select count(*) from eligible where approved>=required),
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',r.id,'record_type_code',r.record_type_code,'played_on',r.played_on,
        'course_name',r.course_name_snapshot,'course_region',r.course_region_snapshot,
        'course_environment',r.course_environment,'course_segment',r.course_segment_snapshot,
        'hole_number',r.hole_number,'hole_par',r.hole_par,'strokes',r.strokes,
        'name',private.hall_viewer_name(r.target_user_id,r.display_name),'member_key',r.member_key,'club_name',r.club_name,
        'companion_status',jsonb_build_object('approved',r.approved,'required',r.required,'names',r.companions),
        'photos',coalesce((select jsonb_agg(e.id order by e.created_at,e.id)
          from public.hall_of_fame_evidence_files e
          join private.hall_special_photo_purposes ph on ph.evidence_id=e.id and ph.purpose='public_photo'
          where e.application_record_id=r.source_application_record_id and e.status='available'),'[]')
      ) order by r.played_on desc,r.id desc)
      from (select * from eligible order by played_on desc,id desc limit p_limit offset p_offset) r),'[]')
    )
  );
end
$$;

-- Targeted witness notices and manual platform-wide broadcasts have separate quotas.
do $$
declare
  ddl text := pg_get_functiondef('public.send_platform_broadcast(text,uuid)'::regprocedure);
  before text := 'where kind=''platform_broadcast'' and created_at';
begin
  if (length(ddl)-length(replace(ddl,before,'')))/length(before) <> 3 then
    raise exception 'Unexpected platform broadcast quota predicates';
  end if;
  execute replace(ddl, before, 'where kind=''platform_broadcast'' and not exists (
    select 1 from private.hall_special_applications sp where sp.companion_message_id=messaging_messages.id
  ) and created_at');
end
$$;
