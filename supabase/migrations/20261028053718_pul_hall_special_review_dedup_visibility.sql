-- Shared v1/v2 event guard. No historical rows, fingerprints, consent or publication are rewritten.
create table private.hall_of_fame_event_locks (
 target_user_id uuid primary key references public.user_accounts(id) on delete restrict
);
alter table private.hall_of_fame_event_locks enable row level security;
alter table private.hall_of_fame_event_locks force row level security;
revoke all on private.hall_of_fame_event_locks from public,anon,authenticated,service_role;

create function private.hall_of_fame_event_identity(p_day date,p_course text,p_region text,p_environment text,p_segment text,p_hole integer) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_array(p_day,lower(btrim(p_course)),lower(btrim(p_region)),p_environment,lower(btrim(p_segment)),p_hole)
$$;
revoke all on function private.hall_of_fame_event_identity(date,text,text,text,text,integer) from public,anon,authenticated,service_role;

create function private.assert_hall_of_fame_event_available(p_user uuid,p_day date,p_course text,p_region text,p_environment text,p_segment text,p_hole integer,p_source uuid) returns void
language plpgsql volatile security definer set search_path='' as $$
declare event_key jsonb:=private.hall_of_fame_event_identity(p_day,p_course,p_region,p_environment,p_segment,p_hole);
begin
 -- A row write serializes v1/v2, including snapshot-isolation transactions (which must retry on 40001).
 insert into private.hall_of_fame_event_locks(target_user_id) values(p_user)
 on conflict(target_user_id) do update set target_user_id=excluded.target_user_id;
 if exists(
 select 1 from public.hall_of_fame_records r
 where r.target_user_id=p_user and r.played_on=p_day and r.validity_status='active'
 and r.source_application_record_id<>p_source
 and private.hall_of_fame_event_identity(r.played_on,r.course_name_snapshot,r.course_region_snapshot,r.course_environment,r.course_segment_snapshot,r.hole_number)=event_key
 ) or exists(
 select 1 from public.hall_of_fame_application_records a
 join public.hall_of_fame_round_snapshots s on s.id=a.round_snapshot_id and s.application_batch_id=a.application_batch_id
 where a.target_user_id=p_user and a.id<>p_source and s.played_on=p_day
 and a.review_status in ('submitted','under_review','additional_info_required','approved')
 and private.hall_of_fame_event_identity(s.played_on,s.course_name_snapshot,s.course_region_snapshot,s.course_environment,a.course_segment_snapshot,a.hole_number)=event_key
 ) then raise exception 'HOF_DUPLICATE_EVENT' using errcode='PT409'; end if;
end$$;
revoke all on function private.assert_hall_of_fame_event_available(uuid,date,text,text,text,text,integer,uuid) from public,anon,authenticated,service_role;

create function private.guard_hall_of_fame_event_identity() returns trigger
language plpgsql volatile security definer set search_path='' as $$
declare s public.hall_of_fame_round_snapshots; a public.hall_of_fame_application_records;
begin
 if tg_table_name='hall_of_fame_records' then
  if new.validity_status<>'active' then return new; end if;
  if tg_op='UPDATE' and old.validity_status='active' and
   row(new.target_user_id,new.played_on,new.course_name_snapshot,new.course_region_snapshot,new.course_environment,new.course_segment_snapshot,new.hole_number,new.source_application_record_id)
   is not distinct from row(old.target_user_id,old.played_on,old.course_name_snapshot,old.course_region_snapshot,old.course_environment,old.course_segment_snapshot,old.hole_number,old.source_application_record_id) then return new; end if;
  perform private.assert_hall_of_fame_event_available(new.target_user_id,new.played_on,new.course_name_snapshot,new.course_region_snapshot,new.course_environment,new.course_segment_snapshot,new.hole_number,new.source_application_record_id);
 elsif tg_table_name='hall_of_fame_application_records' then
  if new.review_status not in ('draft','submitted','under_review','additional_info_required','approved') then return new; end if;
  if tg_op='UPDATE' and new.review_status<>'draft' and old.review_status=new.review_status and
   row(new.target_user_id,new.round_snapshot_id,new.course_segment_snapshot,new.hole_number)
   is not distinct from row(old.target_user_id,old.round_snapshot_id,old.course_segment_snapshot,old.hole_number) then return new; end if;
  select * into s from public.hall_of_fame_round_snapshots where id=new.round_snapshot_id and application_batch_id=new.application_batch_id;
  perform private.assert_hall_of_fame_event_available(new.target_user_id,s.played_on,s.course_name_snapshot,s.course_region_snapshot,s.course_environment,new.course_segment_snapshot,new.hole_number,new.id);
 else
  if tg_op='UPDATE' and row(new.played_on,new.course_name_snapshot,new.course_region_snapshot,new.course_environment) is not distinct from row(old.played_on,old.course_name_snapshot,old.course_region_snapshot,old.course_environment) then return new; end if;
  for a in select * from public.hall_of_fame_application_records where round_snapshot_id=new.id and review_status in ('draft','submitted','under_review','additional_info_required','approved') order by target_user_id,id loop
   perform private.assert_hall_of_fame_event_available(a.target_user_id,new.played_on,new.course_name_snapshot,new.course_region_snapshot,new.course_environment,a.course_segment_snapshot,a.hole_number,a.id);
  end loop;
 end if;
 return new;
end$$;
revoke all on function private.guard_hall_of_fame_event_identity() from public,anon,authenticated,service_role;
create trigger ab_hall_event_identity before insert or update on public.hall_of_fame_application_records for each row execute function private.guard_hall_of_fame_event_identity();
create trigger ab_hall_event_identity before insert or update on public.hall_of_fame_records for each row execute function private.guard_hall_of_fame_event_identity();
create trigger ab_hall_event_identity before insert or update on public.hall_of_fame_round_snapshots for each row execute function private.guard_hall_of_fame_event_identity();

do $$declare definition text; old_fragment text;begin
 -- Preserve batch serialization and ledger replay before enforcing the existing twelve-intent policy.
 definition:=pg_get_functiondef('public.mutate_hall_special_record(text,uuid,jsonb)'::regprocedure);
 old_fragment:='where e.application_batch_id=bid)>12';
 assert strpos(definition,old_fragment)>0;
 execute replace(definition,old_fragment,'where e.application_batch_id=bid)>=12');
 -- submitted_at is also populated by cancel_draft, so use append-only submission history.
 definition:=pg_get_functiondef('public.get_hall_special_workspace()'::regprocedure);
 old_fragment:='where a.target_user_id=u or private.hall_special_can_review(u,b.nominating_club_id)';
 assert strpos(definition,old_fragment)>0;
 execute replace(definition,old_fragment,
 'where a.target_user_id=u or (private.hall_special_can_review(u,b.nominating_club_id) and exists(select 1 from public.hall_of_fame_application_history h where h.application_record_id=a.id and h.to_status in (''submitted'',''under_review'',''additional_info_required'',''approved'',''rejected'')))');
end$$;
