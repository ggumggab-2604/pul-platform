import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../../../supabase/migrations/20260929000100_pul_club_public_directory_truthfulness.sql");
const source = read("./clubDirectory.ts");
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const client = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("public eligibility is default-deny and registration evidence is not a legacy-key heuristic",()=>{
  assert.match(migration,/directory_is_public boolean not null default false/);
  const backfill=migration.slice(migration.indexOf("update public.clubs"),migration.indexOf("-- Official self-service"));
  assert.match(backfill,/request.action_code = 'club.register'/);
  assert.match(backfill,/audit.request_id = request.request_id/);
  assert.match(backfill,/request.completed_at is not null/);
  assert.doesNotMatch(backfill,/legacy_key (?:in|~)|created_at|한강|delete from/i);
  assert.doesNotMatch(migration,/delete from|truncate |drop table|grant.*(?:insert|update|delete)/i);
});
test("public list, detail, course selectors and hidden-content readers use eligibility",()=>{
  for(const name of ["list_public_clubs","get_public_club","list_public_course_clubs","get_club_core_content","get_club_media_content","get_club_event_participation"]){
    const start=migration.indexOf("FUNCTION public."+name+"(");
    assert.ok(start>=0,name);
    const body=migration.slice(start,migration.indexOf("$function$;",start));
    assert.match(body,/club.directory_is_public/);
  }
});
test("official registration completion is atomic; replay cannot republish a hidden club",()=>{
  assert.match(migration,/old.completed_at is null and new.completed_at is not null/);
  assert.match(migration,/after update on private.club_mutation_requests/);
  assert.match(migration,/new.actor_id is distinct from \(select auth.uid\(\)\)/);
  assert.match(migration,/before insert on public.club_membership_applications/);
  assert.match(migration,/before insert on public.club_join_inquiries/);
});
test("internal identity lookup uses RLS and returns only a display name",async()=>{
  const calls=[];
  const query={
    select(value){calls.push(["select",value]);return this;},
    eq(key,value){calls.push(["eq",key,value]);return this;},
    async maybeSingle(){return {data:{name:"TEST 내부 동호회",id:"not-returned"},error:null};},
  };
  const result=await client.getClubManagementIdentity({from(table){calls.push(["from",table]);return query;}},"1");
  assert.deepEqual(result,{name:"TEST 내부 동호회"});
  assert.deepEqual(calls,[["from","clubs"],["select","name"],["eq","legacy_key","1"],["eq","club_status","active"]]);
});
test("internal identity fails closed for missing or malformed rows",async()=>{
  for(const data of [null,{name:null},{name:123}]){
    const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data,error:null};}};
    await assert.rejects(()=>client.getClubManagementIdentity({from(){return query;}},"1"),e=>e.code==="notFound");
  }
  await assert.rejects(()=>client.getClubManagementIdentity({},""),e=>e.code==="notFound");
});
test("all existing management pages avoid public detail gating and preserve permission resolvers",()=>{
  for(const page of ["members","membership-applications"]){
    const content=read("../../app/clubs/[id]/manage/"+page+"/page.tsx");
    assert.match(content,/getClubManagementIdentity/);
    assert.doesNotMatch(content,/getPublicClub/);
    assert.match(content,/resolveClub|listClubDirectoryCorrectionRequestsForManagement/);
  }
  const corrections=read("../../app/clubs/[id]/manage/corrections/page.tsx");
  assert.match(corrections,/getClubCorrectionManagementIdentity\(context.supabase, id\)/);
  assert.doesNotMatch(corrections,/getClubManagementIdentity|getPublicClub|createClient/);
  assert.match(corrections,/listClubDirectoryCorrectionRequestsForManagement/);
  assert.match(read("../../app/clubs/[id]/page.tsx"),/getPublicClub/);
});

test("correction context is exact-club permission-aware, read-only and authenticated-only",()=>{
  const body=migration.slice(migration.indexOf("create function public.get_club_directory_correction_management_context"),migration.indexOf("$context$;"));
  assert.match(body,/stable\s+security definer\s+set search_path = ''/);
  assert.match(body,/v_actor_id uuid := auth.uid\(\)/);
  assert.match(body,/v_actor_id is null/);
  assert.match(body,/private.club_directory_correction_actor_can_manage\(v_actor_id, v_club_id\)/);
  assert.match(body,/club.legacy_key = v_key and club.club_status = 'active'/);
  assert.match(body,/jsonb_build_object\('name', v_name\)/);
  assert.doesNotMatch(body,/\b(insert|update|delete)\b|directory_is_public|email|phone/i);
  assert.match(migration,/revoke all on function public.get_club_directory_correction_management_context\(text\)\s+from public, anon, authenticated, service_role/);
  assert.match(migration,/grant execute on function public.get_club_directory_correction_management_context\(text\) to authenticated/);
});

