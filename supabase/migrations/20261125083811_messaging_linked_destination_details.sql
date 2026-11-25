-- Keep the original confirmation entry point for existing clients.
alter table private.hall_special_companions
  add column declined_at timestamptz,
  add constraint hall_special_companion_one_response check (approved_at is null or declined_at is null);

create function private.hall_special_companion_response(p_message_id uuid, response text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source_id uuid;
  member_id uuid;
  result jsonb;
  approved timestamptz;
  declined timestamptz;
begin
  if response is not null then
    if response not in ('confirm', 'decline') then
      raise exception 'SPECIAL_COMPANION_FORBIDDEN' using errcode = '42501';
    end if;
    perform private.lock_active_hall_of_fame_actor(actor);
    perform private.lock_hall_of_fame_authorization_boundary();
  end if;

  select r.source_application_record_id, m.id,
    jsonb_build_object('id', r.id, 'type', r.record_type_code,
      'name', private.hall_viewer_name(r.target_user_id, r.display_name),
      'course', r.course_name_snapshot, 'date', r.played_on,
      'segment', r.course_segment_snapshot, 'hole', r.hole_number,
      'confirmed', w.approved_at is not null, 'declined', w.declined_at is not null)
  into source_id, member_id, result
  from private.hall_special_president_records r
  join private.hall_special_applications sp on sp.application_record_id = r.source_application_record_id
  join private.hall_special_companions w on w.application_record_id = sp.application_record_id
  join public.club_memberships m on m.id = w.membership_id and m.membership_status = 'active'
    and m.club_id = r.nominating_club_id and m.user_id = actor
  where sp.companion_message_id = p_message_id and actor <> r.target_user_id
    and private.messaging_account_available(actor)
    and exists (select 1 from public.messaging_recipients receipt
      where receipt.message_id = p_message_id and receipt.recipient_user_id = actor);

  if result is null then
    if response is not null then raise exception 'SPECIAL_COMPANION_FORBIDDEN' using errcode = '42501'; end if;
    return null;
  end if;
  if response is null then return result; end if;

  perform 1 from public.hall_of_fame_records
    where id = (result->>'id')::uuid and validity_status = 'active' and publication_status = 'published'
    for share;
  if not found then raise exception 'SPECIAL_COMPANION_FORBIDDEN' using errcode = '42501'; end if;

  update private.hall_special_companions
  set approved_at = case when response = 'confirm' then coalesce(approved_at, now()) else approved_at end,
      declined_at = case when response = 'decline' then coalesce(declined_at, now()) else declined_at end
  where application_record_id = source_id and membership_id = member_id
    and ((response = 'confirm' and declined_at is null) or (response = 'decline' and approved_at is null))
  returning approved_at, declined_at into approved, declined;
  if not found then raise exception 'SPECIAL_COMPANION_ALREADY_RESPONDED' using errcode = 'PT409'; end if;
  return result || jsonb_build_object('confirmed', approved is not null, 'declined', declined is not null);
end
$$;

create or replace function public.hall_special_companion_confirmation(p_message_id uuid, p_confirm boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.hall_special_companion_response(p_message_id, case when p_confirm then 'confirm' end)
$$;
create function public.decline_hall_special_companion(p_message_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.hall_special_companion_response(p_message_id, 'decline')
$$;
revoke all on function private.hall_special_companion_response(uuid, text),
  public.hall_special_companion_confirmation(uuid, boolean), public.decline_hall_special_companion(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.hall_special_companion_response(uuid, text),
  public.hall_special_companion_confirmation(uuid, boolean), public.decline_hall_special_companion(uuid) to authenticated;

-- Project the destination title only while the existing reviewer can open that row.
create or replace function public.get_tournament_correction_message(p_message_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', q.id, 'clubKey', c.legacy_key, 'clubName', c.name, 'tournamentTitle', ev.title)
  from private.tournament_correction_messages n
  join private.tournament_result_corrections q on q.id = n.correction_id and q.status = 'pending'
  join private.club_tournament_entries e on e.id = q.entry_id
  join private.club_tournaments t on t.id = e.tournament_id
  join public.events ev on ev.id = t.event_id
  left join private.tournament_hosts h on h.event_id = t.event_id
  join public.clubs c on c.id = t.club_id and c.club_status = 'active'
  join public.messaging_recipients r on r.message_id = n.message_id and r.recipient_user_id = auth.uid() and r.hidden_at is null
  where n.message_id = p_message_id and q.requested_by is distinct from auth.uid()
    and (q.applied_revision is not null or num_nonnulls(h.host_club_id, h.host_course_id) = 0)
    and private.messaging_account_available(auth.uid())
    and private.club_user_is_active_admin_or_vice_admin(auth.uid(), c.id)
$$;
