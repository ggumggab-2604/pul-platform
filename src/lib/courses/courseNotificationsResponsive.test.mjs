// Standalone local layout verification of actual mounted component exports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
test('Field/Screen five states at 390/768/1280: no overflow, 44px controls, focusable keyboard targets',async()=>{
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 const out=process.env.PUL_COURSE_NOTIFICATION_ARTIFACTS??path.join(tmpdir(),'pul-course-notifications-ui');
 const runtime=process.env.PUL_MESSAGING_TEST_RUNTIME??path.join(tmpdir(),'pul-messaging-ui-runtime');
 const {chromium}=createRequire(path.join(runtime,'package.json'))('playwright-core');
 const css=readFileSync(path.join(root,'src/app/globals.css'),'utf8').replace('"tailwindcss"',JSON.stringify(path.join(runtime,'node_modules/tailwindcss/index.css').replaceAll('\\','/'))).replace('@source "../";','@source "./*.html";');
 writeFileSync(path.join(out,'input.css'),css);
 const compile=spawnSync(process.execPath,[path.join(runtime,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i',path.join(out,'input.css'),'-o',path.join(out,'app.css')],{encoding:'utf8',windowsHide:true});assert.equal(compile.status,0,compile.stderr);
 const browser=await chromium.launch({executablePath:process.env.PUL_TEST_CHROME??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});const results=[];
 try{
  for(const width of [390,768,1280]){
   const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
   for(const type of ['field','screen'])for(const state of ['signed-out','unsubscribed','subscribed','error','pending']){
    const body=readFileSync(path.join(out,`${type}-${state}.html`),'utf8');await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${readFileSync(path.join(out,'app.css'),'utf8')}</style></head><body>${body}</body></html>`);
    const measured=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(measured.scroll<=width,`${type}/${state}/${width} overflow`);
    const region=page.getByRole('region',{name:'장소 운영알림'});assert.match(await region.innerText(),/할인·광고 수신동의가 아닙니다/);
    const controls=region.locator('button:not(:disabled),a');for(const control of await controls.all()){
     const size=await control.boundingBox();assert.ok(size.height>=44,`${type}/${state}/${width} touch height ${size.height}`);
     await control.focus();assert.equal(await control.evaluate(el=>el===document.activeElement),true);
    }
    if(state==='pending')assert.equal(await region.locator('[aria-busy="true"]').count(),1);
    if(state==='error')assert.equal(await region.getByRole('alert').count(),1);
    await page.screenshot({path:path.join(out,`${type}-${state}-${width}.png`),fullPage:true});results.push({type,state,width,scroll:measured.scroll,pass:true});
   }await page.close();
  }
 }finally{await browser.close();}
 writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log('30 responsive states PASS; screenshots: '+out);
});
