import { openDB } from 'idb';
import type { Moment } from '../types/domain';
const dbPromise=openDB('daystitch-db',1,{upgrade(db){if(!db.objectStoreNames.contains('moments'))db.createObjectStore('moments',{keyPath:'id'});}});
export async function getMoments():Promise<Moment[]>{return (await (await dbPromise).getAll('moments')).sort((a,b)=>b.occurredOn.localeCompare(a.occurredOn));}
export async function putMoment(moment:Moment){await (await dbPromise).put('moments',moment);}
export async function removeMoment(id:string){await (await dbPromise).delete('moments',id);}
export function getLegacyHabitCount():number {try{const v=JSON.parse(localStorage.getItem('habits.v1')||'[]');return Array.isArray(v)?v.length:0;}catch{return 0;}}
