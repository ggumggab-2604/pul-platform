import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript"),sharp=require("sharp");
function load(name,deps={}) { const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(name,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:p=>deps[p],Buffer});return exports; }
const policy=load("photoPolicy.ts"), api=load("validatePhotoBytes.ts",{"server-only":{},"sharp":sharp,"./photoPolicy":policy});
test("actual bytes enforce purpose ceilings despite tiny files/forged metadata",async()=>{
 const big=await sharp({create:{width:1600,height:1200,channels:3,background:"#fff"}}).png().toBuffer();
 assert.ok(big.length<4_000_000);await assert.rejects(api.validatePhotoBytes(big,"image/png","photo"));
 assert.equal((await api.validatePhotoBytes(big,"image/png","document")).width,1600);
 await assert.rejects(api.validatePhotoBytes(big,"image/jpeg","document"));
 const hugeDoc=await sharp({create:{width:2561,height:1,channels:3,background:"#fff"}}).png().toBuffer();
 await assert.rejects(api.validatePhotoBytes(hugeDoc,"image/png","document"));
});
test("valid maximum, transparent small and EXIF-tagged portrait remain readable",async()=>{
 const alpha=await sharp({create:{width:500,height:300,channels:4,background:{r:0,g:200,b:0,alpha:0}}}).png().toBuffer();
 assert.equal((await api.validatePhotoBytes(alpha,"image/png","photo")).height,300);assert.equal((await sharp(alpha).metadata()).hasAlpha,true);
 const portrait=await sharp({create:{width:533,height:800,channels:3,background:"#eee"}}).jpeg().toBuffer();
 assert.equal((await api.validatePhotoBytes(portrait,"image/jpeg","photo")).height,800);
 const oriented=await sharp({create:{width:800,height:533,channels:3,background:"#eee"}}).jpeg().withMetadata({orientation:6}).toBuffer();
 assert.equal((await api.validatePhotoBytes(oriented,"image/jpeg","photo")).width,800);assert.equal((await sharp(oriented).metadata()).orientation,6);
 const doc=await sharp({create:{width:2560,height:1781,channels:3,background:"#fff"}}).png().toBuffer();
 assert.equal((await api.validatePhotoBytes(doc,"image/png","document")).width,2560);
});
test("malformed/truncated and over-byte file fail closed",async()=>{
 await assert.rejects(api.validatePhotoBytes(Buffer.from([255,216,255,0]),"image/jpeg","photo"));
 await assert.rejects(api.validatePhotoBytes(Buffer.alloc(4_000_001),"image/png","photo"));
 const full=await sharp({create:{width:800,height:600,channels:3,background:"#eee"}}).jpeg().toBuffer();
 await assert.rejects(api.validatePhotoBytes(full.subarray(0,full.length-20),"image/jpeg","photo"));
});
