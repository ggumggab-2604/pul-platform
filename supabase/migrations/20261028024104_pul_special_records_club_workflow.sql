-- New-policy records share the existing application, consent, canonical and history tables.
-- No legacy record or consent is rewritten. Private context is transaction scoped, never a client GUC.
create table private.hall_special_applications (
 batch_id uuid primary key references public.hall_of_fame_application_batches(id),
 application_record_id uuid not null unique references public.hall_of_fame_application_records(id),
 companion_name text, companion_contact text,
 check (companion_name is null or char_length(companion_name) between 1 and 100),
 check (companion_contact is null or char_length(companion_contact) between 3 and 100)
);
create table private.hall_special_photo_purposes (
 evidence_id uuid primary key references public.hall_of_fame_evidence_files(id),
 purpose text not null check(purpose in ('public_photo','private_score','private_companion'))
);
create table private.hall_special_member_keys (
 user_id uuid primary key references public.user_accounts(id), public_key uuid not null unique default gen_random_uuid()
);
create table private.hall_special_write_context (
 backend integer not null, transaction_id bigint not null, actor uuid not null, request_id uuid not null,
 batch_id uuid not null, application_record_id uuid not null,
 primary key(backend,transaction_id)
);
revoke all on private.hall_special_applications,private.hall_special_photo_purposes,private.hall_special_member_keys,private.hall_special_write_context from public,anon,authenticated,service_role;

-- Explicitly selecting the same bytes for separate private/public purposes still creates separate objects.
alter table public.hall_of_fame_evidence_files add column special_photo_purpose text check(special_photo_purpose in ('public_photo','private_score','private_companion'));
drop index public.hall_of_fame_evidence_files_available_sha_uidx;
create unique index hall_of_fame_evidence_files_available_sha_uidx on public.hall_of_fame_evidence_files(application_batch_id,sha256,coalesce(special_photo_purpose,'legacy')) where status='available' and sha256 is not null;

create function private.hall_special_write_allowed(p_table text,p_row jsonb) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.hall_special_write_context c
 where c.backend=pg_backend_pid() and c.transaction_id=txid_current() and
 case p_table
 when 'hall_of_fame_mutation_requests' then p_row->>'actor_user_id'=c.actor::text and p_row->>'request_id'=c.request_id::text and p_row->>'operation' like 'hall_of_fame.special.%'
 when 'hall_of_fame_application_batches' then p_row->>'id'=c.batch_id::text
 when 'hall_of_fame_round_snapshots' then p_row->>'application_batch_id'=c.batch_id::text
 when 'hall_of_fame_application_records' then p_row->>'id'=c.application_record_id::text and p_row->>'application_batch_id'=c.batch_id::text
 when 'hall_of_fame_records' then p_row->>'source_application_record_id'=c.application_record_id::text
 when 'hall_of_fame_record_history' then exists(select 1 from public.hall_of_fame_records r where r.id=(p_row->>'record_id')::uuid and r.source_application_record_id=c.application_record_id)
 when 'hall_of_fame_badge_sources' then exists(select 1 from public.hall_of_fame_records r where r.id=(p_row->>'record_id')::uuid and r.source_application_record_id=c.application_record_id)
 else p_row->>'application_batch_id'=c.batch_id::text or p_row->>'application_record_id'=c.application_record_id::text end)
$$;
revoke all on function private.hall_special_write_allowed(text,jsonb) from public,anon,authenticated,service_role;

