import type {Season,Driver,Session} from './types';
export const RACE_POINTS:number[];
export const SPRINT_POINTS:number[];
export function pointsFor(type:string,position:number):number;
export function capacity(sessions:Session[]):number;
export function compareCountback(a:number[],b:number[]):number;
export function isSafe(driver:Driver,rival:Driver,sessions:Session[],countbackAvailable:boolean):boolean;
export function contenderStatus(season:Season,driver:Driver):'Leader'|'Eliminated'|'In contention';
export interface ProjectionPoint extends Session {index:number;points:number;rivalPoints:number;ceiling:number;remaining:number;margin:number;locked:boolean;rivalName:string}
export function project(season:Season,driverId:string,mode?:'pressure'|'earliest'|'custom',selectedPosition?:number,rivalPosition?:number):{clinch:({name:string;type:'current'}|(Session&{index:number}))|null;path:ProjectionPoint[];already:boolean};
