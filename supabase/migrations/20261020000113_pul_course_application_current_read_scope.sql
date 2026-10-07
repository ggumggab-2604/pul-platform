-- Restrict live management data; preserve submitted snapshots and existing row scope.
begin;
create or replace function private.read_course_application_workspace(p_manage boolean,p_offset integer,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid; manager boolean; rows jsonb; mine jsonb;
begin
  a:=private.require_course_applicant(); manager:=private.course_actor_has_permission(a,'courses.manage');
  if p_manage and not manager then raise exception '검토 권한이 없습니다.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_offset>10000 then raise exception '목록 범위를 확인해 주세요.' using errcode='22023'; end if;
  if p_id is not null and not exists(select 1 from private.course_applications where id=p_id and (applicant_id=a or (p_manage and manager))) then raise exception '신청을 찾을 수 없습니다.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(t.body order by t.created_at desc,t.id),'[]') into rows from (
    select r.id,r.created_at,jsonb_build_object('id',r.id,'kind',r.kind,'draft',r.draft,'relation',r.relation,'verificationContact',r.verification_contact,'publicContactConfirmed',r.public_contact_confirmed,'status',r.status,'version',r.version,'reviewNote',r.review_note,'courseKey',c.course_key,'baseUpdatedAt',r.base_updated_at,'permissionGranted',r.permission_granted,'createdAt',r.created_at,'currentCourse',case when c.id is not null and (
      manager or (
        c.course_status <> 'removed' and exists (
          select 1 from private.course_stewards current_steward
          where current_steward.course_id=c.id
            and current_steward.user_id=a
            and current_steward.active
        )
      )
    ) then private.management_course_json(c) else null end) body
    from private.course_applications r left join public.courses c on c.id=r.target_course_id
    where (r.applicant_id=a or (p_manage and manager)) and (p_id is null or r.id=p_id)
    order by r.created_at desc,r.id limit 21 offset p_offset
  ) t;
  select coalesce(jsonb_agg(private.management_course_json(c) order by c.name),'[]') into mine
    from private.course_stewards s join public.courses c on c.id=s.course_id where s.user_id=a and s.active and c.course_status<>'removed';
  return jsonb_build_object('items',rows,'managed',mine,'canManage',manager);
end; $$;

commit;
