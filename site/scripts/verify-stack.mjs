// Deterministic full-stack validation; use only an isolated test database.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
const root=path.resolve(import.meta.dirname,'../..');
if(!process.env.TEST_DATABASE_URL)throw new Error('Set TEST_DATABASE_URL to an isolated local PostgreSQL database');
for(const port of [5173,5174])await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(new Error(`Stop existing listener on ${port} before full-stack validation`)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
const dir=await mkdtemp(path.join(tmpdir(),'f1-stack-'));
const bin=path.join(dir,'backend'),adapter=path.join(dir,'fixture.mjs');
const fixture=JSON.parse(await readFile(path.join(root,'site/lib/snapshot.json'),'utf8'));
fixture.year=new Date().getUTCFullYear();fixture.source='official';
const run=(cmd,args,options={})=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:'inherit',...options});p.once('error',reject);p.once('exit',code=>code===0?resolve():reject(new Error(`${cmd} exited ${code}`)));});
const children=new Set();
const start=(cmd,args,cwd,env={})=>{const p=spawn(cmd,args,{cwd,stdio:'inherit',env:{...process.env,...env}});children.add(p);p.once('exit',()=>children.delete(p));return p;};
const stop=p=>new Promise((resolve,reject)=>{if(p.exitCode!==null)return resolve();const timer=setTimeout(()=>{p.kill('SIGKILL');reject(new Error('Shutdown timed out'));},8000);p.once('exit',(code,signal)=>{clearTimeout(timer);if(code!==0&&signal!=='SIGTERM')reject(new Error(`Unexpected shutdown ${code}/${signal}`));else resolve();});p.kill('SIGTERM');});
async function wait(url){for(let i=0;i<120;i++){try{const r=await fetch(url);if(r.status===200)return r;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Service did not start: ${url}`);}
const api=()=>start(bin,[],path.join(root,'backend'),{DATABASE_URL:process.env.TEST_DATABASE_URL,F1_INGEST_SCRIPT:adapter});
try {
 await run('go',['build','-o',bin,'.'],{cwd:path.join(root,'backend')});
 fixture.fetchedAt=new Date(Date.now()-3600000).toISOString();
 await writeFile(adapter,`process.stdout.write(${JSON.stringify(JSON.stringify(fixture))});`);
 // Tests expect the database current-year snapshot to be stale or absent.
 let backend=api();const frontend=start(process.execPath,['scripts/local-server.mjs'],path.join(root,'site'));
 let r=await wait('http://127.0.0.1:5173/api/season');let body=await r.json();assert.equal(body.source,'official');assert.equal(body.fetchedAt,fixture.fetchedAt);assert.ok(body.constructors.length);assert.ok(body.raceResults.length);assert.ok(body.sprintResults.length);
 await stop(backend);await writeFile(adapter,"process.exit(1);");backend=api();r=await wait('http://127.0.0.1:5173/api/season');body=await r.json();assert.equal(body.source,'cached');assert.equal(body.fetchedAt,fixture.fetchedAt);assert.match(body.warning,/last verified snapshot/);
 await stop(backend);fixture.fetchedAt=new Date().toISOString();await writeFile(adapter,`process.stdout.write(${JSON.stringify(JSON.stringify(fixture))});`);backend=api();body=await (await wait('http://127.0.0.1:5173/api/season')).json();assert.equal(body.source,'official');assert.equal(body.fetchedAt,fixture.fetchedAt);
 await stop(backend);await writeFile(adapter,"process.exit(1);");backend=api();body=await (await wait('http://127.0.0.1:5173/api/season')).json();assert.equal(body.source,'official');assert.equal(body.fetchedAt,fixture.fetchedAt);
 r=await fetch('http://127.0.0.1:5173/api/season',{headers:{Origin:'https://evil.test'}});assert.equal(r.status,403);
 r=await fetch('http://127.0.0.1:5173/api/season',{method:'POST'});assert.equal(r.status,405);
 await stop(backend);r=await fetch('http://127.0.0.1:5173/api/season');assert.equal(r.status,503);assert.match((await r.json()).error,/backend is unavailable/);
 await stop(frontend);
 console.log('PASS: PostgreSQL-backed frontend proxy, stale fallback, fresh restart, guards, backend unavailable, SIGTERM cleanup');
} finally {for(const p of children)await stop(p);await rm(dir,{recursive:true,force:true});}
