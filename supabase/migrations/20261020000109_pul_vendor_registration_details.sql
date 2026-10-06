-- Independent LOCAL ONLY supplement after the integrated stage 2 vendor candidate.
-- Existing JSON drafts, requests, owner checks, review/version flow and grants remain.
begin;
create or replace function private.vendor_profile(p jsonb, vid uuid, actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f text; a text;
begin
 if p is null or jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where k not in ('name','region','area','primary','fields','summary','services','before','photos','businessRegistered','hasWorkshop','serviceModes','website')) then raise exception 'vendor_invalid'; end if;
 foreach f in array array['name','region','area','primary','summary','services','before'] loop
 if jsonb_typeof(p->f) is distinct from 'string' or length(trim(p->>f))<1 or length(p->>f)>(case when f in ('services','before') then 2000 when f='summary' then 180 else 80 end) then raise exception 'vendor_invalid'; end if;
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
 return p;
end $$;

-- New application-management fields are owner/manager information only.
-- Public cards/details continue to use only the existing approved profile structure.
create or replace function private.vendor_public(v public.market_vendors) returns jsonb language sql stable security definer set search_path='' as $$
 select case when v.visible and not v.restricted and v.approved is not null and private.messaging_account_available(v.owner_id)
 then jsonb_build_object('id',v.id,'profile',v.approved - array['businessRegistered','hasWorkshop','serviceModes','website']) end;
$$;
-- CREATE OR REPLACE retains explicit EXECUTE grants; no new permissions or table access.
notify pgrst,'reload schema';
commit;
