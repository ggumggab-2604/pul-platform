-- Minimal context for explicit projection sync. The existing sync RPC owns all writes.
create function public.get_hall_of_fame_record_projection_context(
  p_record_id uuid
)
returns table (
  record_id uuid,
  source_application_record_id uuid,
  source_application_batch_id uuid,
  record_version integer,
  validity_status text,
  publication_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_record record;
  v_batch_id uuid;
  v_review_status text;
begin
  perform private.require_hall_of_fame_projection_admin(v_actor);

  if p_record_id is null then
    raise exception 'HOF_INVALID_PROJECTION_REQUEST' using errcode = '22023';
  end if;

  select canonical.id, canonical.source_application_record_id, canonical.target_user_id,
    canonical.version, canonical.validity_status, canonical.publication_status
  into v_record
  from public.hall_of_fame_records as canonical
  where canonical.id = p_record_id;

  if not found then
    raise exception 'HOF_CANONICAL_RECORD_NOT_FOUND' using errcode = 'P0002';
  end if;

  select source.application_batch_id, source.review_status
  into v_batch_id, v_review_status
  from public.hall_of_fame_application_records as source
  join public.hall_of_fame_application_batches as batch on batch.id = source.application_batch_id
  where source.id = v_record.source_application_record_id
    and source.target_user_id = v_record.target_user_id;

  if not found or v_batch_id is null or v_review_status is distinct from 'approved'
    or v_record.version is null or v_record.version < 1 then
    raise exception 'HOF_CANONICAL_SOURCE_INTEGRITY_INVALID' using errcode = '23514';
  end if;

  -- A later change is detected by sync's expected canonical version, without read locks.
  return query select v_record.id, v_record.source_application_record_id, v_batch_id,
    v_record.version, v_record.validity_status, v_record.publication_status;
end;
$$;

comment on function public.get_hall_of_fame_record_projection_context(uuid) is
  'Active platform-admin-only current canonical version and source identity for explicit projection sync; no writes.';

revoke all on function public.get_hall_of_fame_record_projection_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_hall_of_fame_record_projection_context(uuid)
  to authenticated;
