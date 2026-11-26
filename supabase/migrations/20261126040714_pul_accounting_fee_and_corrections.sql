-- Individual and group entries share the tournament roster's participant identity.
create view private.accounting_open_tournament_fees as
select r.owner_id event_id, coalesce(p.duplicate_of,p.id) participant_id, r.id request_id
from private.accounting_requests r
join private.accounting_categories c on c.id=r.category_id and c.group_name='fee'
join private.accounting_targets t on t.request_id=r.id
join private.tournament_participants p on p.event_id=r.owner_id and p.user_id=t.user_id
where r.kind='tournament' and r.event_id=r.owner_id and r.discarded_at is null
  and private.accounting_target_status(r.id,t.user_id)->>'status' not in ('cancelled','refunded');

revoke all on private.accounting_open_tournament_fees from public,anon,authenticated,service_role;

do $$
declare conflicts integer;
begin
  select count(*) into conflicts from (
    select event_id,participant_id from private.accounting_open_tournament_fees
    group by event_id,participant_id having count(*)>1
  ) x;
  raise notice 'Unresolved tournament fee conflicts (participant count): %',conflicts;
end $$;

create function private.accounting_assert_distinct_tournament_fee(p_request uuid,p_user uuid)
returns void language plpgsql set search_path='' as $$
declare tournament uuid; participant uuid;
begin
  select r.owner_id into tournament from private.accounting_requests r
    join private.accounting_categories c on c.id=r.category_id
  where r.id=p_request and r.kind='tournament' and r.event_id=r.owner_id
    and r.discarded_at is null and c.group_name='fee';
  if tournament is null then return; end if;

  -- Take the same lock as the ledger mutation and read its committed changes afterwards.
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception '참가비 요청을 다시 시도해 주세요.' using errcode='40001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('accounting:tournament:'||tournament,0));
  select coalesce(p.duplicate_of,p.id) into participant
  from private.tournament_participants p where p.event_id=tournament and p.user_id=p_user;
  if participant is null then
    raise exception '대회 참가 명단에서 납부 대상을 확인해 주세요.' using errcode='22023';
  end if;
  if exists(select 1 from private.accounting_open_tournament_fees f
    where f.event_id=tournament and f.participant_id=participant and f.request_id<>p_request) then
    raise exception '같은 대회의 참가비 의무가 이미 있습니다. 기존 요청을 취소하거나 입금액 전부를 환불한 뒤 납부 경로를 바꿔 주세요.'
      using errcode='22023';
  end if;
end $$;

create function private.accounting_guard_tournament_fee()
returns trigger language plpgsql security definer set search_path='' as $$
declare target record;
begin
  if tg_table_name='accounting_targets' then
    if tg_op='INSERT' or (old.resolution='cancelled' and new.resolution is distinct from 'cancelled') then
      perform private.accounting_assert_distinct_tournament_fee(new.request_id,new.user_id);
    end if;
  elsif tg_table_name='accounting_allocations' then
    -- Refunds may resolve historical duplicate entries.
    if exists(select 1 from private.accounting_entries e where e.id=new.transaction_id and e.refund_of is null) then
      perform private.accounting_assert_distinct_tournament_fee(new.request_id,new.user_id);
    end if;
  elsif tg_table_name='accounting_requests' then
    for target in select user_id from private.accounting_targets where request_id=new.id loop
      perform private.accounting_assert_distinct_tournament_fee(new.id,target.user_id);
    end loop;
  else
    -- Canceling a refund restores the original confirmed balance.
    for target in select request_id,user_id from private.accounting_allocations where transaction_id=new.id loop
      perform private.accounting_assert_distinct_tournament_fee(target.request_id,target.user_id);
    end loop;
  end if;
  return new;
end $$;

