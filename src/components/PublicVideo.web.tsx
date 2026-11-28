import React,{useEffect,useState} from 'react';
import {approvedVideoPlayback} from '../lib/videoPlatform';
export default function PublicVideo({id}:{id:string}){
 const [url,setUrl]=useState('');
 const [status,setStatus]=useState('Noch nicht geladen.');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setUrl('');setStatus('Noch nicht geladen.');},[id]);
 async function play(){
  if(busy)return;
  setBusy(true);
  try{
   setUrl(await approvedVideoPlayback(id));
   setStatus('Freigegebenes Video geladen. Wiedergabelink gilt 60 Sekunden.');
  }catch{setUrl('');setStatus('Video nicht verfügbar; Test-Auslieferung ist möglicherweise deaktiviert.');}
  finally{setBusy(false);}
 }
 return <div style={{color:'#fafafa',padding:8}}>
  <button disabled={busy} style={{minHeight:44}} onClick={()=>void play()}>▶ Video laden</button>
  {url&&<video key={url} controls playsInline preload="metadata" src={url} style={{width:'100%',maxHeight:420}}/>}
  <p role="status">{status}</p>
 </div>;
}
