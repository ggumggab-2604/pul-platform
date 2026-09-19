import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require=createRequire(import.meta.url);
const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");
function load(path,modules={}) {
  const code=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const exports={}; new Function("require","exports",code)(n=>modules[n]??require(n),exports); return exports;
}
const reports=load("lib/community/communityReports.ts");
const lib=load("lib/community/contentModeration.ts",{"./communityReports":reports});
const id="11111111-1111-4111-8111-111111111111",rid="22222222-2222-4222-8222-222222222222";
const input={targetType:"post",targetId:id,action:"restrict",reason:"spam",expectedVersion:1,expectedModerationVersion:0};
const row={id,title:"검토할 제목",body:"<script>private body</script>",base_state:"published",restricted:false,version:1,moderation_version:0,created_at:"2026-09-19T00:00:00Z",parent_visible:true};
const page={items:[row],total:1,has_more:false};
const result={id,restricted:true,moderation_version:1,report_resolved:false};
function client(data=result,error) { const calls=[]; return {calls,rpc:async(...args)=>{calls.push(args);return {data,error};}}; }

test("valid restriction, restoration and report action have exact RPC contracts",async()=>{
  for(const action of ["restrict","restore"]) for(const reportId of action==="restrict"?[null,rid]:[null]) {
    const c=client({...result,restricted:action==="restrict",report_resolved:!!reportId});
    await lib.moderateContent(c,{...input,action,reportId,actorId:rid});
    assert.deepEqual(c.calls,[["moderate_public_content",{p_target_type:"post",p_target_id:id,p_action:action,p_reason:"spam",p_expected_version:1,p_expected_moderation_version:0,p_report_id:reportId}]]);
  }
});
test("invalid type, ID, reason, version and report/action combinations fail before RPC",async()=>{
  for(const bad of [null,{}, {...input,targetType:"account"},{...input,targetId:"bad"},{...input,reason:["spam"]},{...input,reason:"toString"},{...input,expectedVersion:-1},{...input,expectedModerationVersion:NaN},{...input,action:"remove"},{...input,action:"restore",reportId:rid},{...input,targetType:"course",reportId:rid}]) {
    const c=client(); await assert.rejects(lib.moderateContent(c,bad),e=>e.code==="invalid"); assert.equal(c.calls.length,0);
  }
});
test("backend and malformed success responses cannot leak internals or appear successful",async()=>{
  for(const [message,code] of [["moderation_conflict","conflict"],["moderation_state","state"],["moderation_parent_unavailable","parent"],["moderation_target_mismatch","invalid"],["community_report_permission","permission"],["moderation_missing","missing"],["private SQL body email","unknown"]]) {
    await assert.rejects(lib.moderateContent(client(null,{message}),input),e=>e.code===code&&!e.message.includes("private"));
  }
  for(const bad of [null,{...result,id:rid},{...result,restricted:false},{...result,report_resolved:true},{...result,moderation_version:0}]) await assert.rejects(lib.moderateContent(client(bad),input),e=>e.code==="unknown");
});
test("management pagination/parser is narrow and rejects malformed content",async()=>{
  const c=client({...page,items:[{...row,email:"private",actor_id:rid}]});
  const parsed=await lib.listContentForModeration(c,"comment","restricted",id,20,20);
  assert.deepEqual(c.calls,[["list_content_for_moderation",{p_target_type:"comment",p_filter:"restricted",p_target_id:id,p_limit:20,p_offset:20}]]);
  assert.doesNotMatch(JSON.stringify(parsed),/actor_id|email/);
  for(const bad of [null,{...page,total:-1},{...page,items:[{...row,restricted:"false"}]},{...page,items:[{...row,moderation_version:-1}]}]) await assert.rejects(lib.listContentForModeration(client(bad),"post","all",null));
  for(const args of [["toString","all",null],["post","unknown",null],["post","all","bad"],["post","all",null,31,0]]) await assert.rejects(lib.listContentForModeration(client(page),...args));
});
test("server action verifies login, redacts errors and invalidates affected surfaces only after success",async()=>{
  for(const scenario of ["anonymous","permission","parent","network","success"]) {
    const c=client(result,scenario==="permission"?{message:"community_report_permission"}:scenario==="parent"?{message:"moderation_parent_unavailable"}:scenario==="network"?{message:"PRIVATE"}:null),invalidated=[];
    const action=load("app/community/moderation-actions.ts",{
      "@/lib/community/contentModeration":lib,"@/lib/supabase/auth":{getAuthenticatedSupabaseContext:async()=>scenario==="anonymous"?null:{supabase:c}},
      "next/cache":{revalidatePath:(...args)=>invalidated.push(args)},
    }).moderateContentAction;
    const r=await action(input); assert.equal(r.ok,scenario==="success"); assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
    assert.equal(c.calls.length,scenario==="anonymous"?0:1);
    assert.equal(invalidated.length,scenario==="success"?6:0);
    if(scenario==="parent") assert.match(r.error,/상위.*공개 상태가 아니어서 복원할 수 없습니다/);
    if(scenario==="success") assert.deepEqual(invalidated[0],["/"]);
  }
});
const walk=n=>!n||typeof n!=="object"?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
const link={default:({children,...props})=>React.createElement("a",props,children)};
function card(item,reportId=null,response={ok:true},type="post") {
  const state=[],refs=[],tasks=[],calls=[],refresh=[]; let cursor=0,refCursor=0;
  const componentModule=load("components/community/ContentModerationManagement.tsx",{
    "@/lib/community/contentModeration":lib,"@/lib/community/communityReports":reports,"next/link":link,
    "next/navigation":{useRouter:()=>({refresh:()=>refresh.push(true)})},
    "@/app/community/moderation-actions":{moderateContentAction:async value=>{calls.push(value); return response;}},
    react:{...React,useId:()=>"moderation",useState:init=>{const i=cursor++;if(!(i in state))state[i]=init;return [state[i],v=>state[i]=v];},useRef:init=>refs[refCursor++]??={current:init},useTransition:()=>[false,fn=>tasks.push(fn())]},
  });
  const tree=componentModule.ContentModerationManagement({page:{items:[item],total:1,hasMore:false},type,filter:"all",pageNumber:1,targetId:item.id,reportId});
  const node=walk(tree).find(n=>typeof n.type==="function"&&n.type.name==="ContentCard");
  return {calls,refresh,render(){cursor=0;refCursor=0;return node.type(node.props);},async flush(){await Promise.all(tasks.splice(0));}};
}
const item={id,title:row.title,body:row.body,baseState:"published",restricted:false,version:1,moderationVersion:0,createdAt:row.created_at,parentVisible:true};
test("operator must review body and choose reason; report actions are distinct and overlapping clicks suppressed",async()=>{
  for(const combined of [false,true]) {
    const h=card(item,rid); const initial=h.render();
    assert.ok(walk(initial).filter(n=>n.type==="button").every(n=>n.props.disabled));
    assert.doesNotMatch(renderToStaticMarkup(initial),/<script>/);
    walk(initial).find(n=>n.type==="select").props.onChange({target:{value:"spam"}});
    walk(h.render()).find(n=>n.type==="input").props.onChange({target:{checked:true}});
    const button=walk(h.render()).filter(n=>n.type==="button")[combined?1:0];
    button.props.onClick(); button.props.onClick(); await h.flush();
    assert.equal(h.calls.length,1); assert.equal(h.calls[0].reportId,combined?rid:null); assert.equal(h.refresh.length,1);
  }
});
test("restore and deleted/original-hidden UI controls preserve state; failures retain review context",async()=>{
  const restored=card({...item,baseState:"hidden",restricted:true,moderationVersion:1});
  assert.match(renderToStaticMarkup(restored.render()),/운영자 제한 해제/);
  for(const baseState of ["hidden","removed"]) assert.equal(walk(card({...item,baseState}).render()).filter(n=>n.type==="button").length,0);
  const h=card(item,null,{ok:false,error:"콘텐츠 운영 권한이 없습니다."});
  walk(h.render()).find(n=>n.type==="select").props.onChange({target:{value:"spam"}});
  walk(h.render()).find(n=>n.type==="input").props.onChange({target:{checked:true}});
  walk(h.render()).find(n=>n.type==="button").props.onClick(); await h.flush();
  assert.equal(h.refresh.length,0); assert.match(renderToStaticMarkup(h.render()),/role="alert"/);
});
test("non-public parents disable restoration; stale visible UI displays DB denial without refresh",async()=>{
  for(const type of ["comment","course"]) {
    const restricted={...item,baseState:type==="comment"?"published":"hidden",restricted:true,moderationVersion:1};
    const blocked=card({...restricted,parentVisible:false},null,{ok:true},type);
    assert.equal(walk(blocked.render()).filter(n=>n.type==="button").length,0);
    assert.match(renderToStaticMarkup(blocked.render()),/공개 상태가 아니어서 복원할 수 없습니다/);
    assert.equal(blocked.calls.length,0);
    const stale=card(restricted,null,{ok:false,error:new lib.ContentModerationError("parent").message},type);
    walk(stale.render()).find(n=>n.type==="select").props.onChange({target:{value:"spam"}});
    walk(stale.render()).find(n=>n.type==="input").props.onChange({target:{checked:true}});
    walk(stale.render()).find(n=>n.type==="button").props.onClick();await stale.flush();
    assert.equal(stale.calls[0].action,"restore");assert.equal(stale.refresh.length,0);
    assert.match(renderToStaticMarkup(stale.render()),/role="alert"/);
    assert.doesNotMatch(renderToStaticMarkup(stale.render()),/role="status"/);
  }
});

