import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarketQuery, marketHref, MarketRequestEpoch, anchorViews } from './marketNavigation.ts';
test('direct URLs validate view and separate board filters, trim keyword and ignore invalid values', () => {
  const q=new URLSearchParams('view=buy&sale_q=채&buy_q=%20공%20&buy_category=ball&buy_status=closed&buy_region=제주');
  assert.deepEqual(parseMarketQuery(q),{view:'buy',keyword:'공',category:'ball',region:'제주',status:'closed',requestType:'all'});
  assert.deepEqual(parseMarketQuery(new URLSearchParams('view=oops&home_region=악성')),{view:'home',keyword:'',category:'all',region:'전체',status:'all',requestType:'all'});
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

test('1A menus and help preserve AS exchange type and independent sale filters', () => {
  let href='/market?view=buy&buy_type=exchange&buy_q=공&buy_region=전국&buy_status=open&sale_q=채&sale_region=경기';
  for (const view of ['home','care','business','startup','price','guide','safety','buy']) {
    href=marketHref(new URL(href,'http://localhost').search.slice(1),view);
    const params=new URL(href,'http://localhost').searchParams;
    assert.equal(parseMarketQuery(params).view,view);
    params.set('view','buy');
    assert.equal(parseMarketQuery(params).requestType,'exchange');
    assert.equal(parseMarketQuery(params).keyword,'공');
    assert.equal(parseMarketQuery(params).region,'전국');
    params.set('view','sale');
    assert.equal(parseMarketQuery(params).keyword,'채');
    assert.equal(parseMarketQuery(params).region,'경기');
  }
});
test('buy type selection round trips and invalid values remain all', () => {
  for(const requestType of ['buy','exchange','all']) {
    const href=marketHref('buy_type=exchange','buy',{keyword:'',category:'all',region:'전체',status:'all',requestType});
    assert.equal(parseMarketQuery(new URL(href,'http://localhost').searchParams).requestType,requestType);
  }
  assert.equal(parseMarketQuery(new URLSearchParams('view=buy&buy_type=invalid')).requestType,'all');
});
