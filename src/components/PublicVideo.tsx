import React,{useEffect,useState} from 'react';
import {View,Text,StyleSheet,TouchableOpacity} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
import {approvedVideoPlayback} from '../lib/videoPlatform';
export default function PublicVideo({id}:{id:string}){
 const player=useVideoPlayer(null);
 const [status,setStatus]=useState('Noch nicht geladen.');
 const [busy,setBusy]=useState(false);
 useEffect(()=>()=>{player.pause();},[player]);
 async function start(){
  if(busy)return;
  setBusy(true);
  try{
   const url=await approvedVideoPlayback(id);
   await player.replaceAsync({uri:url});
   player.play();
   setStatus('Freigegebene Videowiedergabe gestartet. Link läuft nach 60 Sekunden ab.');
  }catch{
   setStatus('Video nicht verfügbar. Die öffentliche Test-Auslieferung ist möglicherweise deaktiviert.');
  }finally{setBusy(false);}
 }
 return <View style={s.panel}>
  <TouchableOpacity accessibilityRole="button" style={s.button} disabled={busy}
   onPress={()=>void start()}><Text style={s.text}>▶ Freigegebenes Video laden</Text></TouchableOpacity>
  <VideoView player={player} nativeControls contentFit="contain" style={s.video}/>
  <Text style={s.text} accessibilityLiveRegion="polite">{status}</Text>
 </View>;
}
const s=StyleSheet.create({
 panel:{gap:8,padding:8},
 button:{minHeight:44,backgroundColor:'#881337',justifyContent:'center',padding:12,borderRadius:8},
 text:{color:'#f4f4f5'},
 video:{height:220,width:'100%',backgroundColor:'#000'},
});
