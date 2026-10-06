import {useEffect,useState} from 'react';
export function OfficialImage({src,label,fallback,className,color}:{src?:string;label:string;fallback:string;className:string;color:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return <span className={className} style={{borderColor:color,backgroundColor:className==='driver-portrait'?`${color}22`:undefined}}>
   {src&&!failed?<img src={src} alt={label} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span aria-label={label}>{fallback}</span>}
 </span>;
}
export function CircuitImage({src,name}:{src?:string;name:string}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 if(!src||failed)return null;
 return <img className="circuit-art" src={src} alt={`${name} circuit layout`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}
