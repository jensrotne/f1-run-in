import {createServer as createHttpServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fetchSeason} from '../lib/f1-source.mjs';
const host='127.0.0.1',port=5173;
const root=new URL('../',import.meta.url).pathname;
const localDir=new URL('../.local/',import.meta.url);
let cached, pending;
try {cached=JSON.parse(await readFile(new URL('season.json',localDir),'utf8'));} catch {cached=JSON.parse(await readFile(new URL('../lib/snapshot.json',import.meta.url),'utf8'));}
const server=createHttpServer();
const vite=await createViteServer({root,configFile:new URL('../vite.config.ts',import.meta.url).pathname,server:{middlewareMode:true,host,hmr:{host,server}},appType:'spa'});
async function loadSeason() {
  const year=new Date().getUTCFullYear();
  if(cached?.year===year&&Array.isArray(cached.raceResults)&&Array.isArray(cached.sprintResults)&&Date.now()-Date.parse(cached.fetchedAt)<5*60*1000) return cached;
  try {
    pending??=fetchSeason(year).then(async data=>{
      cached=data;
      await mkdir(localDir,{recursive:true});
      const tmp=new URL('season.tmp.json',localDir);
      await writeFile(tmp,JSON.stringify(data));await rename(tmp,new URL('season.json',localDir));
      return data;
    }).finally(()=>{pending=undefined;});
    return await pending;
  } catch(error) {
    console.warn('F1 refresh unavailable:',error.message);
    if(cached?.year!==year) throw error;
    return {...cached,source:'cached',warning:'Official F1 refresh is unavailable. Showing the last verified snapshot; calculations use that snapshot.'};
  }
}
server.on('request',async(req,res)=>{
  const allowedHosts=new Set([`${host}:${port}`,`localhost:${port}`]);
  if(!allowedHosts.has(req.headers.host)||req.headers.origin&&!new Set([`http://${host}:${port}`,`http://localhost:${port}`]).has(req.headers.origin)) {res.writeHead(403);return res.end('Local access only');}
  if(req.url?.split('?')[0]==='/api/season') {
    if(req.method!=='GET') {res.writeHead(405);return res.end();}
    try {const data=await loadSeason();res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(data));}
    catch {res.writeHead(503,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Official F1 data is unavailable. Try refreshing again later.'}));}
  }
  vite.middlewares(req,res);
});
server.listen(port,host,()=>console.log(`F1 Run-In · Local only\nhttp://${host}:${port}`));
server.on('error',e=>{console.error(e.message);process.exit(1);});
async function close(){await vite.close();server.close(()=>process.exit(0));}
process.on('SIGINT',close);process.on('SIGTERM',close);
