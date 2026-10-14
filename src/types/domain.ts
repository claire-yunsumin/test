export type ActivityType = 'CAFE'|'RUNNING'|'TRAVEL'|'FOOD'|'READING'|'FRIENDS'|'REST'|'WORK'|'OTHER';
export type MomentSource = 'MANUAL'|'PHOTO'|'CALENDAR'|'HEALTH';
export interface Moment { id:string; occurredOn:string; title:string; note:string; activity:ActivityType; source:MomentSource; createdAt:string; updatedAt:string; }
export interface Patch { id:string; activity:ActivityType; count:number; size:'S'|'M'|'L'|'XL'; month:number; x:number; y:number; rotation:number; }
export const ACTIVITIES: Record<ActivityType,{label:string;icon:string;color:string}> = {CAFE:{label:'카페',icon:'☕',color:'#a97654'},RUNNING:{label:'운동',icon:'🏃',color:'#7a9b83'},TRAVEL:{label:'여행',icon:'✈️',color:'#8d9dc6'},FOOD:{label:'맛집',icon:'🍰',color:'#d58c86'},READING:{label:'독서',icon:'📚',color:'#c6a26a'},FRIENDS:{label:'사람들',icon:'💌',color:'#bc8fb7'},REST:{label:'휴식',icon:'🌙',color:'#8e95a9'},WORK:{label:'일',icon:'💻',color:'#8ca4a0'},OTHER:{label:'일상',icon:'🌼',color:'#d4ad6a'}};
