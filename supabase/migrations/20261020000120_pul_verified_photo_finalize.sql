-- Formal release of docs/photos/20261008-fixed-dimensions/market_image_finalize_boundary.sql.
-- Same SQL body; locally already installed. Do not execute both copies.
-- New server verification gates only; existing ready assets and actor checks remain unchanged.
begin;
revoke all on function public.complete_market_store_asset(uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_market_vendor_asset(uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_market_content_asset(uuid) from public,anon,authenticated,service_role;
-- The store RPC already wraps a private implementation in the existing baseline.
revoke all on function private.complete_market_store_asset(uuid) from public,anon,authenticated,service_role;

create function public.complete_market_photo_asset_server(
 p_kind text,p_actor uuid,p_id uuid,p_verified_mime text,p_verified_bytes integer,p_verified_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a record; old_claims text:=current_setting('request.jwt.claims',true);
 old_sub text:=current_setting('request.jwt.claim.sub',true);old_role text:=current_setting('request.jwt.claim.role',true);
begin
 if coalesce(nullif(old_role,''),(nullif(old_claims,'')::jsonb->>'role')) is distinct from 'service_role'
   or p_actor is null or p_kind is null or p_kind not in ('store','vendor','content') then
   raise exception 'photo_finalize_not_authorized' using errcode='42501';
 end if;
 if p_kind='store' then select owner_id,mime,bytes,sha256 into a from public.market_store_assets where id=p_id for update;
 elsif p_kind='vendor' then select owner_id,mime,bytes,sha256 into a from public.market_vendor_assets where id=p_id for update;
 else select owner_id,mime,bytes,sha256 into a from public.market_content_assets where id=p_id for update;end if;
 if not found or a.owner_id is distinct from p_actor or a.mime is distinct from p_verified_mime
   or a.bytes is distinct from p_verified_bytes or a.sha256 is distinct from p_verified_sha256 then
   raise exception 'photo_verified_object_mismatch' using errcode='42501';
 end if;
 -- Preserve the exact original active-account/permission/owner/Storage checks.
 -- Service-only caller supplies the actor verified with getUser; claims are scoped and restored.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if p_kind='store' then perform private.complete_market_store_asset(p_id);
 elsif p_kind='vendor' then perform public.complete_market_vendor_asset(p_id);
 else perform public.complete_market_content_asset(p_id);end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.complete_market_photo_asset_server(text,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.complete_market_photo_asset_server(text,uuid,uuid,text,integer,text) to service_role;
comment on function public.complete_market_photo_asset_server(text,uuid,uuid,text,integer,text) is 'Only a server that verified actual bytes/pixels/hash may complete a new photo asset.';
commit;