create trigger accounting_tournament_fee_target
before insert or update of resolution on private.accounting_targets
for each row execute function private.accounting_guard_tournament_fee();
create trigger accounting_tournament_fee_allocation
before insert on private.accounting_allocations
for each row execute function private.accounting_guard_tournament_fee();
create trigger accounting_tournament_fee_send
before update of sent_at on private.accounting_requests
for each row when (old.sent_at is null and new.sent_at is not null and new.kind='tournament')
execute function private.accounting_guard_tournament_fee();
create trigger accounting_tournament_fee_cancel_refund
before update of cancelled on private.accounting_entries
for each row when (not old.cancelled and new.cancelled and old.kind='tournament' and old.refund_of is not null)
execute function private.accounting_guard_tournament_fee();

-- Preserve prior recipients who still qualify, including when the write comes directly through the RPC.
create function private.accounting_guard_correction_audience()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from private.accounting_publications original
    cross join lateral private.accounting_people(new.kind,new.owner_id) person
    where original.id=new.previous_id and person.user_id=any(original.audience)
      and not (person.user_id=any(new.audience))
  ) then
    raise exception '현재 열람할 수 있는 이전 발행 대상자를 모두 포함해 주세요.' using errcode='22023';
  end if;
  return new;
end $$;

create trigger accounting_correction_audience
before insert on private.accounting_publications
for each row when (new.previous_id is not null)
execute function private.accounting_guard_correction_audience();

