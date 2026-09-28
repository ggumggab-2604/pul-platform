// Run existing behavioral suites against 1F-B3 without editing their baselines.
// The original setup first verifies its own migration, then applies the remaining
// migrations to its unique disposable Docker project before behavioral tests.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const out=mkdtempSync(path.join(tmpdir(),'pul-course-broadcast-regression-'));
const foundation='20261012000100_pul_course_notification_subscription_foundation.sql';
const candidate='20261013000100_pul_course_operational_broadcast.sql';
const suites=['src/lib/messaging/messagingRpc.test.mjs','src/lib/messaging/marketMessagingRpc.test.mjs','src/lib/messaging/broadcastRpc.test.mjs','src/lib/messaging/clubBroadcastRpc.test.mjs','src/lib/messaging/clubEventBroadcastRpc.test.mjs','src/lib/courses/courseNotificationsRpc.test.mjs'];
for(const [index,file]of suites.entries()){
 const original=path.join(repo,file),url=pathToFileURL(original).href;
 let source=readFileSync(original,'utf8').replaceAll('import.meta.url',JSON.stringify(url))
  .replace(/(['"])\.\.\/market\/marketTestEnvironment\.mjs\1/g,JSON.stringify(pathToFileURL(path.join(repo,'src/lib/market/marketTestEnvironment.mjs')).href));
 const extra=(file.includes('courseNotifications')?[candidate]:[foundation,candidate]).map(n=>readFileSync(path.join(repo,'supabase/migrations',n),'utf8')).join('\n');
 const after=source.indexOf('\nafter(');assert.ok(after>0);
 const marker=source.lastIndexOf('\n});',after);assert.ok(marker>source.indexOf('before('));
 source=source.slice(0,marker)+`\n  ok(sql(${JSON.stringify('begin;\n'+extra+'\ncommit;')}));console.log('Regression runs on 1F-B3 candidate');\n`+source.slice(marker);
 const generated=path.join(out,path.basename(file));writeFileSync(generated,source);
 const env={...process.env,PUL_DISPOSABLE_TEST_PORT:process.env.PUL_DISPOSABLE_TEST_PORT??'45321',PUL_MESSAGING_MARKET_CANDIDATE:'1',PUL_MESSAGING_BROADCAST_CANDIDATE:'1',PUL_MESSAGING_CLUB_CANDIDATE:'1',PUL_MESSAGING_EVENT_CANDIDATE:'1'};
 delete env.NODE_TEST_CONTEXT;
 console.log(`Regression ${index+1}/${suites.length}: ${file}`);
 let output='';
 const status=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--test',generated],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const stream of [p.stdout,p.stderr])stream.on('data',b=>{output+=b;process.stdout.write(b);});
  p.on('error',reject);p.on('close',resolve);
 });
 writeFileSync(path.join(out,path.basename(file)+'.log'),output);
 assert.equal(status,0,`Regression failure: ${file}; log directory ${out}`);
}
console.log('All six existing suites passed against 1F-B3. Logs: '+out);
