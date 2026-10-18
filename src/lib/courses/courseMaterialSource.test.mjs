import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import ts from "typescript";
const code=ts.transpileModule(readFileSync(new URL("./courseMaterialSource.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {materialSource,materialSourceUrl}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
test("source web URLs support channels, sites, blogs and HTTP independently of video rules",()=>{
 for(const url of ["https://www.youtube.com/@danuriparkgolf","http://example.org/blog?a=1&b=2#post","https://blog.example.com/글","https://example.com:8443/","http://[::1]:8080/page","https://예시.한국/자료"]){assert.equal(materialSourceUrl(url),new URL(url).href);}
 assert.equal(materialSourceUrl("  HTTPS://EXAMPLE.ORG  "),"https://example.org/");
});
test("blank source link clears; non-web schemes, credentials and malformed URLs are refused",()=>{
 for(const v of [null,undefined,"","   "])assert.equal(materialSourceUrl(v),null);
 for(const v of ["javascript:alert(1)","data:text/html,<script>","vbscript:alert(1)","ftp://example.org/a","//example.org","https://","https://u:p@example.org","https://example.org\\evil","https://example.org/a\nb","https://example.org:99999/","https://[:::]/",42,{},"https://example.org/"+"x".repeat(2048)])assert.throws(()=>materialSourceUrl(v));
});
test("all optional source combinations have independent display values",()=>{
 const url="https://www.youtube.com/@danuriparkgolf";
 assert.deepEqual(materialSource("다누리파크골프클럽",url),{name:"다누리파크골프클럽",url});
 assert.deepEqual(materialSource("다누리파크골프클럽",null),{name:"다누리파크골프클럽",url:null});
 assert.deepEqual(materialSource(null,url),{name:null,url});assert.deepEqual(materialSource(null,null),{name:null,url:null});
});
test("legacy URL-only source is interpreted without data conversion; ordinary/HTML names stay text",()=>{
 assert.deepEqual(materialSource("https://example.org/channel"),{name:null,url:"https://example.org/channel"});
 for(const name of ["기존 제작자","<img src=x onerror=alert(1)>","javascript:alert(1)"])assert.deepEqual(materialSource(name),{name,url:null});
 assert.deepEqual(materialSource("이름","javascript:alert(1)"),{name:"이름",url:null});
});
