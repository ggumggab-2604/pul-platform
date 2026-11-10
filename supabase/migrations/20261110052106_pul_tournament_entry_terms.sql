alter table private.tournament_signup
  add column group_fee integer check (group_fee between 0 and 100000000),
  add column club_limit integer check (club_limit between 1 and 1000),
  add column club_limit_scope text check (club_limit_scope in ('group','combined')),
  add column resident_area text check (char_length(resident_area) between 2 and 80 and resident_area !~ '[[:cntrl:]]'),
  add column resident_channel text check (resident_channel in ('individual','group','both')),
  add column resident_fee integer check (resident_fee between 0 and 100000000),
  add constraint tournament_club_limit_pair check (num_nonnulls(club_limit,club_limit_scope) in (0,2)),
  add constraint tournament_resident_rate_complete check (num_nonnulls(resident_area,resident_channel,resident_fee) in (0,3));

alter table private.tournament_participants add column resident_verified boolean;

create function private.keep_tournament_entry_selection() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.chosen_source='individual' then
    if new.individual_division is not null and new.individual_club is not distinct from old.individual_club then
      new.chosen_source:=old.chosen_source;
    end if;
  elsif old.chosen_source<>'' and exists(
    select 1 from private.tournament_club_responses response
    where response.event_id=new.event_id and response.user_id=new.user_id
      and response.club_id::text=old.chosen_source and response.submitted_division is not null
  ) then
    new.chosen_source:=old.chosen_source;
  end if;
  -- A withdrawn or moved selection must be confirmed again before another route takes a seat.
  new.chosen_source:=coalesce(new.chosen_source,'');
  return new;
end
$$;

create trigger keep_tournament_entry_selection
before update of chosen_source on private.tournament_participants
for each row when (old.chosen_source is not null and new.chosen_source is null)
execute function private.keep_tournament_entry_selection();
revoke all on function private.keep_tournament_entry_selection() from public,anon,authenticated,service_role;

