import assert from 'node:assert/strict';
import test from 'node:test';
import { courseWeatherLocation, loadLocationWeather } from './weather.ts';
const fixture = (temperature=0,wind=0) => ({properties:{meta:{updated_at:'2026-10-20T06:00:00Z',units:{air_temperature:'celsius',wind_speed:'m/s'}},timeseries:[{time:'2026-10-20T06:00:00Z',data:{instant:{details:{air_temperature:temperature,wind_speed:wind}},next_1_hours:{summary:{symbol_code:'clearsky_day'}}}}]}});
const response=(t,w)=>new Response(JSON.stringify(fixture(t,w)),{status:200});
test('course point validation excludes directions-only destinations and never supplies a default',()=>{
 for(const destinationKind of ['parking','entrance']) assert.equal(courseWeatherLocation({latitude:36.5,longitude:127.3,destinationKind},'A'),null);
 for(const latitude of [null,NaN,Infinity,91]) assert.equal(courseWeatherLocation({latitude,longitude:127.3,destinationKind:'facility'},'A'),null);
 assert.equal(courseWeatherLocation({latitude:36.5,longitude:null},'A'),null);
 for(const destinationKind of ['facility','building',null]) assert.deepEqual(courseWeatherLocation({latitude:36.5,longitude:127.3,destinationKind},'A'),{latitude:36.5,longitude:127.3,locationLabel:'A'});
});
test('location requests have distinct cache URLs, retain timeout/revalidation, and preserve zero values',async()=>{
 const requests=[];const fetcher=async(url,init)=>{requests.push({url,init});return response(0,0)};
 const a=await loadLocationWeather({latitude:36.5,longitude:127.3,locationLabel:'A'},fetcher);
 const b=await loadLocationWeather({latitude:35.1796,longitude:129.0756,locationLabel:'B'},fetcher);
 assert.notEqual(requests[0].url,requests[1].url);
 for(const r of requests){assert.equal(r.init.next.revalidate,1800);assert.ok(r.init.signal instanceof AbortSignal);assert.match(r.init.headers['User-Agent'],/^pul-platform/)}
 assert.equal(a.weather.temperatureC,0);assert.equal(a.weather.windSpeedKmh,0);assert.equal(a.weather.locationLabel,'A');assert.equal(b.weather.locationLabel,'B');assert.equal(a.weather.updatedAt,'2026-10-20T06:00:00Z');
});
test('late A completion cannot replace an independent B result',async()=>{
 let release;const gate=new Promise(ok=>release=ok);
 const fetcher=async url=>{if(new URL(url).searchParams.get('lat')==='36.5000'){await gate;return response(1,1)}return response(2,2)};
 const pendingA=loadLocationWeather({latitude:36.5,longitude:127.3,locationLabel:'A'},fetcher);
 const b=await loadLocationWeather({latitude:35.1796,longitude:129.0756,locationLabel:'B'},fetcher);
 assert.equal(b.weather.temperatureC,2);release();const a=await pendingA;
 assert.equal(a.weather.temperatureC,1);assert.equal(b.weather.temperatureC,2);assert.equal(b.weather.locationLabel,'B');
});
test('invalid locations and provider failures return no fabricated values',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response(0,0)};
 assert.deepEqual(await loadLocationWeather({latitude:NaN,longitude:127.3,locationLabel:'A'},fetcher),{weather:null,loadFailed:true});assert.equal(calls,0);
 assert.deepEqual(await loadLocationWeather({latitude:36.5,longitude:127.3,locationLabel:'A'},async()=>new Response('',{status:503})),{weather:null,loadFailed:true});
 assert.deepEqual(await loadLocationWeather({latitude:36.5,longitude:127.3,locationLabel:'A'},async()=>{throw Error('offline')}),{weather:null,loadFailed:true});
});
