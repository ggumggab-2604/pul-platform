import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
function load(name,globals={},deps={}){const exports={};const code=ts.transpileModule(readFileSync(new URL(name,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports,require:p=>deps[p],File,Blob,FormData,Response,URL,Buffer,Uint8Array,DataView,Map,WeakMap,...globals});return exports;}
const policy=load("photoPolicy.ts");
const jpeg=(size=30)=>new File([new Uint8Array([255,216,255]),new Uint8Array(size-3)],"photo.jpg",{type:"image/jpeg",lastModified:1});
function browser({width=4000,height=3000,fail=false,outputBytes=1000}={}){let encodes=0,decodes=0,closed=0;let drawn=[];const canvas={width:0,height:0,getContext:()=>({clearRect(){},drawImage(bitmap,x,y,w,h){drawn=[w,h];}}),toBlob(cb,mime){encodes++;cb(fail?null:new Blob([new Uint8Array(outputBytes)],{type:mime}));}};const api=load("preparePhoto.ts",{createImageBitmap:async()=>{decodes++;return {width,height,close(){closed++;}}},requestAnimationFrame:cb=>cb(),document:{createElement:()=>canvas}},{"./photoPolicy":policy});return {api,stats:()=>({encodes,decodes,closed}),dimensions:()=>drawn};}
test("small photos keep exact File and retry uses one decode",async()=>{const b=browser({width:800,height:600}),f=jpeg();assert.equal(await b.api.preparePhoto(f),f);assert.equal(await b.api.preparePhoto(f),f);assert.deepEqual(b.stats(),{encodes:0,decodes:1,closed:1});});
test("large photo is transformed before form and cached without recompressing",async()=>{const b=browser(),f=jpeg(5_000_000);const out=await b.api.preparePhoto(f);assert.equal(out.size,1000);assert.equal(out.type,"image/jpeg");const form=await b.api.photoUploadForm(f,{requestId:"same"});assert.equal(form.get("file").size,1000);assert.equal(b.stats().encodes,1);});
test("low-byte oversized original cannot escape the pixel ceiling",async()=>{const b=browser({outputBytes:500}),f=jpeg(100);const out=await b.api.preparePhoto(f);assert.notEqual(out,f);assert.equal(out.size,500);});
test("purpose ceilings and ordered processing messages are fixed",()=>{assert.equal(policy.PHOTO_MAX_EDGE.photo,800);assert.equal(policy.PHOTO_MAX_EDGE.document,2560);assert.throws(()=>policy.validatePhotoPixels(801,400,"photo"));assert.throws(()=>policy.validatePhotoPixels(2561,400,"document"));assert.match(policy.photoProcessingMessage(2,5),/2\/5장/);});
test("conversion failure never falls back, failure can retry",async()=>{const b=browser({fail:true}),f=jpeg(5_000_000);await assert.rejects(b.api.preparePhoto(f));await assert.rejects(b.api.preparePhoto(f));assert.equal(b.stats().decodes,2);assert.equal(b.stats().closed,2);});
test("input, animation, forged and transfer limits reject",async()=>{assert.throws(()=>policy.validatePhotoInput({name:"large.jpg",type:"image/jpeg",size:33*1024*1024}));assert.throws(()=>policy.validatePhotoTransfer({size:4_000_001}));const b=browser();await assert.rejects(b.api.preparePhoto(new File(["wrong"],"fake.png",{type:"image/png"})));await assert.rejects(b.api.preparePhoto(new File(["wrong"],"photo.heic",{type:"image/heic"})));const bytes=new Uint8Array(32);bytes.set([137,80,78,71,13,10,26,10]);bytes.set([97,99,84,76],12);await assert.rejects(b.api.preparePhoto(new File([bytes],"animated.png",{type:"image/png"})));assert.equal(b.stats().decodes,0);});
test("server reader rejects bypass file bytes and multipart bytes",async()=>{const api=load("photoRequest.ts",{},{"./photoPolicy":policy});const form=new FormData();form.set("file",jpeg(4_000_001));await assert.rejects(api.readPhotoForm(new Request("http://local/upload",{method:"POST",body:form})));await assert.rejects(api.readPhotoForm(new Request("http://local/upload",{method:"POST",body:new Uint8Array(4_200_001)})));assert.equal(api.photoOriginMatches(new Request("http://internal/upload",{headers:{host:"localhost:57944",origin:"http://localhost:57944"}})),true);assert.equal(api.photoOriginMatches(new Request("http://internal/upload",{headers:{host:"localhost:57944",origin:"https://foreign.example"}})),false);});

test("output uses the fixed ceiling for portrait/document; small files do not wait for paint",async()=>{
 const portrait=browser({width:2400,height:3600}),document=browser({width:4600,height:3200});
 await portrait.api.preparePhoto(jpeg(100));assert.deepEqual(portrait.dimensions(),[533,800]);
 await document.api.preparePhoto(jpeg(100),{purpose:"document"});assert.deepEqual(document.dimensions(),[2560,1781]);
 const small=browser({width:500,height:300});let phases=0;const f=jpeg();
 await small.api.preparePhoto(f,{onProcessing:()=>phases++});await small.api.preparePhoto(f,{onProcessing:()=>phases++});
 assert.equal(phases,1);assert.equal(small.stats().encodes,0);
 await assert.rejects(document.api.preparePhoto(jpeg(),{purpose:"oversized"}));
});

test("mixed policy route still enforces image multipart while PDF behavior stays separate",async()=>{
 const api=load("photoRequest.ts",{},{ "./photoPolicy":policy });const form=new FormData();
 form.set("file",jpeg(30));form.set("extra","x".repeat(4_200_001));
 await assert.rejects(api.readPhotoForm(new Request("http://local/upload",{method:"POST",body:form}),true));
 const pdf=new FormData();pdf.set("file",new File(["%PDF-",new Uint8Array(4_300_000)],"evidence.pdf",{type:"application/pdf"}));
 assert.equal((await api.readPhotoForm(new Request("http://local/upload",{method:"POST",body:pdf}),true)).get("file").type,"application/pdf");
});
