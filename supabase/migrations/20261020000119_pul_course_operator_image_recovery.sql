-- Local follow-up only. Does not incorporate or reapply the separately installed photo boundary SQL.
begin;
alter table private.course_operator_images add column cleanup_pending boolean not null default false;
alter table private.course_operator_images add constraint course_operator_cleanup_removed check (not cleanup_pending or status='removed');

create or replace function public.course_operator_image_prepare(p_actor uuid,p_course_key text,p_request_id uuid,p_purpose text,p_mime text,p_bytes integer,p_hash text,p_width integer,p_height integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; r private.course_operator_images%rowtype;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception '서버 전용 처리입니다.' using errcode='42501';end if;
 c:=private.course_operator_assert(p_actor,p_course_key);
 if p_request_id is null or p_purpose is null or p_purpose not in ('photo','document') or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_bytes is null or p_bytes not between 1 and 4000000 or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_width is null or p_height is null or least(p_width,p_height)<1 or greatest(p_width,p_height)>(case when p_purpose='document' then 2560 else 800 end) then raise exception '사진 입력을 확인해 주세요.' using errcode='22023';end if;
 select * into r from private.course_operator_images where id=p_request_id for update;
 if found then
  if r.course_id<>c or r.owner_id<>p_actor or r.purpose<>p_purpose or r.mime_type<>p_mime or r.byte_size<>p_bytes or r.content_hash<>p_hash or r.width<>p_width or r.height<>p_height or r.status='removed' then raise exception '같은 요청번호의 파일 정보를 확인해 주세요.' using errcode='22023';end if;
 else
  if (select count(*) from private.course_operator_images where course_id=c and (status in ('pending','uploaded') or cleanup_pending))>=8 then raise exception '미저장 이미지가 최대 8장입니다. 이전 작업을 완료하거나 취소해 주세요.' using errcode='22023';end if;
  insert into private.course_operator_images(id,course_id,owner_id,purpose,mime_type,byte_size,content_hash,width,height)
   values(p_request_id,c,p_actor,p_purpose,p_mime,p_bytes,p_hash,p_width,p_height) returning * into r;
 end if;
 return jsonb_build_object('id',r.id,'uploaded',r.status in ('uploaded','ready'));
end $$;

create function public.course_operator_images_unfinished(p_course_key text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); c uuid; items jsonb;
begin
 c:=private.course_operator_assert(a,p_course_key);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'purpose',purpose,'createdAt',created_at) order by created_at,id),'[]') into items
 from private.course_operator_images where course_id=c and owner_id=a and (status in ('pending','uploaded') or cleanup_pending);
 return jsonb_build_object('items',items);
end $$;
revoke all on function public.course_operator_images_unfinished(text) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_images_unfinished(text) to authenticated;

create or replace function public.course_operator_images_discard(p_course_key text,p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=auth.uid(); c uuid; removed jsonb;
begin
 c:=private.course_operator_assert(a,p_course_key);
 if p_ids is null or cardinality(p_ids)>8 or array_position(p_ids,null) is not null then raise exception '이미지 선택을 확인해 주세요.' using errcode='22023';end if;
 if exists(select 1 from private.course_operator_images where id=any(p_ids) and (course_id<>c or owner_id<>a or status='ready')) then raise exception '본인의 미저장 이미지만 취소할 수 있습니다.' using errcode='42501';end if;
 with r as(update private.course_operator_images set status='removed',position=null,cleanup_pending=true where id=any(p_ids) and course_id=c and owner_id=a and status in ('pending','uploaded','removed') returning id)
 select coalesce(jsonb_agg(id),'[]') into removed from r;
 return jsonb_build_object('removed',removed);
end $$;

-- Storage is touched only after this service-only gate rechecks actor, current course rights, ownership and terminal state.
create function public.course_operator_image_cleanup_server(p_actor uuid,p_course_key text,p_ids uuid[],p_complete boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c uuid; removed jsonb;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then raise exception '서버 전용 처리입니다.' using errcode='42501';end if;
 c:=private.course_operator_assert(p_actor,p_course_key);
 if p_ids is null or cardinality(p_ids) not between 1 and 8 or array_position(p_ids,null) is not null or p_complete is null
  or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception '이미지 선택을 확인해 주세요.' using errcode='22023';end if;
 if (select count(*) from private.course_operator_images where id=any(p_ids) and course_id=c and owner_id=p_actor and status='removed')<>cardinality(p_ids) then
  raise exception '본인의 취소된 사진만 정리할 수 있습니다.' using errcode='42501';end if;
 with r as(update private.course_operator_images set cleanup_pending=not p_complete where id=any(p_ids) and course_id=c and owner_id=p_actor and status='removed' returning id)
 select jsonb_agg(id) into removed from r;
 return jsonb_build_object('removed',removed);
end $$;
revoke all on function public.course_operator_image_cleanup_server(uuid,text,uuid[],boolean) from public,anon,authenticated,service_role;
grant execute on function public.course_operator_image_cleanup_server(uuid,text,uuid[],boolean) to service_role;
notify pgrst,'reload schema';
commit;
