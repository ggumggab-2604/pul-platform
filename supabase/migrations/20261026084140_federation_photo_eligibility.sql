-- Source qualification must use stored roles directly, without re-entering automatic federation qualification.
create or replace function private.club_primary_eligible(u uuid,m uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(exists(
  select 1 from public.club_memberships x join public.clubs c on c.id=x.club_id
  join private.club_profiles p on p.club_id=c.id
  where x.id=m and x.user_id=u and x.membership_status='active' and c.club_status='active'
   and p.profile->>'activityType' in ('field','both')
   and not exists(select 1 from private.club_federations f where f.club_id=c.id)
   and exists(select 1 from private.club_federations f where f.region=c.region)
   and private.club_stored_permission(u,c.id,'club.posts.read')
 ),false)
$$;
