-- Public activity is a separate projection from the directory and operator contracts.
create function private.certification_job_effective_status(p_status text, p_ends_on date)
returns text language sql stable set search_path = '' as $$
  select case when p_ends_on < (now() at time zone 'Asia/Seoul')::date then 'closed' else p_status end;
$$;

create function private.certification_job_activity_json(p_job public.certification_jobs, p_details jsonb)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'key', p_job.job_key, 'title', p_job.title, 'role_type', p_job.role_type,
    'region', p_job.region, 'organizer', p_job.organizer_name,
    'status', private.certification_job_effective_status(p_job.recruit_status, p_job.application_ends_on),
    'activity_date', nullif(btrim(p_details->>'activity_date'), ''),
    'venue', nullif(btrim(p_details->>'venue'), ''),
    'qualification', nullif(concat_ws(' · ', nullif(btrim(p_details->>'issuer'), ''), nullif(btrim(p_details->>'grade'), '')), '')
  );
$$;

create function private.certification_job_contact_name(p_user_id uuid)
returns text language sql stable set search_path = '' as $$
  select case when private.messaging_account_available(p_user_id) then
    coalesce((select nullif(btrim(p.nickname), '') from public.user_profiles p
      where p.user_id = p_user_id and p.profile_visibility = 'public' and private.certification_public_profile_text(p.nickname)), '공고 담당자')
  end;
$$;

revoke all on function private.certification_job_effective_status(text,date),
  private.certification_job_activity_json(public.certification_jobs,jsonb),
  private.certification_job_contact_name(uuid) from public, anon, authenticated, service_role;

create function public.list_public_certification_job_activity(
  p_keyword text, p_role_type text, p_region text, p_recruit_status text, p_limit integer, p_offset integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_keyword text := nullif(lower(btrim(p_keyword)), '');
  v_region text := nullif(btrim(p_region), '');
  v_total integer;
  v_items jsonb;
begin
  if char_length(v_keyword) > 100 or char_length(v_region) > 80
    or p_role_type not in ('referee','instructor','staff','scorer','assistant')
    or p_recruit_status not in ('planned','recruiting','accepting','waiting','closed')
    or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset < 0 then
    raise exception 'certification_invalid' using errcode = '22023';
  end if;

  with filtered as materialized (
    select j as job, d.details, j.created_at, j.job_key
    from public.certification_jobs j left join private.certification_job_details d using(job_key)
    where j.publication_status = 'published'
      and (p_role_type is null or j.role_type = p_role_type)
      and (v_region is null or j.region = v_region)
      and (p_recruit_status is null or
        private.certification_job_effective_status(j.recruit_status,j.application_ends_on) = p_recruit_status)
      and (v_keyword is null or strpos(lower(concat_ws(' ',j.title,j.organizer_name,j.region,j.condition_text,
        d.details->>'venue',d.details->>'issuer',d.details->>'grade')), v_keyword) > 0)
  ), page as (
    select * from filtered order by created_at desc, job_key limit p_limit offset p_offset
  )
  select (select count(*)::integer from filtered),
    coalesce(jsonb_agg(private.certification_job_activity_json(job,details) order by created_at desc,job_key),'[]'::jsonb)
  into v_total,v_items from page;

  return jsonb_build_object('items',v_items,'total',v_total,'limit',p_limit,'offset',p_offset,
    'has_more',p_offset::bigint + jsonb_array_length(v_items) < v_total,
    'has_public_jobs',exists(select 1 from public.certification_jobs where publication_status = 'published'));
end;
$$;

create function public.certification_job_activity_detail(p_job_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'job',private.public_certification_job_json(j),
    'summary',private.certification_job_activity_json(j,d.details),
    'event_key',e.event_key,
    'contact_name',private.certification_job_contact_name(d.contact_user_id),
    'is_own_contact',coalesce(d.contact_user_id = auth.uid(),false)
  )
  from public.certification_jobs j left join private.certification_job_details d using(job_key)
  left join public.events e on e.event_key = d.event_key and e.publication_status = 'published'
  where j.job_key = p_job_key and j.publication_status = 'published';
$$;

revoke all on function public.list_public_certification_job_activity(text,text,text,text,integer,integer),
  public.certification_job_activity_detail(text) from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_job_activity(text,text,text,text,integer,integer),
  public.certification_job_activity_detail(text) to anon, authenticated;

create or replace function private.certification_event_jobs(p_event_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(private.certification_job_activity_json(j,d.details)
    || jsonb_build_object('contact_name',private.certification_job_contact_name(d.contact_user_id))
    order by j.title,j.job_key),'[]'::jsonb)
  from public.events e join private.certification_job_details d using(event_key)
  join public.certification_jobs j using(job_key)
  where e.event_key = p_event_key and e.publication_status = 'published' and j.publication_status = 'published';
$$;

-- Keep the existing row lock and version binding on send; use the same deadline rule as the public projections.
create or replace function private.certification_message_target(p_kind text,p_key text,p_lock boolean default false)
returns table(recipient uuid, title text, binding text)
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind = 'job' then
    if p_lock then
      perform 1 from public.certification_jobs j where j.job_key = p_key for share;
    end if;
    return query select d.contact_user_id,j.title,j.version::text
      from public.certification_jobs j join private.certification_job_details d using(job_key)
      where j.job_key = p_key and j.publication_status = 'published'
        and private.certification_job_effective_status(j.recruit_status,j.application_ends_on) <> 'closed';
  elsif p_kind = 'talent' and p_key ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
    if p_lock then
      perform 1 from private.certification_talent_profiles p where p.id = p_key::uuid for share;
    end if;
    return query select p.owner_id,pr.nickname,p.revision::text
      from private.certification_talent_profiles p join public.user_profiles pr on pr.user_id = p.owner_id
      where p.id = p_key::uuid and p.is_public and private.certification_public_profile_text(pr.nickname);
  end if;
end;
$$;
