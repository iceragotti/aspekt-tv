import React, {useEffect,useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {useVideoPlayer, VideoView} from 'expo-video';
import {listMyPrivateVideos, signedPrivatePlayback, privateVideoEnabled, type PrivateVideoFile} from '../lib/privateVideo';
import {supabase} from '../lib/supabase';
import {loadVideoCreatorName, saveVideoCreatorName} from '../lib/videoCreatorProfile';

/** Private media is only available with local Supabase and owner-scoped Storage RLS. */
export default function PrivateVideo(_props:{onUploaded?:()=>void}={}) {
  const player = useVideoPlayer(null);
  const [files,setFiles]=useState<PrivateVideoFile[]>([]);
  const [creatorName,setCreatorName]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('Privater Player: lokale Supabase-Testumgebung erforderlich.');
  useEffect(()=>{
    const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{
      setFiles([]);
      setCreatorName('');
      player.pause();
      void player.replaceAsync(null).catch(()=>{});
    });
    return ()=>subscription.unsubscribe();
  },[player]);
  async function saveCreator(){
    if(!privateVideoEnabled||busy)return;
    setBusy(true);
    try{await saveVideoCreatorName(creatorName);setNotice('Creator-Profil dauerhaft gespeichert.');}
    catch{setNotice('Creator-Profil konnte nicht gespeichert werden.');}
    finally{setBusy(false);}
  }
  async function load(){
    if(!privateVideoEnabled||busy)return;
    setBusy(true);
    try{
      const [items,profile]=await Promise.all([listMyPrivateVideos(),loadVideoCreatorName()]);
      setFiles(items);
      setCreatorName(profile);
      setNotice('Private Videos und Creator-Profil geladen – keine öffentliche Auslieferung.');
    }
    catch{setFiles([]);setNotice('Videos konnten nicht geladen werden. Bitte Testkonto und Datenbank prüfen.');}
    finally{setBusy(false);}
  }
  async function play(file:PrivateVideoFile){
    if(busy)return;
    setBusy(true);
    try{
      const url=await signedPrivatePlayback(file.path);
      await player.replaceAsync({uri:url});
      player.play();
      setNotice('Geschützte Wiedergabe: Link gilt maximal fünf Minuten.');
    }catch{setNotice('Wiedergabe fehlgeschlagen. Anmeldung, Medienformat und Rechte prüfen.');}
    finally{setBusy(false);}
  }
  return <View style={s.container}>
    <Text style={s.heading}>ASPEKT Private Player</Text>
    <Text style={s.text}>iOS und Android – nur eigene Videos aus dem privaten Test-Speicher. Eine öffentliche Videoplattform ist noch nicht freigeschaltet.</Text>
    <Text style={s.text}>Creator-Name (privat)</Text>
    <TextInput style={s.input} accessibilityLabel="Creator-Name" value={creatorName}
      maxLength={80} onChangeText={setCreatorName} placeholder="Mein Kanal"
      placeholderTextColor="#a1a1aa" editable={privateVideoEnabled&&!busy}/>
    <TouchableOpacity accessibilityRole="button" disabled={!privateVideoEnabled||busy||!creatorName.trim()}
      style={s.button} onPress={()=>void saveCreator()}>
      <Text style={s.text}>Creator-Profil speichern</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" disabled={!privateVideoEnabled||busy}
      style={s.button} onPress={()=>void load()}>
      <Text style={s.text}>Meine privaten Videos laden</Text>
    </TouchableOpacity>
    {files.map(f=><TouchableOpacity key={f.path} accessibilityRole="button"
      style={s.button} disabled={busy} onPress={()=>void play(f)}>
      <Text style={s.text}>▶ {f.name}</Text>
    </TouchableOpacity>)}
    <VideoView player={player} style={s.video} nativeControls contentFit="contain"/>
    <Text style={s.text} accessibilityLiveRegion="polite">{notice}</Text>
  </View>;
}
const s=StyleSheet.create({
  container:{padding:12,gap:10,borderRadius:12,backgroundColor:'#18181b'},
  heading:{color:'#fda4af',fontSize:18,fontWeight:'700'},
  text:{color:'#f4f4f5',fontSize:14},
  button:{minHeight:44,backgroundColor:'#881337',padding:10,justifyContent:'center',borderRadius:8},
  video:{width:'100%',height:210,backgroundColor:'#000'},
  input:{minHeight:44,color:'#fff',borderWidth:1,borderColor:'#71717a',padding:10,borderRadius:8},
});
