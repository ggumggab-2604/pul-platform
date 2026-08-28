-- PUL 9-3B: permission-safe, read-only operations inbox read model.
-- This migration does not create tasks or mutate any operational domain row.

insert into public.platform_permission_definitions (
  code,
  description,
  is_active
)
values (
  'courses.information_reports.read',
  '골프장 정보 제보의 미처리 현황을 운영 대시보드에서 확인합니다.',
  true
);

insert into public.platform_role_permissions (
  platform_role,
  permission_code
)
values (
  'platform_admin',
  'courses.information_reports.read'
);

create function public.get_operations_dashboard(
  p_reference_at timestamptz default pg_catalog.now(),
  p_recent_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_permissions text[] := '{}'::text[];
  v_attention jsonb := '[]'::jsonb;
  v_upcoming jsonb := '[]'::jsonb;
  v_signals jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_count bigint;
  v_oldest timestamptz;
  v_next timestamptz;
  v_age_days integer;
  v_urgency text;
  v_has_course_reports boolean;
  v_has_lessons boolean;
  v_has_certification boolean;
  v_has_news boolean;
  v_has_market_repair boolean;
  v_has_market_partnership boolean;
  v_has_hof_applications boolean;
  v_has_hof_disputes boolean;
  v_has_hof_evidence boolean;
  v_has_promotions boolean;
  v_has_events boolean;
begin
  if v_actor_id is null then
    raise exception 'PUL_OPERATIONS_DASHBOARD_AUTHENTICATION_REQUIRED'
      using errcode = '42501';
  end if;

  if p_reference_at is null
     or p_recent_limit is null
     or p_recent_limit not between 1 and 8 then
    raise exception 'PUL_OPERATIONS_DASHBOARD_INVALID_ARGUMENT'
      using errcode = '22023';
  end if;

  select coalesce(
    pg_catalog.array_agg(mapping.permission_code order by mapping.permission_code),
    '{}'::text[]
  )
  into v_permissions
  from public.user_accounts as account
  join public.platform_role_permissions as mapping
    on mapping.platform_role = account.platform_role
  join public.platform_permission_definitions as permission
    on permission.code = mapping.permission_code
   and permission.is_active
  where account.id = v_actor_id
    and account.account_status = 'active';

  v_has_course_reports := 'courses.information_reports.read' = any(v_permissions);
  v_has_lessons := 'lessons.manage' = any(v_permissions);
  v_has_certification := 'certification.manage' = any(v_permissions);
  v_has_news := 'news.manage' = any(v_permissions);
  v_has_market_repair := 'market.repair_shop_inquiries.manage' = any(v_permissions);
  v_has_market_partnership := 'market.partnership_inquiries.manage' = any(v_permissions);
  v_has_hof_applications := 'hall_of_fame.applications.read' = any(v_permissions);
  v_has_hof_disputes := 'hall_of_fame.disputes.read' = any(v_permissions);
  v_has_hof_evidence := 'hall_of_fame.evidence.read' = any(v_permissions);
  v_has_promotions := 'promotions.manage' = any(v_permissions);
  v_has_events := 'events.manage' = any(v_permissions);

  if not (
    v_has_course_reports
    or v_has_lessons
    or v_has_certification
    or v_has_news
    or v_has_market_repair
    or v_has_market_partnership
    or v_has_hof_applications
    or v_has_hof_disputes
    or v_has_hof_evidence
    or v_has_promotions
    or v_has_events
  ) then
    raise exception 'PUL_OPERATIONS_DASHBOARD_NOT_AUTHORIZED'
      using errcode = '42501';
  end if;

  if v_has_course_reports then
    select pg_catalog.count(*), pg_catalog.min(report.created_at)
    into v_count, v_oldest
    from public.course_information_reports as report
    where report.report_status = 'received';
    if v_count > 0 then
      v_age_days := greatest(
        0,
        pg_catalog.floor(
          extract(epoch from (p_reference_at - v_oldest)) / 86400
        )::integer
      );
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'course_information_reports', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_lessons then
    select pg_catalog.count(*), pg_catalog.min(request.created_at)
    into v_count, v_oldest
    from public.lesson_submission_requests as request
    where request.request_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'lesson_submission_requests', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;

    select pg_catalog.count(*), pg_catalog.min(report.created_at)
    into v_count, v_oldest
    from public.lesson_information_reports as report
    where report.report_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'lesson_information_reports', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_certification then
    select pg_catalog.count(*), pg_catalog.min(request.created_at)
    into v_count, v_oldest
    from public.certification_submission_requests as request
    where request.request_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'certification_submission_requests', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_news then
    select pg_catalog.count(*), pg_catalog.min(inquiry.created_at)
    into v_count, v_oldest
    from public.news_inquiries as inquiry
    where inquiry.inquiry_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'news_inquiries', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_market_repair then
    select pg_catalog.count(*), pg_catalog.min(inquiry.created_at)
    into v_count, v_oldest
    from public.market_repair_shop_inquiries as inquiry
    where inquiry.inquiry_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'market_repair_shop_inquiries', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_market_partnership then
    select pg_catalog.count(*), pg_catalog.min(inquiry.created_at)
    into v_count, v_oldest
    from public.market_partnership_inquiries as inquiry
    where inquiry.inquiry_status = 'pending';
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'market_partnership_inquiries', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_hof_applications then
    select pg_catalog.count(*), pg_catalog.min(batch.submitted_at)
    into v_count, v_oldest
    from public.hall_of_fame_application_batches as batch
    where batch.status in ('submitted', 'under_review', 'additional_info_required');
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'hall_of_fame_application_reviews', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_hof_disputes then
    select pg_catalog.count(*), pg_catalog.min(dispute.created_at)
    into v_count, v_oldest
    from public.hall_of_fame_disputes as dispute
    where dispute.status in ('open', 'under_review');
    if v_count > 0 then
      v_age_days := greatest(0, pg_catalog.floor(extract(epoch from (p_reference_at - v_oldest)) / 86400)::integer);
      v_urgency := case when v_age_days >= 7 then 'overdue' when v_age_days >= 3 then 'attention' else 'normal' end;
      v_attention := v_attention || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'queue_key', 'hall_of_fame_disputes', 'count', v_count,
        'oldest_at', v_oldest, 'age_days', v_age_days, 'urgency', v_urgency
      ));
    end if;
  end if;

  if v_has_promotions then
    select pg_catalog.count(*), pg_catalog.min(placement.ends_at)
    into v_count, v_next
    from public.promotion_placements as placement
    where placement.publication_status = 'published'
      and placement.starts_at <= p_reference_at
      and placement.ends_at > p_reference_at
      and placement.ends_at <= p_reference_at + interval '7 days';
    if v_count > 0 then
      v_upcoming := v_upcoming || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'item_key', 'promotions_ending_soon', 'count', v_count,
        'next_at', v_next, 'severity', 'info'
      ));
    end if;
  end if;

  if v_has_events then
    select pg_catalog.count(*),
           (pg_catalog.min(event.start_date)::timestamp at time zone 'Asia/Seoul')
    into v_count, v_next
    from public.events as event
    where event.publication_status = 'published'
      and event.start_date between p_reference_at::date and (p_reference_at + interval '7 days')::date;
    if v_count > 0 then
      v_upcoming := v_upcoming || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'item_key', 'events_starting_soon', 'count', v_count,
        'next_at', v_next, 'severity', 'info'
      ));
    end if;

    select pg_catalog.count(*)
    into v_count
    from public.events as event
    where event.publication_status = 'published'
      and event.end_date is not null
      and event.end_date < p_reference_at::date
      and event.registration_status in ('open', 'scheduled');
    if v_count > 0 then
      v_upcoming := v_upcoming || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'item_key', 'events_status_mismatch', 'count', v_count,
        'next_at', null, 'severity', 'warning'
      ));
    end if;
  end if;

  if v_has_promotions then
    select pg_catalog.count(*)
    into v_count
    from public.promotion_media as media
    where (
      media.media_status = 'pending_upload'
      and media.created_at <= p_reference_at - interval '1 hour'
    ) or (
      media.media_status = 'failed'
      and not exists (
        select 1
        from public.promotion_media as replacement
        where replacement.promotion_id = media.promotion_id
          and replacement.variant = media.variant
          and replacement.sort_order = media.sort_order
          and replacement.media_status = 'available'
      )
    );
    if v_count > 0 then
      v_signals := v_signals || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'signal_key', 'promotion_media_attention', 'count', v_count, 'severity', 'warning'
      ));
    end if;
  end if;

  if v_has_hof_evidence then
    select pg_catalog.count(*)
    into v_count
    from public.hall_of_fame_evidence_files as evidence
    where evidence.storage_deleted_at is null
      and (
        evidence.status in ('failed', 'expired', 'replaced', 'deleted')
        or (
          evidence.status = 'pending_upload'
          and evidence.upload_expires_at <= p_reference_at
        )
      );
    if v_count > 0 then
      v_signals := v_signals || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'signal_key', 'hall_of_fame_evidence_cleanup', 'count', v_count, 'severity', 'warning'
      ));
    end if;
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'domain', activity.domain,
        'action', activity.action,
        'occurred_at', activity.created_at,
        'outcome', activity.outcome
      ) order by activity.created_at desc, activity.id desc
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select
      audit.id,
      case when audit.action like 'promotion.%' then 'promotions' else 'hall_of_fame' end as domain,
      audit.action,
      audit.created_at,
      audit.outcome
    from public.audit_logs as audit
    where audit.outcome in ('success', 'noop')
      and (
        (
          v_has_promotions
          and audit.action in (
            'promotion.create', 'promotion.update', 'promotion.archive',
            'promotion.placement.create', 'promotion.placement.update',
            'promotion.placement.publish', 'promotion.placement.hide',
            'promotion.media.finalize', 'promotion.media.remove'
          )
        )
        or (
          v_has_hof_applications
          and audit.action in (
            'hall_of_fame.application.review.start',
            'hall_of_fame.application.additional_info.request',
            'hall_of_fame.application.final_decision'
          )
        )
        or (
          v_has_hof_disputes
          and audit.action in (
            'hall_of_fame.dispute.review.start',
            'hall_of_fame.dispute.resolve',
            'hall_of_fame.dispute.resolve.correction',
            'hall_of_fame.dispute.resolve.revoke'
          )
        )
      )
    order by audit.created_at desc, audit.id desc
    limit p_recent_limit
  ) as activity;

  return pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'generated_at', p_reference_at,
    'attention', v_attention,
    'upcoming', v_upcoming,
    'automation_signals', v_signals,
    'recent_activity', v_recent
  );
end;
$$;

comment on function public.get_operations_dashboard(timestamptz, integer) is
  'Returns a permission-filtered, privacy-minimized, read-only operations inbox without task creation, locks, or domain mutations.';

revoke all on function public.get_operations_dashboard(timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_operations_dashboard(timestamptz, integer)
  to authenticated;
