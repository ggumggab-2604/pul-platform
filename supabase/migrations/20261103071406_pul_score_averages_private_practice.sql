-- Reuse all qualified originals, never the one-best-per-person view.
create view private.club_average_sources as
select distinct s.club_id,s.person_id,s.kind,s.event_id,s.source_id,s.source_key,s.played_on,s.title,s.course_name,s.score,
 case when s.kind='tournament' then e.division else null end division
from private.club_personal_score_sources s
left join private.club_tournament_entries e on s.kind='tournament' and e.id=s.source_id
where s.exclusion_reason is null and s.user_id is not null;
revoke all on private.club_average_sources from public,anon,authenticated,service_role;

create function public.get_club_score_average_sources(p_club_key text,p_person_id uuid default null,p_all_members boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,false); pid uuid; person_name text; mine boolean; begin
 if coalesce(p_all_members,false) then
  if p_person_id is not null then raise exception '조회 범위를 확인해 주세요.' using errcode='22023';end if;
 else
  select p.id,pr.display_name,p.user_id=auth.uid() into pid,person_name,mine
  from private.club_score_people p join public.user_accounts a on a.id=p.user_id and a.account_status='active'
  join public.club_memberships m on m.user_id=p.user_id and m.club_id=c and m.membership_status='active'
  join public.user_profiles pr on pr.user_id=p.user_id
  where p.club_id=c and not p.anonymized and (case when p_person_id is null then p.user_id=auth.uid() else p.id=p_person_id end);
  if p_person_id is not null and pid is null then raise exception '현재 해당 동호회 회원의 기록만 볼 수 있습니다.' using errcode='42501';end if;
 end if;
 -- One JSON value is not subject to REST row-page clipping; the UI paginates only after computing the full mean.
 return jsonb_build_object('viewerId',auth.uid(),'clubKey',p_club_key,'personId',pid,'personName',person_name,'isMine',coalesce(mine,p_person_id is null and not coalesce(p_all_members,false)),
 'records',coalesce((select jsonb_agg(jsonb_build_object('sourceKey',s.source_key,'personId',s.person_id,'kind',s.kind,'eventId',s.event_id,'sourceId',s.source_id,
 'date',s.played_on,'title',s.title,'course',s.course_name,'score',s.score,'division',s.division) order by s.played_on desc,s.source_key)
 from private.club_average_sources s where s.club_id=c and (coalesce(p_all_members,false) or s.person_id=pid)),'[]'::jsonb));
end $$;
revoke all on function public.get_club_score_average_sources(text,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.get_club_score_average_sources(text,uuid,boolean) to authenticated;

create table private.personal_practice_records(
 id uuid primary key default gen_random_uuid(),owner_id uuid references public.user_accounts(id) on delete set null,
 played_on date not null,course_id uuid references public.courses(id) on delete set null,course_name text not null check(length(btrim(course_name)) between 1 and 200),
 comparison_basis text not null check(comparison_basis in('outdoor_18_single','outdoor_9_single','outdoor_36','screen','other')),
 strokes integer not null check(strokes>0),memo text not null default '' check(length(memo)<=1000),
 version integer not null default 1 check(version>0),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 check(owner_id is not null or deleted_at is not null)
);
create index personal_practice_owner_date on private.personal_practice_records(owner_id,played_on desc,id) where deleted_at is null;
alter table private.personal_practice_records enable row level security;
create policy personal_practice_owner on private.personal_practice_records for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.user_accounts a where a.id=(select auth.uid()) and a.account_status='active'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.user_accounts a where a.id=(select auth.uid()) and a.account_status='active'));
revoke all on private.personal_practice_records from public,anon,authenticated,service_role;

create function public.get_my_practice_records(p_record_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.messaging_assert_actor();begin
 if p_record_id is not null and not exists(select 1 from private.personal_practice_records where id=p_record_id and owner_id=actor and deleted_at is null) then
  raise exception '본인의 연습기록만 볼 수 있습니다.' using errcode='42501';end if;
 return jsonb_build_object('viewerId',actor,'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'date',r.played_on,'courseKey',c.course_key,'course',r.course_name,
 'condition',r.comparison_basis,'score',r.strokes,'memo',r.memo,'version',r.version,'createdAt',r.created_at) order by r.played_on desc,r.id)
 from private.personal_practice_records r left join public.courses c on c.id=r.course_id where r.owner_id=actor and r.deleted_at is null),'[]'::jsonb));
