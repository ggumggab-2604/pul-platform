-- The roster records intent. Attendance and scores survive a later signup cancellation.
create table private.university_monthly_sheets (
  entry_id uuid primary key references public.lesson_university_space_entries(id) on delete cascade,
  game_type text check (game_type in ('field','screen')),
  course_id uuid references public.courses(id),
  comparison_basis text not null default 'unconfirmed' check (comparison_basis in ('unconfirmed','outdoor_18_single','other')),
  public_ranking boolean not null default false,
  recorded_at timestamptz,
  version integer not null default 1,
  check (comparison_basis <> 'outdoor_18_single' or game_type is not distinct from 'field'),
  check (recorded_at is null or game_type is not null)
);
create table private.university_monthly_scores (
  entry_id uuid not null references private.university_monthly_sheets(entry_id) on delete cascade,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  strokes integer check (strokes > 0),
  excluded boolean not null default false,
  registered_at timestamptz not null default statement_timestamp(),
  score_entered_at timestamptz,
  primary key (entry_id,user_id)
);
-- References survive corrections, exclusion and changes to the club that carries the official result.
create table private.university_tournament_links (
  department_id uuid not null references public.lesson_university_departments(id),
  event_id uuid not null references public.events(id),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  division text not null check (char_length(division) between 1 and 100),
  primary key (department_id,event_id,user_id,division)
);
alter table private.university_monthly_sheets enable row level security;
alter table private.university_monthly_scores enable row level security;
alter table private.university_tournament_links enable row level security;
revoke all on private.university_monthly_sheets, private.university_monthly_scores,
  private.university_tournament_links from public,anon,authenticated,service_role;

create function private.protect_university_scored_event() returns trigger
language plpgsql set search_path='' as $$
begin
  if exists (select 1 from private.university_monthly_sheets s where s.entry_id=old.id and s.recorded_at is not null)
     and (tg_op='DELETE' or (new.event_date,new.event_time) is distinct from (old.event_date,old.event_time)) then
    raise exception '성적을 등록한 월례회는 일정 변경 또는 삭제가 제한됩니다.' using errcode='PT409';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end
$$;
create trigger protect_university_scored_event before delete or update of event_date,event_time
on public.lesson_university_space_entries for each row execute function private.protect_university_scored_event();

create function private.university_score_department(p_key text,p_write boolean default false)
returns public.lesson_university_departments language plpgsql stable set search_path='' as $$
declare
  d public.lesson_university_departments;
begin
  select * into d from public.lesson_university_departments where department_key=p_key;
  if not (private.university_manages(d.id,auth.uid()) or (
    not p_write and d.publication_status is not distinct from 'published'
    and private.university_student_approved(d.id,auth.uid())
  )) then
    raise exception '학과 성적을 이용할 권한이 없습니다.' using errcode='42501';
  end if;
  return d;
end
$$;

