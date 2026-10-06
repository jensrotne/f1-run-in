export interface Driver { id:string; name:string; code:string; position:number; team:string; points:number; color:string; portraitUrl?:string; teamLogoUrl?:string; url:string; finishes:number[] }
export interface Constructor extends Driver {}
export type Championship = 'drivers'|'constructors';
export interface Session { type:'race'|'sprint'; start:string; end:string; completed:boolean; round:number; name:string; slug:string; url:string; maxPoints:number }
export interface Race { slug:string; name:string; round:number; url:string; date:string; circuitImageUrl?:string; sprint:boolean; completed:boolean; sessions:Session[] }
export interface RaceClassification {driverId:string;name:string;code:string;position:string;number:string;team:string;laps:string;time:string;points:number;color:string;portraitUrl?:string;teamLogoUrl?:string}
export interface RaceResult {slug:string;name:string;round:number;date:string;url:string;classification:RaceClassification[]}
export interface Season {year:number; fetchedAt:string; source:string; warning?:string; drivers:Driver[]; constructors:Constructor[]; calendar:Race[]; sessions:Session[]; raceResults?:RaceResult[]; sprintResults?:RaceResult[]; completedRaces:number; countbackAvailable:boolean; constructorCountbackAvailable:boolean; sources:{standings:string;constructors:string;calendar:string;rules:string} }
