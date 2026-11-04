import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {proxySeason} from '../scripts/api-proxy.mjs';

test('proxy preserves Go payload/provenance/status and explicitly reports unavailable backend',async()=>{
  const backend=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({source:'cached',fetchedAt:'2026-01-01T00:00:00Z',warning:'test fallback'}));});
  await new Promise((resolve,reject)=>{backend.once('error',reject);backend.listen(5174,'127.0.0.1',resolve);});
  const proxy=createServer(proxySeason);await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
  try {const url=`http://127.0.0.1:${proxy.address().port}/api/season`;let r=await fetch(url);assert.equal(r.status,200);assert.deepEqual(await r.json(),{source:'cached',fetchedAt:'2026-01-01T00:00:00Z',warning:'test fallback'});
    await new Promise(resolve=>backend.close(resolve));r=await fetch(url);assert.equal(r.status,503);assert.match((await r.json()).error,/backend is unavailable/);
  } finally {backend.closeAllConnections();backend.close();proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
});
