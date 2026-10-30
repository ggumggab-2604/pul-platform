import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript'),cache={};
function load(name){
 if(cache[name])return cache[name];
 const code=ts.transpileModule(fs.readFileSync(path.join(import.meta.dirname,name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m={exports:{}};
 new Function('require','module','exports',code)(id=>{if(id==='client-only')return {};if(id==='./clubApplicationDetails')return load('clubApplicationDetails');throw Error('Unexpected dependency '+id);},m,m.exports);
 return cache[name]=m.exports;
}
const {validateMembershipApplicationForm:validate,submitMembershipApplication:submit}=load('membershipApplication');
const {emptyClubApplicationDetails:empty,applicationAvailableDay:day}=load('clubApplicationDetails');
const base=()=>({details:{...empty,fullName:'합성 신청자',phone:'00000000000',days:[]},rules:'',interests:[],applicationReason:'',message:'',rulesConfirmed:false,courtesyConfirmed:true,scheduleConfirmed:false});

test('name and phone only never invent experience, days, notes or rule/schedule confirmation',()=>{
 const r=validate(base());assert.equal(r.ok,true);assert.equal(r.value.experience,'notProvided');assert.equal(r.value.availableDay,'notProvided');assert.deepEqual(r.value.details.days,[]);assert.deepEqual(r.value.interests,[]);assert.equal(r.value.message,null);assert.equal(r.value.applicationReason,'');assert.equal(r.value.rulesConfirmed,false);assert.equal(r.value.scheduleConfirmed,false);assert.deepEqual(r.value.details.confirmations,{rules:false,courtesy:true,schedule:false,rulesText:''});
});
test('registered rules require the actual acknowledgement; no rule cannot be claimed confirmed',()=>{
 assert.equal(validate({...base(),rules:'등록된 회칙'}).ok,false);
 assert.equal(validate({...base(),courtesyConfirmed:false}).ok,false);
 assert.equal(validate({...base(),rulesConfirmed:true}).ok,false);
 const r=validate({...base(),rules:'등록된 회칙\n둘째 줄',rulesConfirmed:true});assert.equal(r.ok,true);assert.equal(r.value.details.confirmations.rulesText,'등록된 회칙\n둘째 줄');assert.equal(r.value.scheduleConfirmed,false);
});
test('Monday to Sunday selections map to the existing category without inventing flexible days',()=>{
 assert.equal(day([]),'notProvided');assert.equal(day(['월','금']),'weekday');assert.equal(day(['토']),'weekend');assert.equal(day(['일']),'weekend');assert.equal(day(['화','일']),'both');
 const r=validate({...base(),details:{...base().details,days:['화','일']}});assert.equal(r.value.availableDay,'both');assert.deepEqual(r.value.details.days,['화','일']);
});
test('optional selections and the single note preserve exactly the supplied meaning',()=>{
 const input={...base(),experience:'oneToThreeYears',interests:['regularRound','beginnerEducation'],message:'  운영진에게 보내는 합성 질문  ',details:{...base().details,level:'초급',lessonNeeded:'상담 후 결정',otherClubs:'가입 중 · 합성 동호회',averageScore:65,holes:18,days:['수']}};
 const r=validate(input);assert.equal(r.ok,true);assert.equal(r.value.experience,'oneToThreeYears');assert.equal(r.value.applicationReason,'');assert.equal(r.value.message,'운영진에게 보내는 합성 질문');assert.equal(r.value.details.previousActivity,'');assert.equal(r.value.details.otherClubs,input.details.otherClubs);assert.deepEqual(r.value.interests,input.interests);
});
test('score and basis validation remains paired and bounded',()=>{
 for(const [averageScore,holes] of [[60,null],[0,18],[10000,36],[60,9],[1.5,18]])assert.equal(validate({...base(),details:{...base().details,averageScore,holes}}).ok,false);
 assert.equal(validate({...base(),details:{...base().details,averageScore:99,holes:36}}).ok,true);
});
test('required contact, note limit and invalid choice validation remain enforced',()=>{
 assert.equal(validate({...base(),details:{...base().details,fullName:''}}).ok,false);assert.equal(validate({...base(),details:{...base().details,phone:'123'}}).ok,false);assert.equal(validate({...base(),message:'가'.repeat(501)}).ok,false);assert.equal(validate({...base(),experience:'not-a-code'}).ok,false);assert.equal(validate({...base(),details:{...base().details,days:['미정']}}).ok,false);
});
test('RPC transport sends actual false booleans and the same private confirmation snapshot',async()=>{
 const r=validate(base());assert.equal(r.ok,true);let actual;
 const client={rpc:async(name,args)=>{actual={name,args};return {error:null,data:[{request_id:'request',application_id:'application',previous_status:null,current_status:'submitted',application_version:1,changed:true,replayed:false,outcome:'submitted'}]};}};
 await submit(client,'club',r.value,'request');assert.equal(actual.name,'submit_club_membership_application_v2');assert.equal(actual.args.p_rules_confirmed,false);assert.equal(actual.args.p_courtesy_confirmed,true);assert.equal(actual.args.p_schedule_confirmed,false);assert.deepEqual(actual.args.p_details.confirmations,r.value.details.confirmations);assert.equal(actual.args.p_available_day_code,'notProvided');assert.equal(actual.args.p_application_reason,'');assert.equal(actual.args.p_message,null);
});
