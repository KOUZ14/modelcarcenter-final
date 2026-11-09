// Nationwide U.S. federal holidays, including observed fixed-date holidays.
export function isUsBusinessDay(date:Date) {
  const weekday=date.getUTCDay();if(weekday===0||weekday===6)return false;
  const key=(d:Date)=>d.toISOString().slice(0,10),holidays=new Set<string>(),year=date.getUTCFullYear();
  const observed=(y:number,month:number,day:number)=>{const d=new Date(Date.UTC(y,month,day));if(d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1);if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);holidays.add(key(d));};
  const nth=(month:number,day:number,n:number)=>{const d=new Date(Date.UTC(year,month,1));d.setUTCDate(1+(day-d.getUTCDay()+7)%7+7*(n-1));holidays.add(key(d));};
  for(const y of [year,year+1])for(const [month,day] of [[0,1],[5,19],[6,4],[10,11],[11,25]])observed(y,month,day);
  nth(0,1,3);nth(1,1,3);nth(8,1,1);nth(9,1,2);nth(10,4,4);
  const memorial=new Date(Date.UTC(year,5,0));memorial.setUTCDate(memorial.getUTCDate()-(memorial.getUTCDay()+6)%7);holidays.add(key(memorial));
  return !holidays.has(key(date));
}
