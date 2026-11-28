import React,{useEffect,useState} from 'react';
import {Image,Text,View,StyleSheet} from 'react-native';
import {approvedVideoThumbnail} from '../lib/videoPlatform';

export default function VideoThumbnail({id,available}:{id:string;available:boolean}){
 const [uri,setUri]=useState('');
 useEffect(()=>{
  let live=true;
  setUri('');
  if(available){
   void approvedVideoThumbnail(id).then(url=>{if(live)setUri(url);})
    .catch(()=>{if(live)setUri('');});
  }
  return ()=>{live=false;};
 },[id,available]);
 return <View style={styles.poster}>
  {uri?<Image source={{uri}} accessibilityLabel="Video-Vorschaubild" resizeMode="cover" style={styles.image}/>:
   <Text style={styles.label}>ASPEKT VIDEO</Text>}
 </View>;
}
const styles=StyleSheet.create({
 poster:{height:180,backgroundColor:'#27272a',borderRadius:10,
  justifyContent:'center',alignItems:'center',overflow:'hidden'},
 image:{height:'100%',width:'100%'},
 label:{color:'#e4e4e7',fontWeight:'700',letterSpacing:2},
});
