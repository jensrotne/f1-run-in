export async function proxySeason(req,res) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),105_000);
  const abort=()=>controller.abort();
  res.on('close',abort);
  try {
    const response=await fetch('http://127.0.0.1:5174/api/season',{headers:req.headers.origin?{Origin:req.headers.origin}:{},signal:controller.signal});
    const body=await response.text();
    res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(body);
  } catch {
    if(!res.destroyed){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Local Go backend is unavailable. Start PostgreSQL and the backend, then try again.'}));}
  } finally {clearTimeout(timer);res.off('close',abort);}
}