create function public.save_university_monthly_scores(p_key text,p_entry uuid,p_event_version integer,p_version integer,
  p_game text,p_course_key text,p_basis text,p_public boolean,p_rows jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  d public.lesson_university_departments := private.university_score_department(p_key,true);
  e public.lesson_university_space_entries;
  s private.university_monthly_sheets;
  c public.courses;
  row_input record;
begin
  perform 1 from public.lesson_university_departments where id=d.id for share;
  if not private.university_manages(d.id,auth.uid()) then
    raise exception '학과 성적을 이용할 권한이 없습니다.' using errcode='42501';
  end if;
  select * into e from public.lesson_university_space_entries
  where id=p_entry and department_id=d.id and kind='event' for update;
  if not found then raise exception '학과 모임을 확인해 주세요.' using errcode='42501'; end if;
  select * into s from private.university_monthly_sheets where entry_id=e.id;
  if e.version is distinct from p_event_version or coalesce(s.version,0) is distinct from p_version then
    raise exception '일정 또는 성적표가 변경됐습니다. 새로고침한 뒤 다시 입력해 주세요.' using errcode='PT409';
  end if;
  if p_course_key is not null then
    select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
    if not found or p_game is distinct from c.course_type then
      raise exception '선택한 구장과 경기 종류를 확인해 주세요.' using errcode='22023';
    end if;
  end if;
  if (p_game is not null and p_game not in ('field','screen'))
     or p_basis is null or p_basis not in ('unconfirmed','outdoor_18_single','other')
     or (p_basis='outdoor_18_single' and p_game is distinct from 'field')
     or ((p_rows is not null or s.recorded_at is not null) and p_game is null)
     or p_public is null then
    raise exception '경기 종류와 비교 기준을 확인해 주세요.' using errcode='22023';
  end if;
  if p_rows is not null then
    if (e.event_date+e.event_time) > (statement_timestamp() at time zone 'Asia/Seoul')
      or jsonb_typeof(p_rows) is distinct from 'array' then
      raise exception '경기 시작 시각과 참가 명단을 확인해 주세요.' using errcode='22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_rows) x
      where jsonb_typeof(x) <> 'object' or not (x ? 'user_id' and x ? 'strokes')
        or jsonb_typeof(x->'user_id') <> 'string'
        or (jsonb_typeof(x->'strokes') <> 'null' and
          (jsonb_typeof(x->'strokes') <> 'number' or x->>'strokes' !~ '^[1-9][0-9]{0,9}$'
            or (x->>'strokes')::numeric > 2147483647))) then
      raise exception '18홀 타수는 양의 정수 또는 빈칸으로 입력해 주세요.' using errcode='22023';
    end if;
    for row_input in select * from jsonb_to_recordset(p_rows) x(user_id uuid,strokes integer) order by user_id loop
      if not private.university_student_approved(d.id,row_input.user_id) or not (
        exists (select 1 from public.lesson_university_event_members m where m.entry_id=e.id and m.user_id=row_input.user_id)
        or exists (select 1 from private.university_monthly_scores r where r.entry_id=e.id and r.user_id=row_input.user_id)
      ) then
        raise exception '이 모임의 승인된 참가 계정만 선택할 수 있습니다.' using errcode='42501';
      end if;
    end loop;
    if exists (select 1 from jsonb_to_recordset(p_rows) x(user_id uuid) group by x.user_id having count(*)>1) then
      raise exception '같은 참가자가 중복 선택되었습니다.' using errcode='22023';
    end if;
  end if;
  insert into private.university_monthly_sheets(entry_id,game_type,course_id,comparison_basis,public_ranking,recorded_at)
  values(e.id,p_game,c.id,p_basis,p_public,case when p_rows is not null then statement_timestamp() end)
  on conflict(entry_id) do update
  set game_type=excluded.game_type,course_id=excluded.course_id,comparison_basis=excluded.comparison_basis,
      public_ranking=excluded.public_ranking,version=university_monthly_sheets.version+1,
      recorded_at=coalesce(university_monthly_sheets.recorded_at,excluded.recorded_at);
  if p_rows is not null then
    update private.university_monthly_scores r set excluded=true
    where r.entry_id=e.id and not r.excluded and not exists (
      select 1 from jsonb_to_recordset(p_rows) x(user_id uuid) where x.user_id=r.user_id
    );
    insert into private.university_monthly_scores(entry_id,user_id,strokes,score_entered_at)
    select e.id,x.user_id,x.strokes,case when x.strokes is not null then statement_timestamp() end
    from jsonb_to_recordset(p_rows) x(user_id uuid,strokes integer)
    on conflict(entry_id,user_id) do update set strokes=excluded.strokes,excluded=false,
      score_entered_at=coalesce(university_monthly_scores.score_entered_at,excluded.score_entered_at);
  end if;
end
$$;

-- The tournament pipeline already selects the representative affiliation and owns finalization/correction.
create view private.university_official_results as
select r.*, coalesce(s.comparison_basis,t.comparison_basis) as comparison_basis
from private.hall_confirmed_tournament_results r
left join private.tournament_signup s on s.event_id=r.competition_id
left join private.club_tournaments t on t.id=r.tournament_id
where r.event_key is not null and r.user_id is not null and r.game_type in ('field','screen')
  and r.played_on <= (statement_timestamp() at time zone 'Asia/Seoul')::date
  and r.place is not null and r.score is not null;

