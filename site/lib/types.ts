export interface Driver { id:string; name:string; code:string; position:number; team:string; points:number; color:string; portraitUrl?:string; teamLogoUrl?:string; url:string; finishes:number[] }
export interface Session { type:'race'|'sprint'; start:string; end:string; completed:boolean; round:number; name:string; slug:string; url:string; maxPoints:number }
export interface Race { slug:string; name:string; round:number; url:string; date:string; sprint:boolean; completed:boolean; sessions:Session[] }
export interface Season {year:number; fetchedAt:string; source:string; warning?:string; drivers:Driver[]; calendar:Race[]; sessions:Session[]; completedRaces:number; countbackAvailable:boolean; sources:{standings:string;calendar:string;rules:string} }
