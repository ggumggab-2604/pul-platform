import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizeMetNorwayWeather} from './weather.ts';
import {HOUR, roundingSummary, koreanDay, dateOffset, daySummary} from './rounding.ts';
const base=Date.parse('2026-10-20T08:00:00Z');
function make({rain=0,wind=0,temp=20,symbol='clearsky_day',count=80,step=1}={}) {
 const raw={properties:{meta:{updated_at:new Date(base).toISOString(),units:{air_temperature:'celsius',wind_speed:'m/s',precipitation_amount:'mm'}},timeseries:Array.from({length:count},(_,i)=>({time:new Date(base+i*step*HOUR).toISOString(),data:{instant:{details:{air_temperature:temp,wind_speed:wind}},[`next_${step}_hours`]:{summary:{symbol_code:symbol},details:{precipitation_amount:rain}}}}))}};
 return normalizeMetNorwayWeather(raw,'검증 지역',base+HOUR/2);
}
test('two hour window overlaps three complete provider periods at half past, never prorates',()=>{
 const w=make();w.forecast[2].precipitationMm=.4;w.forecast[2].symbol='rain';
 const a=roundingSummary(w,base+HOUR/2);assert.equal(a.complete,true);assert.match(a.rain,/19:00~20:00/);assert.equal(a.condition,'보통');assert.equal(w.forecast[2].precipitationMm,.4);
 w.forecast.splice(2,1);assert.equal(roundingSummary(w,base+HOUR/2).condition,'판단 정보 부족');
});
test('uses actual now, not first two items; no probability or numeric score',()=>{
 const w=make();w.forecast[0].precipitationMm=10;const a=roundingSummary(w,base+5*HOUR);assert.equal(a.rain,'비 예보 없음');assert.equal(a.condition,'좋음');assert.equal(w.precipitationProbability,null);assert.equal(a.score,undefined);
});
test('zero temperature and zero wind remain valid, cold is caution',()=>{const w=make({temp:0,wind:0});const a=roundingSummary(w,base);assert.equal(a.complete,true);assert.equal(a.condition,'주의');assert.equal(a.wind,'약함');assert.equal(a.maxWind,0);assert.equal(w.temperatureC,0)});
test('all threshold edges and precedence',()=>{
 const check=(args,expected)=>assert.equal(roundingSummary(make(args),base).condition,expected,JSON.stringify(args));
 for(const [args,expected] of [[{wind:4.999},'좋음'],[{wind:5},'보통'],[{wind:7.999},'보통'],[{wind:8},'주의'],[{rain:.999},'보통'],[{rain:1},'주의'],[{temp:0},'주의'],[{temp:.01},'보통'],[{temp:5},'보통'],[{temp:5.01},'좋음'],[{temp:29.99},'좋음'],[{temp:30},'보통'],[{temp:34.99},'보통'],[{temp:35},'주의']])check(args,expected);
 for(const symbol of ['heavyrainandthunder','snow','sleet','fog'])check({symbol},'주의');
});
test('missing field, interval gap, six-hour-only, stale or missing issue time never defaults good',()=>{
 for(const change of [w=>w.forecast[1].precipitationMm=null,w=>w.forecast[1].windSpeedKmh=null,w=>w.forecast[1].temperatureC=null,w=>w.forecast.splice(1,1),w=>delete w.updatedAt,w=>w.updatedAt=new Date(base-13*HOUR).toISOString()]){const w=make();change(w);assert.equal(roundingSummary(w,base).condition,'판단 정보 부족')}
 assert.equal(roundingSummary(make({step:6}),base).condition,'판단 정보 부족');
 const edge=make();edge.updatedAt=new Date(base-12*HOUR).toISOString();assert.equal(roundingSummary(edge,base).complete,true);assert.equal(roundingSummary(edge,base+1).condition,'판단 정보 부족');
 const future=make();future.updatedAt=new Date(base+HOUR+1).toISOString();assert.equal(roundingSummary(future,base).condition,'판단 정보 부족');
});
test('wind increase and known adverse weather survives neutral surroundings',()=>{
 const w=make();w.forecast[2].windSpeedKmh=25;assert.match(roundingSummary(w,base+HOUR/2).change,/후반에 바람/);
 w.forecast[2].symbol='heavysnow';assert.equal(roundingSummary(w,base+HOUR/2).condition,'주의');
});
test('Korean dates roll at UTC 15h and no fabricated hourly interpolation',()=>{
 const t=Date.parse('2026-12-31T14:30:00Z');assert.equal(koreanDay(t),'2026-12-31');assert.equal(dateOffset(t,1),'2027-01-01');assert.equal(koreanDay(t+HOUR),'2027-01-01');
 const w=make({step:6,count:5});assert.equal(w.forecast.length,5);assert.equal(w.forecast[1].periodHours,6);assert.match(daySummary(w.forecast),/제공/);
});
test('current point uses timestamp and preserves all supplied series',()=>{
 const w=make();assert.equal(w.forecast.length,80);assert.equal(w.observedAt,new Date(base).toISOString());assert.equal(w.forecast[0].periodHours,1);assert.equal(w.forecast[0].precipitationMm,0);
});

