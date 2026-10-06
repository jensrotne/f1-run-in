import {useState} from 'react';
import {ArrowUpRight,Trophy,Zap} from 'lucide-react';
import {RadioGroup,RadioGroupItem} from '@/components/ui/radio-group';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '@/components/ui/table';
import {OfficialImage,CircuitImage} from '@/components/official-image';
import type {Season,Championship,RaceClassification} from '@/lib/types';
const date=(s:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short'}).format(new Date(s));
function teamTotals(rows:RaceClassification[]){
 const teams=new Map<string,{name:string;points:number;color:string;teamLogoUrl?:string;drivers:RaceClassification[]}>();
 for(const row of rows){const team=teams.get(row.team)||{name:row.team,points:0,color:row.color,teamLogoUrl:row.teamLogoUrl,drivers:[]};team.points+=row.points;team.drivers.push(row);teams.set(row.team,team);}
 const best=(drivers:RaceClassification[])=>Math.min(...drivers.map(d=>Number(d.position)||Infinity));
 return [...teams.values()].sort((a,b)=>b.points-a.points||best(a.drivers)-best(b.drivers));
}
export default function SeasonResults({season,championship='drivers'}:{season:Season;championship?:Championship}){
 const isConstructors=championship==='constructors';
 const completed=season.raceResults || [];
 const sprints=season.sprintResults || [];
 const resultWeekends=season.calendar.filter(r=>completed.some(gp=>gp.slug===r.slug)||sprints.some(s=>s.slug===r.slug));
 const [choice,setChoice]=useState('');
 const [session,setSession]=useState<'race'|'sprint'>('race');
 const choose=(slug:string)=>{setChoice(slug);setSession('race');};
 const selected=season.calendar.find(r=>r.slug===choice) || season.calendar.find(r=>r.slug===completed.at(-1)?.slug) || season.calendar[0];
 const activeSession=selected?.sprint?session:'race';
 const result=(activeSession==='sprint'?sprints:completed).find(r=>r.slug===selected?.slug);
 const sessionInfo=selected?.sessions.find(s=>s.type===activeSession);
 if(!selected)return null;
 return <section id="results" className="season-results">
   <div className="section-heading"><div><span className="eyebrow">05 / THE SEASON SO FAR</span><h2>Season results</h2></div><span className="subtle-badge">{completed.length} GPs · {sprints.length} sprints</span></div>
   <p className="chart-description">{isConstructors?'Points earned by both cars in every Grand Prix and sprint.':'Every Grand Prix and sprint, from the winners to the full classifications.'}</p>
   <div className="results-rounds" aria-label={isConstructors?"Completed weekend team points":"Completed Grand Prix and sprint winners"}>{resultWeekends.map(r=>{
     const gpRows=completed.find(gp=>gp.slug===r.slug)?.classification||[];
     const sprintRows=sprints.find(s=>s.slug===r.slug)?.classification||[];
     const gpTeam=teamTotals(gpRows)[0], sprintTeam=teamTotals(sprintRows)[0];
     const winner=isConstructors?(gpTeam?{...gpTeam,portraitUrl:gpTeam.teamLogoUrl,code:gpTeam.name.slice(0,3)}:undefined):gpRows.find(d=>d.position==='1');
     const sprintWinner=isConstructors?sprintTeam:sprintRows.find(d=>d.position==='1');
     return <button type="button" key={r.slug} className={`results-round ${selected.slug===r.slug?'active':''}`} aria-pressed={selected.slug===r.slug} onClick={()=>choose(r.slug)}>
       <span className="round-label">R{String(r.round).padStart(2,'0')} <span>{date(r.date)}</span></span><span className="gp-card-heading"><b>{r.name}</b><CircuitImage src={r.circuitImageUrl} name={r.name}/></span>
       {winner&&<span className="round-winner"><OfficialImage src={winner.portraitUrl} label={`${winner.name} ${isConstructors?'logo':'portrait'}`} fallback={winner.code} className={isConstructors?"constructor-logo":"driver-portrait"} color={winner.color}/><span>{winner.name}<small><Trophy size={10}/> {isConstructors?'Most GP points · ':''}{winner.points} pts</small></span></span>}
       {sprintWinner&&<span className="sprint-round-winner"><Zap size={11}/><span>{isConstructors?'Most sprint points: ':'Sprint: '}{sprintWinner.name}<small>{sprintWinner.points} pts</small></span></span>}
     </button>;
   })}</div>
   <div className="results-toolbar"><div><label className="field-label" htmlFor="results-gp">CHOOSE A GRAND PRIX</label><Select value={selected.slug} onValueChange={choose}><SelectTrigger id="results-gp" className="results-select"><SelectValue/></SelectTrigger><SelectContent>{season.calendar.map(r=><SelectItem key={r.slug} value={r.slug}>R{r.round} · {r.name}{r.sprint?' · Sprint weekend':''}{completed.some(c=>c.slug===r.slug)||sprints.some(c=>c.slug===r.slug)?'':' · No results yet'}</SelectItem>)}</SelectContent></Select></div><a className="source-link" href={result?.url || selected.url} target="_blank" rel="noreferrer">{result?(activeSession==='sprint'?'Official sprint result':'Official race result'):'Official race page'} <ArrowUpRight size={14}/></a></div>
   {selected.sprint&&<RadioGroup className="results-session-tabs" value={activeSession} onValueChange={v=>setSession(v as 'race'|'sprint')} aria-label="Results session"><label className={activeSession==='race'?'active':''}><RadioGroupItem value="race"/>Grand Prix</label><label className={activeSession==='sprint'?'active':''}><RadioGroupItem value="sprint"/><Zap size={13}/>Sprint</label></RadioGroup>}
   <div className="results-title"><h3>{result?.name || selected.name} {activeSession==='sprint'?'Sprint':'Grand Prix'}</h3><span>Round {selected.round} · {date(result?.date || sessionInfo?.start || selected.date)} · {season.year}</span></div>
   {result?(isConstructors?<Table className="race-results-table"><TableHeader><TableRow><TableHead>TEAM</TableHead><TableHead>DRIVERS</TableHead><TableHead>FINISHES / STATUS</TableHead><TableHead className="numeric">PTS</TableHead></TableRow></TableHeader><TableBody>{teamTotals(result.classification).map(team=><TableRow key={team.name}><TableCell><div className="result-driver"><span className="team-line" style={{background:team.color}}/><OfficialImage src={team.teamLogoUrl} label={`${team.name} logo`} fallback={team.name.slice(0,3)} className="constructor-logo" color={team.color}/><b>{team.name}</b></div></TableCell><TableCell>{team.drivers.map(d=><div key={d.driverId}>{d.name}</div>)}</TableCell><TableCell>{team.drivers.map(d=><div key={d.driverId} className="result-mono">{d.position} · {d.time}</div>)}</TableCell><TableCell className="numeric result-points">{team.points}</TableCell></TableRow>)}</TableBody></Table>:<Table className="race-results-table"><TableHeader><TableRow><TableHead>POS</TableHead><TableHead>DRIVER</TableHead><TableHead>TEAM</TableHead><TableHead className="numeric">LAPS</TableHead><TableHead className="numeric">TIME / STATUS</TableHead><TableHead className="numeric">PTS</TableHead></TableRow></TableHeader><TableBody>{result.classification.map(d=><TableRow key={d.driverId} className={d.position==='1'?'race-winner-row':''}><TableCell className="result-position">{d.position}</TableCell><TableCell><div className="result-driver"><span className="team-line" style={{background:d.color}}/><OfficialImage src={d.portraitUrl} label={`${d.name} portrait`} fallback={d.code} className="driver-portrait" color={d.color}/><span><b>{d.name}</b><small>#{d.number}</small></span></div></TableCell><TableCell><div className="result-team"><OfficialImage src={d.teamLogoUrl} label={`${d.team} logo`} fallback={d.team.slice(0,1)} className="team-logo" color={d.color}/><span>{d.team}</span></div></TableCell><TableCell className="numeric result-mono">{d.laps}</TableCell><TableCell className="numeric result-mono">{d.time}</TableCell><TableCell className="numeric result-points">{d.points}</TableCell></TableRow>)}</TableBody></Table>):<div className="results-empty" role="status"><Trophy size={20}/><p>{sessionInfo?.completed?'The classification is not available in this snapshot. Refresh the official data to try again.':`This ${activeSession==='sprint'?'sprint':'Grand Prix'} has not published results yet.`}</p></div>}
   <p className="calendar-note">{isConstructors?'Team totals sum the points awarded to both cars in the official F1 classification, using the team each driver raced for. Ordered by session points, then best finish.':'Grand Prix and sprint classifications. Times, retirement status, laps and awarded points are taken from the official F1 results.'}</p>
 </section>;
}
