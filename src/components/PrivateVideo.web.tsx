import React,{useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {listMyPrivateVideos,signedPrivatePlayback,privateVideoEnabled,type PrivateVideoFile} from '../lib/privateVideo';
import {loadVideoCreatorName,saveVideoCreatorName} from '../lib/videoCreatorProfile';
export default function PrivateVideo(){
 const [file,setFile]=useState<File|null>(null);
 const [url,setUrl]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [name,setName]=useState('');
 const [files,setFiles]=useState<PrivateVideoFile[]>([]);
 const [privateUrl,setPrivateUrl]=useState('');
 const enabled=privateVideoEnabled;
 useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{setFiles([]);setPrivateUrl('');setName('');});return()=>subscription.unsubscribe();},[]);
 async function refresh(){try{const [files,profile]=await Promise.all([listMyPrivateVideos(),loadVideoCreatorName()]);setFiles(files);setName(profile);setStatus('Private Videos und Creator-Profil geladen.');}catch{setFiles([]);setStatus('Private Videos konnten nicht geladen werden.');}}
 async function play(path:string){try{setPrivateUrl(await signedPrivatePlayback(path));setStatus('Privater Link ist maximal fünf Minuten gültig.');}catch{setPrivateUrl('');setStatus('Wiedergabe nicht möglich.');}}
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
 const registered=await supabase.rpc('video_register_upload',{p_path:result.data.path});
 if(registered.error)throw registered.error;
 }else{
 await saveVideoCreatorName(name);
 }
 if(upload)await refresh();
 setStatus(upload?'Quarantäne angelegt – Medienprüfung steht aus. Keine Veröffentlichung.':'Creator-Name gespeichert.');
 }catch{setStatus('Aktion fehlgeschlagen. Testserver, Anmeldung und Datei prüfen.');}finally{setBusy(false);}
 }
 return <div style={{color:'#fff',padding:12}}>
 <label>Lokale Videodatei (MP4/WebM, maximal 20 MiB)<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={e=>{const f=e.target.files?.[0];setFile(f&&f.size<=20971520&&['video/mp4','video/webm'].includes(f.type)?f:null);setStatus(f&&f.size>20971520?'Datei zu groß.':'');}}/></label>
 {url&&<video key={url} src={url} controls playsInline preload="metadata" style={{width:'100%',maxHeight:420}}/>}
 {privateUrl&&<video key={privateUrl} src={privateUrl} controls playsInline preload="metadata" style={{width:'100%',maxHeight:420}}/>}
 <p>Lokale Wiedergabe und private Vorschau; keine Veröffentlichung. Upload nur auf lokalem Testserver.</p>
 <button disabled={!enabled||busy} onClick={()=>void refresh()}>Meine privaten Videos laden</button>
 {files.map(item=><button key={item.path} disabled={busy} onClick={()=>void play(item.path)}>▶ {item.name}</button>)}
 <button disabled={!enabled||!file||busy} onClick={()=>void save(true)}>Privat hochladen</button>
 <label>Creator-Name<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label>
 <button disabled={!enabled||busy||!name.trim()} onClick={()=>void save(false)}>Creator-Name speichern</button>
 <p role="status">{status}</p>
 </div>;
}