test("correction identity client uses only the authorized RPC and rejects malformed metadata",async()=>{
  const calls=[];
  const rpc=async(name,args)=>{calls.push([name,args]);return {data:{name:"TEST 관리 동호회"},error:null};};
  assert.deepEqual(await client.getClubCorrectionManagementIdentity({rpc},"hidden-test"),{name:"TEST 관리 동호회"});
  assert.deepEqual(calls,[["get_club_directory_correction_management_context",{p_club_public_key:"hidden-test"}]]);
  for(const data of [null,[],{name:""},{name:2},{name:"ok",id:"private"},Object.create({name:"inherited"})]){
    await assert.rejects(()=>client.getClubCorrectionManagementIdentity({rpc:async()=>({data,error:null})},"1"));
  }
  await assert.rejects(()=>client.getClubCorrectionManagementIdentity({rpc:async()=>({error:{code:"42501"}})},"1"),e=>e.code==="permission");
});

const require=createRequire(import.meta.url);
function loadCorrectionsPage(context, management) {
  const output=ts.transpileModule(read("../../app/clubs/[id]/manage/corrections/page.tsx"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  const modules={
    "@/lib/clubs/clubDirectory":client,
    "@/lib/clubs/clubDirectoryCorrectionRequests":management,
    "@/lib/supabase/auth":{getAuthenticatedSupabaseContext:async()=>context},
    "@/components/clubs/manage/ClubDirectoryCorrectionInbox":{ClubDirectoryCorrectionInbox:"inbox"},
    "@/components/ui/Container":{Container:"container"},
    "next/link":{default:"a"},
    "next/navigation":{notFound(){throw Error("TEST_404");},redirect(){throw Error("TEST_LOGIN_REDIRECT");}},
  };
  new Function("require","exports",output)(name=>name in modules?modules[name]:require(name),exports);
  return exports.default;
}

test("actual corrections server page renders hidden/public empty Inbox for platform and own managers without table lookup",async()=>{
  for(const actor of ["platform-no-membership","own-manager"]){
    for(const id of ["hidden-test","public-test"]){
      const calls=[];
      const supabase={rpc:async(name,args)=>{calls.push([name,args]);return {data:{name:`TEST ${id}`},error:null};}};
      const management={
        ClubDirectoryCorrectionError:class extends Error{},
        async listClubDirectoryCorrectionRequestsForManagement(c,options){assert.equal(c,supabase);assert.equal(options.clubPublicKey,id);calls.push(["list",actor]);return {items:[],total:0,limit:30,offset:0,hasMore:false};},
      };
      const page=loadCorrectionsPage({supabase},management);
      const tree=await page({params:Promise.resolve({id}),searchParams:Promise.resolve({})});
      const rendered=JSON.stringify(tree);
      assert.match(rendered,/동호회 정보 수정 제보 관리/);
      assert.ok(rendered.includes(`TEST ${id}`));
      assert.ok(rendered.includes('"type":"inbox"'));
      assert.equal(calls.length,2);
    }
  }
});

test("actual corrections server page denies unrelated/inactive actors without fetching Inbox or leaking name; anonymous redirects",async()=>{
  for(const actor of ["unrelated","inactive"]){
    const management={ClubDirectoryCorrectionError:class extends Error{},listClubDirectoryCorrectionRequestsForManagement(){assert.fail("denied actor must not fetch Inbox");}};
    const page=loadCorrectionsPage({supabase:{rpc:async()=>({error:{code:"42501"}})}},management);
    const tree=JSON.stringify(await page({params:Promise.resolve({id:actor}),searchParams:Promise.resolve({})}));
    assert.match(tree,/정보 수정 제보 관리 권한이 없습니다/);
    assert.ok(!tree.includes('"type":"inbox"'));
  }
  await assert.rejects(()=>loadCorrectionsPage(null,{})({params:Promise.resolve({id:"hidden-test"}),searchParams:Promise.resolve({})}),/TEST_LOGIN_REDIRECT/);
});
test("home reuses the same filtered public RPC and empty directory does not inject fake cards",()=>{
  assert.match(read("../home/homeAggregation.ts"),/listPublicClubs\(client, \{\}, limit, 0\)/);
  const ui=read("../../components/clubs/ClubsPageContent.tsx");
  assert.match(ui,/아직 공개된 동호회가 없습니다/);
  assert.match(ui,/공개 동호회 \{page.total\}곳/);
  assert.doesNotMatch(ui,/실제 공개 동호회|@\/data\/clubData/);
});
