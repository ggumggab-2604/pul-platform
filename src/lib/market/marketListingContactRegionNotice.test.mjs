import assert from 'node:assert/strict';
import test from 'node:test';
import { validateListingInput, hasValidListingContactConsent, mutateMarketListing, getMarketListing } from './market.ts';
import { parseMarketQuery, marketHref } from './marketNavigation.ts';

const input={title:'LOCAL 판매글',category:'bag',price:45000,region:'전국',condition:'likeNew',tradeType:'negotiable',description:'LOCAL 상품 상태를 설명합니다.',publicContactMethod:null,publicContactValue:'',publicContactConsent:false,tradeNoticeConfirmed:true,tradeNoticeVersion:"market-policy-v1"};
test('message-only create/edit and nationwide are independent of contact consent',()=>{
  for(const existing of [false,true]) assert.equal(validateListingInput(input,existing).region,'전국');
  assert.throws(()=>validateListingInput({...input,tradeNoticeConfirmed:false}),/장터 이용안내 및 운영정책/);
  for(const method of ['phone','sms']) {
    assert.throws(()=>validateListingInput({...input,publicContactMethod:method,publicContactValue:'01012345678'}),/공개 연락처/);
    assert.throws(()=>validateListingInput({...input,publicContactMethod:method,publicContactConsent:true}),/전화번호/);
  }
  for(const region of ['서울','경기','인천','충청','강원','전라','경상','제주'])assert.equal(validateListingInput({...input,region}).region,region);
  assert.throws(()=>validateListingInput({...input,region:'전체'}));
});
test('only explicit stored consent for the same normalized number and method is reusable',()=>{
  const contact={publicContactMethod:'phone',publicContactValue:'010-1234-5678',publicContactConsent:false};
  const item={...contact,publicContactValue:'01012345678',publicContactConsentValid:true};
  assert.equal(hasValidListingContactConsent(item,contact),true);
  assert.equal(hasValidListingContactConsent({...item,publicContactConsentValid:false},contact),false);
  assert.equal(hasValidListingContactConsent({...item,publicContactConsentValid:undefined},contact),false);
  assert.equal(hasValidListingContactConsent(item,{...contact,publicContactMethod:'sms'}),false);
  assert.equal(hasValidListingContactConsent(item,{...contact,publicContactValue:'01087654321'}),false);
});
test('nationwide filter is distinct from no filter and does not change other boards',()=>{
  const filters={keyword:'',category:'all',region:'전국',status:'all'};
  const href=marketHref('','sale',filters);
  assert.equal(parseMarketQuery(new URL(href,'http://localhost').searchParams).region,'전국');
  assert.equal(parseMarketQuery(new URLSearchParams('view=sale')).region,'전체');
  assert.equal(parseMarketQuery(new URLSearchParams('view=buy&buy_region=전국')).region,'전체');
});
test('new write API carries independent notice; old DB is blocked instead of silently ignoring it',async()=>{
  let observed;
  const client={rpc:async(name,args)=>{observed={name,args};return {error:{code:'PGRST202'},data:null};}};
  await assert.rejects(mutateMarketListing(client,'create',null,null,input,'00000000-0000-4000-8000-000000000001'),/DB 업데이트/);
  assert.equal(observed.name,'mutate_market_listing_v2');
  assert.equal(observed.args.p_payload.trade_notice_confirmed,true);
  assert.equal(observed.args.p_payload.trade_notice_version,'market-policy-v1');
  assert.equal(observed.args.p_payload.public_contact_consent,false);
});
test('old detail responses never invent consent evidence; new owner-only flags survive parsing',async()=>{
  const value={id:'00000000-0000-4000-8000-000000000001',name:input.title,category:'bag',seller_type:'personal',price:45000,region:'전국',condition:'likeNew',trade_type:'negotiable',sale_status:'selling',description:input.description,seller_display_name:'LOCAL',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',version:1,can_edit:true,image_paths:[],public_contact_method:'phone',public_contact_value:'01012345678'};
  const client={rpc:async()=>({data:value,error:null}),storage:{from:()=>({getPublicUrl:p=>({data:{publicUrl:p}})})}};
  assert.equal((await getMarketListing(client,value.id)).publicContactConsentValid,false);
  Object.assign(value,{public_contact_consent_valid:true,trade_notice_confirmed:true,trade_notice_version:"market-policy-v1"});
  assert.equal((await getMarketListing(client,value.id)).tradeNoticeConfirmed,true);
  value.trade_notice_version='market-trade-v1';
  assert.equal((await getMarketListing(client,value.id)).tradeNoticeConfirmed,false);
  value.trade_notice_version='market-policy-v1';
  value.can_edit=false;
  assert.equal((await getMarketListing(client,value.id)).publicContactConsentValid,false);
});
