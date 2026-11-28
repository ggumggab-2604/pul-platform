-- Keep the existing vendor mutation, approval, and Storage permission paths.
begin;
create or replace function private.vendor_profile(p jsonb, vid uuid, actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f text; a text;
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('name','region','area','primary','fields','summary','services','before','photos','businessRegistered','hasWorkshop','serviceModes','website','publicLinks')) then raise exception 'vendor_invalid'; end if;
 foreach f in array array['name','region','area','primary','summary','services','before'] loop
 if jsonb_typeof(p->f) is distinct from 'string' or (f not in ('area','before') and length(trim(p->>f))<1) or length(p->>f)>(case when f='services' then 2182 when f='before' then 2000 when f='summary' then 180 else 80 end) then raise exception 'vendor_invalid'; end if;
 end loop;
 if jsonb_typeof(p->'fields') is distinct from 'array' or jsonb_array_length(p->'fields') not between 1 and 6 or not (p->'fields' ? (p->>'primary')) then raise exception 'vendor_invalid'; end if;
 for f in select jsonb_array_elements_text(p->'fields') loop
 if f not in ('restore','head','grip','shaft','custom','fit') then raise exception 'vendor_invalid'; end if; end loop;
 if jsonb_typeof(p->'photos') is distinct from 'array' or jsonb_array_length(p->'photos')>5 then raise exception 'vendor_invalid'; end if;
 for a in select jsonb_array_elements_text(p->'photos') loop
 if not exists(select 1 from public.market_vendor_assets where id=a::uuid and vendor_id=vid and owner_id=actor and ready) then raise exception 'vendor_photo_permission' using errcode='42501'; end if; end loop;
 foreach f in array array['businessRegistered','hasWorkshop'] loop
 if p ? f and jsonb_typeof(p->f) not in ('boolean','null') then raise exception 'vendor_invalid'; end if;
 end loop;
 if p ? 'serviceModes' then
 if jsonb_typeof(p->'serviceModes') is distinct from 'array' then raise exception 'vendor_invalid'; end if;
 if jsonb_array_length(p->'serviceModes')>3 or exists(select 1 from jsonb_array_elements(p->'serviceModes') x where jsonb_typeof(x)<>'string' or x#>>'{}' not in ('visit','delivery','onsite'))
 or (select count(*)<>count(distinct x) from jsonb_array_elements(p->'serviceModes') x) then raise exception 'vendor_invalid'; end if;
 end if;
 if p ? 'website' then
 if jsonb_typeof(p->'website') is distinct from 'string' or length(p->>'website')>500 then raise exception 'vendor_invalid'; end if;
 if p->>'website'<>'' and (p->>'website' !~* '^https?://[^/@[:space:]:?#]+(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' or p->>'website' ~ '[[:space:]\\]') then raise exception 'vendor_invalid'; end if;
 end if;
 if p ? 'publicLinks' then
  if jsonb_typeof(p->'publicLinks') is distinct from 'object' then raise exception 'vendor_invalid'; end if;
  for f, a in select key, value #>> '{}' from jsonb_each(p->'publicLinks') loop
   if f not in ('website','blog','youtube') or jsonb_typeof(p->'publicLinks'->f) is distinct from 'string'
      or length(a)>500 or a !~* '^https://[^/@[:space:][:cntrl:]:?#]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      or a ~ '[\\]' then raise exception 'vendor_invalid'; end if;
  end loop;
 end if;
 return p;
end $$;

create or replace function public.list_market_vendors(p_query text default '',p_region text default '',p_field text default '',p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total integer; region_pattern text;
begin
 if length(p_query)>100 or length(p_region)>80 or length(p_field)>30 or p_offset not between 0 and 10000 then raise exception 'vendor_invalid'; end if;
 if p_region=any(array['서울','경기','인천','충청','강원','전라','경상','제주']) then
  region_pattern:=case p_region
   when '경상' then '경상|경북|경남|부산|대구|울산'
   when '충청' then '충청|충북|충남|대전|세종'
   when '전라' then '전라|전북|전남|전주|광주'
   else p_region end;
 end if;
 with matches as materialized (
  select private.vendor_public(v) as value,v.updated_at,v.id
  from public.market_vendors v
  where (p_query='' or position(lower(p_query) in lower(v.approved->>'name'||' '||(v.approved->>'summary')))>0)
  and (case
   when p_region='' then true
   when p_region='전국' then position('전국' in v.approved->>'area')>0
   when region_pattern is not null then
    position('전국' in v.approved->>'area')>0 or (case when p_region='전라' then
     -- Remove just the Gyeonggi Gwangju mention so other destinations still match.
     regexp_replace(concat_ws(', ',v.approved->>'region',v.approved->>'area'),
       '경기(도)?[[:space:]]*광주(?!광역시)시?',' ','g') ~ region_pattern
    else (v.approved->>'region') ~ region_pattern or (v.approved->>'area') ~ region_pattern
    end)
   else position(p_region in (v.approved->>'region')||' '||(v.approved->>'area'))>0
  end)
  and (p_field='' or v.approved->'fields' ? p_field)
 ), public_matches as (
  select value,updated_at,id from matches where value is not null
 ), page as (
  select value,updated_at,id from public_matches order by updated_at desc,id limit 12 offset p_offset
 )
 select coalesce(jsonb_agg(page.value order by page.updated_at desc,page.id),'[]'),
        (select count(*) from public_matches)
 into result,total from page;
 return jsonb_build_object('items',result,'hasMore',p_offset+jsonb_array_length(result)<total);
end $$;
notify pgrst,'reload schema';
commit;