-- Keep every old trigger and predicate; only the explicitly scoped new RPC replaces its workflow guard.
-- Foreign keys, check constraints, evidence invariants, badge invariants and lineage triggers still run.
do $$declare t record; ddl text; begin
 for t in select tr.tgname,pg_get_triggerdef(tr.oid) as ddl from pg_trigger tr
 join pg_class cl on cl.oid=tr.tgrelid join pg_proc f on f.oid=tr.tgfoid
 where not tr.tgisinternal and cl.relname in (
 'hall_of_fame_application_batches','hall_of_fame_round_snapshots','hall_of_fame_application_records',
 'hall_of_fame_publication_consents','hall_of_fame_publication_consent_history','hall_of_fame_evidence_files',
 'hall_of_fame_application_history','hall_of_fame_record_history','hall_of_fame_records','hall_of_fame_badge_sources','hall_of_fame_mutation_requests')
 and (f.proname like 'enforce_guarded_hall_of_fame_%' or f.proname like 'guard_hall_of_fame_%' or f.proname in (
 'reject_hall_of_fame_mutation','reject_hall_of_fame_append_only_mutation',
 'enforce_hall_of_fame_application_history_append','enforce_hall_of_fame_consent_history_append',
 'enforce_hall_of_fame_projection_history_append','enforce_hall_of_fame_canonical_lifecycle_history_append','enforce_hall_of_fame_evidence_history_append',
 'enforce_hall_of_fame_review_history_append'))
 loop
 ddl:=t.ddl;
 if ddl like '%DELETE%' then
 execute regexp_replace(regexp_replace(ddl,'CREATE TRIGGER [^ ]+','CREATE OR REPLACE TRIGGER '||quote_ident(left(t.tgname,52)||'_delete')),'BEFORE .*? ON','BEFORE DELETE ON');
 ddl:=replace(replace(ddl,'INSERT OR DELETE OR UPDATE','INSERT OR UPDATE'),'DELETE OR UPDATE','UPDATE');
 if ddl like '%BEFORE DELETE ON%' then continue; end if;
 end if;
 if ddl like '% WHEN (%' then
 ddl:=replace(ddl,' WHEN (',' WHEN ((NOT private.hall_special_write_allowed(TG_TABLE_NAME, to_jsonb(NEW))) AND (');
 ddl:=replace(ddl,') EXECUTE FUNCTION', ')) EXECUTE FUNCTION');
 else ddl:=replace(ddl,' EXECUTE FUNCTION',' WHEN (NOT private.hall_special_write_allowed(TG_TABLE_NAME, to_jsonb(NEW))) EXECUTE FUNCTION'); end if;
 -- TG_TABLE_NAME is not available in a WHEN expression; use the known relation literal.
 ddl:=replace(ddl,'TG_TABLE_NAME',quote_literal((select cl.relname from pg_trigger tr join pg_class cl on cl.oid=tr.tgrelid where tr.tgname=t.tgname)));
 execute regexp_replace(ddl,'^CREATE TRIGGER','CREATE OR REPLACE TRIGGER');
 end loop;
end$$;

create function private.hall_special_can_review(p_actor uuid,p_club uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_accounts a where a.id=p_actor and a.account_status='active') and
 case when p_club is null then exists(select 1 from public.platform_role_permissions rp join public.platform_permission_definitions pd on pd.code=rp.permission_code and pd.is_active join public.user_accounts a on a.platform_role=rp.platform_role where a.id=p_actor and a.platform_role in ('platform_moderator','platform_admin') and rp.permission_code='hall_of_fame.applications.decide')
 else exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id
 join public.club_role_assignments r on r.membership_id=m.id join public.club_role_definitions d on d.role_code=r.role_code
 where m.club_id=p_club and m.user_id=p_actor and m.membership_status='active' and c.club_status='active'
 and r.revoked_at is null and d.is_active and r.role_code in ('club_admin','club_vice_admin')) end
$$;
revoke all on function private.hall_special_can_review(uuid,uuid) from public,anon,authenticated,service_role;

create function private.hall_special_fingerprint(p_user uuid,p_start timestamptz,p_course text,p_region text,p_environment text,p_segment text,p_hole integer) returns bytea
language sql immutable set search_path='' as $$
 select extensions.digest(convert_to(jsonb_build_array('special-round-v2',p_user,extract(epoch from p_start),lower(btrim(p_course)),lower(btrim(p_region)),p_environment,lower(btrim(p_segment)),p_hole)::text,'UTF8'),'sha256')
