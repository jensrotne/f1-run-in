export const RACE_POINTS = [25,18,15,12,10,8,6,4,2,1];
export const SPRINT_POINTS = [8,7,6,5,4,3,2,1];
export const pointsFor = (type, position) => (type === 'race' ? RACE_POINTS : SPRINT_POINTS)[position-1] || 0;
export const capacity = sessions => sessions.reduce((n,s) => n+s.maxPoints,0);
export function compareCountback(a,b) {
  for (let i=0;i<Math.max(a.length,b.length);i++) { const diff=(a[i]||0)-(b[i]||0); if(diff) return Math.sign(diff); }
  return 0;
}
export function isSafe(driver, rival, sessions, countbackAvailable) {
  const ceiling = rival.points + capacity(sessions);
  if (driver.points !== ceiling) return driver.points > ceiling;
  if (!countbackAvailable) return false;
  const rivalFinishes = [...rival.finishes];
  rivalFinishes[0] += sessions.filter(s=>s.type==='race').length;
  return compareCountback(driver.finishes,rivalFinishes)>0;
}
export function contenderStatus(season, driver) {
  const leader=season.drivers[0], max=driver.points+capacity(season.sessions);
  if(driver.id===leader.id) return 'Leader';
  if(max < leader.points) return 'Eliminated';
  if(max === leader.points && season.countbackAvailable) {
    const finishes=[...driver.finishes];finishes[0]+=season.sessions.filter(s=>s.type==='race').length;
    if(compareCountback(finishes,leader.finishes)<0) return 'Eliminated';
  }
  return 'In contention';
}
export function project(season, driverId, mode='pressure', selectedPosition=1, rivalPosition=2) {
  const selected=season.drivers.find(d=>d.id===driverId);
  if(!selected) throw new Error('Unknown driver');
  if(!['pressure','earliest','custom'].includes(mode)) throw new Error('Unknown scenario');
  if(!Number.isInteger(selectedPosition)||!Number.isInteger(rivalPosition)||selectedPosition<1||rivalPosition<1||selectedPosition>11||rivalPosition>11) throw new Error('Invalid finishing position');
  if(mode==='custom'&&selectedPosition===rivalPosition&&selectedPosition<=10) throw new Error('Two drivers cannot occupy the same scoring position.');
  const states=season.drivers.map(d=>({...d,finishes:[...d.finishes]}));
  const focus=states.find(d=>d.id===driverId);
  const safe = remaining => states.filter(d=>d.id!==driverId).every(d=>isSafe(focus,d,remaining,season.countbackAvailable));
  const already=safe(season.sessions);
  let clinch=already?{name:'Already clinched',type:'current'}:null;
  const path=season.sessions.map((s,i)=>{
    const ownPos=mode==='custom'?selectedPosition:1;
    const otherPos=mode==='earliest'?11:mode==='custom'?rivalPosition:2;
    for(const d of states) {
      const position=d.id===driverId?ownPos:otherPos;
      d.points+=pointsFor(s.type,position);
      if(s.type==='race') d.finishes[position-1]++;
    }
    const remaining=season.sessions.slice(i+1);
    const rival=states.filter(d=>d.id!==driverId).sort((a,b)=>b.points-a.points)[0];
    const ceiling=rival.points+capacity(remaining);
    const locked=safe(remaining);
    if(locked&&!clinch) clinch={...s,index:i};
    return {...s,index:i,points:focus.points,rivalPoints:rival.points,ceiling,remaining:capacity(remaining),margin:focus.points-ceiling,locked,rivalName:rival.name};
  });
  return {clinch,path,already};
}
