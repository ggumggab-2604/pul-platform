alter table private.club_monthly_sheets add column annual_screen_condition text
  check (annual_screen_condition is null or (game_type='screen' and length(annual_screen_condition) between 2 and 100));

alter function public.save_club_monthly_scores(text,uuid,jsonb) rename to save_club_monthly_scores_base;
alter function public.save_club_monthly_scores_base(text,uuid,jsonb) set schema private;
revoke all on function private.save_club_monthly_scores_base(text,uuid,jsonb) from public,anon,authenticated,service_role;

create function private.clear_annual_screen_condition() returns trigger
language plpgsql set search_path='' as $$
begin
  if row(old.game_type,old.course_id,old.course_name,old.event_id,old.comparison_basis)
    is distinct from row(new.game_type,new.course_id,new.course_name,new.event_id,new.comparison_basis) then
    new.annual_screen_condition:=null;
  end if;
  return new;
end $$;

create trigger monthly_screen_condition_reset before update on private.club_monthly_sheets
  for each row execute function private.clear_annual_screen_condition();

create function public.save_club_monthly_scores(p_club_key text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; condition text:=nullif(btrim(p_payload->>'annualScreenCondition'),'');
begin
  if condition is not null and (p_payload->>'gameType' is distinct from 'screen'
    or jsonb_typeof(p_payload->'annualScreenCondition') is distinct from 'string'
    or char_length(condition) not between 2 and 100 or condition ~ '[[:cntrl:]]') then
    raise exception '확인한 스크린 경기 조건은 2~100자로 입력해 주세요.' using errcode='22023';
  end if;
  result:=private.save_club_monthly_scores_base(p_club_key,p_request_id,p_payload);
  if p_payload ? 'annualScreenCondition' and result->>'replayed' is distinct from 'true' then
    update private.club_monthly_sheets set annual_screen_condition=condition where id=(result->>'id')::uuid;
  end if;
  return result;
end $$;

alter function public.get_club_monthly_scores(text,integer,boolean) rename to get_club_monthly_scores_base;
alter function public.get_club_monthly_scores_base(text,integer,boolean) set schema private;
revoke all on function private.get_club_monthly_scores_base(text,integer,boolean) from public,anon,authenticated,service_role;

create function public.get_club_monthly_scores(p_club_key text,p_year integer,p_editor boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=private.get_club_monthly_scores_base(p_club_key,p_year,p_editor); sheets jsonb;
begin
  if p_editor is distinct from true then return result; end if;
  select coalesce(jsonb_agg(j.value||jsonb_build_object('annualScreenCondition',s.annual_screen_condition) order by j.ord),'[]'::jsonb)
    into sheets from jsonb_array_elements(result->'sheets') with ordinality j(value,ord)
    join private.club_monthly_sheets s on s.id=(j.value->>'id')::uuid;
  return jsonb_set(result,'{sheets}',sheets);
end $$;

create table private.club_annual_awards (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id),
  award_year integer not null check (award_year between 1 and 9999),
  category text not null check (category in ('perfect','since_join','average','growth')),
  competition text not null default '' check (length(competition)<=340),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  decided_by uuid references public.user_accounts(id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (club_id,award_year,category,competition,user_id)
);
alter table private.club_annual_awards enable row level security;
revoke all on private.club_annual_awards from public,anon,authenticated,service_role;

create function public.get_club_annual_activity(p_club_key text,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,true); first_day date; last_day date;
begin
  if p_year is null or p_year not between 1 and 9999 then raise exception '연도를 확인해 주세요.' using errcode='22023'; end if;
  first_day:=make_date(p_year,1,1); last_day:=make_date(p_year,12,31);
  return jsonb_build_object(
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,
      'name',coalesce(nullif(btrim(p.display_name),''),'이름 미등록'),
      'joined',(m.joined_at at time zone 'Asia/Seoul')::date) order by p.display_name,m.user_id)
      from public.club_memberships m left join public.user_profiles p on p.user_id=m.user_id
      where m.club_id=c and m.membership_status='active'
      and private.messaging_account_available(m.user_id)),'[]'::jsonb),
    'recruitment',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,
      'date',coalesce((e.starts_at at time zone 'Asia/Seoul')::date,s.played_on),
      'count',(select count(*) from private.club_room_members(r) m where m.response='yes'))
      order by coalesce((e.starts_at at time zone 'Asia/Seoul')::date,s.played_on),r.id)
      from private.club_participation_rooms r
      left join public.club_official_events e on e.id=r.monthly_event_id
      left join private.club_monthly_sheets s on s.id=r.monthly_sheet_id
      where r.club_id=c and r.tournament_id is null
        and coalesce((e.starts_at at time zone 'Asia/Seoul')::date,s.played_on) between first_day and last_day),'[]'::jsonb),
    'awards',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'userId',a.user_id,'name',p.display_name,
      'category',a.category,'competition',a.competition,'at',a.decided_at) order by a.decided_at desc,a.id)
      from private.club_annual_awards a join public.user_profiles p on p.user_id=a.user_id
      where a.club_id=c and a.award_year=p_year and private.messaging_account_available(a.user_id)),'[]'::jsonb));
end $$;

create function public.confirm_club_annual_award(p_club_key text,p_year integer,p_category text,p_competition text,p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare c uuid:=private.monthly_club(p_club_key,true); a uuid:=auth.uid();
begin
  perform private.messaging_assert_read_committed();
  perform id from public.clubs where id=c for update;
  perform id from public.user_accounts where id in (a,p_user) order by id for share;
  perform user_id from public.user_profiles where user_id=a for share;
  perform id from public.consent_records where user_id=a for share;
  perform id from public.club_memberships where club_id=c and user_id in (a,p_user) order by id for share;
  perform id from public.club_role_assignments where membership_id in
    (select id from public.club_memberships where club_id=c and user_id=a) for share;
  perform role_code from public.club_role_definitions where role_code in ('club_admin','club_vice_admin') for share;
  c:=private.monthly_club(p_club_key,true);
  if p_year is null or p_year not between 1 and extract(year from now() at time zone 'Asia/Seoul')
    or p_category is null or p_category not in ('perfect','since_join','average','growth')
    or p_competition is null or length(p_competition)>340 or p_competition ~ '[[:cntrl:]]'
    or (p_category in ('perfect','since_join'))<>(p_competition='')
    or not private.messaging_account_available(p_user)
    or not exists(select 1 from public.club_memberships m where m.club_id=c and m.user_id=p_user
      and m.membership_status='active' and (m.joined_at at time zone 'Asia/Seoul')::date<=make_date(p_year,12,31)) then
    raise exception '시상 연도, 부문과 해당 동호회 회원을 확인해 주세요.' using errcode='22023';
  end if;
  insert into private.club_annual_awards(club_id,award_year,category,competition,user_id,decided_by)
  values(c,p_year,p_category,p_competition,p_user,a) on conflict do nothing;
  return true;
end $$;

revoke all on function private.clear_annual_screen_condition() from public,anon,authenticated,service_role;
revoke all on function public.save_club_monthly_scores(text,uuid,jsonb), public.get_club_monthly_scores(text,integer,boolean),
  public.get_club_annual_activity(text,integer),public.confirm_club_annual_award(text,integer,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.save_club_monthly_scores(text,uuid,jsonb), public.get_club_monthly_scores(text,integer,boolean),
  public.get_club_annual_activity(text,integer),public.confirm_club_annual_award(text,integer,text,text,uuid) to authenticated;
notify pgrst,'reload schema';