test('overnight rounding uses overlapping periods across Korean midnight',()=>{
 const w=make();const offset=6*HOUR;w.forecast=w.forecast.map(p=>({...p,time:new Date(Date.parse(p.time)+offset).toISOString()}));w.updatedAt=new Date(base+offset).toISOString();w.forecast[1].precipitationMm=.2;
 const a=roundingSummary(w,base+offset+HOUR/2);assert.equal(a.complete,true);assert.match(a.rain,/00:00~01:00/);assert.equal(a.condition,'보통');
});
test('unknown conditions and absent rain units are incomplete, not dry',()=>{
 const w=make();w.forecast[1].condition='날씨 확인 중';assert.equal(roundingSummary(w,base).condition,'판단 정보 부족');
 const x=make();x.forecast[0].precipitationMm=null;assert.equal(roundingSummary(x,base).rain,'정보 부족');
});

// W1: exercise only fields rendered by RoundingWeatherCard, using the real MET normalizer.
function visibleSummary({symbols={},rain={},wind={},missingWind}={}) {
 const now=base+HOUR/2;
 const raw={properties:{meta:{updated_at:new Date(base).toISOString(),units:{air_temperature:'celsius',wind_speed:'m/s',precipitation_amount:'mm'}},timeseries:Array.from({length:6},(_,i)=>({time:new Date(base+i*HOUR).toISOString(),data:{instant:{details:{air_temperature:18,wind_speed:i===missingWind?null:wind[i]??2}},next_1_hours:{summary:{symbol_code:symbols[i]??'cloudy'},details:{precipitation_amount:rain[i]??0}}}}))}};
 const weather=normalizeMetNorwayWeather(raw,'검증 지역',now);
 return {weather,summary:roundingSummary(weather,now)};
}
test('W1 next-hour thunder stays visible with wind increase or missing data',()=>{
 for(const variant of [{},{wind:{2:5}},{missingWind:2}]) {
  const {weather,summary:s}=visibleSummary({symbols:{1:'rainandthunder'},rain:{1:.6},...variant});
  assert.equal(weather.condition,'흐림');
  assert.match(s.rain,/18:00~19:00 뇌우 예보/);
  assert.match(s.change,/18:00~19:00 뇌우 예보/);
  assert.doesNotMatch(s.change,/후반에 바람/);
  assert.equal(s.complete,variant.missingWind===undefined);
  assert.equal(s.condition,variant.missingWind===undefined?'주의':'판단 정보 부족');
  if(variant.missingWind!==undefined)assert.match(s.change,/전체를 판단할 시간별 자료가 부족/);
 }
});
test('W1 earlier rain and fog cannot hide later thunder or borrow the wrong interval',()=>{
 const {summary:s}=visibleSummary({symbols:{0:'rain',1:'fog',2:'rainandthunder'},rain:{0:.2,2:.6}});
 assert.match(s.rain,/17:00~18:00 비 예보/);
 assert.match(s.change,/18:00~19:00 안개 예보/);
 assert.match(s.change,/19:00~20:00 뇌우 예보/);
 assert.doesNotMatch(s.change,/17:00~18:00 뇌우|18:00~19:00 뇌우/);
 assert.equal(s.complete,true);assert.equal(s.condition,'주의');
});
test('W1 precipitation labels reuse normalized phenomena and ordinary rain stays ordinary',()=>{
 for(const [symbol,label] of [['rain','비'],['rainshowers_day','소나기'],['snow','눈'],['sleet','진눈깨비']]) {
  const {summary:s}=visibleSummary({symbols:{1:symbol},rain:{1:.2}});
  assert.match(s.rain,new RegExp(`18:00~19:00 ${label} 예보`));
  assert.doesNotMatch(s.rain,/눈·진눈깨비/);
  if(['비','소나기'].includes(label)){assert.match(s.change,/강수에 대비/);assert.doesNotMatch(s.change,/뇌우|안개/);assert.equal(s.condition,'보통');}
 }
});
