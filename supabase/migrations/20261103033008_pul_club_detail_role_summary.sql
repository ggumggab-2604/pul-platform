-- Counts and the viewer's own best only; no applicant, inquiry or other-member payload.
create function public.get_club_detail_role_summary(p_club_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); cid uuid; mid uuid; role_code text; best jsonb;
 apps bigint; inquiries bigint;
begin
 if actor is null or not private.messaging_account_available(actor) then
  raise exception '현재 계정으로 조회할 수 없습니다.' using errcode='42501';
 end if;
 select id into cid from public.clubs where legacy_key=p_club_key and club_status='active';
 if cid is null then raise exception '동호회를 확인할 수 없습니다.' using errcode='42501';end if;
 select id into mid from public.club_memberships where club_id=cid and user_id=actor and membership_status='active';
 if private.club_user_has_permission(actor,cid,'club.membership_applications.read')
    and private.club_user_has_permission(actor,cid,'club.membership_applications.manage') then
  select count(*) into apps from public.club_membership_applications
   where club_id=cid and status in ('submitted','reviewing','additional_info_required','interview_requested','waitlisted');
 end if;
 if private.club_user_has_permission(actor,cid,'club.join_inquiries.read')
    and private.club_user_has_permission(actor,cid,'club.join_inquiries.manage') then
  select count(*) into inquiries from public.club_join_inquiries where club_id=cid and inquiry_status in ('received','reviewing');
 end if;
 if mid is null and apps is null and inquiries is null then
  raise exception '현재 회원 또는 권한이 있는 운영진만 조회할 수 있습니다.' using errcode='42501';
 end if;
 if mid is not null then
  select a.role_code into role_code from public.club_role_assignments a
   join public.club_role_definitions d on d.role_code=a.role_code and d.is_active
   where a.membership_id=mid and a.revoked_at is null and a.role_code in ('club_admin','club_vice_admin')
   order by case a.role_code when 'club_admin' then 0 else 1 end limit 1;
  role_code:=coalesce(role_code,'club_member');
  perform private.monthly_club(p_club_key,false);
  select jsonb_build_object('personId',person_id,'score',score,'rank',ranking,'tied',tied,'date',played_on,'course',course_name,'kind',kind)
   into best from private.club_personal_bests where club_id=cid and user_id=actor;
 end if;
 return jsonb_build_object('member',mid is not null,'role',role_code,'best',best,'applications',apps,'inquiries',inquiries);
end $$;
revoke all on function public.get_club_detail_role_summary(text) from public,anon,authenticated,service_role;
grant execute on function public.get_club_detail_role_summary(text) to authenticated;

-- Keep the existing history queue; this separate queue contains every pending item counted above.
create function public.list_club_pending_inquiries(p_club_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cid uuid;
begin
 select id into cid from public.clubs where legacy_key=p_club_key and club_status='active';
 if cid is null or auth.uid() is null or not private.messaging_account_available(auth.uid())
  or private.club_user_has_permission(auth.uid(),cid,'club.join_inquiries.read') is not true then
  raise exception '문의 조회 권한이 없습니다.' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'category',category,'message',message,'status',inquiry_status,'reply',public_reply,'created_at',submitted_at) order by submitted_at desc,id desc)
  from public.club_join_inquiries where club_id=cid and inquiry_status in ('received','reviewing')),'[]'::jsonb);
end $$;
revoke all on function public.list_club_pending_inquiries(text) from public,anon,authenticated,service_role;
grant execute on function public.list_club_pending_inquiries(text) to authenticated;

-- Same pending definition as the summary; existing pagination and permissions remain.
create or replace function public.list_club_membership_applications(
  p_club_id uuid,
  p_status text default null,
  p_limit integer default 50,
  p_before_submitted_at timestamptz default null,
  p_before_application_id uuid default null
)
returns table (
  application_id uuid,
  club_id uuid,
  applicant_id uuid,
  applicant_display_name text,
  status text,
  experience_code text,
  available_day_code text,
  interest_codes text[],
  application_version bigint,
  submitted_at timestamptz,
  status_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_status text := nullif(pg_catalog.btrim(p_status), '');
begin
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if p_club_id is null then
    raise exception 'CLUB_REQUIRED';
  end if;
  if v_status is not null and v_status not in (
    'pending', 'submitted', 'reviewing', 'additional_info_required',
    'interview_requested', 'waitlisted', 'approved', 'rejected', 'withdrawn'
  ) then
    raise exception 'INVALID_APPLICATION_STATUS';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'INVALID_PAGE_LIMIT';
  end if;
  if (p_before_submitted_at is null) <> (p_before_application_id is null) then
    raise exception 'INVALID_PAGE_CURSOR';
  end if;
  if not exists (
    select 1 from public.user_accounts as account
    where account.id = v_actor_id and account.account_status = 'active'
  ) or not private.club_user_has_permission(
    v_actor_id, p_club_id, 'club.membership_applications.read'
  ) then
    raise exception 'APPLICATION_READ_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  return query
  select
    application.id,
    application.club_id,
    application.applicant_id,
    coalesce(nullif(pg_catalog.btrim(profile.display_name), ''), 'Name unavailable'),
    application.status,
    application.experience_code,
    application.available_day_code,
    application.interest_codes,
    application.version,
    application.submitted_at,
    application.status_changed_at
  from public.club_membership_applications as application
  left join public.user_profiles as profile on profile.user_id = application.applicant_id
  where application.club_id = p_club_id
    and (v_status is null or application.status = v_status or (v_status = 'pending' and application.status in ('submitted','reviewing','additional_info_required','interview_requested','waitlisted')))
    and (
      p_before_submitted_at is null
      or (application.submitted_at, application.id)
        < (p_before_submitted_at, p_before_application_id)
    )
  order by application.submitted_at desc, application.id desc
  limit p_limit;
end;
$$;
