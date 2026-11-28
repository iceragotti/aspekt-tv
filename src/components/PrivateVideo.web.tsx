import React,{useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
export default function PrivateVideo(){
 const [file,setFile]=useState<File|null>(null);
 const [url,setUrl]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState('');
 const enabled=process.env.EXPO_PUBLIC_VIDEO_STAGING==='true' && /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(process.env.EXPO_PUBLIC_SUPABASE_URL??'');
 useEffect(()=>{if(!file){setUrl('');return;}const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
 async function save(upload:boolean){
 if(!enabled||busy)return;
 setBusy(true);
 try{
 const {data,error}=await supabase.auth.getUser();
 if(error||!data.user)throw Error('Anmeldung erforderlich');
 if(upload){
 if(!file||file.size>20971520||!['video/mp4','video/webm'].includes(file.type))throw Error('Ungültige Datei');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const mp4=bytes.length>=8&&String.fromCharCode(...bytes.slice(4,8))==='ftyp';
 const webm=bytes[0]===26&&bytes[1]===69&&bytes[2]===223&&bytes[3]===163;
 if(!(file.type==='video/mp4'?mp4:webm))throw Error('Dateisignatur ungültig');
 const result=await supabase.storage.from('aspekt-video-private').upload(data.user.id+'/'+crypto.randomUUID()+ (mp4?'.mp4':'.webm'),file,{contentType:file.type,upsert:false});
 if(result.error)throw result.error;
 }else{
 const result=await supabase.from('video_creator_profiles').upsert({display_name:name.trim()},{onConflict:'owner_id'});
 if(result.error)throw result.error;
 }
 setStatus(upload?'Privat gespeichert – nicht veröffentlicht.':'Creator-Name gespeichert.');
 }catch{setStatus('Aktion fehlgeschlagen. Testserver, Anmeldung und Datei prüfen.');}finally{setBusy(false);}
 }
 return <div style={{color:'#fff',padding:12}}>
 <label>Lokale Videodatei (MP4/WebM, maximal 20 MiB)<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={e=>{const f=e.target.files?.[0];setFile(f&&f.size<=20971520&&['video/mp4','video/webm'].includes(f.type)?f:null);setStatus(f&&f.size>20971520?'Datei zu groß.':'');}}/></label>
 {url&&<video key={url} src={url} controls playsInline preload="metadata" style={{width:'100%',maxHeight:420}}/>}
 <p>Lokale Wiedergabe; keine Veröffentlichung. Upload nur auf lokalem Testserver.</p>
 <button disabled={!enabled||!file||busy} onClick={()=>void save(true)}>Privat hochladen</button>
 <label>Creator-Name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
 <button disabled={!enabled||busy||!name.trim()} onClick={()=>void save(false)}>Creator-Name speichern</button>
 <p role="status">{status}</p>
 </div>;
}
