import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const season=JSON.parse(fs.readFileSync(new URL('../lib/snapshot.json',import.meta.url)));
test('every completed GP has a classification and maps to the correct calendar round',()=>{
 assert.equal(season.raceResults.length,season.completedRaces);
 for(const result of season.raceResults){
  const race=season.calendar.find(r=>r.slug===result.slug);
  assert.ok(race?.completed,result.name);
  assert.equal(result.round,race.round);
  assert.equal(result.date,race.date);
  assert.ok(result.classification.length>=20);
  assert.equal(new Set(result.classification.map(d=>d.driverId)).size,result.classification.length);
  assert.equal(result.classification.filter(d=>d.position==='1').length,1);
 }
});
test('classifications preserve retirement and non-classified status',()=>{
 const latest=season.raceResults.at(-1);
 assert.equal(latest.name,'Bahrain');
 const retired=latest.classification.find(d=>d.name==='George Russell');
 assert.equal(retired.position,'20');assert.equal(retired.time,'DNF');assert.equal(retired.points,0);
 assert.ok(latest.classification.some(d=>d.position==='NC'&&d.time==='DNF'));
});
test('displayed race classifications also produce the championship countback',()=>{
 for(const driver of season.drivers){
  const finishes=Array(30).fill(0);
  for(const result of season.raceResults){const row=result.classification.find(d=>d.driverId===driver.id);const pos=Number(row?.position);if(pos>0&&pos<=30)finishes[pos-1]++;}
  assert.deepEqual(driver.finishes,finishes,driver.name);
 }
});
test('every completed sprint has a classification and its own date',()=>{
 const sprintSessions=season.calendar.flatMap(r=>r.sessions.filter(s=>s.type==='sprint'&&s.completed).map(s=>({race:r,session:s})));
 assert.equal(season.sprintResults.length,sprintSessions.length);
 for(const {race,session} of sprintSessions){
  const result=season.sprintResults.find(s=>s.slug===race.slug);
  assert.ok(result,race.name);assert.equal(result.date,session.start);assert.equal(result.round,race.round);
  assert.ok(result.url.endsWith('/sprint-results'));
  assert.equal(result.classification.length,22);
  assert.equal(result.classification.find(d=>d.position==='1').points,8);
  assert.deepEqual(result.classification.filter(d=>d.points>0).map(d=>d.points),[8,7,6,5,4,3,2,1]);
 }
});
test('upcoming sprint has no fabricated result and remains in championship capacity',()=>{
 assert.ok(!season.sprintResults.some(s=>s.slug==='singapore'));
 assert.ok(season.sessions.some(s=>s.slug==='singapore'&&s.type==='sprint'&&s.maxPoints===8));
});
test('every GP card has circuit artwork from the official F1 media source',()=>{
 for(const race of season.calendar){assert.equal(new URL(race.circuitImageUrl).hostname,'media.formula1.com');assert.ok(race.circuitImageUrl.includes('/track/'));}
});
test('Grand Prix plus sprint points reconcile with every driver standing',()=>{
 const allRows=[...season.raceResults,...season.sprintResults].flatMap(r=>r.classification);
 for(const driver of season.drivers){const total=allRows.filter(r=>r.driverId===driver.id).reduce((sum,r)=>sum+r.points,0);assert.equal(total,driver.points,driver.name);}
});
