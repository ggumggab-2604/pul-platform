create or replace function public.list_public_clubs(
  p_keyword text default null,
  p_region text default null,
  p_district text default null,
  p_recruitment_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_keyword text := nullif(pg_catalog.btrim(p_keyword), '');
  v_region text := nullif(pg_catalog.btrim(p_region), '');
  v_district text := nullif(pg_catalog.btrim(p_district), '');
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 30);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total integer;
  v_items jsonb;
begin
  if v_keyword is not null and pg_catalog.char_length(v_keyword) > 100 then
    raise exception '검색어는 100자 이하여야 합니다.';
  end if;
  if v_region is not null and v_region not in (
    '서울', '경기', '인천', '충북', '충남', '강원', '전북', '전남',
    '경북', '경남', '부산', '대구', '광주', '대전', '울산', '제주'
  ) then
    raise exception '지역을 확인해 주세요.';
  end if;
  if v_district is not null and pg_catalog.char_length(v_district) > 80 then
    raise exception '활동 지역은 80자 이하여야 합니다.';
  end if;
  if p_recruitment_status is not null
     and p_recruitment_status not in ('recruiting', 'waiting', 'closed') then
    raise exception '회원 모집 상태를 확인해 주세요.';
  end if;

  select pg_catalog.count(*)::integer
  into v_total
  from public.clubs as club
  where club.club_status = 'active'
    and club.directory_is_public
    and not exists(select 1 from private.club_federations f where f.club_id=club.id)
    and club.legacy_key is not null
    and (v_region is null or club.region = v_region)
    and (v_district is null or club.district ilike '%' || v_district || '%')
    and (
      p_recruitment_status is null
      or club.membership_recruitment_status = p_recruitment_status
    )
    and (
      v_keyword is null
      or club.name ilike '%' || v_keyword || '%'
      or club.region ilike '%' || v_keyword || '%'
      or club.district ilike '%' || v_keyword || '%'
      or club.summary ilike '%' || v_keyword || '%'
    );

  select coalesce(
    pg_catalog.jsonb_agg(page.item order by page.created_at desc, page.id desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select club.id, club.created_at,
      pg_catalog.jsonb_build_object(
        'public_key', club.legacy_key,
        'name', club.name,
        'region', club.region,
        'district', club.district,
        'region_label', coalesce(
          nullif(pg_catalog.concat_ws(' ', club.region, club.district), ''),
          '지역 정보 미등록'
        ),
        'summary', club.summary,
        'recruitment_status', club.membership_recruitment_status,
        'created_at', club.created_at
      ) as item
    from public.clubs as club
    where club.club_status = 'active'
    and club.directory_is_public
    and not exists(select 1 from private.club_federations f where f.club_id=club.id)
      and club.legacy_key is not null
      and (v_region is null or club.region = v_region)
      and (v_district is null or club.district ilike '%' || v_district || '%')
      and (
        p_recruitment_status is null
        or club.membership_recruitment_status = p_recruitment_status
      )
      and (
        v_keyword is null
        or club.name ilike '%' || v_keyword || '%'
        or club.region ilike '%' || v_keyword || '%'
        or club.district ilike '%' || v_keyword || '%'
        or club.summary ilike '%' || v_keyword || '%'
      )
    order by club.created_at desc, club.id desc
    limit v_limit offset v_offset
  ) as page;

  return pg_catalog.jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'has_more', v_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
end;
$$;
