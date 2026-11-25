begin;

create function public.hide_my_published_real_names_with_result(p_expected_generation bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  current_generation bigint;
begin
  perform 1 from public.user_accounts where id = actor and account_status = 'active' for share;
  if not found then
    raise exception '현재 계정에서는 게시물의 이름을 숨길 수 없습니다.' using errcode = '42501';
  end if;

  select n.name_generation into strict current_generation from private.member_posting_names n
  where n.user_id = actor for update;
  if p_expected_generation is null or p_expected_generation < 0 or p_expected_generation > current_generation then
    raise exception '이름 설정을 다시 불러와 주세요.' using errcode = '22023';
  end if;
  if p_expected_generation < current_generation then
    return 'already_applied';
  end if;
  update private.member_posting_names set name_generation = current_generation + 1 where user_id = actor;
  return 'applied';
end $$;

revoke all on function public.hide_my_published_real_names_with_result(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.hide_my_published_real_names_with_result(bigint) to authenticated;

-- Keep the void RPC usable by the previous app during rollout.
create or replace function public.hide_my_published_real_names(p_expected_generation bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.hide_my_published_real_names_with_result(p_expected_generation);
end $$;

commit;