create function public.set_university_tournament_link(p_key text,p_event_key text,p_user uuid,p_division text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  d public.lesson_university_departments := private.university_score_department(p_key,true);
begin
  perform 1 from public.lesson_university_departments where id=d.id for share;
  if not private.university_manages(d.id,auth.uid()) then
    raise exception '학과 성적을 이용할 권한이 없습니다.' using errcode='42501';
  end if;
  if p_enabled is true then
    insert into private.university_tournament_links(department_id,event_id,user_id,division)
    select d.id,r.competition_id,r.user_id,r.division from private.university_official_results r
    where r.event_key=p_event_key and r.user_id=p_user and r.division=p_division
      and private.university_student_approved(d.id,r.user_id)
    on conflict do nothing;
    if not found and not exists (
      select 1 from private.university_tournament_links l join public.events e on e.id=l.event_id
      where l.department_id=d.id and e.event_key=p_event_key and l.user_id=p_user and l.division=p_division
        and private.university_student_approved(d.id,l.user_id)
    ) then raise exception '승인된 재학생의 공식 성적을 확인해 주세요.' using errcode='22023'; end if;
  elsif p_enabled is false then
    delete from private.university_tournament_links l using public.events e
    where l.department_id=d.id and e.id=l.event_id and e.event_key=p_event_key and l.user_id=p_user and l.division=p_division;
  end if;
end
$$;

create function public.get_university_tournament_candidates(p_key text,p_event_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  d public.lesson_university_departments := private.university_score_department(p_key,true);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('userId',r.user_id,'name',r.display_name,'division',r.division,
      'score',r.score,'place',r.place,'title',r.title) order by r.division,r.place,r.user_id)
    from private.university_official_results r
    where r.event_key=p_event_key and private.university_student_approved(d.id,r.user_id)
      and not exists (select 1 from private.university_tournament_links l where
        (l.department_id,l.event_id,l.user_id,l.division)=(d.id,r.competition_id,r.user_id,r.division))
  ),'[]');
end
$$;

create view private.university_monthly_display_scores as
select e.department_id,e.id as entry_id,e.event_date,e.title,e.place,e.event_time,
  s.game_type,s.comparison_basis,s.course_id,s.public_ranking,r.user_id,r.strokes,r.registered_at,r.score_entered_at,
  coalesce(nullif(btrim(p.display_name),''),'이름 미등록') as display_name
from private.university_monthly_scores r
join private.university_monthly_sheets s on s.entry_id=r.entry_id
join public.lesson_university_space_entries e on e.id=s.entry_id and e.kind='event'
left join public.user_profiles p on p.user_id=r.user_id
where not r.excluded and s.recorded_at is not null and private.university_student_approved(e.department_id,r.user_id);

