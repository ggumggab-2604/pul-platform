-- Existing applications retain their old workflow. Only NEW applications must use the new scoped policy.
create function private.guard_hall_special_new_application() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not private.hall_special_write_allowed('hall_of_fame_application_batches',to_jsonb(new)) then
 raise exception 'SPECIAL_USE_SCOPED_WORKFLOW' using errcode='42501',hint='Use /hall-of-fame/special for new records. Existing applications can still be continued.';
 end if;
 return new;
end$$;
revoke all on function private.guard_hall_special_new_application() from public,anon,authenticated,service_role;
create trigger a_hall_special_new_application before insert on public.hall_of_fame_application_batches for each row execute function private.guard_hall_special_new_application();
