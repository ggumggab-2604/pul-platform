begin;

create or replace function private.certification_topic_valid(p_topic text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    p_topic ~ '^(written-2026-(education|society|psychology|ethics|physiology|mechanics|history|health|injury|measurement|training|disability|adapted|senior|earlychildhood)-([1-9]|1[0-9]|20)|practical-(hancheon|boryeong)|oral-(safety|local-rules)|training-(hanyang|kyonggi))$'
    or exists (
      select 1 from private.certification_oral_submissions o
      where p_topic='oral-'||o.id::text and o.status='published'
    ), false);
$$;

commit;
