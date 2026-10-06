-- LOCAL ONLY supplement: after the stage 2 vendor candidate.
-- Preserve existing profiles, public eligibility, fields, query and 12-item pagination.
-- Standard regions search service area; legacy free-text conditions keep the old match.
begin;
create or replace function public.list_market_vendors(p_query text default '',p_region text default '',p_field text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer;
begin
 if length(p_query)>100 or length(p_region)>80 or length(p_field)>30 or p_offset not between 0 and 10000 then raise exception 'vendor_invalid'; end if;
 select count(*) into total from public.market_vendors v where private.vendor_public(v) is not null
 and (p_query='' or position(lower(p_query) in lower(v.approved->>'name'||' '||(v.approved->>'summary')))>0)
 and (p_region='' or
   (p_region='전국' and position('전국' in v.approved->>'area')>0) or
   (p_region=any(array['서울','경기','인천','충청','강원','전라','경상','제주']) and
     (position(p_region in v.approved->>'area')>0 or position('전국' in v.approved->>'area')>0)) or
   (p_region<>all(array['전국','서울','경기','인천','충청','강원','전라','경상','제주']) and
     position(p_region in (v.approved->>'region')||' '||(v.approved->>'area'))>0))
 and (p_field='' or v.approved->'fields' ? p_field);
 select coalesce(jsonb_agg(x.value order by x.updated_at desc,x.id),'[]') into result from (
 select private.vendor_public(v) value,v.updated_at,v.id from public.market_vendors v where private.vendor_public(v) is not null
 and (p_query='' or position(lower(p_query) in lower(v.approved->>'name'||' '||(v.approved->>'summary')))>0)
 and (p_region='' or
   (p_region='전국' and position('전국' in v.approved->>'area')>0) or
   (p_region=any(array['서울','경기','인천','충청','강원','전라','경상','제주']) and
     (position(p_region in v.approved->>'area')>0 or position('전국' in v.approved->>'area')>0)) or
   (p_region<>all(array['전국','서울','경기','인천','충청','강원','전라','경상','제주']) and
     position(p_region in (v.approved->>'region')||' '||(v.approved->>'area'))>0))
 and (p_field='' or v.approved->'fields' ? p_field) order by updated_at desc,id limit 12 offset p_offset) x;
 return jsonb_build_object('items',result,'hasMore',p_offset+jsonb_array_length(result)<total);
end $$;
-- CREATE OR REPLACE preserves the current explicit EXECUTE grants. No policy/grant changes.
commit;
