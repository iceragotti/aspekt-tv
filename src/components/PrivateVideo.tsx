import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet} from 'react-native';
import {useVideoPlayer,VideoView} from 'expo-video';
import {listMyPrivateVideos,signedPrivatePlayback,privateVideoEnabled,type PrivateVideoFile} from '../lib/privateVideo';
import {supabase} from '../lib/supabase';
import {loadVideoCreatorName,saveVideoCreatorName} from '../lib/videoCreatorProfile';
import {
 pickNativeVideo,uploadNativeVideo,type NativeVideoSelection,type UploadProgress
} from '../lib/nativeVideoUpload';

/** Android/iOS owner-only upload. Entire beta upload flow is loopback-staging gated. */
export default function PrivateVideo({onUploaded}:{onUploaded?:()=>void}={}){
 const player=useVideoPlayer(null);
 const [files,setFiles]=useState<PrivateVideoFile[]>([]);
 const [creatorName,setCreatorName]=useState('');
 const [selected,setSelected]=useState<NativeVideoSelection|null>(null);
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [kind,setKind]=useState<'video'|'short'>('video');
 const [progress,setProgress]=useState<UploadProgress|null>(null);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('Der native Upload funktioniert nur mit lokaler Supabase-Staging-Umgebung.');
 const abort=useRef<AbortController|null>(null);
 useEffect(()=>{
  const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{
   abort.current?.abort();
   setFiles([]);setCreatorName('');setSelected(null);setProgress(null);
   player.pause();
   void player.replaceAsync(null).catch(()=>{});
  });
  return ()=>{abort.current?.abort();subscription.unsubscribe();};
 },[player]);

 async function pick(){
  if(busy||!privateVideoEnabled)return;
  setBusy(true);
  try{
   const file=await pickNativeVideo();
   if(file){setSelected(file);setProgress(null);setNotice('Video ausgewählt. Titel eingeben und privat hochladen.');}
  }catch{setSelected(null);setNotice('Dateiauswahl fehlgeschlagen. Nur MP4/WebM bis 20 MiB.');}
  finally{setBusy(false);}
 }
 async function upload(){
  if(busy||!selected||!privateVideoEnabled||!title.trim())return;
  const controller=new AbortController();
  abort.current=controller;
  setBusy(true);setProgress({stage:'reading',percent:0});
  try{
   const reviewId=await uploadNativeVideo(selected,{title,description,kind},setProgress,controller.signal);
   setNotice('Upload registriert (Quarantäne '+reviewId.slice(0,8)+'). Noch nicht veröffentlicht.');
   setSelected(null);setTitle('');setDescription('');
   const [items,profile]=await Promise.all([listMyPrivateVideos(),loadVideoCreatorName()]);
   setFiles(items);setCreatorName(profile);
   onUploaded?.();
  }catch(error){
   setNotice(error instanceof Error?error.message:'Upload fehlgeschlagen. Bitte erneut versuchen.');
  }finally{abort.current=null;setBusy(false);}
 }
 async function saveCreator(){
  if(!privateVideoEnabled||busy)return;
  setBusy(true);
  try{await saveVideoCreatorName(creatorName);setNotice('Creator-Profil gespeichert.');}
  catch{setNotice('Creator-Profil konnte nicht gespeichert werden.');}
  finally{setBusy(false);}
 }
 async function load(){
  if(!privateVideoEnabled||busy)return;
  setBusy(true);
  try{
   const [items,profile]=await Promise.all([listMyPrivateVideos(),loadVideoCreatorName()]);
   setFiles(items);setCreatorName(profile);
   setNotice('Private Videos geladen – keine öffentliche Auslieferung.');
  }catch{setFiles([]);setNotice('Anmeldung oder Testdatenbank prüfen.');}
  finally{setBusy(false);}
 }
 async function play(file:PrivateVideoFile){
  if(busy)return;
  setBusy(true);
  try{
   const url=await signedPrivatePlayback(file.path);
   await player.replaceAsync({uri:url});player.play();
   setNotice('Private Wiedergabe. Link ist maximal fünf Minuten gültig.');
  }catch{setNotice('Wiedergabe fehlgeschlagen.');}
  finally{setBusy(false);}
 }
 const button=(label:string,onPress:()=>void,disabled=false)=>
  <TouchableOpacity accessibilityRole="button" disabled={disabled}
   style={[s.button,disabled&&s.disabled]} onPress={onPress}>
   <Text style={s.text}>{label}</Text>
  </TouchableOpacity>;
 return <View style={s.container}>
  <Text style={s.heading}>ASPEKT Native Creator Studio</Text>
  <Text style={s.text}>Geschützter Test-Upload auf iOS und Android. Videos bleiben bis zur unabhängigen Freigabe privat.</Text>
  {button('Video auswählen (MP4/WebM)',()=>void pick(),!privateVideoEnabled||busy)}
  {selected&&<>
   <Text style={s.text}>{selected.name} · {(selected.size/1048576).toFixed(1)} MiB</Text>
   <Text style={s.text}>Videotitel (Pflichtfeld)</Text>
   <TextInput style={s.input} accessibilityLabel="Videotitel" value={title}
    maxLength={120} onChangeText={setTitle} editable={!busy} placeholder="Titel eingeben"
    placeholderTextColor="#a1a1aa"/>
   <Text style={s.text}>Videobeschreibung</Text>
   <TextInput style={[s.input,s.multiline]} accessibilityLabel="Videobeschreibung"
    value={description} maxLength={2000} onChangeText={setDescription}
    multiline editable={!busy} placeholderTextColor="#a1a1aa"/>
   <Text style={s.text}>Format: {kind==='video'?'Video':'Short'}</Text>
   {button('Format wechseln',()=>setKind(v=>v==='video'?'short':'video'),busy)}
   {button('Privat hochladen',()=>void upload(),busy||!title.trim()||!privateVideoEnabled)}
   {busy&&button('Upload abbrechen',()=>abort.current?.abort(),!abort.current)}
  </>}
  {progress&&<View accessibilityRole="progressbar" accessibilityValue={{
   min:0,max:100,now:progress.percent
  }} style={s.progress}>
   <View style={[s.progressFill,{width:`${progress.percent}%` as `${number}%`}]}/>
   <Text style={s.text}>Upload: {progress.percent}% · {progress.stage}</Text>
  </View>}
  <Text style={s.text}>Creator-Name (privat)</Text>
  <TextInput style={s.input} accessibilityLabel="Creator-Name" value={creatorName}
   maxLength={80} onChangeText={setCreatorName} placeholder="Mein Kanal"
   placeholderTextColor="#a1a1aa" editable={privateVideoEnabled&&!busy}/>
  {button('Creator-Profil speichern',()=>void saveCreator(),
   !privateVideoEnabled||busy||!creatorName.trim())}
  {button('Meine privaten Videos laden',()=>void load(),!privateVideoEnabled||busy)}
  {files.map(f=><View key={f.path}>
   {button('▶ '+f.name,()=>void play(f),busy)}
  </View>)}
  <VideoView player={player} style={s.video} nativeControls contentFit="contain"/>
  <Text style={s.text} accessibilityLiveRegion="polite">{notice}</Text>
 </View>;
}
const s=StyleSheet.create({
 container:{padding:12,gap:10,borderRadius:12,backgroundColor:'#18181b'},
 heading:{color:'#fda4af',fontSize:18,fontWeight:'700'},
 text:{color:'#f4f4f5',fontSize:14},
 button:{minHeight:44,backgroundColor:'#881337',padding:10,justifyContent:'center',borderRadius:8},
 disabled:{opacity:0.45},
 video:{width:'100%',height:210,backgroundColor:'#000'},
 input:{color:'#fff',borderWidth:1,borderColor:'#71717a',padding:10,borderRadius:8},
 multiline:{minHeight:90,textAlignVertical:'top'},
 progress:{gap:8},
 progressFill:{height:6,backgroundColor:'#fb7185',borderRadius:3},
});
