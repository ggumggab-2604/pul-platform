-- Optional source-page URL; original source remains the name. No data rewrite.
begin;
create function private.course_material_source_url(p_url text) returns text language plpgsql immutable set search_path='' as $$
declare value text:=nullif(btrim(p_url),''); authority text; port text;
begin
 if value is null then return null;end if;
 if char_length(value)>2048 or value ~ '[[:space:][:cntrl:]\\]' or value !~* '^https?://([a-z0-9_-]+(\.[a-z0-9_-]+)*|\[[0-9a-f:.]+\])(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then
  raise exception '출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요.' using errcode='22023';
 end if;
 authority:=substring(value from '(?i)^https?://([^/?#]+)');
 port:=substring(authority from ':([0-9]+)$');
 if port is not null and port::integer>65535 then raise exception '출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요.' using errcode='22023';end if;
 if left(authority,1)='[' then
  begin perform substring(authority from '^\[([^]]+)\]')::inet;
  exception when invalid_text_representation then raise exception '출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요.' using errcode='22023';end;
 end if;
 return value;
end $$;
revoke all on function private.course_material_source_url(text) from public,anon,authenticated,service_role;
alter table private.course_resources add column source_url text;
comment on column private.course_resources.source_url is 'Optional HTTP/HTTPS source page, distinct from the video original URL. Existing source remains the name.';
create or replace function private.course_content_resource_json(r private.course_resources) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'course_id',r.course_id,'kind',r.kind,'title',r.title,'scope',r.scope,'description',r.description,'video_url',r.video_url,'reference_date',r.reference_date,'source',r.source,'source_url',r.source_url,'representative',r.representative,'version',r.version,'created_at',r.created_at,'author',private.messaging_display_name(r.author_id),'can_edit',coalesce(r.author_id=auth.uid(),false),'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'position',i.position) order by i.position) from private.course_resource_images i where i.resource_id=r.id and i.ready),'[]'::jsonb))
$$;

