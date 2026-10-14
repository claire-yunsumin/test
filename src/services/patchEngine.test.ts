import {describe,it,expect} from 'vitest';
import {buildPatches,patchSize} from './patchEngine';
import type {Moment} from '../types/domain';
const make=(id:string,date:string,activity:Moment['activity']):Moment=>({id,occurredOn:date,activity,title:'test',note:'',source:'MANUAL',createdAt:'',updatedAt:''});
describe('patch engine',()=>{it('maps size thresholds',()=>{expect([1,4,8,15].map(patchSize)).toEqual(['S','M','L','XL']);});it('groups by month and activity',()=>{const p=buildPatches([make('1','2026-10-01','CAFE'),make('2','2026-10-02','CAFE'),make('3','2026-11-01','CAFE')],2026);expect(p).toHaveLength(2);expect(p.find(x=>x.month===10)?.count).toBe(2);});it('is deterministic',()=>{const m=[make('1','2026-10-01','REST')];expect(buildPatches(m,2026)).toEqual(buildPatches(m,2026));});});