$$;
revoke all on function private.hall_special_fingerprint(uuid,timestamptz,text,text,text,text,integer) from public,anon,authenticated,service_role;

create function public.mutate_hall_special_record(p_action text,p_request_id uuid,p_input jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); bid uuid; aid uuid; mid uuid; cid uuid; rid uuid; nextid uuid;
 b public.hall_of_fame_application_batches; a public.hall_of_fame_application_records; r public.hall_of_fame_records; s public.hall_of_fame_round_snapshots;
 claim record; fp bytea; payloadhash bytea; op text:='hall_of_fame.special.'||p_action; result jsonb; nextstatus text; reason text;
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
 if cid is not null then
 select m.id into mid from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=u and m.club_id=cid and m.membership_status='active' and c.club_status='active';
 if mid is null then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 elsif exists(select 1 from public.club_memberships m join public.clubs c on c.id=m.club_id where m.user_id=u and m.membership_status='active' and c.club_status='active' and not exists(select 1 from private.club_federations f where f.club_id=c.id)) then raise exception 'SPECIAL_SELECT_MEMBER_CLUB' using errcode='42501'; end if;
 par:=(p_input->>'hole_par')::integer; shots:=(p_input->>'strokes')::integer; kind:=p_input->>'record_type_code';
 if shots is distinct from 1 or par is null or par not in (3,4,5) or kind is distinct from (case par when 3 then 'hole_in_one' when 4 then 'albatross' when 5 then 'condor' end) then raise exception 'SPECIAL_PAR_STROKES_TYPE_MISMATCH' using errcode='22023'; end if;
 started:=(p_input->>'started_at')::timestamptz; played:=(p_input->>'played_on')::date;
 if started is null or played is null or (started at time zone 'Asia/Seoul')::date<>played or played> (now() at time zone 'Asia/Seoul')::date then raise exception 'SPECIAL_ROUND_START_REQUIRED' using errcode='22023'; end if;
 course:=btrim(p_input->>'course_name'); region:=btrim(p_input->>'course_region'); segment:=btrim(p_input->>'course_segment'); env:=p_input->>'course_environment'; hole:=(p_input->>'hole_number')::integer;
 fp:=private.hall_special_fingerprint(u,started,course,region,env,segment,hole);
 insert into public.hall_of_fame_application_batches(id,application_type,created_by_user_id,created_by_membership_id,nominating_club_id) values(bid,case when cid is null then 'direct_application' else 'club_nomination' end,u,mid,cid);
 insert into public.hall_of_fame_round_snapshots(application_batch_id,played_on,started_at,course_name_snapshot,course_region_snapshot,course_environment,round_type) values(bid,played,started,course,region,env,'casual') returning * into s;
 insert into public.hall_of_fame_application_records(id,application_batch_id,round_snapshot_id,target_user_id,target_membership_id,record_type_code,course_segment_snapshot,hole_number,hole_par,strokes,duplicate_fingerprint,member_consent_status,club_verification_status) values(aid,bid,s.id,u,mid,kind,segment,hole,par,shots,fp,'granted',case when cid is null then 'not_applicable' else 'pending' end) returning * into a;
 insert into private.hall_special_applications values(bid,aid,null,null);
 insert into private.hall_special_member_keys(user_id) values(u) on conflict do nothing;
 result:=jsonb_build_object('application_record_id',aid,'batch_id',bid,'version',1,'status','draft');
 else
 perform pg_advisory_xact_lock(hashtextextended(bid::text,8610));
 select * into b from public.hall_of_fame_application_batches where id=bid for update;
 select * into a from public.hall_of_fame_application_records where id=aid for update;
 select * into s from public.hall_of_fame_round_snapshots where application_batch_id=bid;
 if b.version is distinct from (p_input->>'version')::integer then raise exception 'SPECIAL_STALE_VERSION' using errcode='PT409'; end if;
 cid:=b.nominating_club_id;
 if p_action in ('submit','photo_intent','cancel_draft') then
 if u<>a.target_user_id or b.status<>'draft' then raise exception 'SPECIAL_OWNER_DRAFT_REQUIRED' using errcode='42501'; end if;
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
 if (select count(*) from public.hall_of_fame_evidence_files e where e.application_batch_id=bid)>12 then raise exception 'SPECIAL_PHOTO_LIMIT' using errcode='22023'; end if;
 rid:=gen_random_uuid();
 insert into public.hall_of_fame_evidence_files(id,application_batch_id,application_record_id,evidence_type,storage_path,mime_type,uploaded_by_user_id,declared_mime_type,declared_byte_size,upload_expires_at,special_photo_purpose)
 values(rid,bid,aid,case when p_input->>'purpose'='private_score' then 'scorecard' else 'round_photo' end,'applications/'||bid::text||'/'||rid::text||'/original',p_input->>'mime',u,p_input->>'mime',(p_input->>'size')::bigint,now()+interval '30 minutes',p_input->>'purpose');
 insert into private.hall_special_photo_purposes values(rid,p_input->>'purpose');
 result:=jsonb_build_object('evidence_id',rid,'path','applications/'||bid::text||'/'||rid::text||'/original','version',b.version);
 elsif p_action in ('submit','approve','reject') then
 if (p_action='submit' and b.status<>'draft') or (p_action<>'submit' and b.status<>'submitted') then raise exception 'SPECIAL_STATE_CONFLICT' using errcode='PT409'; end if;
 if p_action in ('submit','approve') then
 if a.strokes is distinct from 1 or a.hole_par is null or a.hole_par not in (3,4,5) or a.record_type_code is distinct from (case a.hole_par when 3 then 'hole_in_one' when 4 then 'albatross' when 5 then 'condor' end) then raise exception 'SPECIAL_PAR_STROKES_TYPE_MISMATCH' using errcode='22023'; end if;
 if not exists(select 1 from public.user_accounts where id=a.target_user_id and account_status='active') or (cid is not null and not exists(select 1 from public.club_memberships where user_id=a.target_user_id and club_id=cid and membership_status='active')) then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 end if;
 if p_action='submit' then
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
 nextstatus:=case when p_action='reject' then 'rejected' when p_action='approve' or (p_action='submit' and cid is not null and private.hall_special_can_review(u,cid)) then 'approved' else 'submitted' end;
 reason:=nullif(btrim(p_input->>'reason'),'');
 if p_action='reject' and (reason is null or char_length(reason)<2) then raise exception 'SPECIAL_REASON_REQUIRED' using errcode='22023'; end if;
 update public.hall_of_fame_application_batches set status=nextstatus,version=version+1,submitted_at=coalesce(submitted_at,now()),finalized_at=case when nextstatus in ('approved','rejected') then now() end where id=bid returning * into b;
 update public.hall_of_fame_application_records set review_status=nextstatus,version=version+1,club_verification_status=case when cid is null then 'not_applicable' when nextstatus='approved' then 'verified' when nextstatus='rejected' then 'rejected' else 'pending' end where id=aid;
 insert into public.hall_of_fame_application_history(scope,application_batch_id,application_record_id,from_status,to_status,version,actor_user_id,action,reason,request_id)
 values('record',bid,aid,a.review_status,nextstatus,b.version,u,op,reason,p_request_id);
 if nextstatus='approved' then
 if not exists(select 1 from public.hall_of_fame_publication_consents c where c.application_record_id=aid and c.status='granted' and c.withdrawn_at is null) then raise exception 'SPECIAL_PUBLICATION_CONSENT_REQUIRED'; end if;
 insert into public.hall_of_fame_records(source_application_record_id,target_user_id,record_type_code,played_on,course_name_snapshot,course_region_snapshot,course_environment,course_segment_snapshot,hole_number,hole_par,strokes,nominating_club_id,record_fingerprint,validity_status,publication_status,approved_by_user_id,approved_at,published_at)
 values(aid,a.target_user_id,a.record_type_code,s.played_on,s.course_name_snapshot,s.course_region_snapshot,s.course_environment,a.course_segment_snapshot,a.hole_number,a.hole_par,a.strokes,cid,a.duplicate_fingerprint,'active','published',u,now(),now()) returning * into r;
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
 r.corrected_from_record_id:=(p_input->>'record_id')::uuid;r.version:=1;r.created_at:=now();r.updated_at:=now();
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
end$$;
revoke all on function public.mutate_hall_special_record(text,uuid,jsonb) from public,anon,service_role;
grant execute on function public.mutate_hall_special_record(text,uuid,jsonb) to authenticated;

