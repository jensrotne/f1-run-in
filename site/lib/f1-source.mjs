const ROOT = 'https://www.formula1.com';
export const RULES_URL = 'https://www.fia.com/system/files/documents/fia_2026_f1_regulations_-_section_a_general_provisions_-_iss_02_-_2026-02-27.pdf';
export function plain(s) {
  return s.replace(/<svg\b[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
export function rows(html) {
  const body = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/)?.[1] || '';
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]));
}
export function parseDrivers(html) {
  const officialImage = cell => {
    const src = cell?.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    if (!src) return undefined;
    try { const url = new URL(src); return url.protocol === 'https:' && url.hostname === 'media.formula1.com' ? url.href : undefined; } catch { return undefined; }
  };
  const drivers = rows(html).map(c => {
    const href = c[1]?.match(/href="([^"]*\/drivers\/([A-Z0-9]+)\/[^"\s]+)"/);
    const spans = [...(c[1] || '').matchAll(/<span class="max-(?:lg|md):hidden">([^<]*)<\/span>/g)].map(m => plain(m[1]));
    const code = c[1]?.match(/<span class="md:hidden">([^<]+)<\/span>/)?.[1];
    return { id: href?.[2], name: spans.join(' '), code, position: Number(plain(c[0])), team: plain(c[3]), points: Number(plain(c[4])), color: c[1]?.match(/background-color:(#[a-fA-F0-9]{6})/)?.[1] || '#a9abb5', portraitUrl: officialImage(c[1]), teamLogoUrl: officialImage(c[3]), url: ROOT + href?.[1], finishes: Array(30).fill(0) };
  });
  if (drivers.length < 10 || drivers.some(d => !d.id || !d.name || !Number.isFinite(d.points)) || drivers[0].position !== 1) throw new Error('Official standings format could not be verified.');
  return drivers;
}
export function parseRaceResults(html, drivers) {
  const results = rows(html).map(c => {
    const driverId = c[2]?.match(/\/([a-z]{6}\d{2})\//)?.[1]?.toUpperCase();
    const driver = drivers.find(d => d.id === driverId);
    const name = [...(c[2] || '').matchAll(/<span class="max-(?:lg|md):hidden">([^<]*)<\/span>/g)].map(m => plain(m[1])).join(' ');
    const image = cell => cell?.match(/<img\b[^>]*\bsrc="(https:\/\/media\.formula1\.com\/[^"\s]+)"/)?.[1]?.replace(/&amp;/g,'&');
    return {driverId:driverId || name, name:name || driver?.name, code:driver?.code || c[2]?.match(/<span class="md:hidden">([^<]+)<\/span>/)?.[1],
      position:plain(c[0]), number:plain(c[1]), team:plain(c[3]), laps:plain(c[4]), time:plain(c[5]), points:Number(plain(c[6])),
      color:c[2]?.match(/background-color:(#[a-fA-F0-9]{6})/)?.[1] || driver?.color || '#a9abb5', portraitUrl:image(c[2]) || driver?.portraitUrl, teamLogoUrl:image(c[3]) || driver?.teamLogoUrl};
  });
  if (results.length < 10 || results.some(r => !r.name || !r.position || !Number.isFinite(r.points))) throw new Error('Official race classification could not be verified.');
  return results;
}
export function parseConstructors(html) {
  const constructors=rows(html).map(c=>{
    const href=c[1]?.match(/href="([^"\s]*\/team\/([^"\s]+))"/);
    const name=plain(c[1]);
    return {id:href?.[2],name,team:name,code:name.replace(/[^A-Za-z]/g,'').slice(0,3).toUpperCase(),position:Number(plain(c[0])),points:Number(plain(c[2])),
      color:c[1]?.match(/background-color:(#[a-fA-F0-9]{6})/)?.[1]||'#a9abb5',teamLogoUrl:c[1]?.match(/<img\b[^>]*src="(https:\/\/media\.formula1\.com\/[^"\s]+)"/)?.[1],url:ROOT+href?.[1],finishes:Array(30).fill(0)};
  });
  if(constructors.length<5||constructors.some(c=>!c.id||!c.name||!Number.isFinite(c.points)))throw new Error('Official constructor standings could not be verified.');
  return constructors;
}
export function parseCalendar(html, year) {
  const found = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"\s]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    if (!m[1].startsWith(`/en/racing/${year}/`)) continue;
    const t = plain(m[2]);
    const round = t.match(/ROUND\s+(\d+)/i);
    if (!round) continue;
    const slug = m[1].split('/').pop();
    const name = t.replace(/^.*?ROUND\s+\d+\s*(?:NEXT RACE\s*)?/i, '').split(/\d{2}\s*(?:-|[A-Z]{3})|FORMULA 1/)[0].trim() || slug.split('-').map(w => w[0].toUpperCase()+w.slice(1)).join(' ');
    if (!found.has(slug)) found.set(slug, { slug, name, round: Number(round[1]), url: ROOT + m[1] });
  }
  if (found.size < 10) throw new Error('Official calendar format could not be verified.');
  return [...found.values()].sort((a,b) => a.round-b.round);
}
export function parseSessions(html) {
  const events = [];
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    const walk = v => { if (!v || typeof v !== 'object') return; if (v['@type'] === 'SportsEvent' && v.startDate) events.push(v); Object.values(v).forEach(x => Array.isArray(x) ? x.forEach(walk) : typeof x === 'object' && walk(x)); };
    walk(JSON.parse(m[1]));
  }
  return events.filter(e => /^(Race|Sprint) - /.test(e.name)).map(e => ({ type: e.name.startsWith('Sprint -') ? 'sprint' : 'race', start: e.startDate, end: e.endDate || e.startDate }));
}
async function get(path) {
  const r = await fetch(path.startsWith('https:') ? path : ROOT + path, { headers: { 'Accept': 'text/html', 'User-Agent': 'F1RunIn/1.0' }, signal: AbortSignal.timeout(18000) });
  if (!r.ok) throw new Error(`Official source returned ${r.status}`);
  return r.text();
}
async function mapLimit(items, fn, limit = 5) {
  const result = Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const i = next++; result[i] = await fn(items[i]); } }));
  return result;
}
export async function fetchSeason(year) {
  const [dh, ch, rh, th] = await Promise.all([get(`/en/results/${year}/drivers`), get(`/en/racing/${year}`), get(`/en/results/${year}/races`),get(`/en/results/${year}/team`)]);
  const drivers = parseDrivers(dh);
  const constructors = parseConstructors(th);
  const completedMetadata = rows(rh).map(c => ({path:c[0].match(/href="([^"]+\/race-result)"/)?.[1],name:plain(c[0]),date:plain(c[1])})).filter(r => r.path);
  const completed = completedMetadata.map(r => r.path);
  const completedSlugs = new Set(completed.map(p => p.split('/').at(-2).replace(/[^a-z]/g,'')));
  const sprintResultPaths = new Map();
  const calendar = await mapLimit(parseCalendar(ch,year), async race => {
    const html = await get(race.url);
    const sessions = parseSessions(html);
    if (!sessions.some(s => s.type === 'race')) throw new Error(`Race timing missing: ${race.name}`);
    const sessionState = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
    const raceDone = completedSlugs.has(race.slug.replace(/[^a-z]/g,'')) || /"session":"r"[\s\S]{0,400}?"state":"(?:completed|finished)"/.test(sessionState);
    const sprintDone = /"session":"s"[\s\S]{0,400}?"state":"(?:completed|finished)"/.test(sessionState);
    const sprintPath = [...html.matchAll(/href="([^"\s]+\/sprint-results)"/g)].map(m=>m[1]).find(p=>p.startsWith(`/en/results/${year}/races/`));
    if (sprintPath) sprintResultPaths.set(race.slug,sprintPath);
    const circuitImageUrl = [...html.matchAll(/(?:src|href)="(https:\/\/media\.formula1\.com\/[^"\s]*\/track\/[^"\s]+)"/g)].map(m=>m[1]).find(src=>src.includes('detailed'));
    return { ...race, circuitImageUrl, date: sessions.find(s => s.type === 'race').start, sprint: sessions.some(s => s.type === 'sprint'), completed: raceDone,
      sessions: sessions.map(s => ({ ...s, completed: s.type === 'race' ? raceDone : sprintDone })) };
  });
  const sprintResults = await mapLimit(calendar.filter(r=>r.sessions.some(s=>s.type==='sprint'&&s.completed)),async race=>{
    const path = sprintResultPaths.get(race.slug);
    if (!path) throw new Error(`Official sprint result link missing: ${race.name}`);
    const classification = parseRaceResults(await get(path),drivers);
    return {slug:race.slug,name:race.name,round:race.round,date:race.sessions.find(s=>s.type==='sprint').start,url:ROOT+path,classification};
  });
  const raceResults = await mapLimit(completedMetadata, async (metadata) => {
    const classification = parseRaceResults(await get(metadata.path), drivers);
    for (const row of classification) {
      const d = drivers.find(d => d.id === row.driverId); const pos = Number(row.position);
      if (d && pos > 0 && pos <= 30) d.finishes[pos-1]++;
      const constructor=constructors.find(c=>c.name===row.team);
      if(constructor&&pos>0&&pos<=30)constructor.finishes[pos-1]++;
    }
    const normalize = s => s.toLowerCase().replace(/[^a-z]/g,'');
    const race = calendar.find(r => normalize(r.name) === normalize(metadata.name) || normalize(r.slug) === normalize(metadata.path.split('/').at(-2)));
    if (!race) throw new Error(`Official race result could not be matched to the calendar: ${metadata.name}`);
    return {slug:race.slug,name:metadata.name,round:race.round,date:race.date,url:ROOT+metadata.path,classification};
  });
  const expected = completed.length;
  const countbackAvailable = drivers.reduce((n,d) => n+d.finishes[0],0) === expected;
  const constructorCountbackAvailable=constructors.reduce((n,c)=>n+c.finishes[0],0)===expected;
  const sessions = calendar.flatMap(r => r.sessions.filter(s => !s.completed).map(s => ({ ...s, round:r.round, name:r.name, slug:r.slug, url:r.url, maxPoints:s.type==='race'?25:8 }))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  return { year, fetchedAt: new Date().toISOString(), source: 'official', drivers, constructors, calendar, sessions, raceResults, sprintResults, completedRaces: expected, countbackAvailable, constructorCountbackAvailable,
    sources: { standings: `${ROOT}/en/results/${year}/drivers`, constructors:`${ROOT}/en/results/${year}/team`, calendar: `${ROOT}/en/racing/${year}`, rules: RULES_URL } };
}
