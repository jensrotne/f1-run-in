export const RACE_POINTS = [25,18,15,12,10,8,6,4,2,1];
export const SPRINT_POINTS = [8,7,6,5,4,3,2,1];
export const pointsFor = (type, position) => (type === 'race' ? RACE_POINTS : SPRINT_POINTS)[position-1] || 0;
export const capacity = (sessions,championship='drivers') => sessions.reduce((n,s) => n+(championship==='constructors'?(s.type==='race'?43:15):s.maxPoints),0);
const entries=(season,championship)=>championship==='constructors'?season.constructors:season.drivers;
const knownCountback=(season,championship)=>championship==='constructors'?season.constructorCountbackAvailable:season.countbackAvailable;
export function compareCountback(a,b) {
  for (let i=0;i<Math.max(a.length,b.length);i++) { const diff=(a[i]||0)-(b[i]||0); if(diff) return Math.sign(diff); }
  return 0;
}
function maximumFinishes(rival,sessions,championship){
 const finishes=[...rival.finishes];const races=sessions.filter(s=>s.type==='race').length;
 finishes[0]+=races;if(championship==='constructors')finishes[1]+=races;return finishes;
}
export function isSafe(driver, rival, sessions, countbackAvailable,championship='drivers') {
  const ceiling = rival.points + capacity(sessions,championship);
  if (driver.points !== ceiling) return driver.points > ceiling;
  if (!countbackAvailable) return false;
  return compareCountback(driver.finishes,maximumFinishes(rival,sessions,championship))>0;
}
export function contenderStatus(season, driver,championship='drivers') {
  const leader=entries(season,championship)[0], max=driver.points+capacity(season.sessions,championship);
  if(driver.id===leader.id) return 'Leader';
  if(max < leader.points) return 'Eliminated';
  if(max === leader.points && knownCountback(season,championship)&&compareCountback(maximumFinishes(driver,season.sessions,championship),leader.finishes)<0)return 'Eliminated';
  return 'In contention';
}
function simulate(season,id,mode,ownPositions,rivalPositions,championship){
 const competitors=entries(season,championship);
 if(!competitors?.some(d=>d.id===id))throw new Error('Unknown championship entrant');
 if(!['pressure','earliest','custom'].includes(mode))throw new Error('Unknown scenario');
 for(const position of [...ownPositions,...rivalPositions])if(!Number.isInteger(position)||position<1||position>11)throw new Error('Invalid finishing position');
 if(mode==='custom'){
  const scoringPositions=[...ownPositions,...rivalPositions].filter(p=>p<=10);
  if(new Set(scoringPositions).size!==scoringPositions.length)throw new Error('Cars cannot share a scoring position.');
 }
 const states=competitors.map(d=>({...d,finishes:[...d.finishes]}));const focus=states.find(d=>d.id===id);
 const safe=remaining=>states.filter(d=>d.id!==id).every(d=>isSafe(focus,d,remaining,knownCountback(season,championship),championship));
 const already=safe(season.sessions);let clinch=already?{name:'Already clinched',type:'current'}:null;
 const path=season.sessions.map((s,i)=>{
  const selected=mode==='custom'?ownPositions:championship==='constructors'?[1,2]:[1];
  const rivals=mode==='earliest'?(championship==='constructors'?[11,11]:[11]):mode==='custom'?rivalPositions:championship==='constructors'?[3,4]:[2];
  for(const d of states)for(const position of d.id===id?selected:rivals){d.points+=pointsFor(s.type,position);if(s.type==='race'&&position<=10)d.finishes[position-1]++;}
  const remaining=season.sessions.slice(i+1);const rival=states.filter(d=>d.id!==id).sort((a,b)=>b.points-a.points)[0];
  const ceiling=rival.points+capacity(remaining,championship);const locked=safe(remaining);
  if(locked&&!clinch)clinch={...s,index:i};
  return {...s,index:i,points:focus.points,rivalPoints:rival.points,ceiling,remaining:capacity(remaining,championship),margin:focus.points-ceiling,locked,rivalName:rival.name};
 });
 return {clinch,path,already};
}
export function project(season,driverId,mode='pressure',selectedPosition=1,rivalPosition=2){return simulate(season,driverId,mode,[selectedPosition],[rivalPosition],'drivers');}
export function projectConstructors(season,constructorId,mode='pressure',selectedPositions=[1,2],rivalPositions=[3,4]){
 if(selectedPositions.length!==2||rivalPositions.length!==2)throw new Error('Each constructor must have two car positions.');
 return simulate(season,constructorId,mode,selectedPositions,rivalPositions,'constructors');
}