create function public.finalize_hall_special_photo_server(p_actor uuid,p_evidence uuid,p_sha256 text,p_size bigint) returns void
language plpgsql volatile security definer set search_path='' as $$
declare e public.hall_of_fame_evidence_files; b public.hall_of_fame_application_batches; aid uuid; req uuid:=gen_random_uuid(); fp bytea; claim record;
begin
 perform private.lock_active_hall_of_fame_actor(p_actor);
 perform private.lock_hall_of_fame_authorization_boundary();
 select * into e from public.hall_of_fame_evidence_files where id=p_evidence;
 select * into b from public.hall_of_fame_application_batches where id=e.application_batch_id for update;
 if e.uploaded_by_user_id is distinct from p_actor or b.status is distinct from 'draft' or e.upload_expires_at<now() or p_size<>e.declared_byte_size or e.status not in ('pending_upload','available') or not exists(select 1 from private.hall_special_applications where batch_id=b.id) then raise exception 'SPECIAL_PHOTO_FINALIZE_FORBIDDEN' using errcode='42501'; end if;
 if b.nominating_club_id is not null and not exists(select 1 from public.club_memberships where user_id=p_actor and club_id=b.nominating_club_id and membership_status='active') then raise exception 'SPECIAL_ACTIVE_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
 if e.status='available' then if e.sha256=decode(p_sha256,'hex') then return; else raise exception 'SPECIAL_PHOTO_CHANGED'; end if; end if;
 aid:=e.application_record_id;fp:=extensions.digest(convert_to(p_evidence::text||p_sha256,'UTF8'),'sha256');
 insert into private.hall_special_write_context values(pg_backend_pid(),txid_current(),p_actor,req,b.id,aid);
 select * into claim from private.hall_of_fame_claim_request(p_actor,req,'hall_of_fame.special.photo_finalize',b.id,aid,p_actor,fp);
 update public.hall_of_fame_evidence_files set status='available',byte_size=p_size,sha256=decode(p_sha256,'hex'),finalized_at=now(),version=version+1 where id=p_evidence;
 perform private.complete_hall_of_fame_request(p_actor,req,'hall_of_fame.special.photo_finalize',b.id,aid,fp,jsonb_build_object('evidence_id',p_evidence));
 delete from private.hall_special_write_context where backend=pg_backend_pid() and transaction_id=txid_current();
