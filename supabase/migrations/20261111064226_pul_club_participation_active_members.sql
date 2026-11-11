-- Keep saved votes and submission history. Use current membership when displaying closed room rosters.
CREATE OR REPLACE FUNCTION private.club_room_members(r private.club_participation_rooms)
 RETURNS TABLE(user_id uuid, name text, response text, division text, queued_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.user_id,coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
    case when r.closed_at is not null or r.tournament_id is null then v.response else t.response end,
    case when r.closed_at is not null or r.tournament_id is null then v.division else t.division end,
    v.joined_queue_at
  from (
    select cm.user_id from public.club_memberships cm
    where r.closed_at is null and cm.club_id=r.club_id and cm.membership_status='active'
    union all
    select cv.user_id from private.club_participation_votes cv
    where r.closed_at is not null and cv.room_id=r.id and cv.frozen
      and private.tournament_entry_member(r.club_id,cv.user_id)
  ) m
  left join public.user_profiles p on p.user_id=m.user_id
  left join private.club_participation_votes v on (v.room_id,v.user_id)=(r.id,m.user_id)
  left join private.tournament_club_responses t on (t.event_id,t.club_id,t.user_id)=(r.tournament_id,r.club_id,m.user_id)
  where private.messaging_account_available(m.user_id)
$function$;