test("management route denies anonymous/member and never renders content on failed permission",async()=>{
  for(const scenario of ["anonymous","permission","success"]) {
    const c=client(page,scenario==="permission"?{message:"community_report_permission"}:null);
    const route=load("app/community/manage/content/page.tsx",{
      "@/lib/community/contentModeration":lib,"@/lib/supabase/auth":{getAuthenticatedSupabaseContext:async()=>scenario==="anonymous"?null:{supabase:c}},
      "next/link":link,"next/navigation":{redirect:url=>{throw Error(url);}},
      "@/components/ui/Container":{Container:({children})=>React.createElement("div",null,children)},
      "@/components/community/ContentModerationManagement":{ContentModerationManagement:()=>React.createElement("p",null,"AUTHORIZED CONTENT")},
    }).default;
    if(scenario==="anonymous") await assert.rejects(route({searchParams:Promise.resolve({})}),/login/);
    else {const html=renderToStaticMarkup(await route({searchParams:Promise.resolve({type:"course"})}));assert.equal(html.includes("AUTHORIZED CONTENT"),scenario==="success");}
  }
});

test("existing public read definitions change only hidden-comment filtering; SEC01 is not redefined",()=>{
  const sqlRead=name=>readFileSync(new URL(`../../../supabase/migrations/${name}`,import.meta.url),"utf8").replace(/\r/g,"");
  const candidate=sqlRead("20261005000100_pul_sec02_content_moderation.sql");
  const original=sqlRead("20260824000100_pul_community_core_foundation.sql");
  const extract=(sql,name)=>{const start=sql.indexOf(`function public.${name}(`);assert.ok(start>=0);return sql.slice(start,sql.indexOf("\n$$;",start)+4);};
  for(const name of ["list_community_posts","get_community_post","list_community_comments"]) {
    assert.equal(extract(candidate,name).replaceAll(" and comment.moderation_hidden_at is null",""),extract(original,name));
  }
  assert.doesNotMatch(candidate,/create(?: or replace)? function (?:private\.check_public_create_limit|public\.(?:mutate_community_post|mutate_community_comment|submit_course_discussion_post|submit_certification_study_post))\(/);
});