end$$;
revoke all on function public.finalize_hall_special_photo_server(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.finalize_hall_special_photo_server(uuid,uuid,text,bigint) to service_role;

create function private.hall_special_visible_records() returns setof public.hall_of_fame_records
language sql stable security definer set search_path='' as $$
 select r.* from public.hall_of_fame_records r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id and c.target_user_id=r.target_user_id
 join public.user_accounts a on a.id=r.target_user_id and a.account_status='active'
 where r.validity_status='active' and r.publication_status='published' and c.status='granted' and c.masked_display_name_consent and c.record_date_consent and c.course_detail_consent and c.policy_version is not null and c.consented_at is not null and c.withdrawn_at is null
$$;
revoke all on function private.hall_special_visible_records() from public,anon,authenticated,service_role;

create function public.get_hall_special_member_summaries(p_keys uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(cardinality(p_keys),0)>100 then raise exception 'SPECIAL_SUMMARY_LIMIT'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('key',k.public_key,'name',p.display_name,'primary_club',case when p.profile_visibility='public' then pc.name end,
 'hole_in_one',coalesce(n.h,0),'albatross',coalesce(n.a,0),'condor',coalesce(n.c,0)))
 from private.hall_special_member_keys k join public.user_accounts ua on ua.id=k.user_id and ua.account_status='active'
 join public.user_profiles p on p.user_id=k.user_id
 left join private.club_primary_memberships pm on pm.user_id=k.user_id
 left join public.club_memberships cm on cm.id=pm.membership_id and cm.membership_status='active'
 left join public.clubs pc on pc.id=cm.club_id and pc.club_status='active' and pc.directory_is_public
 left join (select target_user_id,count(*) filter(where record_type_code='hole_in_one') h,count(*) filter(where record_type_code='albatross') a,count(*) filter(where record_type_code='condor') c from private.hall_special_visible_records() group by target_user_id) n on n.target_user_id=k.user_id
 where k.public_key=any(p_keys) and (p.profile_visibility='public' or exists(select 1 from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id where r.target_user_id=k.user_id and c.full_display_name_consent))), '[]'::jsonb);
