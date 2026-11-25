begin;

create or replace function public.get_my_dashboard()
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
      private.tournament_signup_open(e,s) as signup_open, private.tournament_registration_status(e) as registration_status,
      s.attendance_closed, h.finalized_at,
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
    select 'club' as kind, key, name, role as label, null::text as parent, null::timestamptz as deadline from clubs
    union all select 'course', key, name,
      case operating_status when 'open' then '운영 중' when 'closed' then '휴장 중' else '운영 상태 미등록' end, null, null from courses
    union all select 'event', key, name, case when cancelled then '취소' when signup_open then '접수 중'
      when finalized_at is not null then '성적 확정'
      when registration_status = 'scheduled' then '접수 예정'
      when registration_status = 'needCheck' then '일정 확인 필요'
      when registration_status = 'ended' then '접수 종료' else '접수 마감' end, null, deadline from tournaments
    union all select 'university', key, name,
      concat_ws(' · ',case when can_manage then '담당자' end,
        case student_status when 'approved' then '재학생' when 'pending' then '승인 대기' end), parent, null
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
    from tournaments t join private.tournament_roster r on r.event_id = t.id and r.active
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

commit;
