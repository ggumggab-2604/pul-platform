import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(path,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const candidate = read("../../../supabase/migrations/20261004000100_pul_sec01_public_create_limits.sql");
async function moduleAt(path) {
  const result=ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
  assert.equal(result.diagnostics.length,0);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
}
const community=await moduleAt("./community.ts");
const course=await moduleAt("../courses/courseDiscussions.ts");
const certification=await moduleAt("../certification/certificationStudyPosts.ts");
const paths=[
  ["community post",community.CommunityError,(c)=>community.mutateCommunityPost(c,"create",null,null,{category:"free",title:"SEC01 test",body:"SEC01 valid public body"})],
  ["community comment",community.CommunityError,(c)=>community.mutateCommunityComment(c,"create","12345678-1234-4234-8234-123456789012",null,null,"SEC01 valid comment")],
  ["course discussion",course.CourseDiscussionError,(c)=>course.submitCourseDiscussionPost(c,"course-1","SEC01 valid public body")],
  ["certification study",certification.CertificationStudyPostError,(c)=>certification.submitCertificationStudyPost(c,"SEC01 valid public body")],
];
for(const [name,ErrorType,call] of paths) {
  for(const [message,code] of [["PUL_CREATE_COOLDOWN","cooldown"],["PUL_CREATE_DUPLICATE","duplicate"],["PUL_CREATE_QUOTA","quota"]]) {
    test(`${name}: ${code} maps to a safe actionable error without login/refresh`,async()=>{
      await assert.rejects(call({rpc:async()=>({data:null,error:{code:"P0001",message,details:"private fixture detail"}})}),(error)=>{
        assert.ok(error instanceof ErrorType);
        assert.equal(error.code,code);
        assert.match(error.userMessage,/작성|등록/);
        assert.doesNotMatch(error.userMessage,/PUL_CREATE|private fixture/);
        assert.notEqual(error.shouldRefresh,true);
        return true;
      });
    });
  }
  test(`${name}: unknown database error stays redacted`,async()=>{
    await assert.rejects(call({rpc:async()=>({data:null,error:{message:"private fixture detail"}})}),(error)=>error.code==="unknown"&&!error.userMessage.includes("private fixture"));
  });
}

test("candidate preserves every original RPC statement except the create guard/timestamps",()=>{
  for(const [file,name,scope] of [
    ["20260824000100_pul_community_core_foundation.sql","mutate_community_post","community_post"],
    ["20260824000100_pul_community_core_foundation.sql","mutate_community_comment","community_comment"],
    ["20260906000100_pul_course_discussion_posts.sql","submit_course_discussion_post","course_discussion"],
    ["20260908000100_pul_certification_study_posts.sql","submit_certification_study_post","certification_study"],
  ]) {
    const original=read("../../../supabase/migrations/"+file);
    const extract=(s)=>s.slice(s.indexOf("function public."+name+"("),s.indexOf("\n$$;",s.indexOf("function public."+name+"("))+4);
    let revised=extract(candidate).replace("  v_created_at timestamptz;\n","");
    revised=revised.replace(new RegExp(" +v_created_at := private.check_public_create_limit\\('"+scope+"', v_body\\);\\n\\n"),"");
    if(name==="mutate_community_comment") {
      revised=revised.replace("body, created_at, updated_at)","body)").replace("v_body, v_created_at, v_created_at)","v_body)");
    } else {
      revised=revised.replace(/,\n +created_at,\n +updated_at/,"").replace(/,\n +v_created_at,\n +v_created_at/,"");
    }
    assert.equal(revised,extract(original),name);
  }
  assert.doesNotMatch(candidate,/create table|create index|alter table|create trigger|grant execute/i);
});