end$$;
revoke all on function public.get_hall_special_member_summaries(uuid[]) from public,service_role;
grant execute on function public.get_hall_special_member_summaries(uuid[]) to anon,authenticated;

create function public.list_hall_special_records(p_club_key text default null,p_member_key uuid default null,p_type text default null,p_offset integer default 0,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare items jsonb; total integer;
begin
 if p_limit not between 1 and 100 or p_offset<0 or p_limit is null or p_offset is null or (p_type is not null and p_type not in ('condor','albatross','hole_in_one')) then raise exception 'SPECIAL_INVALID_PAGE'; end if;
 select count(*) into total from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id left join public.clubs cl on cl.id=r.nominating_club_id left join private.hall_special_member_keys k on k.user_id=r.target_user_id
 where (p_club_key is null or (cl.legacy_key=p_club_key and c.club_name_consent)) and (p_member_key is null or (k.public_key=p_member_key and c.full_display_name_consent)) and (p_type is null or r.record_type_code=p_type);
 select coalesce(jsonb_agg(rowdata order by played_on desc,id desc),'[]') into items from (
 select r.played_on,r.id,jsonb_build_object('id',r.id,'record_type_code',r.record_type_code,'played_on',r.played_on,'course_name',r.course_name_snapshot,'course_region',r.course_region_snapshot,'course_environment',r.course_environment,'course_segment',r.course_segment_snapshot,'hole_number',r.hole_number,'hole_par',r.hole_par,'strokes',r.strokes,
 'name',case when c.full_display_name_consent then p.display_name else 'PUL 회원' end,'member_key',case when c.full_display_name_consent then k.public_key end,'club_name',case when c.club_name_consent then cl.name end,
 'photos',coalesce((select jsonb_agg(e.id order by e.created_at,e.id) from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes ph on ph.evidence_id=e.id and ph.purpose='public_photo' where e.application_record_id=r.source_application_record_id and e.status='available'),'[]')) rowdata
 from private.hall_special_visible_records() r join public.hall_of_fame_publication_consents c on c.application_record_id=r.source_application_record_id left join public.user_profiles p on p.user_id=r.target_user_id left join public.clubs cl on cl.id=r.nominating_club_id left join private.hall_special_member_keys k on k.user_id=r.target_user_id
 where (p_club_key is null or (cl.legacy_key=p_club_key and c.club_name_consent)) and (p_member_key is null or (k.public_key=p_member_key and c.full_display_name_consent)) and (p_type is null or r.record_type_code=p_type)
 order by r.played_on desc,r.id desc limit p_limit offset p_offset) q;
 return jsonb_build_object('items',items,'total',total);
end$$;
revoke all on function public.list_hall_special_records(text,uuid,text,integer,integer) from public,service_role;
grant execute on function public.list_hall_special_records(text,uuid,text,integer,integer) to anon,authenticated;

create function public.get_hall_special_workspace() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.user_accounts where id=u and account_status='active') then raise exception 'SPECIAL_LOGIN_REQUIRED' using errcode='42501'; end if;
 return jsonb_build_object('viewer_id',u,'clubs',coalesce((select jsonb_agg(jsonb_build_object('id',cl.id,'key',cl.legacy_key,'name',cl.name,'can_review',private.hall_special_can_review(u,cl.id))) from public.club_memberships m join public.clubs cl on cl.id=m.club_id where m.user_id=u and m.membership_status='active' and cl.club_status='active' and not exists(select 1 from private.club_federations f where f.club_id=cl.id)),'[]'),
 'items',coalesce((select jsonb_agg(jsonb_build_object('application_record_id',a.id,'version',b.version,'status',b.status,'name',p.display_name,'club_name',cl.name,'club_id',cl.id,'record_type_code',coalesce(r.record_type_code,a.record_type_code),'played_on',coalesce(r.played_on,s.played_on),'started_at',s.started_at,'course_name',coalesce(r.course_name_snapshot,s.course_name_snapshot),'course_region',coalesce(r.course_region_snapshot,s.course_region_snapshot),'course_segment',coalesce(r.course_segment_snapshot,a.course_segment_snapshot),'course_environment',coalesce(r.course_environment,s.course_environment),'hole_number',coalesce(r.hole_number,a.hole_number),'hole_par',coalesce(r.hole_par,a.hole_par),'strokes',coalesce(r.strokes,a.strokes),'record_id',r.id,'record_version',r.version,'validity',r.validity_status,'can_review',private.hall_special_can_review(u,cl.id),'can_correct',case when cl.id is null then public.current_user_has_platform_permission('hall_of_fame.records.correct') else private.hall_special_can_review(u,cl.id) end,'can_revoke',case when cl.id is null then public.current_user_has_platform_permission('hall_of_fame.records.revoke') else private.hall_special_can_review(u,cl.id) end,'can_submit',a.target_user_id=u and b.status='draft',
 'companion_name',case when b.nominating_club_id is null then sp.companion_name end,'companion_contact',case when b.nominating_club_id is null then sp.companion_contact end,
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'purpose',ph.purpose)) from public.hall_of_fame_evidence_files e join private.hall_special_photo_purposes ph on ph.evidence_id=e.id where e.application_record_id=a.id and e.status='available'),'[]')) order by b.created_at desc)
 from private.hall_special_applications sp join public.hall_of_fame_application_records a on a.id=sp.application_record_id join public.hall_of_fame_application_batches b on b.id=sp.batch_id join public.hall_of_fame_round_snapshots s on s.application_batch_id=b.id left join public.user_profiles p on p.user_id=a.target_user_id left join public.clubs cl on cl.id=b.nominating_club_id
 left join public.hall_of_fame_records r on r.source_application_record_id=a.id and r.validity_status in ('active','revoked')
 where a.target_user_id=u or private.hall_special_can_review(u,b.nominating_club_id)),'[]'));
