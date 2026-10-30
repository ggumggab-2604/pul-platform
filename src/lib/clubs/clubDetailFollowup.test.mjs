import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {createRequire} from "node:module";
import ts from "typescript";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";

const require=createRequire(import.meta.url),source=fs.readFileSync(new URL("../../components/clubs/detail/ClubLinkedCourses.tsx",import.meta.url),"utf8");
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const compiled={exports:{}};
new Function("require","module","exports",code)(name=>{
 if(name==="next/link")return{default:({children,...props})=>React.createElement("a",props,children)};
 if(name.endsWith(".module.css"))return{default:{panel:"panel"}};
 if(name.startsWith("@/"))return{};
 return require(name);
},compiled,compiled.exports);
const {initialClubCourseKey,ClubLinkedCourseProvider,ClubLinkedCourses,ClubLinkedCourseResources}=compiled.exports;
const courses=[{courseKey:"synthetic-a",name:"합성 A 구장",courseType:"field"},{courseKey:"synthetic-b",name:"합성 B 구장",courseType:"field"}];

test("legacy multiple field links remain unselected and all choices stay available",()=>{
 assert.equal(initialClubCourseKey(courses),null);
 const before=JSON.stringify(courses);
 const html=renderToStaticMarkup(React.createElement(ClubLinkedCourseProvider,{courses,overviews:{},failed:false,overviewFailed:[]},React.createElement(React.Fragment,null,React.createElement(ClubLinkedCourses),React.createElement(ClubLinkedCourseResources))));
 assert.match(html,/합성 A 구장/);assert.match(html,/합성 B 구장/);assert.match(html,/확인할 활동 구장을 선택/);assert.doesNotMatch(html,/data-selected-course=/);assert.doesNotMatch(html,/기존 복수|연결 정리/);assert.equal(JSON.stringify(courses),before);
});

test("the existing single field/screen selection convention stays unchanged",()=>{
 assert.equal(initialClubCourseKey([]),null);assert.equal(initialClubCourseKey([courses[0]]),"synthetic-a");
 assert.equal(initialClubCourseKey([courses[0],{...courses[1],courseType:"screen"}]),"synthetic-a");
});