alter function public.register_pul_tournament(uuid,jsonb) rename to register_pul_tournament_base;
alter function public.register_pul_tournament_base(uuid,jsonb) set schema private;
alter function public.get_tournament_signup(text) set schema private;
alter function public.mutate_tournament_signup(text,text,uuid,jsonb) set schema private;
revoke all on function private.register_pul_tournament_base(uuid,jsonb), private.get_tournament_signup(text),
  private.mutate_tournament_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.register_pul_tournament(p_request_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<input>>
declare
  individual_fee text:=nullif(btrim(p_payload->>'individualFee'),'');
  group_fee text:=nullif(btrim(p_payload->>'groupFee'),'');
  club_limit text:=nullif(btrim(p_payload->>'clubLimit'),'');
  limit_scope text:=nullif(btrim(p_payload->>'clubLimitScope'),'');
  resident_area text:=nullif(btrim(p_payload->>'residentArea'),'');
  resident_channel text:=nullif(btrim(p_payload->>'residentChannel'),'');
  resident_fee text:=nullif(btrim(p_payload->>'residentFee'),'');
  saved jsonb;
begin
  if (p_payload ?| array['individualFee','groupFee']) and (individual_fee is null or group_fee is null)
    or exists(select 1 from unnest(array[individual_fee,group_fee,resident_fee]) fee
      where fee !~ '^[0-9]{1,9}$' or case when fee ~ '^[0-9]{1,9}$' then fee::int>100000000 end) then
    raise exception '개인·단체 참가비와 지역주민 요금은 0원부터 1억 원 사이의 정수로 입력해 주세요.' using errcode='22023';
  end if;
  if num_nonnulls(club_limit,limit_scope) not in (0,2)
    or limit_scope not in ('group','combined')
    or (club_limit is not null and not case when club_limit ~ '^[0-9]{1,4}$' then club_limit::int between 1 and 1000 else false end) then
    raise exception '동호회별 인원 제한과 집계 방식을 확인해 주세요.' using errcode='22023';
  end if;
  if num_nonnulls(resident_area,resident_channel,resident_fee) not in (0,3)
    or char_length(resident_area) not between 2 and 80 or resident_area ~ '[[:cntrl:]]'
    or resident_channel not in ('individual','group','both') then
    raise exception '지역주민 요금의 적용 지역·접수 방식·금액을 확인해 주세요.' using errcode='22023';
  end if;
  if not (p_payload ? 'divisions') and num_nonnulls(individual_fee,club_limit,resident_area)>0 then
    raise exception '대회 접수 조건을 함께 입력해 주세요.' using errcode='22023';
  end if;
  if individual_fee is not null then
    p_payload:=p_payload||jsonb_build_object('fee',individual_fee);
  end if;
  saved:=private.register_pul_tournament_base(p_request_id,p_payload);
  if saved->>'replayed' is distinct from 'true' and num_nonnulls(group_fee,club_limit,resident_fee)>0 then
    update private.tournament_signup s set group_fee=input.group_fee::int,club_limit=input.club_limit::int,
      club_limit_scope=limit_scope,resident_area=input.resident_area,resident_channel=input.resident_channel,resident_fee=input.resident_fee::int
    from public.events e where s.event_id=e.id and e.event_key=saved->>'key';
  end if;
  return saved;
end
$$;

create function public.get_tournament_signup(p_event_key text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  signup jsonb:=private.get_tournament_signup(p_event_key);
  s private.tournament_signup;
  roster jsonb;
begin
  if signup is null then return null; end if;
  select t.* into s from private.tournament_signup t join public.events e on e.id=t.event_id
  where e.event_key=p_event_key;
  select coalesce(jsonb_agg(item||jsonb_build_object('finalSource',selection.source)||case when item->>'status'<>'cancelled'
    and ((item->>'own')::boolean or (signup->>'host')::boolean) then
    jsonb_build_object('feeQuote',jsonb_build_object('base',quote.base,
      'amount',least(quote.base,case when quote.resident_applies and p.resident_verified then s.resident_fee end),
      'estimated',(s.group_fee is not null or s.resident_fee is not null)
        and (selection.source is null or (quote.resident_applies and p.resident_verified is null)),
      'residentStatus',case when quote.resident_applies then
        case p.resident_verified when true then 'eligible' when false then 'ineligible' else 'pending' end end))
    else '{}'::jsonb end order by row_number),'[]'::jsonb) into roster
  from jsonb_array_elements(signup->'roster') with ordinality as r(item,row_number)
  join private.tournament_participants p on p.id=(item->>'id')::uuid and p.event_id=s.event_id
  left join lateral (
    select option->>'id' as source from jsonb_array_elements(item->'sources') option
    where option->>'id'=p.chosen_source and item->>'status'<>'cancelled'
  ) selection on true
  cross join lateral (
    select case when selection.source='individual' then 'individual'
      when selection.source is not null then 'group' else item->>'channel' end as channel
  ) route
  cross join lateral (
    select least(case when route.channel<>'group' then s.fee end,
      case when route.channel<>'individual' then coalesce(s.group_fee,s.fee) end) as base,
      s.resident_fee is not null and (s.resident_channel='both' or route.channel in ('both',s.resident_channel)) as resident_applies
  ) quote;
  return signup||jsonb_build_object('groupFee',s.group_fee,'clubLimit',s.club_limit,'clubLimitScope',s.club_limit_scope,
    'residentRate',case when s.resident_fee is not null then
      jsonb_build_object('area',s.resident_area,'channel',s.resident_channel,'fee',s.resident_fee) end,'roster',roster);
end
$$;

create function public.mutate_tournament_signup(p_event_key text,p_operation text,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  e public.events;
  s private.tournament_signup;
  h private.tournament_hosts;
  r private.tournament_roster;
  a uuid:=auth.uid();
  result jsonb;
  fingerprint jsonb:=jsonb_build_array(p_event_key,p_operation,p_input);
  state text:=coalesce(p_input->>'state','');
begin
  if p_operation is distinct from 'residency' then
    result:=private.mutate_tournament_signup(p_event_key,p_operation,p_request_id,p_input);
    if result->>'replayed' is distinct from 'true'
      and (p_operation in ('group','resolve') or p_operation='individual' and state<>'cancel'
        or p_operation='roster_state' and state='received') then
      select t.* into s from private.tournament_signup t join public.events event on event.id=t.event_id
      where event.event_key=p_event_key;
      -- The base operation holds the event lock until this check and the mutation commit together.
      if s.club_limit is not null and exists(
        select 1 from (
          select p.id,response.club_id from private.tournament_participants p
          join private.tournament_club_responses response on (response.event_id,response.user_id)=(p.event_id,p.user_id)
          where p.event_id=s.event_id and p.status<>'cancelled' and p.duplicate_of is null and response.submitted_division is not null
            and (p.chosen_source is null or p.chosen_source=response.club_id::text)
          union
          select p.id,p.individual_club from private.tournament_participants p
          where s.club_limit_scope='combined' and p.event_id=s.event_id and p.status<>'cancelled'
            and p.duplicate_of is null and p.individual_division is not null and p.individual_club is not null
            and (p.chosen_source is null or p.chosen_source='individual')
        ) seats group by club_id having count(*)>s.club_limit
      ) then
        raise exception '동호회별 접수 한도(%명)를 초과했습니다.',s.club_limit using errcode='PT409';
      end if;
    end if;
    return result;
  end if;

  perform private.messaging_assert_read_committed();
  if not private.messaging_account_available(a) then
    raise exception '활동 중인 회원 계정으로 로그인해 주세요.' using errcode='42501';
  end if;
  select * into e from public.events where event_key=p_event_key and publication_status='published';
  if e.id is null or p_request_id is null then
    raise exception '공개 대회와 요청 번호를 확인해 주세요.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pul-tournament:'||e.id,0));
  select * into e from public.events where id=e.id and publication_status='published' for update;
  select * into h from private.tournament_hosts where event_id=e.id;
  if not private.tournament_host_can_finalize(h,a) then
    raise exception '현재 대회 개최자만 지역주민 자격을 확인할 수 있습니다.' using errcode='42501';
  end if;
  result:=private.club_extension_previous(a,p_request_id,'event.tournament.signup',fingerprint);
  if result is not null then return result; end if;
  select * into s from private.tournament_signup where event_id=e.id;
  select * into r from private.tournament_roster where event_id=e.id and id=nullif(p_input->>'participant','')::uuid;
  if r.id is null or r.version is distinct from (p_input->>'version')::int then
    raise exception '참가 명단이 변경됐습니다. 다시 확인해 주세요.' using errcode='PT409';
  end if;
  if e.occurrence_status='cancelled' or not r.active or s.resident_fee is null or state not in ('eligible','ineligible') then
    raise exception '지역주민 요금 설정과 참가자 상태를 확인해 주세요.' using errcode='22023';
  end if;
  update private.tournament_participants set resident_verified=(state='eligible'),version=version+1
  where id=r.id and resident_verified is distinct from (state='eligible');
  result:='{"done":true}'::jsonb;
  perform private.club_extension_complete(a,p_request_id,'event.tournament.signup',fingerprint,result);
  return result;
end
$$;

revoke all on function public.register_pul_tournament(uuid,jsonb), public.get_tournament_signup(text),
  public.mutate_tournament_signup(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.register_pul_tournament(uuid,jsonb), public.mutate_tournament_signup(text,text,uuid,jsonb) to authenticated;
grant execute on function public.get_tournament_signup(text) to anon,authenticated;
