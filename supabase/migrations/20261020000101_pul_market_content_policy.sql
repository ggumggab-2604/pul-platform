-- PUL 1B SQL candidate: NOT registered or applied. Requires AS through 20261020000100.
-- Manual activation: apply/review/test this candidate before enabling PUL_MARKET_CONTENT_MODE=managed.
begin;
insert into public.platform_permission_definitions(code,description,is_active)
values('market.content.manage','장터 안내·정책 관리',true);
insert into public.platform_role_permissions(platform_role,permission_code) values('platform_admin','market.content.manage');

create table public.market_content_documents (
 key text primary key check(key in ('checklist','beginner','safety','help','policy')),
 current_id uuid
);
create table public.market_content_revisions (
 id uuid primary key,
 document_key text not null references public.market_content_documents(key),
 content jsonb not null,
 state text not null check(state in ('draft','published')),
 revision integer not null check(revision>0),
 base_id uuid references public.market_content_revisions(id),
 consent_version text,
 effective_notice text not null default '',
 reason text not null,
 author_id uuid,
 created_at timestamptz not null default clock_timestamp(),
 published_at timestamptz,
 baseline boolean not null default false,
 check(document_key<>'policy' or state='draft' or (consent_version is not null and content->'visible'='true'::jsonb))
);
alter table public.market_content_documents add foreign key(current_id) references public.market_content_revisions(id);
create unique index market_content_one_draft on public.market_content_revisions(document_key) where state='draft';
create index market_content_history on public.market_content_revisions(document_key,created_at desc) where state='published';
create table public.market_content_requests (
 actor_id uuid not null, request_id uuid not null, input jsonb not null, result jsonb not null,
 primary key(actor_id,request_id)
);
create table public.market_content_assets (
 id uuid primary key, draft_id uuid not null references public.market_content_revisions(id),
 owner_id uuid not null, name text not null check(length(name) between 1 and 200),
 mime text not null check(mime in ('image/jpeg','image/png','application/pdf')),
 bytes integer not null check(bytes between 1 and 5242880),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready')),
 created_at timestamptz not null default clock_timestamp()
);
create index market_content_assets_owner on public.market_content_assets(owner_id,draft_id);
create table public.market_policy_consents (
 id bigint generated always as identity primary key,
 entity_kind text not null, entity_id uuid not null, user_id uuid not null,
 consent_version text not null, consent_at timestamptz not null,
 revision_id uuid references public.market_content_revisions(id),
 evidence_kind text not null check(evidence_kind in ('managed','legacy_unresolved')),
 recorded_at timestamptz not null default clock_timestamp(),
 unique(entity_kind,entity_id,consent_version,consent_at)
);
create index market_policy_consents_owner on public.market_policy_consents(user_id,entity_kind,entity_id);
alter table public.market_content_documents enable row level security;
alter table public.market_content_revisions enable row level security;
alter table public.market_content_requests enable row level security;
alter table public.market_content_assets enable row level security;
alter table public.market_policy_consents enable row level security;
revoke all on public.market_content_documents,public.market_content_revisions,public.market_content_requests,public.market_content_assets,public.market_policy_consents from public,anon,authenticated,service_role;
-- No direct table access. Bounded definer RPCs check the existing active platform permission.
revoke all on sequence public.market_policy_consents_id_seq from public,anon,authenticated,service_role;

create function private.market_content_json(r public.market_content_revisions)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'key',r.document_key,'content',r.content,'state',r.state,'revision',r.revision,
 'baseId',r.base_id,'consentVersion',r.consent_version,'effectiveNotice',r.effective_notice,'reason',r.reason,'publishedAt',r.published_at);
$$;
revoke all on function private.market_content_json(public.market_content_revisions) from public,anon,authenticated,service_role;
create function private.market_content_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.state='published' then raise exception '게시 원문은 변경하거나 삭제할 수 없습니다.' using errcode='42501'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
create trigger market_content_immutable before update or delete on public.market_content_revisions for each row execute function private.market_content_immutable();
revoke all on function private.market_content_immutable() from public,anon,authenticated,service_role;
create function private.market_consent_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception '과거 동의는 변경하거나 삭제할 수 없습니다.' using errcode='42501'; end; $$;
create trigger market_consent_immutable before update or delete on public.market_policy_consents for each row execute function private.market_consent_immutable();
revoke all on function private.market_consent_immutable() from public,anon,authenticated,service_role;

create function public.get_market_published_content() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.market_content_json(r) order by d.key),'[]'::jsonb)
 from public.market_content_documents d join public.market_content_revisions r on r.id=d.current_id and r.state='published' where r.content->'visible'='true'::jsonb;
$$;
revoke all on function public.get_market_published_content() from public,anon,authenticated,service_role;
grant execute on function public.get_market_published_content() to anon,authenticated;
create function public.get_market_content_management() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.market_require_platform_permission('market.content.manage');
 return jsonb_build_object(
 'current',coalesce((select jsonb_agg(private.market_content_json(r)) from public.market_content_documents d join public.market_content_revisions r on r.id=d.current_id),'[]'::jsonb),
 'drafts',coalesce((select jsonb_agg(private.market_content_json(r) order by document_key) from public.market_content_revisions r where state='draft'),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(private.market_content_json(r) order by created_at desc) from public.market_content_revisions r where state='published'),'[]'::jsonb));
end; $$;
revoke all on function public.get_market_content_management() from public,anon,authenticated,service_role;
grant execute on function public.get_market_content_management() to authenticated;

