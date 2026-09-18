import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarketQuery, marketHref, MarketRequestEpoch, anchorViews } from './marketNavigation.ts';
test('direct URLs validate view and separate board filters, trim keyword and ignore invalid values', () => {
  const q=new URLSearchParams('view=buy&sale_q=채&buy_q=%20공%20&buy_category=ball&buy_status=closed&buy_region=제주');
  assert.deepEqual(parseMarketQuery(q),{view:'buy',keyword:'공',category:'ball',region:'제주',status:'closed'});
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=oops&home_region=악성')),{view:'home',keyword:'',category:'all',region:'전체',status:'all'});
});
test('navigation URLs round trip and preserve independent board conditions for history/reload', () => {
  const current='view=sale&sale_q=채&sale_region=경기&buy_q=공';
  const next=marketHref(current,'buy',{keyword:'  가방  ',category:'bag',region:'서울',status:'open'});
  const params=new URL(next,'http://localhost').searchParams;
  assert.equal(parseMarketQuery(params).keyword,'가방');
  params.set('view','sale'); assert.equal(parseMarketQuery(params).keyword,'채'); assert.equal(parseMarketQuery(params).region,'경기');
  assert.equal(parseMarketQuery(new URLSearchParams(current)).view,'sale');
});
test('every legacy anchor selects the correct screen', () => { for (const [anchor,view] of Object.entries(anchorViews)) assert.equal(parseMarketQuery(new URLSearchParams(),anchor).view,view); });
test('late initial and load-more responses are invalidated by a newer query or auth epoch', async () => {
  const epoch=new MarketRequestEpoch(); let commit='';
  let resolve; const old=new Promise(r=>{resolve=r}); const oldTicket=epoch.next();
  const oldRun=old.then(()=>{if(epoch.current(oldTicket))commit='old page'});
  const next=epoch.next(); if(epoch.current(next))commit='new page'; resolve(); await oldRun;
  assert.equal(commit,'new page'); epoch.next(); assert.equal(epoch.current(next),false);
});
