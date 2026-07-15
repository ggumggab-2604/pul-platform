-- PUL 8-2D: only active accounts may update their own public profile.

drop policy "Users can update their own profile"
on public.user_profiles;

create policy "Users can update their own profile"
on public.user_profiles
for update
to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.user_accounts as account
    where account.id = (select auth.uid())
      and account.account_status = 'active'
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.user_accounts as account
    where account.id = (select auth.uid())
      and account.account_status = 'active'
  )
);
