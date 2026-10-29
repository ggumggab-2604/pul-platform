-- Follow-up F1: preserve previous migrations and reject invalid optimistic concurrency tokens.
create or replace function public.update_club_profile(p_club_key text,p_expected_version bigint,p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c public.clubs; s private.club_profiles; ledger private.club_profile_requests; result jsonb; fp text:=md5(jsonb_build_object('club',p_club_key,'version',p_expected_version,'payload',p_payload)::text);
begin
 perform private.validate_club_profile(p_payload);
 if auth.uid() is null or p_request_id is null then raise exception '로그인과 요청 번호를 확인해 주세요.' using errcode='42501';end if;
 if p_expected_version is null or p_expected_version<1 then raise exception '유효한 정보 version이 필요합니다.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':profile:'||p_request_id::text,0));
 select * into c from public.clubs where legacy_key=p_club_key and club_status='active' for share;
 if not found or private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage') is not true then raise exception '현재 동호회 정보 설정 권한이 없습니다.' using errcode='42501';end if;
 perform 1 from public.club_memberships where club_id=c.id and user_id=auth.uid() and membership_status='active' for share;
 perform 1 from public.club_role_assignments where membership_id in(select id from public.club_memberships where club_id=c.id and user_id=auth.uid()) and revoked_at is null for share;
 if private.club_user_has_permission(auth.uid(),c.id,'club.settings.manage') is not true then raise exception '현재 정보 설정 권한이 없습니다.' using errcode='42501';end if;
 select * into ledger from private.club_profile_requests where actor_id=auth.uid() and request_id=p_request_id;
 if found then if ledger.fingerprint<>fp then raise exception '동일한 요청 번호를 다른 수정에 재사용할 수 없습니다.';end if;return ledger.result_data||'{"replayed":true}'::jsonb;end if;
 insert into private.club_profiles(club_id) values(c.id) on conflict do nothing;
 select * into s from private.club_profiles where club_id=c.id for update;
 if s.version is distinct from p_expected_version then raise exception '다른 관리자가 먼저 수정했습니다. 최신 정보를 다시 확인해 주세요.' using errcode='P0001';end if;
 if c.region is not null and p_payload->>'region' is distinct from c.region then raise exception '기존 동호회의 소속 지역 이전은 별도 확인이 필요합니다.';end if;
 perform private.replace_club_profile_courses(c.id,p_payload);
 update public.clubs set region=coalesce(region,p_payload->>'region'),name=btrim(p_payload->>'name'),summary=btrim(p_payload->>'summary'),district=coalesce(nullif(btrim(p_payload->>'district'),''),region),membership_recruitment_status=p_payload->>'recruitment_status' where id=c.id;
 update private.club_profiles set profile=p_payload->'profile',contacts=p_payload->'contacts',version=version+1,updated_at=now() where club_id=c.id;
 result:=jsonb_build_object('public_key',c.legacy_key,'version',s.version+1,'replayed',false);
 insert into private.club_profile_requests(actor_id,request_id,club_id,fingerprint,before_data,after_data,result_data) values(auth.uid(),p_request_id,c.id,fp,jsonb_build_object('profile',s.profile,'contacts',s.contacts,'name',c.name,'summary',c.summary),p_payload,result);
 return result;
end $$;
revoke all on function public.update_club_profile(text,bigint,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.update_club_profile(text,bigint,uuid,jsonb) to authenticated;