end$$;
revoke all on function public.get_hall_special_workspace() from public,anon,service_role;
grant execute on function public.get_hall_special_workspace() to authenticated;

create function public.get_hall_special_photo_file(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare e public.hall_of_fame_evidence_files; b public.hall_of_fame_application_batches; purpose text; u uuid:=auth.uid();
begin
 select f.* into e from public.hall_of_fame_evidence_files f join private.hall_special_photo_purposes p on p.evidence_id=f.id where f.id=p_id and f.status='available';
 if e.id is null then raise exception 'SPECIAL_PHOTO_NOT_FOUND' using errcode='42501'; end if;
 select p.purpose into purpose from private.hall_special_photo_purposes p where p.evidence_id=e.id;
 select * into b from public.hall_of_fame_application_batches where id=e.application_batch_id;
 if not (purpose='public_photo' and exists(select 1 from private.hall_special_visible_records() r where r.source_application_record_id=e.application_record_id)) then
 if b.status not in ('draft','submitted') or u is null or not exists(select 1 from public.user_accounts where id=u and account_status='active') or not (b.created_by_user_id=u or (b.status='submitted' and private.hall_special_can_review(u,b.nominating_club_id))) then raise exception 'SPECIAL_PHOTO_NOT_FOUND' using errcode='42501'; end if;
 end if;
 return jsonb_build_object('bucket',e.storage_bucket,'path',e.storage_path,'mime',e.mime_type);
end$$;
revoke all on function public.get_hall_special_photo_file(uuid) from public,service_role;
grant execute on function public.get_hall_special_photo_file(uuid) to anon,authenticated;

-- Resolve only server-authorized post identifiers, never a name or a client-supplied account id.
create function public.get_hall_special_post_authors(p_post_ids uuid[]) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare keys uuid[]; authors jsonb;
begin
 if coalesce(cardinality(p_post_ids),0)>100 then raise exception 'SPECIAL_SUMMARY_LIMIT'; end if;
 insert into private.hall_special_member_keys(user_id)
 select distinct p.author_user_id from public.club_posts p join public.user_profiles up on up.user_id=p.author_user_id and up.profile_visibility='public'
 join public.user_accounts a on a.id=p.author_user_id and a.account_status='active'
 where p.id=any(p_post_ids) and private.club_post_readable(p) on conflict do nothing;
 select array_agg(distinct k.public_key),jsonb_object_agg(p.id,k.public_key) into keys,authors
 from public.club_posts p join public.user_profiles up on up.user_id=p.author_user_id and up.profile_visibility='public'
 join public.user_accounts a on a.id=p.author_user_id and a.account_status='active'
 join private.hall_special_member_keys k on k.user_id=p.author_user_id where p.id=any(p_post_ids) and private.club_post_readable(p);
 return jsonb_build_object('authors',coalesce(authors,'{}'),'members',public.get_hall_special_member_summaries(keys));
end$$;
revoke all on function public.get_hall_special_post_authors(uuid[]) from public,service_role;
grant execute on function public.get_hall_special_post_authors(uuid[]) to anon,authenticated;

create function private.guard_hall_special_policy() returns trigger
language plpgsql security definer set search_path='' as $$
declare rowdata jsonb:=to_jsonb(new); bid uuid; special boolean; operation text:=current_setting('pul.hall_of_fame.operation',true);
begin
 if tg_table_name='hall_of_fame_application_batches' then bid:=(rowdata->>'id')::uuid;
 elsif tg_table_name='hall_of_fame_records' then select application_batch_id into bid from public.hall_of_fame_application_records where id=(rowdata->>'source_application_record_id')::uuid;
 elsif tg_table_name='hall_of_fame_publication_consents' then select application_batch_id into bid from public.hall_of_fame_application_records where id=(rowdata->>'application_record_id')::uuid;
 else bid:=(rowdata->>'application_batch_id')::uuid; end if;
 select exists(select 1 from private.hall_special_applications where batch_id=bid) into special;
 if special and not private.hall_special_write_allowed(tg_table_name,rowdata) then
 -- Preserve the existing subject-owned publication withdrawal and its original guards.
 if operation not in ('hall_of_fame.publication_consent.withdraw','hall_of_fame.publication_consent.withdraw_after_approval') or not private.hall_of_fame_mutation_context_is_valid() then raise exception 'SPECIAL_USE_SCOPED_WORKFLOW' using errcode='42501'; end if;
 end if;
 return new;
end$$;
revoke all on function private.guard_hall_special_policy() from public,anon,authenticated,service_role;
do $$declare t text;begin foreach t in array array['hall_of_fame_application_batches','hall_of_fame_round_snapshots','hall_of_fame_application_records','hall_of_fame_records','hall_of_fame_evidence_files','hall_of_fame_publication_consents'] loop
 execute format('create trigger aa_hall_special_policy before insert or update on public.%I for each row execute function private.guard_hall_special_policy()',t);
end loop;end$$;
