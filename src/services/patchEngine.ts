import { ACTIVITIES, type Moment, type Patch, type ActivityType } from '../types/domain';
export function patchSize(count:number):Patch['size'] { return count>=15?'XL':count>=8?'L':count>=4?'M':'S'; }
function hash(s:string):number { let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0; }
export function buildPatches(moments:Moment[],year:number):Patch[] {
 const groups=new Map<string,{activity:ActivityType;month:number;count:number}>();
 for(const m of moments){if(!m.occurredOn.startsWith(String(year)+'-'))continue;const month=Number(m.occurredOn.slice(5,7));if(month<1||month>12||!Object.hasOwn(ACTIVITIES,m.activity))continue;const key=month+'-'+m.activity;const g=groups.get(key);if(g)g.count++;else groups.set(key,{activity:m.activity,month,count:1});}
 const result:Patch[]=[];
 for(const [id,g] of [...groups].sort(([a],[b])=>a.localeCompare(b))){const seed=hash(year+'-'+id);const monthIndex=g.month-1;const col=monthIndex%3,row=Math.floor(monthIndex/3);const n=result.filter(p=>p.month===g.month).length;result.push({id,activity:g.activity,count:g.count,size:patchSize(g.count),month:g.month,x:8+col*33.33+((seed%17)+n*11)%22,y:5+row*25+((Math.floor(seed/17)%13)+n*8)%16,rotation:(seed%25)-12});}
 return result;
}
