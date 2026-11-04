import {createServer as createHttpServer} from 'node:http';
import {createServer as createViteServer} from 'vite';
import {proxySeason} from './api-proxy.mjs';
const host='127.0.0.1',port=5173;
const root=new URL('../',import.meta.url).pathname;
const server=createHttpServer();
const vite=await createViteServer({root,configFile:new URL('../vite.config.ts',import.meta.url).pathname,server:{middlewareMode:true,host,hmr:{host,server}},appType:'spa'});
server.on('request',async(req,res)=>{
  const allowedHosts=new Set([`${host}:${port}`,`localhost:${port}`]);
  if(!allowedHosts.has(req.headers.host)||req.headers.origin&&!new Set([`http://${host}:${port}`,`http://localhost:${port}`]).has(req.headers.origin)) {res.writeHead(403);return res.end('Local access only');}
  if(req.url?.split('?')[0]==='/api/season') {
    if(req.method!=='GET') {res.writeHead(405);return res.end();}
    return proxySeason(req,res);
  }
  vite.middlewares(req,res);
});
server.listen(port,host,()=>console.log(`F1 Run-In · Local only\nhttp://${host}:${port}`));
server.on('error',e=>{console.error(e.message);process.exit(1);});
let closing=false;
async function close(){if(closing)return;closing=true;server.close();server.closeAllConnections();await vite.close();}
process.on('SIGINT',close);process.on('SIGTERM',close);