end $$;
revoke all on function public.get_my_practice_records(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_my_practice_records(uuid) to authenticated;

create function public.mutate_my_practice_record(p_request_id uuid,p_operation text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r private.personal_practice_records;prior jsonb;result jsonb;input jsonb;course uuid;d date;begin
 perform private.messaging_assert_read_committed();
 perform id from public.user_accounts where id=actor for share;
 perform user_id from public.user_profiles where user_id=actor for share;
 perform id from public.consent_records where user_id=actor for share;
 actor:=private.messaging_assert_actor();
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':personal-practice',0));
 if p_request_id is null or p_operation is null or p_operation not in('create','update','delete') or p_payload is null or jsonb_typeof(p_payload)<>'object'
 or exists(select 1 from jsonb_object_keys(p_payload) k where k not in('id','version','date','course','courseKey','condition','score','memo')) then
  raise exception '연습기록 요청을 확인해 주세요.' using errcode='22023';end if;
 input:=jsonb_build_object('operation',p_operation,'payload',p_payload);
 prior:=private.club_extension_previous(actor,p_request_id,'practice.'||p_operation,input);if prior is not null then return prior;end if;
 if p_operation<>'create' then
  select * into r from private.personal_practice_records where id=(p_payload->>'id')::uuid and owner_id=actor and deleted_at is null for update;
  if not found then raise exception '본인의 연습기록만 변경할 수 있습니다.' using errcode='42501';end if;
  if r.version is distinct from (p_payload->>'version')::integer then raise exception '다른 수정이 먼저 저장되었습니다. 입력을 유지하고 최신 기록을 확인해 주세요.' using errcode='PT409';end if;
 elsif nullif(p_payload->>'id','') is not null then raise exception '새 기록의 식별자는 서버에서 정합니다.' using errcode='22023';end if;
 if p_operation='delete' then
  update private.personal_practice_records set deleted_at=now(),version=version+1,updated_at=now() where id=r.id returning * into r;
 else
  if p_payload->>'date' is null or p_payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(p_payload->'score') is distinct from 'number'
  or p_payload->>'score' !~ '^[1-9][0-9]*$' or p_payload->>'course' is null or length(btrim(p_payload->>'course')) not between 1 and 200
  or length(coalesce(p_payload->>'memo',''))>1000 or p_payload->>'condition' is null or p_payload->>'condition' not in('outdoor_18_single','outdoor_9_single','outdoor_36','screen','other') then
   raise exception '경기일·구장·경기 조건·정수 타수를 확인해 주세요.' using errcode='22023';end if;
  d:=(p_payload->>'date')::date;
  if d<'0001-01-01'::date or d>'9999-12-31'::date then raise exception '경기일을 확인해 주세요.' using errcode='22023';end if;
  if nullif(p_payload->>'courseKey','') is not null then
   select id into course from public.courses where course_key=p_payload->>'courseKey' and (course_status<>'removed' or id=r.course_id) for share;
   if course is null then raise exception '선택한 구장 연결을 확인해 주세요.' using errcode='22023';end if;
  end if;
  if p_operation='create' then
   insert into private.personal_practice_records(owner_id,played_on,course_id,course_name,comparison_basis,strokes,memo)
   values(actor,d,course,btrim(p_payload->>'course'),p_payload->>'condition',(p_payload->>'score')::integer,coalesce(p_payload->>'memo','')) returning * into r;
  else
   update private.personal_practice_records set played_on=d,course_id=course,course_name=btrim(p_payload->>'course'),comparison_basis=p_payload->>'condition',
    strokes=(p_payload->>'score')::integer,memo=coalesce(p_payload->>'memo',''),version=version+1,updated_at=now() where id=r.id returning * into r;
  end if;
 end if;
 result:=jsonb_build_object('id',r.id,'version',r.version);
 perform private.club_extension_complete(actor,p_request_id,'practice.'||p_operation,input,result);return result;
end $$;
revoke all on function public.mutate_my_practice_record(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_my_practice_record(uuid,text,jsonb) to authenticated;

-- Account withdrawal erases private text/ownership; club membership changes do not touch personal records.
create function private.erase_personal_practice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or new.account_status='withdrawn' then
  update private.personal_practice_records set owner_id=null,course_id=null,course_name='삭제된 개인 기록',memo='',deleted_at=coalesce(deleted_at,now()),updated_at=now(),version=version+1 where owner_id=old.id;
 end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger erase_personal_practice before delete or update of account_status on public.user_accounts for each row execute function private.erase_personal_practice();
revoke all on function private.erase_personal_practice() from public,anon,authenticated,service_role;