create function public.get_university_score_workspace(p_key text,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  d public.lesson_university_departments := private.university_score_department(p_key);
  jan date;
  next_jan date;
begin
  if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
  jan := make_date(p_year,1,1);
  next_jan := make_date(p_year+1,1,1);
  return jsonb_build_object('department',d.department_name,'manager',private.university_manages(d.id,auth.uid()),
    'sheets',coalesce((
      select jsonb_agg(jsonb_build_object('id',e.id,'eventId',e.id,'date',e.event_date,'title',e.title,'course',e.place,
        'version',s.version,'note','','gameType',s.game_type,'rows',coalesce((
          select jsonb_agg(jsonb_build_object('id',r.user_id,'userId',r.user_id,'name',r.display_name,'score',r.strokes,'kind','member')
            order by r.display_name,r.user_id)
          from private.university_monthly_display_scores r where r.entry_id=e.id
        ),'[]')) order by e.event_date,e.id)
      from private.university_monthly_sheets s join public.lesson_university_space_entries e on e.id=s.entry_id
      where e.department_id=d.id and s.recorded_at is not null and e.event_date>=jan and e.event_date<next_jan
    ),'[]'),
    'pendingMedalEvents',coalesce((
      select jsonb_agg(jsonb_build_object('date',e.event_date,'gameType',s.game_type))
      from private.university_monthly_sheets s join public.lesson_university_space_entries e on e.id=s.entry_id
      where e.department_id=d.id and s.recorded_at is null and e.event_date>=jan and e.event_date<next_jan
        and (e.event_date+e.event_time) <= (statement_timestamp() at time zone 'Asia/Seoul')
    ),'[]'),
    'tournaments',coalesce((
      select jsonb_agg(jsonb_build_object('eventKey',r.event_key,'title',r.title,'date',r.played_on,'game',r.game_type,
        'userId',r.user_id,'name',r.display_name,'division',r.division,'score',r.score,'place',r.place,'tied',r.tied)
        order by r.played_on desc,r.event_key,r.division,r.place,r.user_id)
      from private.university_tournament_links l join private.university_official_results r
        on (l.event_id,l.user_id,l.division)=(r.competition_id,r.user_id,r.division)
      where l.department_id=d.id and r.played_on>=jan and r.played_on<next_jan
        and private.university_student_approved(d.id,l.user_id)
    ),'[]'),
    'best',coalesce((
      select jsonb_agg(to_jsonb(b) order by b.game,b.score,b.name,b."userId") from (
        select distinct on ("userId",game) * from (
          select r.user_id as "userId",r.game_type as game,r.display_name as name,r.strokes as score,r.event_date as date,
            r.title,r.entry_id as meeting,null::text as "eventKey",r.registered_at
          from private.university_monthly_display_scores r
          where r.department_id=d.id and r.strokes is not null
            and (r.game_type='screen' or r.comparison_basis='outdoor_18_single')
          union all
          select r.user_id,r.game_type,r.display_name,r.score,r.played_on,r.title,null::uuid,r.event_key,r.score_entered_at
          from private.university_tournament_links l join private.university_official_results r
            on (l.event_id,l.user_id,l.division)=(r.competition_id,r.user_id,r.division)
          where l.department_id=d.id and r.comparison_basis='outdoor_18_single' and private.university_student_approved(d.id,l.user_id)
        ) s order by "userId",game,score,registered_at,meeting,"eventKey"
      ) b
    ),'[]'),
    'links',case when private.university_manages(d.id,auth.uid()) then coalesce((
      select jsonb_agg(jsonb_build_object('eventKey',e.event_key,'title',e.title,'userId',l.user_id,'division',l.division,
        'name',case when private.university_active(l.user_id) then coalesce(p.display_name,'이름 미등록') else '이용할 수 없는 계정' end)
        order by e.start_date desc,e.event_key,l.division,l.user_id)
      from private.university_tournament_links l join public.events e on e.id=l.event_id
      left join public.user_profiles p on p.user_id=l.user_id
      where l.department_id=d.id and e.start_date>=jan and e.start_date<next_jan
    ),'[]') else '[]'::jsonb end);
end
$$;

create function public.get_university_monthly_score(p_key text,p_entry uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  d public.lesson_university_departments := private.university_score_department(p_key);
  manager boolean := private.university_manages(d.id,auth.uid());
begin
  return (select jsonb_build_object('id',e.id,'department',d.department_name,'title',e.title,'date',e.event_date,
    'time',e.event_time,'place',e.place,'body',e.body,'eventVersion',e.version,'version',coalesce(s.version,0),
    'manager',manager,'recorded',s.recorded_at is not null,
    'started',(e.event_date+e.event_time) <= (statement_timestamp() at time zone 'Asia/Seoul'),
    'game',s.game_type,'basis',coalesce(s.comparison_basis,'unconfirmed'),'public',coalesce(s.public_ranking,false),
    'courseKey',c.course_key,'courseName',c.name,'rows',coalesce((
      select jsonb_agg(jsonb_build_object('id',r.user_id,'userId',r.user_id,'name',r.display_name,'score',r.strokes,'kind','member')
        order by r.display_name,r.user_id)
      from private.university_monthly_display_scores r where r.entry_id=e.id
    ),'[]'),'roster',case when manager then coalesce((
      select jsonb_agg(jsonb_build_object('id',u.user_id,'name',coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
        'score',case when not r.excluded then r.strokes end,'attended',r.user_id is not null and not r.excluded)
        order by p.display_name,u.user_id)
      from (select m.user_id from public.lesson_university_event_members m where m.entry_id=e.id
        union select x.user_id from private.university_monthly_scores x where x.entry_id=e.id) u
      left join public.user_profiles p on p.user_id=u.user_id
      left join private.university_monthly_scores r on r.entry_id=e.id and r.user_id=u.user_id
      where private.university_student_approved(d.id,u.user_id)
    ),'[]') else '[]'::jsonb end)
    from public.lesson_university_space_entries e left join private.university_monthly_sheets s on s.entry_id=e.id
    left join public.courses c on c.id=s.course_id
    where e.id=p_entry and e.department_id=d.id and e.kind='event');
end
$$;

-- Public projections contain only the fields of existing ranked-score results. Free-text meeting data stays private.
create view private.university_public_monthly_sources as
select null::uuid as club_id, r.user_id as person_id,'monthly'::text as kind,r.entry_id as event_id,r.entry_id as source_id,
  r.event_date as played_on,'학과 월례회'::text as title,coalesce(c.name,'구장 미연결') as course_name,
  c.id as course_id,null::uuid as linked_event_id,r.strokes as score,r.registered_at,
  'university-monthly:'||r.entry_id||':'||r.user_id as source_key,r.user_id,r.display_name,null::text as exclusion_reason,
  r.score_entered_at
from private.university_monthly_display_scores r
join public.lesson_university_departments d on d.id=r.department_id and d.publication_status='published'
left join public.courses c on c.id=r.course_id and c.course_status='active' and c.course_type='field'
where r.public_ranking and r.game_type='field' and r.comparison_basis='outdoor_18_single'
  and r.strokes is not null and (r.course_id is null or c.id is not null)
  and (r.event_date+r.event_time) <= (statement_timestamp() at time zone 'Asia/Seoul');

-- Keep the national pipeline's existing single tournament join. The course/best view also
-- needs that deduplication, so it applies the same gate when it reads these club sources.
create view private.club_public_personal_score_sources as
select s.* from private.personal_score_sources s join public.clubs c on c.id=s.club_id
left join private.tournament_hosts h on s.kind='tournament' and h.event_id=s.linked_event_id
left join private.club_tournaments t on s.kind='tournament' and t.id=s.event_id
where c.club_status='active' and c.directory_is_public and s.exclusion_reason is null and s.user_id is not null
  and (num_nonnulls(h.host_club_id,h.host_course_id)=0 or h.finalized_at is not null)
  and (t.id is null or private.tournament_scope_visible(t));

create view private.unaffiliated_public_tournament_score_sources as
select null::uuid as club_id,null::uuid as person_id,'tournament'::text as kind,t.tournament_id as event_id,
  t.id as source_id,t.played_on,t.title,t.course_name,e.related_course_id as course_id,t.competition_id as linked_event_id,
  t.score,t.score_entered_at as registered_at,'tournament:'||t.id as source_key,null::text as reason,
  t.user_id,t.display_name,null::text as exclusion_reason
from private.hall_confirmed_tournament_results t
join private.tournament_participants p on p.id=t.id and p.event_id=t.competition_id and p.result_entry is null
join private.tournament_signup signup on signup.event_id=t.competition_id and signup.comparison_basis='outdoor_18_single'
join public.events e on e.id=t.competition_id
where t.game_type='field' and t.user_id is not null;

create or replace view private.public_personal_score_sources as
select s.* from private.club_public_personal_score_sources s
where s.kind<>'tournament' or s.linked_event_id is null or exists (
  select 1 from private.hall_confirmed_tournament_results confirmed
  where confirmed.id=s.source_id and confirmed.competition_id=s.linked_event_id
)
union all
select s.club_id,s.person_id,s.kind,s.event_id,s.source_id,s.played_on,s.title,s.course_name,
  s.course_id,s.linked_event_id,s.score,s.registered_at,s.source_key,null::text,s.user_id,s.display_name,s.exclusion_reason
from private.university_public_monthly_sources s
union all
select s.* from private.unaffiliated_public_tournament_score_sources s;

create or replace view private.hall_national_score_sources as
select s.*, c.name as club_name, r.score_entered_at as entered_at
from private.club_public_personal_score_sources s
join public.clubs c on c.id = s.club_id
join private.club_monthly_sheets m on s.kind = 'monthly' and m.id = s.source_id
join private.club_monthly_scores r on r.sheet_id = m.id and r.person_id = s.person_id
where m.game_type is distinct from 'screen'
  and (m.event_id is null or exists (
    select 1 from public.club_official_events se
    where se.id = m.event_id and se.event_status not in ('draft','cancelled') and se.moderation_status = 'visible'
  ))
union all
select s.*, t.club_name, t.score_entered_at
from private.club_public_personal_score_sources s
join private.hall_confirmed_tournament_results t on s.kind = 'tournament' and t.id = s.source_id
where t.game_type = 'field'
union all
select s.*,'무소속'::text,s.registered_at
from private.unaffiliated_public_tournament_score_sources s
union all
select s.club_id,s.person_id,s.kind,s.event_id,s.source_id,s.played_on,s.title,s.course_name,
  s.course_id,s.linked_event_id,s.score,s.registered_at,s.source_key,null::text,s.user_id,s.display_name,s.exclusion_reason,
  '학과 월례회'::text,s.score_entered_at
from private.university_public_monthly_sources s;

revoke all on private.club_public_personal_score_sources,private.unaffiliated_public_tournament_score_sources
from public,anon,authenticated,service_role;
revoke all on private.university_official_results,private.university_monthly_display_scores,
  private.university_public_monthly_sources from public,anon,authenticated,service_role;
revoke all on function private.protect_university_scored_event(),private.university_score_department(text,boolean),
  public.save_university_monthly_scores(text,uuid,integer,integer,text,text,text,boolean,jsonb),
  public.set_university_tournament_link(text,text,uuid,text,boolean),public.get_university_tournament_candidates(text,text),
  public.get_university_score_workspace(text,integer),public.get_university_monthly_score(text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.save_university_monthly_scores(text,uuid,integer,integer,text,text,text,boolean,jsonb),
  public.set_university_tournament_link(text,text,uuid,text,boolean),public.get_university_tournament_candidates(text,text),
  public.get_university_score_workspace(text,integer),public.get_university_monthly_score(text,uuid) to authenticated;
-- Resolve badges and prior averages in sets for the requested page.
create or replace function public.get_hall_national_scores(p_period text, p_limit integer default 20, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' set jit to off as $$
declare
  today date := (statement_timestamp() at time zone 'Asia/Seoul')::date;
begin
  if p_period is null or p_period not in ('month', 'year', 'all', 'today')
     or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception '전국 순위 조회 범위를 확인해 주세요.' using errcode = '22023';
  end if;
  return (
    with ranked as (
      select * from private.hall_ranked_scores(p_period)
    ), page as (
      select * from ranked order by position, played_on desc, entered_at, source_key limit p_limit offset p_offset
    ), pending as (
      select distinct ps.user_id
      from private.hall_national_score_sources ps
      join private.tournament_result_corrections q on q.entry_id=ps.source_id
      join page p on p.user_id=ps.user_id
      where ps.kind='tournament' and q.status='pending'
        and q.applied_revision is not null and p_period=any(q.national_periods)
    ), baselines as (
      select s.user_id, round(avg(b.score)) as average
      from page s
      join private.hall_national_score_sources b on b.user_id=s.user_id and b.entered_at<s.entered_at
        and b.played_on between ((s.entered_at at time zone 'Asia/Seoul')::date - interval '1 year')::date
                            and (s.entered_at at time zone 'Asia/Seoul')::date
      where p_period<>'year'
      group by s.user_id
    )
    select jsonb_build_object('date', today, 'total', (select count(*) from ranked), 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', s.position, 'tied', s.tied, 'score', s.metric, 'date', s.played_on,
        'club', s.club_name, 'course', s.course_name, 'name', private.hall_viewer_name(s.user_id, s.display_name),
        'approvalPending', (s.kind='tournament' and private.tournament_approval_pending(s.source_id)) or pending.user_id is not null,
        'direction', case when s.score < baseline.average then 'up' when s.score > baseline.average then 'down' end
      ) order by s.position, s.played_on desc, s.entered_at, s.source_key)
      from page s left join pending on pending.user_id=s.user_id
      left join baselines baseline on baseline.user_id=s.user_id
    ), '[]'::jsonb))
  );
end
$$;

notify pgrst,'reload schema';
