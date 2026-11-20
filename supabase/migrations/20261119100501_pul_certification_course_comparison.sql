create function public.list_public_certification_course_comparisons(
  p_keyword text,
  p_category text,
  p_provider_type text,
  p_region text,
  p_course_method text,
  p_recruit_status text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with directory as materialized (
    select public.list_public_certification_courses(
      p_keyword, p_category, p_provider_type, p_region,
      p_course_method, p_recruit_status, p_limit, p_offset
    ) as result
  )
  select pg_catalog.jsonb_build_object(
    'page', directory.result || pg_catalog.jsonb_build_object('items', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'course', entry.course,
        'summary', pg_catalog.jsonb_build_object(
          'qualification', detail.details ->> 'qualification',
          'grade', detail.details ->> 'grade',
          'tuition', detail.details ->> 'tuition',
          'exam_fee', detail.details ->> 'exam_fee',
          'issue_fee', detail.details ->> 'issue_fee'
        )
      ) order by entry.position), '[]'::jsonb)
      from pg_catalog.jsonb_array_elements(directory.result -> 'items') with ordinality as entry(course, position)
      left join private.certification_course_details detail on detail.course_key = entry.course ->> 'course_key'
    )),
    'has_public_courses', (directory.result ->> 'total')::integer > 0 or exists (
      select 1 from public.certification_courses where publication_status = 'published'
    )
  )
  from directory;
$$;

comment on function public.list_public_certification_course_comparisons(text, text, text, text, text, text, integer, integer) is
'Course comparison projection of the existing published directory. Keeps the original list and detail contracts intact.';

revoke all on function public.list_public_certification_course_comparisons(text, text, text, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_public_certification_course_comparisons(text, text, text, text, text, text, integer, integer)
  to anon, authenticated;