create function private.market_content_validate(c jsonb) returns void language plpgsql immutable security invoker set search_path='' as $$
declare s jsonb; i jsonb;
begin
 if c is null or jsonb_typeof(c)<>'object' or length(c::text)>120000 or
 jsonb_typeof(c->'title') is distinct from 'string' or length(trim(c->>'title')) not between 1 and 160 or
 jsonb_typeof(c->'intro') is distinct from 'string' or length(c->>'intro')>2000 or
 jsonb_typeof(c->'body') is distinct from 'string' or length(c->>'body')>20000 or
 jsonb_typeof(c->'visible') is distinct from 'boolean' or
 jsonb_typeof(c->'sections') is distinct from 'array' or jsonb_typeof(c->'attachments') is distinct from 'array'
 then raise exception '안내 입력을 확인해 주세요.' using errcode='22023'; end if;
 if jsonb_array_length(c->'sections')>30 or jsonb_array_length(c->'attachments')>8 then raise exception '항목 제한' using errcode='22023'; end if;
 for s in select value from jsonb_array_elements(c->'sections') loop
 if jsonb_typeof(s->'title') is distinct from 'string' or length(s->>'title')>160 or jsonb_typeof(s->'description') is distinct from 'string' or length(s->>'description')>4000 or jsonb_typeof(s->'items') is distinct from 'array' then raise exception '문단 입력' using errcode='22023'; end if;
 if jsonb_array_length(s->'items')>40 then raise exception '항목 제한' using errcode='22023'; end if;
 for i in select value from jsonb_array_elements(s->'items') loop
 if jsonb_typeof(i)<>'string' or length(i#>>'{}')>4000 then raise exception '항목 입력' using errcode='22023'; end if;
 end loop; end loop;
 if exists(select 1 from jsonb_array_elements(c->'attachments') a where jsonb_typeof(a)<>'string' or (a#>>'{}') !~ '^[0-9a-f-]{36}$') or
 (select count(*)<>count(distinct value) from jsonb_array_elements(c->'attachments')) then raise exception '첨부 입력' using errcode='22023'; end if;
end; $$;
revoke all on function private.market_content_validate(jsonb) from public,anon,authenticated,service_role;

create function public.mutate_market_content(p_input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=private.market_require_platform_permission('market.content.manage');
 request uuid:=(p_input->>'requestId')::uuid;
 draft uuid:=(p_input->>'draftId')::uuid;
 k text:=p_input->>'key';
 op text:=p_input->>'operation';
 c jsonb:=p_input->'content';
 d public.market_content_documents%rowtype;
 r public.market_content_revisions%rowtype;
 current_r public.market_content_revisions%rowtype;
 replay public.market_content_requests%rowtype;
 result jsonb;
begin
 if request is null or draft is null or k is null or op is null or op not in ('save','publish') or
 length(trim(coalesce(p_input->>'reason',''))) not between 1 and 2000 or
 coalesce(p_input->>'expectedRevision','') !~ '^[0-9]+$' then raise exception '입력 확인' using errcode='22023'; end if;
 -- Stable per-actor idempotency lock, taken before document lock for every retry.
 perform pg_advisory_xact_lock(hashtextextended(actor::text||request::text,981));
 select * into replay from public.market_content_requests where actor_id=actor and request_id=request;
 if found then
   if replay.input is distinct from p_input then raise exception '동일 요청 입력 충돌' using errcode='40001'; end if;
   return replay.result;
 end if;
 select * into d from public.market_content_documents where key=k for update;
 if not found then raise exception '정해진 안내 위치만 사용할 수 있습니다.' using errcode='22023'; end if;
 select * into current_r from public.market_content_revisions where id=d.current_id;
 if (p_input->>'baseId')::uuid is distinct from d.current_id then raise exception '현재 게시본 충돌' using errcode='40001'; end if;
 perform private.market_content_validate(c);
 if k='policy' and c->'visible'<>'true'::jsonb then raise exception '유효 정책 숨김 금지' using errcode='22023'; end if;
 select * into r from public.market_content_revisions where id=draft for update;
 if r.id is null then
   if op<>'save' or (p_input->>'expectedRevision')::int<>0 or exists(select 1 from public.market_content_revisions where document_key=k and state='draft') then raise exception '초안 충돌' using errcode='40001'; end if;
 else
   if r.document_key<>k or r.state<>'draft' or r.revision<>(p_input->>'expectedRevision')::int or (op='publish' and r.base_id is distinct from d.current_id) then raise exception '초안 충돌' using errcode='40001'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements_text(c->'attachments') x(id)
   where not exists(select 1 from public.market_content_assets a where a.id::text=x.id and a.state='ready' and
     ((a.owner_id=actor and a.draft_id=draft) or exists(select 1 from public.market_content_revisions prior where prior.document_key=k and prior.state='published' and prior.content->'attachments' ? x.id))))
 then raise exception '첨부 소유권·완료 상태 확인' using errcode='22023'; end if;
 if op='save' then
   insert into public.market_content_revisions(id,document_key,content,state,revision,base_id,reason,author_id)
   values(draft,k,c,'draft',1,d.current_id,p_input->>'reason',actor)
   on conflict(id) do update set content=excluded.content,reason=excluded.reason,base_id=excluded.base_id,revision=public.market_content_revisions.revision+1;
 else
   if r.content is distinct from c or r.reason is distinct from p_input->>'reason' then raise exception '먼저 초안을 저장하세요.' using errcode='40001'; end if;
   if k='policy' and c=current_r.content then raise exception '동의 내용이 동일합니다.' using errcode='22023'; end if;
   update public.market_content_revisions set state='published',revision=revision+1,
     consent_version=case when k='policy' then 'market-policy-'||gen_random_uuid()::text else null end,
     published_at=clock_timestamp(),effective_notice=case when k='policy' then '이 정책은 '||to_char(clock_timestamp() at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI:SS')||' (KST)부터 시행합니다.' else '' end
   where id=draft;
   update public.market_content_documents set current_id=draft where key=k;
 end if;
 select private.market_content_json(x) into result from public.market_content_revisions x where id=draft;
 insert into public.market_content_requests(actor_id,request_id,input,result) values(actor,request,p_input,result);
 return result;
end; $$;
revoke all on function public.mutate_market_content(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mutate_market_content(jsonb) to authenticated;

-- Content attachment bucket is private, immutable on upload and separate from all trade photos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('market-content-assets','market-content-assets',false,5242880,array['image/jpeg','image/png','application/pdf']);
create function public.prepare_market_content_asset(p_id uuid,p_draft_id uuid,p_name text,p_mime text,p_bytes integer,p_sha256 text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.market_require_platform_permission('market.content.manage'); a public.market_content_assets%rowtype;
begin
 perform 1 from public.market_content_revisions where id=p_draft_id and state='draft' and author_id=actor for update;
 if not found then raise exception '저장된 초안이 필요합니다.' using errcode='22023'; end if;
 insert into public.market_content_assets(id,draft_id,owner_id,name,mime,bytes,sha256) values(p_id,p_draft_id,actor,p_name,p_mime,p_bytes,p_sha256) on conflict(id) do nothing;
 select * into a from public.market_content_assets where id=p_id;
 if a.owner_id<>actor or a.draft_id<>p_draft_id or a.name<>p_name or a.mime<>p_mime or a.bytes<>p_bytes or a.sha256<>p_sha256 then raise exception '첨부 요청 충돌' using errcode='40001'; end if;
 return jsonb_build_object('id',a.id,'state',a.state);
end; $$;
revoke all on function public.prepare_market_content_asset(uuid,uuid,text,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_market_content_asset(uuid,uuid,text,text,integer,text) to authenticated;

create function private.market_content_asset_access(p_path text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.market_content_assets a where a.id::text=p_path and
 case when p_write then a.owner_id=auth.uid() and a.state='pending' and
 private.market_actor_has_platform_permission(auth.uid(),'market.content.manage') and
 exists(select 1 from public.market_content_revisions r where r.id=a.draft_id and r.state='draft' and r.author_id=auth.uid())
 else (a.owner_id=auth.uid() and private.market_actor_has_platform_permission(auth.uid(),'market.content.manage'))
 or (a.state='ready' and exists(select 1 from public.market_content_revisions r where r.state='published' and r.content->'visible'='true'::jsonb and r.content->'attachments' ? a.id::text and (r.document_key='policy' or exists(select 1 from public.market_content_documents d where d.current_id=r.id))))
 end);
$$;
revoke all on function private.market_content_asset_access(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.market_content_asset_access(text,boolean) to anon,authenticated;
create policy market_content_asset_read on storage.objects for select to anon,authenticated using(bucket_id='market-content-assets' and private.market_content_asset_access(name,false));
create policy market_content_asset_insert on storage.objects for insert to authenticated with check(bucket_id='market-content-assets' and private.market_content_asset_access(name,true));
-- Deliberately no UPDATE/DELETE policy: no overwrite, no published-evidence removal.
create function public.complete_market_content_asset(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.market_require_platform_permission('market.content.manage'); a public.market_content_assets%rowtype;
begin
 select * into a from public.market_content_assets where id=p_id and owner_id=actor for update;
 if not found then raise exception '첨부 권한 없음' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='market-content-assets' and name=p_id::text and (metadata->>'size')::bigint=a.bytes and metadata->>'mimetype'=a.mime)
 then raise exception '첨부 확인 필요' using errcode='22023'; end if;
 update public.market_content_assets set state='ready' where id=p_id;
end; $$;
revoke all on function public.complete_market_content_asset(uuid) from public,anon,authenticated,service_role;
grant execute on function public.complete_market_content_asset(uuid) to authenticated;

-- Single effective-policy criterion. SHARE lock serializes post saves with manual publication.
create function private.market_effective_policy_version(p_version text) returns text language plpgsql security definer set search_path='' as $$
declare current_revision uuid; expected text;
begin
 select current_id into current_revision from public.market_content_documents where key='policy' for share;
 select consent_version into expected from public.market_content_revisions where id=current_revision and state='published';
 if expected is null or p_version is distinct from expected then raise exception 'MARKET_POLICY_STALE' using errcode='22023'; end if;
 return expected;
end; $$;
revoke all on function private.market_effective_policy_version(text) from public,anon,authenticated,service_role;
alter table public.market_listings drop constraint market_listings_trade_notice_check,
 add constraint market_listings_trade_notice_check check((trade_notice_version is null and trade_notice_confirmed_at is null) or (trade_notice_version is not null and trade_notice_confirmed_at is not null));
alter table public.market_buy_requests drop constraint market_buy_exchange_policy_check,
 add constraint market_buy_exchange_policy_check check((trade_notice_version is null and trade_notice_confirmed_at is null) or (trade_notice_version is not null and trade_notice_confirmed_at is not null));

create function private.market_record_policy_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare who uuid; kind text; rid uuid;
begin
 kind:=case when tg_table_name='market_listings' then 'listing' else 'buy_request' end;
 who:=case when tg_table_name='market_listings' then (to_jsonb(new)->>'seller_user_id')::uuid else (to_jsonb(new)->>'author_user_id')::uuid end;
 if tg_op='UPDATE' then
   if old.trade_notice_version is not distinct from new.trade_notice_version and old.trade_notice_confirmed_at is not distinct from new.trade_notice_confirmed_at then return new; end if;
   -- Preserve known evidence before changing row summary; never attach an invented historical body.
   if old.trade_notice_version is not null and old.trade_notice_confirmed_at is not null then
     insert into public.market_policy_consents(entity_kind,entity_id,user_id,consent_version,consent_at,revision_id,evidence_kind)
     values(kind,old.id,who,old.trade_notice_version,old.trade_notice_confirmed_at,null,'legacy_unresolved') on conflict do nothing;
   end if;
 end if;
 if new.trade_notice_version is not null and new.trade_notice_confirmed_at is not null then
   select r.id into rid from public.market_content_documents d join public.market_content_revisions r on r.id=d.current_id where d.key='policy' and r.consent_version=new.trade_notice_version;
   if rid is null then raise exception 'MARKET_POLICY_STALE' using errcode='22023'; end if;
   insert into public.market_policy_consents(entity_kind,entity_id,user_id,consent_version,consent_at,revision_id,evidence_kind)
   values(kind,new.id,who,new.trade_notice_version,new.trade_notice_confirmed_at,rid,'managed') on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function private.market_record_policy_consent() from public,anon,authenticated,service_role;
create trigger market_listing_policy_history after insert or update of trade_notice_version,trade_notice_confirmed_at on public.market_listings for each row execute function private.market_record_policy_consent();
create trigger market_buy_policy_history after insert or update of trade_notice_version,trade_notice_confirmed_at on public.market_buy_requests for each row execute function private.market_record_policy_consent();

-- Initial snapshots and scoped replacement functions are appended by build-sql.py.

insert into public.market_content_documents(key) values('checklist');
insert into public.market_content_revisions(id,document_key,content,state,revision,consent_version,effective_notice,reason,baseline)
values('e0c4ba06-12af-5bc2-9758-ec0c2db7ea36','checklist','{"title": "중고 구매 체크리스트", "intro": "구입 전 사진과 설명을 비교하고, 확인이 필요한 내용은 작성자에게 문의하세요. 가격과 거래 조건은 당사자가 직접 확인해야 합니다.", "body": "", "sections": [{"title": "모델·연식", "description": "같은 모델과 연식인지 확인하고 새 제품 가격과 비교하세요.", "items": []}, {"title": "상태·사용 이력", "description": "균열·마모·수리 흔적과 사용 기간을 사진과 설명으로 확인하세요.", "items": []}, {"title": "구성품·규격", "description": "공의 수량, 가방·신발의 크기와 포함된 구성품을 확인하세요.", "items": []}, {"title": "실물 사진", "description": "실물 전체와 손상 부위가 보이는지 확인하고 필요하면 추가 설명을 요청하세요.", "items": []}, {"title": "가격·거래 방법", "description": "예산 협의나 교환 조건, 직거래 장소와 배송비를 함께 확인하세요.", "items": []}, {"title": "연락·안전 확인", "description": "쪽지로 조건을 확인하고 선입금 요구와 외부 링크를 주의하세요.", "items": []}], "attachments": [], "visible": true}'::jsonb,'published',1,null,'','기존 코드 기준본. 과거 게시 시각·원문 증거로 소급하지 않음.',true);
update public.market_content_documents set current_id='e0c4ba06-12af-5bc2-9758-ec0c2db7ea36' where key='checklist';

insert into public.market_content_documents(key) values('beginner');
insert into public.market_content_revisions(id,document_key,content,state,revision,consent_version,effective_notice,reason,baseline)
values('46c72abc-bb14-5930-a1f1-660223577b83','beginner','{"title": "초보자 장비 선택 가이드", "intro": "", "body": "", "sections": [{"title": "첫 채는 가볍고 짧은 모델부터", "description": "입문 단계에서는 무게와 길이가 맞는지 우선 확인하세요.", "items": []}, {"title": "공은 연습용과 공인구를 구분", "description": "연습과 대회용을 나누면 비용 관리가 쉽습니다.", "items": []}, {"title": "중고 구매 시 그립·헤드 사진 확인", "description": "상태 사진과 거래 방식을 카드에서 먼저 확인하세요.", "items": []}], "attachments": [], "visible": true}'::jsonb,'published',1,null,'','기존 코드 기준본. 과거 게시 시각·원문 증거로 소급하지 않음.',true);
update public.market_content_documents set current_id='46c72abc-bb14-5930-a1f1-660223577b83' where key='beginner';

insert into public.market_content_documents(key) values('safety');
insert into public.market_content_revisions(id,document_key,content,state,revision,consent_version,effective_notice,reason,baseline)
values('748f57aa-9b30-59c8-a2a7-e894eb0992b4','safety','{"title": "안전거래 안내", "intro": "안전한 중고거래를 위한 기본 수칙입니다.", "body": "", "sections": [{"title": "", "description": "", "items": ["직거래 시 사람이 많은 장소를 이용해주세요.", "선입금을 요구하는 거래는 주의해주세요.", "상품 상태 사진을 꼼꼼히 확인해주세요.", "거래 완료 전 개인정보를 과도하게 공유하지 마세요.", "의심스러운 거래는 PUL에 신고해주세요.", "고액 매매나 창업 상담은 반드시 계약서, 사업자 정보, 실제 시설 확인 후 진행해주세요.", "부지 조성이나 시설 공사는 지자체 인허가와 법적 조건을 확인해주세요.", "예상 수익이나 투자 회수 기간을 과장하는 홍보에 주의해주세요.", "업체 답변은 참고 자료이며 최종 결정은 직접 확인 후 진행해주세요."]}], "attachments": [], "visible": true}'::jsonb,'published',1,null,'','기존 코드 기준본. 과거 게시 시각·원문 증거로 소급하지 않음.',true);
update public.market_content_documents set current_id='748f57aa-9b30-59c8-a2a7-e894eb0992b4' where key='safety';

insert into public.market_content_documents(key) values('help');
insert into public.market_content_revisions(id,document_key,content,state,revision,consent_version,effective_notice,reason,baseline)
values('552c5075-1c59-5e4b-9abd-8d236c7a0590','help','{"title": "장터 이용 도움말", "intro": "팝니다에서는 판매 매물을, 삽니다·교환에서는 구매 희망 글과 교환 글을 확인할 수 있습니다. 상세에서 사진·거래 조건을 확인하고 쪽지로 문의하거나 관심글로 저장하세요. 관심목록은 내 정보에서 모아 볼 수 있습니다.", "body": "", "sections": [], "attachments": [], "visible": true}'::jsonb,'published',1,null,'','기존 코드 기준본. 과거 게시 시각·원문 증거로 소급하지 않음.',true);
update public.market_content_documents set current_id='552c5075-1c59-5e4b-9abd-8d236c7a0590' where key='help';

insert into public.market_content_documents(key) values('policy');
insert into public.market_content_revisions(id,document_key,content,state,revision,consent_version,effective_notice,reason,baseline)
values('d3eb65bc-c430-5ae0-8b28-68caf858ccfa','policy','{"title": "장터 이용안내 및 운영정책", "intro": "", "body": "", "sections": [{"title": "A. 이용 범위와 거래 가능한 물품", "description": "PUL 판매 장터는 파크골프 관련 물품을 거래하는 공간입니다.", "items": ["파크골프채·공·가방·의류·신발·연습용품과 파크골프 활동에 관련된 기타 물품을 등록할 수 있습니다. 창업·매매와 시설·조성 정보는 해당 별도 메뉴를 이용해 주세요.", "본인이 소유하거나 판매할 권한이 있는 물품만 등록해 주세요. 상품의 상태·하자·구성품·가격과 거래 조건을 정확하게 알려 주세요."]}, {"title": "B. 거래 금지·등록 제한", "description": "다음은 PUL 장터의 운영정책에 따른 등록 제한입니다. 품목별 법적 판매 금지를 판정한 목록은 아닙니다.", "items": ["위조품·도난품·판매 권한이 없는 물품과 다른 사람의 권리를 침해하는 물품은 등록할 수 없습니다.", "개인정보·계정·비밀번호·인증정보의 거래 또는 이를 요구하는 글은 등록할 수 없습니다.", "실제 물품 거래와 무관한 광고, 사기성 게시물, 허위 매물, 금지된 거래를 우회하도록 유도하는 글은 제한합니다.", "파크골프 관련 물품 범위를 벗어나는 주류·담배·의약품·무기류·현금화 목적의 상품권 등은 이 장터에 등록하지 마세요. 이는 PUL의 등록 범위 제한이며 각 품목의 법적 지위를 단정하는 설명이 아닙니다."]}, {"title": "C. 판매글 작성 기준", "description": "구매자가 실제 상품과 거래 조건을 판단할 수 있도록 작성해 주세요.", "items": ["직접 촬영했거나 사용할 권한이 있는 실제 상품 사진을 사용하고, 사용 기간·상태·하자·수리 여부·구성품·가격을 설명해 주세요.", "허위 설명, 같은 물품의 반복·중복 게시, 타인의 사진 무단 사용과 과도한 홍보를 제한합니다.", "설명이나 사진에 전화번호·주소·계좌정보 등 개인정보를 불필요하게 노출하지 마세요. 전화·문자 문의를 추가하려면 별도의 연락처 공개 안내를 확인하고 선택해 주세요."]}, {"title": "D. 거래 시 주의사항", "description": "거래 전에 상대방과 상품·결제·배송 조건을 충분히 확인해 주세요.", "items": ["상품 상태와 구성품, 최종 가격, 결제 방법, 전달·배송 일정과 비용을 서로 확인하고 필요한 거래 내용을 보관해 주세요.", "비밀번호·인증번호를 공유하지 말고 거래에 불필요한 개인정보 제공이나 의심스러운 외부 링크·선입금 요구에 주의해 주세요.", "PUL은 안전결제·대금 보관·보상·상품 진위 보증을 제공하지 않습니다.", "운영자의 신고 확인은 접수 내용과 제출 자료를 바탕으로 합니다. 모든 상품이나 거래를 사전에 검사했다는 의미는 아닙니다."]}, {"title": "E. 신고와 처리 절차", "description": "판매글 상세의 ‘신고하기’를 이용하거나 PUL 운영자에게 이메일로 문의해 주세요.", "items": ["신고에는 대상 글을 찾을 수 있는 정보, 문제 내용과 확인 가능한 근거를 적어 주세요. 이메일에 비밀번호·인증번호 등 불필요한 개인정보를 보내지 마세요.", "운영자는 신고 내용과 자료를 확인하고 필요하면 관련 설명이나 수정을 요청할 수 있습니다. 신고 횟수만으로 위반을 확정하지 않습니다.", "조치 사유와 결과는 운영자가 연락 가능한 이메일로 안내합니다.", "문의·결과 확인·이의신청은 pulpark.help@gmail.com으로 보내 주세요."]}, {"title": "F. 위반 게시글 조치와 이의신청", "description": "문제의 심각성·반복 여부·피해 우려와 제출 자료를 살펴 조치를 검토합니다.", "items": ["설명 누락 등 수정 가능한 잘못은 설명·수정 요청을 우선합니다.", "금지 물품, 허위 게시물, 반복 위반 등은 운영자가 접수 내용과 근거를 확인한 뒤 해당 판매글을 삭제할 수 있습니다.", "피해 확산 우려가 큰 경우 해당 판매글 삭제 등 필요한 우선 조치를 한 뒤 사유를 안내하고 설명이나 이의신청을 받습니다.", "조치에 이의가 있으면 대상 글 정보와 이의 내용·근거를 pulpark.help@gmail.com으로 보내 주세요. 운영자는 제출된 설명과 자료를 다시 확인하고 연락 가능한 이메일로 결과를 안내합니다."]}], "attachments": [], "visible": true}'::jsonb,'published',1,'market-policy-v1','이 정책은 PUL 베타 장터에 게시되어 적용된 날부터 시행합니다.','기존 코드 기준본. 과거 게시 시각·원문 증거로 소급하지 않음.',true);
update public.market_content_documents set current_id='d3eb65bc-c430-5ae0-8b28-68caf858ccfa' where key='policy';

-- Existing AS mutation body retained; only policy resolution/version assignments changed.
create or replace function public.mutate_market_listing(
  p_operation text,
  p_listing_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_action text := 'market.listing.' || coalesce(p_operation, '');
  v_claim record;
  v_policy_version text;
  v_listing public.market_listings%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_condition text := p_payload->>'condition';
  v_trade_type text := p_payload->>'trade_type';
  v_description text := nullif(pg_catalog.btrim(p_payload->>'description'), '');
  v_contact_method text := p_payload->>'public_contact_method';
  v_contact_value text;
  v_previous_contact_method text;
  v_previous_contact_value text;
  v_contact_changed boolean := false;
  v_price bigint;
  v_next_status text;
  v_removed_paths jsonb := '[]'::jsonb;
begin
  if p_operation not in ('create', 'update', 'reserve', 'sell', 'delete') then
    raise exception '지원하지 않는 판매글 작업입니다.';
  end if;
  if p_operation = 'create' and p_listing_id is not null then
    raise exception '새 판매글에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_listing_id is null then
    raise exception '판매글 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id,
    p_request_id,
    v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation,
      'listing_id', p_listing_id,
      'expected_version', p_expected_version,
      'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;
  if p_operation in ('create','update') then
    v_policy_version := private.market_effective_policy_version(p_payload->>'trade_notice_version');
  end if;


  if p_operation in ('create', 'update') then
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '상품명은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if coalesce(p_payload->>'price', '') !~ '^[0-9]+$' then
      raise exception '가격은 숫자로 입력해 주세요.';
    end if;
    v_price := (p_payload->>'price')::bigint;
    if v_price not between 1 and 1000000000 then
      raise exception '가격 입력 범위를 확인해 주세요.';
    end if;
    if v_region not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_condition not in ('likeNew', 'lightUse', 'normal', 'needsRepair') then
      raise exception '상품 상태 입력을 확인해 주세요.';
    end if;
    if v_trade_type not in ('direct', 'delivery', 'negotiable') then
      raise exception '거래 방식 입력을 확인해 주세요.';
    end if;
    if v_description is null or pg_catalog.char_length(v_description) not between 10 and 2000 then
      raise exception '상품 설명은 10~2000자로 입력해 주세요.';
    end if;
    if p_payload->>'trade_notice_version' is distinct from v_policy_version then
      raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
    end if;
    if v_contact_method is null then
      if nullif(pg_catalog.btrim(p_payload->>'public_contact_value'), '') is not null
         or p_payload->'public_contact_consent' = 'true'::jsonb then
        raise exception '추가 연락을 해제한 경우 연락처를 함께 지워 주세요.' using errcode = '22023';
      end if;
      v_contact_value := null;
    else
      v_contact_value := private.market_normalize_public_contact(v_contact_method, p_payload->>'public_contact_value');
      if p_operation = 'create' and p_payload->'public_contact_consent' is distinct from 'true'::jsonb then
        raise exception '공개 연락처 안내를 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
    end if;
  end if;

  if p_operation = 'create' then
    if p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb then
      raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
    end if;
    insert into public.market_listings (
      seller_user_id,
      title,
      category_code,
      price_amount,
      region_code,
      condition_code,
      trade_type_code,
      description,
      public_contact_method,
      public_contact_value,
      public_contact_consent_at,
      trade_notice_version,
      trade_notice_confirmed_at
    ) values (
      v_actor_id,
      v_title,
      v_category,
      v_price,
      v_region,
      v_condition,
      v_trade_type,
      v_description,
      v_contact_method,
      v_contact_value,
      case when v_contact_method is not null then pg_catalog.now() else null end,
      v_policy_version,
      pg_catalog.now()
    ) returning * into v_listing;
    v_contact_changed := true;
  else
    select listing.*
    into v_listing
    from public.market_listings as listing
    where listing.id = p_listing_id
    for update;
    if v_listing.id is null or v_listing.listing_status = 'removed' then
      raise exception '판매글을 찾을 수 없습니다.';
    end if;
    if v_listing.seller_user_id <> v_actor_id then
      raise exception '본인의 판매글만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_listing.version then
      raise exception '판매글이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    v_previous_contact_method := v_listing.public_contact_method;
    v_previous_contact_value := v_listing.public_contact_value;
    v_before := (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null
    );

    if p_operation = 'update' then
      if v_listing.listing_status = 'sold' then
        raise exception '거래 완료된 판매글은 수정할 수 없습니다.';
      end if;
      if (v_listing.trade_notice_version is distinct from v_policy_version
          or v_listing.trade_notice_confirmed_at is null)
         and p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb then
        raise exception '장터 이용안내 및 운영정책을 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
      v_contact_changed := v_previous_contact_method is distinct from v_contact_method
        or v_previous_contact_value is distinct from v_contact_value;
      if v_contact_method is not null
         and (v_contact_changed or v_listing.public_contact_consent_at is null)
         and p_payload->'public_contact_consent' is distinct from 'true'::jsonb then
        raise exception '공개 연락처 안내를 확인하고 동의해 주세요.' using errcode = '22023';
      end if;
      update public.market_listings
      set title = v_title,
          category_code = v_category,
          price_amount = v_price,
          region_code = v_region,
          condition_code = v_condition,
          trade_type_code = v_trade_type,
          description = v_description,
          public_contact_method = v_contact_method,
          public_contact_value = v_contact_value,
          public_contact_consent_at = case
            when v_contact_method is null then null
            when v_contact_changed or public_contact_consent_at is null then pg_catalog.now()
            else public_contact_consent_at
          end,
          trade_notice_version = v_policy_version,
          trade_notice_confirmed_at = case
            when trade_notice_version = v_policy_version and trade_notice_confirmed_at is not null then trade_notice_confirmed_at
            else pg_catalog.now()
          end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
    elsif p_operation = 'reserve' then
      if v_listing.listing_status <> 'selling' then
        raise exception '판매중인 글만 예약중으로 변경할 수 있습니다.';
      end if;
      v_next_status := 'reserved';
    elsif p_operation = 'sell' then
      if v_listing.listing_status <> 'reserved' then
        raise exception '예약중인 글만 거래완료로 변경할 수 있습니다.';
      end if;
      v_next_status := 'sold';
    else
      select coalesce(pg_catalog.jsonb_agg(media.storage_path), '[]'::jsonb)
      into v_removed_paths
      from public.market_listing_media as media
      where media.listing_id = v_listing.id
        and media.media_status = 'available';
      update public.market_listing_media
      set media_status = 'removed',
          removed_at = pg_catalog.now(),
          version = version + 1
      where listing_id = v_listing.id
        and media_status in ('pending_upload', 'available');
      v_next_status := 'removed';
    end if;

    if v_next_status is not null then
      update public.market_listings
      set listing_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then pg_catalog.now() else null end,
          version = version + 1
      where id = v_listing.id
      returning * into v_listing;
    end if;
  end if;

  if p_operation = 'create'
     or v_before->>'listing_status' is distinct from v_listing.listing_status then
    insert into public.market_status_history (
      entity_kind,
      listing_id,
      entity_version,
      from_status,
      to_status,
      actor_user_id,
      request_id
    ) values (
      'listing',
      v_listing.id,
      v_listing.version,
      case when p_operation = 'create' then null else v_before->>'listing_status' end,
      v_listing.listing_status,
      v_actor_id,
      p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'listing_id', v_listing.id,
    'sale_status', v_listing.listing_status,
    'version', v_listing.version,
    'replayed', false,
    'removed_storage_paths', v_removed_paths
  );
  insert into private.market_audit_log (
    actor_user_id,
    request_id,
    action_code,
    entity_kind,
    entity_id,
    before_data,
    after_data
  ) values (
    v_actor_id,
    p_request_id,
    v_action,
    'listing',
    v_listing.id,
    v_before,
    (
      pg_catalog.to_jsonb(v_listing)
      - 'public_contact_value'
      - 'public_contact_consent_at'
    ) || pg_catalog.jsonb_build_object(
      'status', v_listing.listing_status,
      'version', v_listing.version,
      'contact_method', v_listing.public_contact_method,
      'contact_present', v_listing.public_contact_value is not null,
      'contact_changed', v_contact_changed
    )
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

-- Existing AS mutation body retained; only policy resolution/version assignments changed.
create or replace function private.mutate_market_buy_exchange(
  p_operation text,
  p_buy_request_id uuid,
  p_expected_version integer,
  p_payload jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := private.market_assert_active_actor();
  v_action text := 'market.buy_request.' || coalesce(p_operation, '');
  v_claim record;
  v_policy_version text;
  v_request public.market_buy_requests%rowtype;
  v_before jsonb;
  v_result jsonb;
  v_title text := nullif(pg_catalog.btrim(p_payload->>'title'), '');
  v_category text := p_payload->>'category';
  v_region text := p_payload->>'region';
  v_summary text := nullif(pg_catalog.btrim(p_payload->>'summary'), '');
  v_budget bigint;
  v_next_status text;
  v_type text:=coalesce(p_payload->>'request_type','buy');
  v_neg boolean:=coalesce((p_payload->>'budget_negotiable')::boolean,false);
  v_trade text:=coalesce(p_payload->>'trade_type','negotiable');
  v_wanted text:=nullif(trim(p_payload->>'exchange_wanted'),'');
  v_method text:=nullif(p_payload->>'public_contact_method','');
  v_contact text; v_consent_at timestamptz; v_policy_at timestamptz;
begin
  if p_operation is null or p_operation not in ('create', 'update', 'close', 'delete') then
    raise exception '지원하지 않는 구매요청 작업입니다.';
  end if;
  if p_operation = 'create' and p_buy_request_id is not null then
    raise exception '새 구매요청에는 기존 식별자를 사용할 수 없습니다.';
  end if;
  if p_operation <> 'create' and p_buy_request_id is null then
    raise exception '구매요청 식별자가 필요합니다.';
  end if;

  select * into v_claim from private.market_claim_request(
    v_actor_id, p_request_id, v_action,
    pg_catalog.jsonb_build_object(
      'operation', p_operation, 'buy_request_id', p_buy_request_id,
      'expected_version', p_expected_version, 'payload', coalesce(p_payload, '{}'::jsonb)
    )
  );
  if v_claim.replayed then
    return v_claim.result_data || pg_catalog.jsonb_build_object('replayed', true);
  end if;
  if p_operation in ('create','update') then
    v_policy_version := private.market_effective_policy_version(p_payload->>'trade_notice_version');
  end if;


  -- Lock ownership/version before comparing old contact/policy evidence.
  if p_operation<>'create' then
    select * into v_request from public.market_buy_requests where id=p_buy_request_id for update;
    if v_request.id is null or v_request.request_status='removed' or v_request.publication_status<>'published' then raise exception '글을 찾을 수 없습니다.'; end if;
    if v_request.author_user_id<>v_actor_id then raise exception '본인 글만 변경할 수 있습니다.'; end if;
    if p_expected_version is null or p_expected_version<>v_request.version then raise exception '글이 변경되었습니다. 다시 확인해 주세요.'; end if;
  end if;
  if p_operation in ('create', 'update') then
    if v_type not in ('buy','exchange') or (p_operation='update' and v_type<>v_request.request_type) then raise exception '등록한 글 유형은 변경할 수 없습니다.'; end if;
    if v_trade not in ('direct','delivery','negotiable') then raise exception '거래 방식을 확인해 주세요.'; end if;
    if v_type='exchange' then
      if v_wanted is null or char_length(v_wanted) not between 10 and 1000 or v_neg or p_payload->>'budget' is not null then raise exception '교환 조건을 확인해 주세요.'; end if;
    elsif v_wanted is not null then raise exception '삽니다에는 교환 조건을 저장할 수 없습니다.'; end if;
    if p_payload->'trade_notice_confirmed' is distinct from 'true'::jsonb or p_payload->>'trade_notice_version' is distinct from v_policy_version then raise exception '장터 이용안내 및 운영정책을 읽고 동의해 주세요.'; end if;
    v_policy_at:=case when v_request.trade_notice_version=v_policy_version then v_request.trade_notice_confirmed_at end;
    v_policy_at:=coalesce(v_policy_at,now());
    if v_method is not null then
      v_contact:=private.market_normalize_public_contact(v_method,p_payload->>'public_contact_value');
      if p_operation='update' and v_request.public_contact_method=v_method and v_request.public_contact_value=v_contact and v_request.public_contact_consent_at is not null then
        v_consent_at:=v_request.public_contact_consent_at;
      elsif p_payload->'public_contact_consent'='true'::jsonb then v_consent_at:=now();
      else raise exception '공개 연락처 안내에 동의해 주세요.'; end if;
      if v_method='external_url' and (p_operation='create' or v_request.public_contact_method is distinct from v_method or v_request.public_contact_value is distinct from v_contact) then raise exception '새 외부 문의 링크는 등록할 수 없습니다.'; end if;
    elsif nullif(p_payload->>'public_contact_value','') is not null or p_payload->'public_contact_consent'='true'::jsonb then raise exception '연락 방법을 확인해 주세요.';
    end if;
    if v_title is null or pg_catalog.char_length(v_title) not between 2 and 100 then
      raise exception '구매 희망 제목은 2~100자로 입력해 주세요.';
    end if;
    if v_category not in ('club', 'ball', 'bag', 'apparel', 'shoes', 'practice', 'other') then
      raise exception '카테고리 입력을 확인해 주세요.';
    end if;
    if v_type='buy' and not v_neg then
      if coalesce(p_payload->>'budget','') !~ '^[0-9]{1,10}$' then raise exception '희망 예산은 숫자로 입력해 주세요.'; end if;
      v_budget:=(p_payload->>'budget')::bigint;
      if v_budget not between 1 and 1000000000 then raise exception '희망 예산 입력 범위를 확인해 주세요.'; end if;
    elsif p_payload->>'budget' is not null then raise exception '협의 또는 교환에는 금액을 저장하지 않습니다.'; end if;
    if v_region not in ('전국', '서울', '경기', '인천', '충청', '강원', '전라', '경상', '제주') then
      raise exception '지역 입력을 확인해 주세요.';
    end if;
    if v_summary is null or pg_catalog.char_length(v_summary) not between 10 and 1000 then
      raise exception '구매 희망 내용은 10~1000자로 입력해 주세요.';
    end if;
  end if;

  if p_operation = 'create' then
    insert into public.market_buy_requests (
      author_user_id, title, category_code, budget_amount, region_code, summary, request_type,budget_negotiable,exchange_wanted,trade_type,public_contact_method,public_contact_value,public_contact_consent_at,trade_notice_version,trade_notice_confirmed_at
    ) values (
      v_actor_id, v_title, v_category, v_budget, v_region, v_summary,v_type,v_neg,v_wanted,v_trade,v_method,v_contact,v_consent_at,v_policy_version,v_policy_at
    ) returning * into v_request;
  else
    select request.* into v_request
    from public.market_buy_requests as request
    where request.id = p_buy_request_id
    for update;
    if v_request.id is null or v_request.request_status = 'removed' then
      raise exception '구매요청을 찾을 수 없습니다.';
    end if;
    if v_request.author_user_id <> v_actor_id then
      raise exception '본인의 구매요청만 변경할 수 있습니다.';
    end if;
    if p_expected_version is null or p_expected_version <> v_request.version then
      raise exception '구매요청이 변경되었습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_before := pg_catalog.jsonb_build_object('request_status',v_request.request_status,'version',v_request.version);
    if p_operation = 'update' then
      if v_request.request_status <> 'open' then
        raise exception '종료된 구매요청은 수정할 수 없습니다.';
      end if;
      update public.market_buy_requests
      set title = v_title, category_code = v_category, budget_amount = v_budget,
          region_code=v_region,summary=v_summary,budget_negotiable=v_neg,exchange_wanted=v_wanted,trade_type=v_trade,
          public_contact_method=v_method,public_contact_value=v_contact,public_contact_consent_at=v_consent_at,
          trade_notice_version=v_policy_version,trade_notice_confirmed_at=v_policy_at,version=version+1
      where id = v_request.id returning * into v_request;
    elsif p_operation = 'close' then
      if v_request.request_status <> 'open' then
        raise exception '진행중인 구매요청만 종료할 수 있습니다.';
      end if;
      v_next_status := 'closed';
    else
      v_next_status := 'removed';
    end if;
    if v_next_status is not null then
      update public.market_buy_requests
      set request_status = v_next_status,
          removed_at = case when v_next_status = 'removed' then now() else null end,
          version = version + 1
      where id = v_request.id returning * into v_request;
    end if;
  end if;

  if p_operation in ('create','update') then
    if coalesce(jsonb_typeof(p_payload->'remove_media_ids'),'array')<>'array' or coalesce(jsonb_array_length(p_payload->'remove_media_ids'),0)>5 then raise exception '삭제할 사진을 확인해 주세요.'; end if;
    if exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'remove_media_ids','[]'::jsonb)) x(id) where not exists(select 1 from public.market_exchange_media m where m.id::text=x.id and m.post_id=v_request.id and m.uploaded_by_user_id=v_actor_id and m.media_status='available')) then raise exception '본인 글의 등록 사진만 삭제할 수 있습니다.'; end if;
    update public.market_exchange_media set media_status='removed',removed_at=now(),version=version+1 where post_id=v_request.id and id::text in (select jsonb_array_elements_text(coalesce(p_payload->'remove_media_ids','[]'::jsonb)));
  end if;
  if p_operation = 'create' or v_before->>'request_status' is distinct from v_request.request_status then
    insert into public.market_status_history (
      entity_kind, buy_request_id, entity_version, from_status, to_status, actor_user_id, request_id
    ) values (
      'buy_request', v_request.id, v_request.version,
      case when p_operation = 'create' then null else v_before->>'request_status' end,
      v_request.request_status, v_actor_id, p_request_id
    );
  end if;

  v_result := pg_catalog.jsonb_build_object(
    'request_id', p_request_id,
    'buy_request_id', v_request.id,
    'request_status', v_request.request_status,
    'version', v_request.version,
    'replayed', false
  );
  insert into private.market_audit_log (
    actor_user_id, request_id, action_code, entity_kind, entity_id, before_data, after_data
  ) values (
    v_actor_id, p_request_id, v_action, 'buy_request', v_request.id, v_before,
    pg_catalog.jsonb_build_object('status', v_request.request_status, 'version', v_request.version)
  );
  perform private.market_complete_request(v_actor_id, p_request_id, v_result);
  return v_result;
end;
$$;

create or replace function public.get_market_listing(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', listing.id,
    'name', listing.title,
    'category', listing.category_code,
    'seller_type', 'personal',
    'price', listing.price_amount,
    'region', listing.region_code,
    'condition', listing.condition_code,
    'trade_type', listing.trade_type_code,
    'sale_status', listing.listing_status,
    'description', listing.description,
    'seller_display_name', private.market_actor_display_name(listing.seller_user_id, auth.uid()),
    'created_at', listing.created_at,
    'updated_at', listing.updated_at,
    'version', listing.version,
    'can_edit', coalesce(listing.seller_user_id = auth.uid(), false),
    'image_paths', coalesce((
      select pg_catalog.jsonb_agg(media.storage_path order by media.sort_order, media.id)
      from public.market_listing_media as media
      where media.listing_id = listing.id and media.media_status = 'available'
    ), '[]'::jsonb),
    'public_contact_consent_valid', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.listing_status in ('selling', 'reserved')
      and listing.public_contact_method is not null
      and listing.public_contact_consent_at is not null, false),
    'trade_notice_version', case when listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active() then listing.trade_notice_version else null end,
    'trade_notice_confirmed', coalesce(listing.seller_user_id = auth.uid()
      and private.market_contact_viewer_active()
      and listing.trade_notice_version = (select r.consent_version from public.market_content_documents d join public.market_content_revisions r on r.id=d.current_id where d.key='policy')
      and listing.trade_notice_confirmed_at is not null, false),
    'public_contact_method', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_method
      else null
    end,
    'public_contact_value', case
      when private.market_contact_viewer_active() and listing.listing_status in ('selling', 'reserved')
       and listing.public_contact_consent_at is not null
       and listing.public_contact_method is not null
      then listing.public_contact_value
      else null
    end
  )
  from public.market_listings as listing
  where listing.id = p_listing_id
    and listing.listing_status <> 'removed';
$$;

create or replace function private.market_buy_exchange_json(r public.market_buy_requests) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'category',r.category_code,'region',r.region_code,'budget',r.budget_amount,'summary',r.summary,
 'author_display_name',private.market_actor_display_name(r.author_user_id,auth.uid()),'request_status',r.request_status,'created_at',r.created_at,'updated_at',r.updated_at,'version',r.version,
 'can_edit',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active(),false),
 'request_type',r.request_type,'budget_negotiable',r.budget_negotiable,'exchange_wanted',r.exchange_wanted,'trade_type',r.trade_type,
 'public_contact_method',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_method end,
 'public_contact_value',case when private.market_contact_viewer_active() and r.public_contact_consent_at is not null and (r.request_status='open' or r.author_user_id=auth.uid()) then r.public_contact_value end,
 'public_contact_consent_valid',coalesce(r.author_user_id=auth.uid() and private.market_contact_viewer_active() and r.public_contact_consent_at is not null,false),
 'trade_notice_confirmed',coalesce(r.author_user_id=auth.uid() and r.trade_notice_version=(select cr.consent_version from public.market_content_documents cd join public.market_content_revisions cr on cr.id=cd.current_id where cd.key='policy') and r.trade_notice_confirmed_at is not null,false),
 'trade_notice_version',case when r.author_user_id=auth.uid() then r.trade_notice_version end,
 'image_paths',coalesce((select jsonb_agg(m.storage_path order by m.sort_order,m.id) from public.market_exchange_media m where m.post_id=r.id and m.media_status='available'),'[]'::jsonb)); $$;
commit;
