import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet,ScrollView} from 'react-native';
import PrivateVideo from './PrivateVideo';
import PublicVideo from './PublicVideo';
import {supabase} from '../lib/supabase';
import {privateVideoEnabled} from '../lib/privateVideo';
import {
 myVideoLibrary,publicVideoCatalog,myVideoChannel,saveVideoChannel,
 updateVideoMetadata,type VideoEntry,type PublicVideoEntry
} from '../lib/videoPlatform';

type Section='Discover'|'Shorts'|'Channels'|'Library'|'Studio';
const sections:Section[]=['Discover','Shorts','Channels','Library','Studio'];
export default function VideoCenter({onFreedom}:{onFreedom:()=>void}){
 const [section,setSection]=useState<Section>('Discover');
 const [published,setPublished]=useState<PublicVideoEntry[]>([]);
 const [library,setLibrary]=useState<VideoEntry[]>([]);
 const [handle,setHandle]=useState('');
 const [displayName,setDisplayName]=useState('');
 const [bio,setBio]=useState('');
 const [selected,setSelected]=useState<string|null>(null);
 const [editing,setEditing]=useState<string|null>(null);
 const [title,setTitle]=useState('');
 const [description,setDescription]=useState('');
 const [kind,setKind]=useState<'video'|'short'>('video');
 const [notice,setNotice]=useState('Zum Laden der Video-Plattform ist eine lokale Testumgebung erforderlich.');
 const [busy,setBusy]=useState(false);

 useEffect(()=>{
   const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>{
     setPublished([]);setLibrary([]);setSelected(null);setEditing(null);
   });
   return ()=>subscription.unsubscribe();
 },[]);

 async function load(){
   if(!privateVideoEnabled||busy)return;
   setBusy(true);
   try{
     const [catalog,items,channel]=await Promise.all([
       publicVideoCatalog(),myVideoLibrary(),myVideoChannel()
     ]);
     setPublished(catalog);setLibrary(items);
     setHandle(channel?.handle??'');setDisplayName(channel?.display_name??'');
     setBio(channel?.description??'');
     setNotice('Echte Video- und Kanaldaten geladen.');
   }catch{
     setPublished([]);setLibrary([]);setNotice('Daten konnten nicht geladen werden. Anmeldung und lokale Supabase-Migrationen prüfen.');
   }finally{setBusy(false);}
 }
 async function saveChannel(){
   if(busy)return;
   setBusy(true);
   try{await saveVideoChannel(handle,displayName,bio);setNotice('Creator-Kanal gespeichert.');}
   catch{setNotice('Kanal konnte nicht gespeichert werden. Handle muss einzigartig und gültig sein.');}
   finally{setBusy(false);}
 }
 async function saveDetails(){
   if(!editing||busy)return;
   setBusy(true);
   try{
     await updateVideoMetadata(editing,title,description,kind);
     setEditing(null);setLibrary(await myVideoLibrary());
     setNotice('Videodetails dauerhaft gespeichert.');
   }catch{setNotice('Videodetails nicht speicherbar – ggf. bereits veröffentlicht.');}
   finally{setBusy(false);}
 }
 const button=(label:string,action:()=>void,key=label,disabled=false)=>
   <TouchableOpacity key={key} accessibilityRole="button" disabled={disabled}
     style={[s.button,disabled&&s.disabled]} onPress={action}>
     <Text style={s.text}>{label}</Text>
   </TouchableOpacity>;
 const fields=(label:string,value:string,change:(x:string)=>void,max:number,multiline=false)=>
   <View style={s.field} key={label}><Text style={s.text}>{label}</Text>
     <TextInput accessibilityLabel={label} style={[s.input,multiline&&s.multiline]}
       value={value} onChangeText={change} maxLength={max}
       editable={!busy&&privateVideoEnabled} multiline={multiline}
       placeholderTextColor="#a1a1aa"/>
   </View>;
 const cards=section==='Shorts'?published.filter(v=>v.kind==='short'):published;
 return <ScrollView contentContainerStyle={s.panel}>
   <Text style={s.heading}>ASPEKT VIDEO PLATFORM PRO</Text>
   <Text style={s.text}>Echte Creator-Kanäle, Videoverwaltung und Veröffentlichungsstatus. Keine Beispieldaten.</Text>
   <View style={s.row}>{sections.map(x=>button(x,()=>{
     setSection(x);setSelected(null);setEditing(null);
   },x))}</View>
   {button('FREEDOM / TRUST & JUSTICE',onFreedom)}
   {button('Video-Plattform aktualisieren',()=>void load(),'refresh',!privateVideoEnabled||busy)}
   <Text style={s.text} accessibilityLiveRegion="polite">{notice}</Text>
   <Text style={s.heading}>{section}</Text>
   {(section==='Discover'||section==='Shorts')&&<>
     {cards.length===0&&<Text style={s.text}>Derzeit keine freigegebenen Videos verfügbar.</Text>}
     {cards.map(v=><View key={v.id} style={s.card}>
       <Text style={s.heading}>{v.title}</Text>
       <Text style={s.text}>@{v.channel_handle} · {v.channel_name} · {v.kind==='short'?'Short':'Video'}</Text>
       {Boolean(v.description)&&<Text style={s.text}>{v.description}</Text>}
       {button(selected===v.id?'Player schließen':'▶ Freigegebenes Video abspielen',
        ()=>setSelected(old=>old===v.id?null:v.id),'play-'+v.id)}
       {selected===v.id&&<PublicVideo id={v.id}/>}
     </View>)}
   </>}
   {section==='Channels'&&<>
     <Text style={s.text}>Eigener Creator-Kanal – nur das angemeldete Testkonto darf Änderungen speichern.</Text>
     {fields('Kanal-Handle (3–30 Zeichen)',handle,x=>setHandle(x.toLowerCase()),30)}
     {fields('Kanalname',displayName,setDisplayName,80)}
     {fields('Kanalbeschreibung',bio,setBio,500,true)}
     {button('Kanal speichern',()=>void saveChannel(),'save-channel',busy||!privateVideoEnabled)}
     {published.length>0&&<>
       <Text style={s.heading}>Veröffentlichte Kanäle</Text>
       {Array.from(new Map(published.map(v=>[v.channel_handle,v])).values()).map(v=>
         <View key={v.channel_handle} style={s.card}>
           <Text style={s.text}>@{v.channel_handle} · {v.channel_name}</Text>
           <Text style={s.text}>{v.channel_description}</Text>
         </View>)}
     </>}
   </>}
   {section==='Library'&&<>
     <Text style={s.text}>Meine Videobibliothek – Status wird vom Server bestimmt, nicht durch lokale Klicks.</Text>
     {library.length===0&&<Text style={s.text}>Noch keine eigenen Uploads vorhanden.</Text>}
     {library.map(v=><View key={v.id} style={s.card}>
       <Text style={s.heading}>{v.title}</Text>
       <Text style={s.text}>{v.kind} · Prüfung: {v.status} · Veröffentlichung: {v.published?'Aktiv':'Nicht öffentlich'}</Text>
       {button('Videodetails bearbeiten',()=>{
         setEditing(v.id);setTitle(v.title==='Unbenannt'?'':v.title);
         setDescription(v.description);setKind(v.kind);
       },'edit-'+v.id,!privateVideoEnabled||v.published)}
       {editing===v.id&&<>
         {fields('Videotitel',title,setTitle,120)}
         {fields('Videobeschreibung',description,setDescription,2000,true)}
         {button('Format: '+kind,()=>setKind(x=>x==='video'?'short':'video'))}
         {button('Details speichern',()=>void saveDetails(),'save-'+v.id,busy||!title.trim())}
       </>}
     </View>)}
   </>}
   {section==='Studio'&&<>
     <Text style={s.text}>Private Uploads und Creator-Profile. Zur Veröffentlichung sind Medienprüfung und unabhängige Moderation erforderlich.</Text>
     <PrivateVideo/>
     <Text style={s.text}>Die Videodetails können nach dem Upload im Bereich Library bearbeitet werden.</Text>
   </>}
 </ScrollView>;
}
const s=StyleSheet.create({
 panel:{padding:12,gap:12,backgroundColor:'#18181b'},
 card:{padding:12,gap:8,borderWidth:1,borderColor:'#52525b',borderRadius:12},
 row:{flexDirection:'row',flexWrap:'wrap',gap:8},
 heading:{color:'#fda4af',fontSize:18,fontWeight:'700'},
 text:{color:'#f4f4f5',fontSize:14},
 button:{minHeight:44,justifyContent:'center',padding:10,backgroundColor:'#881337',borderRadius:8},
 disabled:{opacity:0.45},
 field:{gap:5},
 input:{color:'#fff',borderColor:'#71717a',borderWidth:1,minHeight:44,padding:10,borderRadius:8},
 multiline:{minHeight:92,textAlignVertical:'top'},
});
