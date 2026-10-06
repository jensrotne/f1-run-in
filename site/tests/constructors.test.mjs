import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {capacity,isSafe,contenderStatus,projectConstructors} from '../lib/championship.mjs';
const team=(id,points,wins=0,seconds=0)=>({id,name:id,points,finishes:[wins,seconds,...Array(28).fill(0)]});
const session=(type)=>({type,maxPoints:type==='race'?25:8,name:type});
const season=(constructors,sessions)=>({constructors,sessions,constructorCountbackAvailable:true});
test('constructor capacity combines the top two scoring positions in each session',()=>{
 assert.equal(capacity([session('race'),session('sprint')],'constructors'),58);
});
test('pressure projection scores both cars and bounds each rival separately',()=>{
 const s=season([team('A',100),team('B',100),team('C',100)],[session('race'),session('sprint')]);
 const {path}=projectConstructors(s,'A');
 assert.equal(path[0].points,143);assert.equal(path[0].rivalPoints,127);assert.equal(path[0].ceiling,142);
 assert.equal(path[1].points,158);assert.equal(path[1].rivalPoints,138);
 assert.equal(path[0].remaining,15);
});
test('earliest constructor opportunity can occur in a sprint',()=>{
 const s=season([team('A',130),team('B',100)],[session('sprint'),session('race')]);
 const p=projectConstructors(s,'A','earliest');
 assert.equal(p.clinch.type,'sprint');assert.equal(p.path[0].points,145);assert.equal(p.path[0].rivalPoints,100);
});
test('maximum future countback includes a rival one-two, not just the win',()=>{
 const remaining=[session('race')], rival=team('B',100,3,2);
 assert.equal(isSafe(team('A',143,4,3),rival,remaining,true,'constructors'),false);
 assert.equal(isSafe(team('A',143,4,4),rival,remaining,true,'constructors'),true);
 assert.equal(isSafe(team('A',143,4,4),rival,remaining,false,'constructors'),false);
});
test('all constructors matter for countback and elimination',()=>{
 const s=season([team('A',143,4,4),team('B',100,2),team('C',100,5)],[session('race')]);
 assert.equal(projectConstructors(s,'A').already,false);
 const eliminated=season([team('A',200),team('B',100)],[session('race'),session('sprint')]);
 assert.equal(contenderStatus(eliminated,eliminated.constructors[1],'constructors'),'Eliminated');
 assert.equal(projectConstructors(eliminated,'B','earliest').clinch,null);
});
test('custom two-car finishes score races and sprints, allowing repeated zero-point DNFs',()=>{
 const s=season([team('A',100),team('B',100)],[session('race'),session('sprint')]);
 const {path}=projectConstructors(s,'A','custom',[2,5],[1,3]);
 assert.equal(path[0].points,128);assert.equal(path[0].rivalPoints,140);
 assert.equal(path[1].points,139);assert.equal(path[1].rivalPoints,154);
 assert.doesNotThrow(()=>projectConstructors(s,'A','custom',[11,11],[1,2]));
 assert.throws(()=>projectConstructors(s,'A','custom',[1,2],[2,3]));
 assert.throws(()=>projectConstructors(s,'A','custom',[1],[2,3]));
 assert.throws(()=>projectConstructors(s,'A','custom',[1,12],[2,3]));
});
const snapshot=JSON.parse(fs.readFileSync(new URL('../lib/snapshot.json',import.meta.url)));
test('official constructor points reconcile with race and sprint results under actual race teams',()=>{
 const rows=[...snapshot.raceResults,...snapshot.sprintResults].flatMap(r=>r.classification);
 assert.equal(snapshot.constructors.length,11);assert.ok(snapshot.constructorCountbackAvailable);
 for(const team of snapshot.constructors){
  assert.equal(rows.filter(r=>r.team===team.name).reduce((sum,r)=>sum+r.points,0),team.points,team.name);
  const finishes=Array(30).fill(0);
  for(const r of snapshot.raceResults)for(const d of r.classification.filter(d=>d.team===team.name)){const p=Number(d.position);if(p>0&&p<=30)finishes[p-1]++;}
  assert.deepEqual(team.finishes,finishes,team.name);
  assert.equal(new URL(team.teamLogoUrl).hostname,'media.formula1.com');
 }
 assert.equal(capacity(snapshot.sessions,'constructors'),316);
 assert.equal(projectConstructors(snapshot,snapshot.constructors[0].id,'earliest').clinch.name,'United States');
 assert.equal(projectConstructors(snapshot,snapshot.constructors[0].id).clinch.name,'Mexico');
});