create or replace function public.mutate_accounting(k text,o uuid,op text,request_id uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid();
begin
  if op='receipt' then raise exception '증빙은 파일 업로드에서 저장해 주세요.' using errcode='42501'; end if;
  if op='publish' and nullif(p->>'previous','') is not null
    and coalesce(jsonb_array_length(p->'users'),0)=0
    and not exists(select 1 from private.accounting_operations x where x.actor=a and x.request_id=mutate_accounting.request_id) then
    raise exception '정정 정산표를 받을 회원을 확인해 주세요.' using errcode='22023';
  end if;
  return private.accounting_mutate(k,o,op,request_id,p,a);
end $$;

create function public.get_accounting_correction_audiences(k text,o uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare audiences jsonb;
begin
  if private.accounting_access(k,o,auth.uid())<2 then raise exception '회계 공유 권한이 필요합니다.' using errcode='42501'; end if;
  select coalesce(jsonb_object_agg(p.id,coalesce((
    select jsonb_agg(person.user_id order by person.user_id)
    from private.accounting_people(k,o) person where person.user_id=any(p.audience)
  ),'[]')),'{}') into audiences
  from private.accounting_publications p where p.kind=k and p.owner_id=o
    and p.snapshot->>'from'=p_from::text and p.snapshot->>'to'=p_to::text
    and not exists(select 1 from private.accounting_publications newer where newer.previous_id=p.id);
  return audiences;
end $$;

create function private.accounting_publication_recipient(p private.accounting_publications,a uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(a=any(p.audience),false)
    and exists(select 1 from private.accounting_people(p.kind,p.owner_id) person where person.user_id=a)
$$;

create function private.accounting_can_read_publication(p private.accounting_publications,a uuid)
returns boolean language sql stable set search_path='' as $$
  select p.id is not null and (private.accounting_access(p.kind,p.owner_id,a)>0
    or private.accounting_publication_recipient(p,a))
$$;

create or replace function public.get_accounting_publication(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p private.accounting_publications; a uuid:=auth.uid(); prior uuid; latest uuid; superseded boolean;
begin
  select * into p from private.accounting_publications where id=p_id;
  if not private.accounting_can_read_publication(p,a) then
    raise exception '정산표를 확인할 수 없습니다.' using errcode='42501';
  end if;

  select x.id into prior from private.accounting_publications x where x.id=p.previous_id
    and x.kind=p.kind and x.owner_id=p.owner_id and private.accounting_can_read_publication(x,a);

  with recursive corrections(id,depth,path) as (
    select p.id,0,array[p.id]
    union all
    select x.id,c.depth+1,c.path||x.id from corrections c
    join private.accounting_publications x on x.previous_id=c.id
    where x.kind=p.kind and x.owner_id=p.owner_id
      and x.snapshot->>'from'=p.snapshot->>'from' and x.snapshot->>'to'=p.snapshot->>'to'
      and not x.id=any(c.path)
  )
  select count(*)>1,(array_agg(x.id order by c.depth desc)
    filter(where c.depth>0 and private.accounting_can_read_publication(x,a)))[1]
  into superseded,latest
  from corrections c join private.accounting_publications x on x.id=c.id;

  return jsonb_build_object('id',p.id,'previous_id',prior,'latest_correction_id',latest,
    'is_correction',p.previous_id is not null,'superseded',superseded,'owner_name',p.owner_name,
    'created_at',p.created_at,'snapshot',p.snapshot);
end $$;

create or replace function public.list_accounting_publications() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.owner_name,
    'previous_id',prior.id,'is_correction',p.previous_id is not null,
    'from',p.snapshot->>'from','to',p.snapshot->>'to') order by p.created_at desc),'[]')
  from private.accounting_publications p
  left join private.accounting_publications prior on prior.id=p.previous_id and prior.kind=p.kind and prior.owner_id=p.owner_id
    and private.accounting_can_read_publication(prior,auth.uid())
  where private.accounting_publication_recipient(p,auth.uid())
$$;

revoke all on function private.accounting_assert_distinct_tournament_fee(uuid,uuid),private.accounting_guard_tournament_fee(),
  private.accounting_guard_correction_audience(),private.accounting_publication_recipient(private.accounting_publications,uuid),
  private.accounting_can_read_publication(private.accounting_publications,uuid),public.get_accounting_correction_audiences(text,uuid,date,date)
from public,anon,authenticated,service_role;
grant execute on function public.get_accounting_correction_audiences(text,uuid,date,date) to authenticated;


-- The university feed stores a copy of all-student accounting notices.
create or replace function public.get_university_space(p_key text,p_kind text,p_offset integer default 0,p_photos boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  d public.lesson_university_departments;
  manager boolean;
  student boolean;
begin
  select * into d from public.lesson_university_departments where department_key=p_key;
  manager := private.university_manages(d.id,auth.uid());
  student := d.publication_status is not distinct from 'published' and private.university_student_approved(d.id,auth.uid());
  if not (manager or student) then raise exception using errcode='42501',message='학과 공간 이용 권한이 필요합니다.'; end if;
  if p_kind not in ('notice','story','event') or p_kind is null then raise exception using errcode='22023',message='메뉴를 확인해 주세요.'; end if;
  return jsonb_build_object('school',d.university_name,'name',d.department_name,'manager',manager,'student',student,'items',(
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]')
    from (select e.id,e.kind,e.title,e.body,e.event_date,e.event_time,e.place,e.version,e.created_at,
           e.photo_path is not null as has_photo,e.author_id=auth.uid() as own,
           coalesce(u.display_name,u.nickname,'PUL 회원') as author,
           case when e.kind='event' then (select count(*) from public.lesson_university_event_members m where m.entry_id=e.id) end as participants,
           exists(select 1 from public.lesson_university_event_members m where m.entry_id=e.id and m.user_id=auth.uid()) as joined
          from public.lesson_university_space_entries e left join public.user_profiles u on u.user_id=e.author_id
          where e.department_id=d.id and e.kind=p_kind and (not coalesce(p_photos,false) or e.photo_path is not null)
          and not exists (
            select 1 from private.accounting_publications p
            where p.id=e.id and p.kind='university' and p.owner_id=e.department_id
              and not private.accounting_publication_recipient(p,auth.uid())
          )
          order by e.created_at desc,e.id limit 21 offset greatest(p_offset,0)) x
  ));
end
$$;

notify pgrst, 'reload schema';

