import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source=readFileSync(new URL("./messaging.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={};new Function("require","exports",output)(name=>{assert.equal(name,"server-only");return {};},m);
const a="11111111-1111-4111-8111-111111111111", b="22222222-2222-4222-8222-222222222222";
const at="2026-09-19T01:02:03.123456+00:00";
const receipt={id:a,created_at:at};
const summary={id:a,counterpart_display:"PUL 회원",preview:"미리보기",at,read_at:null,is_reply:false};
const detail={id:a,body:"본문",counterpart_user_id:b,counterpart_display:"PUL 회원",created_at:at,reply_to_message_id:null,is_recipient:true,read_at:null};
const report={id:a,message_id:b,body:"신고 원문",sender_display:"PUL 회원",reporter_display:"PUL 회원",reason:"spam",detail:"신고 설명",status:"open",created_at:at,message_created_at:at,resolved_at:null};
function client(data,error=null){return{calls:[],async rpc(name,args){this.calls.push({name,args});return{data,error};}};}
const error=code=>e=>e instanceof m.MessagingError && e.code===code;

test("1D market send allowlists only listing/body/request; identifiers and body validated before RPC",async()=>{
  const c=client(receipt);
  await m.sendMarketListingMessage(c,{listingId:b,body:"  문의  ",requestId:a,seller_user_id:a,sender_user_id:b,recipientId:a});
  assert.deepEqual(c.calls,[{name:"send_market_listing_message",args:{p_listing_id:b,p_body:"문의",p_request_id:a}}]);
  for(const input of [null,{listingId:"bad",body:"ok",requestId:a},{listingId:b,body:"",requestId:a},{listingId:b,body:"ok",requestId:"bad"}]) await assert.rejects(m.sendMarketListingMessage(c,input),error("invalid"));
  assert.equal(c.calls.length,1);
});
test("1E broadcast send forwards only body/request and rejects invalid input before RPC",async()=>{
 const c=client({...receipt,recipient_count:3,recipients:[b]});
 assert.deepEqual(await m.sendPlatformBroadcast(c,{body:" 공지 ",requestId:a,senderId:b,recipients:[a]}),{id:a,createdAt:at,recipientCount:3});
 assert.deepEqual(c.calls,[{name:"send_platform_broadcast",args:{p_body:"공지",p_request_id:a}}]);
 for(const input of [null,{body:"",requestId:a},{body:"x",requestId:"bad"},{body:"가".repeat(2001),requestId:a}])await assert.rejects(m.sendPlatformBroadcast(c,input),error("invalid"));
});
test("1E preview and receipt count boundaries fail closed",async()=>{
 for(const n of [0,1,10000,10001])assert.equal((await m.previewPlatformBroadcast(client({recipient_count:n,maximum:10000,can_send:n>=1&&n<=10000}))).recipientCount,n);
 for(const data of [{recipient_count:1,maximum:10000,can_send:false},{recipient_count:10002,maximum:10000,can_send:false},{recipient_count:1,maximum:9999,can_send:true}])await assert.rejects(m.previewPlatformBroadcast(client(data)),error("unknown"));
 for(const n of [0,10001,-1,"1",1.2])await assert.rejects(m.sendPlatformBroadcast(client({...receipt,recipient_count:n}),{body:"x",requestId:a}),error("unknown"));
});
test("1E broadcast detail removes personal identity and rejects malformed kinds/relations",async()=>{
 const raw={...detail,kind:"platform_broadcast",counterpart_user_id:null,counterpart_display:"private name"};
 const dto=await m.getMessage(client(raw),a);assert.equal(dto.counterpartDisplay,"PUL 공지");assert.equal(dto.kind,"platform_broadcast");
 for(const change of [{kind:"unknown"},{counterpart_user_id:b},{reply_to_message_id:b},{is_recipient:false}])await assert.rejects(m.getMessage(client({...raw,...change}),a),error("unknown"));
 assert.equal((await m.getMessage(client(detail),a)).kind,"direct");
 const page=await m.listMessageInbox(client({items:[{...summary,kind:"platform_broadcast",counterpart_display:"private name"}],has_more:false,next_cursor:null}));assert.equal(page.items[0].counterpartDisplay,"PUL 공지");
});
test("1E management DTOs omit recipient lists/body from summaries and validate exact detail/cursor",async()=>{
 const raw={...receipt,body:"공지",recipient_count:2,sender_display:"PUL 운영자 (나)",recipients:[b]};
 const dto=await m.getPlatformBroadcast(client(raw),a);assert.equal(dto.body,"공지");assert.equal(Object.hasOwn(dto,"recipients"),false);
 await assert.rejects(m.getPlatformBroadcast(client({...raw,id:b}),a),error("unknown"));
 const c=client({items:[{id:a,at,preview:"공지",recipient_count:2,body:"SECRET",recipients:[b]}],has_more:true,next_cursor:{at,id:a}});
 const page=await m.listPlatformBroadcasts(c,{limit:1});assert.deepEqual(page.items,[{id:a,at,preview:"공지",recipientCount:2}]);assert.deepEqual(page.nextCursor,{at,id:a});
 assert.deepEqual(c.calls[0].args,{p_limit:1,p_cursor_at:null,p_cursor_id:null});
});
test("1D context returns only safe projection and strips private fields, including inaccessible fallback",async()=>{
  const c=client({available:true,listing_id:b,title:"장터 글",status:"selling",phone:"SECRET",seller_user_id:a,description:"SECRET"});
  assert.deepEqual(await m.getMarketMessageComposeContext(c,b),{available:true,listingId:b,title:"장터 글",status:"selling"});
  assert.equal(JSON.stringify(await m.getMessageMarketContext(c,a)).includes("SECRET"),false);
  assert.deepEqual(await m.getMessageMarketContext(client({available:false,listing_id:b,title:"SECRET"}),a),{available:false});
  assert.equal(await m.getMessageMarketContext(client(null),a),null);
});
test("1D rejects malformed/mismatched compose context, unsafe state, oversized title and unknown raw errors",async()=>{
  const base={available:true,listing_id:b,title:"글",status:"selling"};
  for(const v of [null,{},false,{...base,listing_id:a},{...base,status:"sold"},{...base,status:"removed"},{...base,title:"가".repeat(101)}]) await assert.rejects(m.getMarketMessageComposeContext(client(v),b),error("unknown"));
  await assert.rejects(m.sendMarketListingMessage(client(null,{message:"SQL SECRET"}),{listingId:b,body:"x",requestId:a}),e=>error("unknown")(e)&&!e.message.includes("SECRET"));
});

test("1B-1 block list forwards only bounded cursor fields and projects minimal DTO",async()=>{
  const row={blocked_user_id:b,counterpart_display:"PUL 회원",blocked_at:at,email:"SECRET",body:"SECRET",blocker_user_id:a};
  const c=client({items:[row],has_more:true,next_cursor:{at,id:b}});
  const result=await m.listMessageBlocks(c,{limit:1,cursor:{at,id:a},blocker_user_id:b,actorId:b});
  assert.deepEqual(c.calls,[{name:"list_messaging_blocks",args:{p_limit:1,p_cursor_at:at,p_cursor_id:a}}]);
  assert.deepEqual(result,{items:[{blockedUserId:b,counterpartDisplay:"PUL 회원",blockedAt:at}],hasMore:true,nextCursor:{at,id:b}});
});

test("1B-1 block list validates default/max, malformed input and empty page",async()=>{
  const c=client({items:[],has_more:false,next_cursor:null});
  assert.deepEqual(await m.listMessageBlocks(c),{items:[],hasMore:false,nextCursor:null});
  assert.equal(c.calls[0].args.p_limit,20);await m.listMessageBlocks(c,{limit:50});assert.equal(c.calls[1].args.p_limit,50);
  for(const input of [null,{limit:0},{limit:51},{limit:1.5},{cursor:{at:"infinity",id:a}},{cursor:{at,id:"bad"}}])await assert.rejects(m.listMessageBlocks(c,input),error("invalid"));
  assert.equal(c.calls.length,2);
});

test("1B-1 block DTO rejects malformed fields, oversized pages and inconsistent cursors",async()=>{
  const row={blocked_user_id:b,counterpart_display:"PUL 회원",blocked_at:at};
  const wrap=items=>({items,has_more:false,next_cursor:null});
  for(const payload of [null,{},wrap([row,row]),wrap([{...row,blocked_user_id:"bad"}]),wrap([{...row,blocked_at:"bad"}]),wrap([{...row,counterpart_display:"가".repeat(101)}]),{items:[],has_more:true,next_cursor:{at,id:b}},{items:[row],has_more:true,next_cursor:{at,id:a}},{items:[row],has_more:true,next_cursor:{at:"2026-09-19T01:02:03.123+00:00",id:b}},{...wrap([row]),next_cursor:{at,id:b}},{...wrap([row]),has_more:"true"}])
    await assert.rejects(m.listMessageBlocks(client(payload),{limit:1}),error("unknown"));
});

test("1B-1 block list retains safe account/permission/transport error mapping",async()=>{
  for(const [raw,code] of [["messaging_account_unavailable","account"],["messaging_permission","permission"],["SQL SECRET","unknown"]])await assert.rejects(m.listMessageBlocks(client(null,{message:raw})),e=>error(code)(e)&&!e.message.includes("SECRET"));
  await assert.rejects(m.listMessageBlocks({rpc(){throw Error("SECRET");}}),error("unknown"));
});
test("Unicode codepoint length, whitespace-only and no NUL; markup remains plain text",()=>{
  assert.equal(m.validateMessageBody(" \u0085\u3000한글 😀\n문의\u00a0 "),"한글 😀\n문의");
  assert.equal(m.validateMessageBody("😀".repeat(2000)),"😀".repeat(2000));
  assert.equal(m.validateMessageBody("<script>x</script> https://example.invalid"),"<script>x</script> https://example.invalid");
  for(const v of [null,{},"", "\n\u0085\u00a0", "가".repeat(2001),"a\0b"])assert.throws(()=>m.validateMessageBody(v),error("invalid"));
});
test("page boundaries and opaque microsecond timestamp retained",()=>{
  assert.deepEqual(m.validateMessagePage(),{p_limit:20,p_cursor_at:null,p_cursor_id:null});
  assert.equal(m.validateMessagePage({limit:50,cursor:{at,id:a}}).p_cursor_at,at);
  for(const x of [{limit:0},{limit:51},{limit:1.2},{cursor:{id:a,at:"infinity"}},{cursor:{id:"x",at}},null])assert.throws(()=>m.validateMessagePage(x),error("invalid"));
});
test("send and reply forward only allowlisted fields and never actor IDs",async()=>{
  const c=client(receipt);
  assert.deepEqual(await m.sendMessage(c,{recipientId:b,body:"  본문  ",requestId:a,sender_user_id:b}),{id:a,createdAt:at});
  assert.deepEqual(c.calls[0],{name:"send_messaging_message",args:{p_recipient_id:b,p_body:"본문",p_request_id:a}});
  await m.replyMessage(c,{messageId:a,body:"답장",requestId:b,recipientId:"forged",actorId:"forged"});
  assert.deepEqual(c.calls[1],{name:"reply_messaging_message",args:{p_message_id:a,p_body:"답장",p_request_id:b}});
  await assert.rejects(m.sendMessage(c,{recipientId:"bad",body:"x",requestId:a}),error("invalid"));
  await assert.rejects(m.replyMessage(c,null),error("invalid"));assert.equal(c.calls.length,2);
});
test("safe errors never echo SQL/body/tokens or thrown transport errors",async()=>{
  for(const [raw,expected] of Object.entries({messaging_login:"login",messaging_account_unavailable:"account",messaging_recipient_unavailable:"recipient",messaging_not_found:"missing",messaging_permission:"permission",messaging_cooldown:"cooldown",messaging_quota:"quota",messaging_recipient_quota:"quota",messaging_new_recipient_quota:"quota",messaging_report_quota:"quota",messaging_duplicate:"duplicate",messaging_replay_conflict:"conflict",messaging_retry_transaction:"retry"}))
    await assert.rejects(m.getMessageUnreadCount(client(null,{message:raw})),error(expected));
  await assert.rejects(m.getMessageUnreadCount(client(null,{message:"SQL contains SECRET",code:"XX000"})),e=>error("unknown")(e)&&!e.message.includes("SECRET"));
  for(const key of ["__proto__","constructor","toString"])await assert.rejects(m.getMessageUnreadCount(client(null,{message:key})),error("unknown"));
  await assert.rejects(m.getMessageUnreadCount({rpc(){throw Error("SECRET");}}),error("unknown"));
});
test("inbox/sent parse narrow page and drop unexpected private fields",async()=>{
  const c=client({items:[{...summary,email:"private",body:"must not forward"}],has_more:true,next_cursor:{at,id:a}});
  const page=await m.listMessageInbox(c,{limit:1});assert.equal(page.nextCursor.at,at);assert.equal(page.items[0].counterpartDisplay,"PUL 회원");assert.ok(!JSON.stringify(page).includes("private"));assert.ok(!JSON.stringify(page).includes("must not forward"));
  assert.equal(c.calls[0].name,"list_messaging_inbox");
  const sent=client({items:[summary],has_more:false,next_cursor:null});await m.listMessageSent(sent);assert.equal(sent.calls[0].name,"list_messaging_sent");
});
test("malformed page/summary/cursor DTO rejected",async()=>{
  for(const value of [null,{}, {items:[],has_more:true,next_cursor:{at,id:a}}, {items:[summary],has_more:true,next_cursor:{at,id:b}}, {items:[summary],has_more:false,next_cursor:{at,id:a}}, {items:[{...summary,preview:"a".repeat(101)}],has_more:false,next_cursor:null}, {items:[{...summary,read_at:"bad"}],has_more:false,next_cursor:null}])
    await assert.rejects(m.listMessageInbox(client(value),{limit:1}),error("unknown"));
});
test("detail/prefetch has no implicit mark; explicit open and recipient-only read DTO",async()=>{
  const c=client({...detail,phone:"private"});const dto=await m.getMessage(c,a);assert.equal(c.calls[0].args.p_mark_read,false);assert.ok(!Object.hasOwn(dto,"phone"));
  await m.getMessage(c,a,true);assert.equal(c.calls[1].args.p_mark_read,true);
  await assert.rejects(m.getMessage(client({...detail,is_recipient:false,read_at:at}),a),error("unknown"));
  await assert.rejects(m.getMessage(client({...detail,id:b}),a),error("unknown"));
  await assert.rejects(m.getMessage(c,a,"true"),error("invalid"));
});
test("read/hide/block acknowledgements validated",async()=>{
  assert.deepEqual(await m.markMessageRead(client({id:a,read_at:at}),a),{id:a,readAt:at});
  await m.hideMessage(client({id:a,hidden:true}),a);await m.setMessageBlock(client({blocked:true}),b,true);
  await assert.rejects(m.markMessageRead(client({id:b,read_at:at}),a),error("unknown"));
  await assert.rejects(m.hideMessage(client({id:a,hidden:false}),a),error("unknown"));
  await assert.rejects(m.setMessageBlock(client({blocked:false}),b,true),error("unknown"));
  await assert.rejects(m.setMessageBlock(client({}),b,1),error("invalid"));
});
test("unread is safe nonnegative integer",async()=>{
  assert.equal(await m.getMessageUnreadCount(client(3)),3);
  for(const value of ["3",null,-1,1.5,Number.MAX_SAFE_INTEGER+1])await assert.rejects(m.getMessageUnreadCount(client(value)),error("unknown"));
});
test("report submission validates reason/detail and no reporter ID forwarded",async()=>{
  const c=client({id:a,duplicate:false});await m.submitMessageReport(c,{messageId:b,reason:"spam",detail:" 설명 ",reporterId:b});
  assert.deepEqual(c.calls[0],{name:"submit_messaging_report",args:{p_message_id:b,p_reason:"spam",p_detail:"설명"}});
  for(const input of [{messageId:b,reason:"bad"},{messageId:b,reason:"spam",detail:"가".repeat(1001)},{messageId:b,reason:"spam",detail:3}])await assert.rejects(m.submitMessageReport(c,input),error("invalid"));
  await assert.rejects(m.submitMessageReport(client({id:a,duplicate:"true"}),{messageId:b,reason:"spam"}),error("unknown"));
});
test("report list/detail/resolve: exact target, minimal DTO and no message selector",async()=>{
  const c=client(report);const dto=await m.getMessageReport(c,a);assert.equal(dto.body,report.body);assert.deepEqual(c.calls[0],{name:"get_messaging_report",args:{p_report_id:a}});
  await assert.rejects(m.getMessageReport(client({...report,id:b}),a),error("unknown"));
  await assert.rejects(m.getMessageReport(client({...report,status:"resolved",resolved_at:null}),a),error("unknown"));
  const list=client({items:[{id:a,reason:"spam",status:"open",at}],has_more:false,next_cursor:null});assert.equal((await m.listMessageReports(list)).items.length,1);
  await assert.rejects(m.listMessageReports(list,"all"),error("invalid"));
  await m.resolveMessageReport(client({id:a,status:"resolved"}),a);await assert.rejects(m.resolveMessageReport(client({id:b,status:"resolved"}),a),error("unknown"));
});
test("receipt payload invalidity is not silently accepted",async()=>{
  for(const value of [null,{}, {id:"invalid",created_at:at}, {id:a,created_at:"bad"}])await assert.rejects(m.sendMessage(client(value),{recipientId:b,body:"x",requestId:a}),error("unknown"));
});
test("signup consent definitions remain aligned with existing auth completion",()=>{
  const auth=readFileSync(new URL("../../app/auth/actions.ts",import.meta.url),"utf8");
  const migration=readFileSync(new URL("../../../supabase/migrations/20261006000100_pul_common_messaging_foundation.sql",import.meta.url),"utf8");
  for(const value of ["terms_required","terms-dev-v1","privacy_required","privacy-dev-v1"]){assert.ok(auth.includes(`\"${value}\"`));assert.ok(migration.includes(`'${value}'`));}
  assert.ok(migration.includes("c.decision = 'granted'"));
});
