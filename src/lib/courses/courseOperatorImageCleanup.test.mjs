import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("./courseOperatorImageCleanup.ts", import.meta.url), "utf8").replace('import "server-only";', '').replace('import { contentRpc } from "./courseContent";', 'const contentRpc=async(client,name,args)=>{const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data;};');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { cleanupCourseOperatorImages } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
function service({ ready=false, storageFailure=false, ackFailure=false }={}) {
  const calls=[],state={pending:false,storageFailure,ackFailure};
  return {calls,state,rpc:async(name,args)=>{calls.push(args.p_complete?'ack':'guard');if(ready)return {error:Object.assign(Error('saved'),{code:'42501'})};if(args.p_complete&&state.ackFailure)return {error:Error('ack failed')};state.pending=!args.p_complete;return {data:{removed:args.p_ids}};},storage:{from:bucket=>({remove:async(ids)=>{assert.equal(bucket,'course-operator-images');assert.deepEqual(ids,['own-id']);calls.push('storage');return {error:state.storageFailure?Error('injected storage failure'):null};}})}};
}
test("saved-state rejection never reaches Storage", async () => {
  const client=service({ready:true});
  await assert.rejects(cleanupCourseOperatorImages(client,'actor','course',['own-id']),/saved/);
  assert.deepEqual(client.calls,['guard']);
});
test("Storage failure keeps retry marker and does not acknowledge completion", async () => {
  const client=service({storageFailure:true});
  await assert.rejects(cleanupCourseOperatorImages(client,'actor','course',['own-id']),/정리가 완료되지/);
  assert.equal(client.state.pending,true);assert.deepEqual(client.calls,['guard','storage']);
  client.state.storageFailure=false;
  await cleanupCourseOperatorImages(client,'actor','course',['own-id']);
  assert.equal(client.state.pending,false);assert.deepEqual(client.calls,['guard','storage','guard','storage','ack']);
});
test("DB acknowledgement failure remains retryable after Storage succeeded", async () => {
  const client=service({ackFailure:true});
  await assert.rejects(cleanupCourseOperatorImages(client,'actor','course',['own-id']),/ack failed/);
  assert.equal(client.state.pending,true);
  client.state.ackFailure=false;await cleanupCourseOperatorImages(client,'actor','course',['own-id']);
  assert.equal(client.state.pending,false);
});