CREATE OR REPLACE FUNCTION private.course_content_mutate(p_course_key text, p_action text, p_id uuid, p_version integer, p_request_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a uuid:=private.require_course_applicant(); c public.courses%rowtype; r private.course_resources%rowtype; manager boolean; result jsonb; ids uuid[]; k text; url text; normalized text; scope_value text;
begin
 if not private.messaging_account_available(a) then raise exception '정상 활동 회원만 등록할 수 있습니다.' using errcode='42501';end if;
 select * into c from public.courses where course_key=p_course_key and course_status='active' for share;
 if not found then raise exception '구장을 찾을 수 없습니다.' using errcode='P0002';end if;
 manager:=private.course_can_manage(c.id,a);if p_action in ('hide','represent') then perform private.course_require_scope(c.id);end if;
 if p_action not in ('save','delete','represent','hide') then raise exception '자료 작업을 확인해 주세요.';end if;
 if p_id is not null then
 select * into r from private.course_resources where id=p_id and course_id=c.id for update;
 if not found then raise exception '자료를 찾을 수 없습니다.' using errcode='P0002';end if;
 if p_action in ('save','delete') and r.author_id is distinct from a or p_action in ('represent','hide') and not manager then raise exception '자료 관리 권한이 없습니다.' using errcode='42501';end if;
 elsif p_action<>'save' then raise exception '자료를 확인해 주세요.';end if;
 result:=private.course_claim_request(a,p_request_id,'course.resource_'||p_action,jsonb_build_object('course',c.id,'id',p_id,'version',p_version,'input',p_input));if result is not null then return result;end if;
 if r.id is not null and (r.version<>p_version or r.status<>'published') then raise exception '자료가 변경되었거나 공개되지 않았습니다. 새로고침해 주세요.' using errcode='PT409';end if;
 if p_action='save' then
 if p_input is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) x where x not in ('kind','title','scope','description','video_url','reference_date','source','source_url','images')) then raise exception '자료 입력 항목을 확인해 주세요.';end if;
 k:=p_input->>'kind';url:=nullif(btrim(p_input->>'video_url'),'');
 scope_value:=case when r.id is null then '구장 전체' else r.scope end;
 if k='video' then
  normalized:=private.course_material_youtube(url);
  if normalized is not null then url:=normalized;
  elsif r.id is null or r.kind<>'video' or url is distinct from r.video_url then raise exception '유튜브 동영상 링크를 입력해 주세요.' using errcode='22023';end if;
 end if;
 if p_input ? 'source_url' and jsonb_typeof(p_input->'source_url') not in ('string','null') then raise exception '출처 링크는 HTTP/HTTPS 웹 주소로 입력해 주세요.' using errcode='22023';end if;
 if k not in ('video','yardage') or k is null or char_length(btrim(coalesce(p_input->>'title',''))) not between 2 and 120 or char_length(scope_value) not between 1 and 100 or char_length(coalesce(p_input->>'description',''))>3000 or char_length(coalesce(p_input->>'reference_date',''))>100 or char_length(coalesce(p_input->>'source',''))>300 then raise exception '자료 제목·분류·설명을 확인해 주세요.';end if;
 if c.course_type='screen' and k<>'video' then raise exception '스크린은 유튜브 동영상 링크만 등록할 수 있습니다.';end if;
 if k='video' and (url is null or char_length(url)>1000 or url !~ '^https?://[^/@[:space:]]+[^[:space:]]*$') then raise exception '영상 링크를 확인해 주세요.';end if;
 if k='yardage' and url is not null then raise exception '야디지북에는 이미지 자료를 선택해 주세요.';end if;
 if jsonb_typeof(coalesce(p_input->'images','[]'))<>'array' then raise exception '이미지 목록을 확인해 주세요.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_input->'images','[]'));
 if cardinality(ids)>8 or cardinality(ids)<>(select count(distinct x) from unnest(ids)x) or k='yardage' and cardinality(ids)=0 or k='video' and cardinality(ids)>0 then raise exception '야디지북은 중복 없이 1~8장을 선택해 주세요.';end if;
 perform id from private.course_resource_images where id=any(ids) order by id for update;
 if (select count(*) from private.course_resource_images i where i.id=any(ids) and i.owner_id=a and i.course_id=c.id and i.ready and (i.resource_id is null or i.resource_id=r.id))<>cardinality(ids) then raise exception '본인이 이 구장에 올린 이미지만 연결할 수 있습니다.' using errcode='42501';end if;
 if r.id is null then insert into private.course_resources(course_id,author_id,kind,title,scope,description,video_url,reference_date,source,source_url) values(c.id,a,k,btrim(p_input->>'title'),scope_value,coalesce(p_input->>'description',''),url,nullif(btrim(p_input->>'reference_date'),''),nullif(btrim(p_input->>'source'),''),private.course_material_source_url(p_input->>'source_url')) returning * into r;
 else update private.course_resources set kind=k,title=btrim(p_input->>'title'),scope=scope_value,description=coalesce(p_input->>'description',''),video_url=url,reference_date=nullif(btrim(p_input->>'reference_date'),''),source=nullif(btrim(p_input->>'source'),''),source_url=case when p_input ? 'source_url' then private.course_material_source_url(p_input->>'source_url') else r.source_url end,version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 update private.course_resource_images set resource_id=null,position=null where resource_id=r.id and not(id=any(ids));
 update private.course_resource_images set resource_id=r.id,position=array_position(ids,id) where id=any(ids);
 elsif p_action='represent' then
 if c.course_type<>'field' then raise exception '스크린에는 대표 자료 기능이 없습니다.';end if;
 if jsonb_typeof(p_input->'enabled') is distinct from 'boolean' then raise exception '대표 상태를 확인해 주세요.';end if;
 update private.course_resources set representative=(p_input->>'enabled')::boolean,version=version+1,updated_at=now() where id=r.id returning * into r;
 else update private.course_resources set status=case when p_action='delete' then 'deleted' else 'hidden' end,representative=false,version=version+1,updated_at=now() where id=r.id returning * into r;end if;
 result:=jsonb_build_object('id',r.id,'version',r.version,'status',r.status);perform private.course_complete_request(a,p_request_id,result);return result;
end $function$
;


notify pgrst,'reload schema';
commit;
