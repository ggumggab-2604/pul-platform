-- Preserve the event identity of each immutable correction successor, without rewriting earlier records.
alter table public.hall_of_fame_records add column special_round_started_at timestamptz;
alter table public.hall_of_fame_records add constraint hall_special_round_date_check check(special_round_started_at is null or (special_round_started_at at time zone 'Asia/Seoul')::date=played_on);
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.mutate_hall_special_record(text,uuid,jsonb)'::regprocedure);
 assert strpos(definition,'nominating_club_id,record_fingerprint,validity_status')>0;
 assert strpos(definition,'a.strokes,cid,a.duplicate_fingerprint')>0;
 assert strpos(definition,'r.corrected_from_record_id:=')>0;
 definition:=replace(definition,'nominating_club_id,record_fingerprint,validity_status','nominating_club_id,special_round_started_at,record_fingerprint,validity_status');
 definition:=replace(definition,'a.strokes,cid,a.duplicate_fingerprint','a.strokes,cid,s.started_at,a.duplicate_fingerprint');
 definition:=replace(definition,'r.corrected_from_record_id:=','r.special_round_started_at:=started; r.corrected_from_record_id:=');
 execute definition;
 definition:=pg_get_functiondef('public.get_hall_special_workspace()'::regprocedure);
 assert strpos(definition,'''started_at'',s.started_at')>0;
 execute replace(definition,'''started_at'',s.started_at','''started_at'',coalesce(r.special_round_started_at,s.started_at)');
end$$;
