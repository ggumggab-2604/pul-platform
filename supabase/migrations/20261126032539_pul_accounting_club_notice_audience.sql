-- Accounting announcements have a saved recipient list. Keep old copies out of the broad club notice readers.
create function private.prevent_broad_accounting_club_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from private.accounting_publications p
    where p.id=new.id and p.kind='club' and p.owner_id=new.club_id
  ) then
    if tg_op='INSERT' then return null; end if;
    new.notice_status:='hidden';
  end if;
  return new;
end $$;

revoke all on function private.prevent_broad_accounting_club_notice() from public,anon,authenticated,service_role;
create trigger prevent_broad_accounting_club_notice
before insert or update on public.club_notices
for each row when (new.notice_status='published')
execute function private.prevent_broad_accounting_club_notice();

update public.club_notices n set notice_status='hidden'
where n.notice_status='published' and exists (
  select 1 from private.accounting_publications p
  where p.id=n.id and p.kind='club' and p.owner_id=n.club_id
);

alter function public.get_club_core_content(uuid) set schema private;
alter function private.get_club_core_content(uuid) rename to club_core_content_without_accounting_notices;
revoke all on function private.club_core_content_without_accounting_notices(uuid) from public,anon,authenticated,service_role;

create function public.get_club_core_content(p_club_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  result jsonb:=private.club_core_content_without_accounting_notices(p_club_id);
  accounting_notices jsonb;
  notices jsonb;
begin
  if actor is null or not private.club_user_has_permission(actor,p_club_id,'club.notices.read')
    or not private.messaging_account_available(actor) then
    return result;
  end if;

  select jsonb_agg(jsonb_build_object(
    'id',p.id,
    'title',n.title,
    'content_summary',left(p.owner_name,150)||' · '||n.title||' · '||
      (p.snapshot->>'from')||' ~ '||(p.snapshot->>'to')||E'\n\n/accounting/shared/'||p.id,
    'notice_type','general',
    'importance','normal',
    'visibility','club_members',
    'notice_status','published',
    'published_at',p.created_at,
    'created_at',p.created_at,
    'updated_at',p.created_at,
    'version',1,
    'author_role','clubManager',
    'can_manage',false
  )) into accounting_notices
  from (
    select x.* from private.accounting_publications x
    where x.kind='club' and x.owner_id=p_club_id and x.channel in ('notice','both')
      and actor=any(x.audience)
    order by x.created_at desc,x.id limit 50
  ) p
  cross join lateral (
    select case when p.previous_id is null then '회원용 정산표' else '회원용 정정 정산표' end title
  ) n;

  if accounting_notices is null then return result; end if;

  select jsonb_agg(row.notice order by row.importance_rank,row.published_at desc,row.id)
  into notices from (
    select notice,
      case notice->>'importance' when 'urgent' then 0 when 'important' then 1 else 2 end importance_rank,
      (notice->>'published_at')::timestamptz published_at,
      (notice->>'id')::uuid id
    from jsonb_array_elements((result->'notices')||accounting_notices) notice
    order by importance_rank,published_at desc,id limit 50
  ) row;
  return jsonb_set(result,'{notices}',notices);
end $$;

revoke all on function public.get_club_core_content(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_club_core_content(uuid) to anon,authenticated;
notify pgrst,'reload schema';

