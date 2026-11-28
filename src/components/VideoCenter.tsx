import React, {useState} from 'react';
import {View,Text,TextInput,TouchableOpacity,StyleSheet} from 'react-native';
import PrivateVideo from './PrivateVideo';
import {selectFeed} from '../domain/freedom';
type Video = {id:string;authorId:string;createdAt:number;title:string;kind:'video'|'short';draft:boolean};
type Section = 'Discover'|'Shorts'|'Channels'|'Library'|'Studio';
const sections:Section[]=['Discover','Shorts','Channels','Library','Studio'];
const samples:Video[]=[
 {id:'sample-1',authorId:'ASPEKT Redaktion',createdAt:2,title:'Willkommen bei ASPEKT VIDEO',kind:'video',draft:false},
 {id:'sample-2',authorId:'ASPEKT Creator',createdAt:1,title:'Eine Welt. Viele Stimmen.',kind:'short',draft:false}
];
export default function VideoCenter({onFreedom}:{onFreedom:()=>void}){
 const [section,setSection]=useState<Section>('Discover');
 const [mode,setMode]=useState<'chronological'|'following'>('chronological');
 const [following,setFollowing]=useState<string[]>([]);
 const [saved,setSaved]=useState<string[]>([]);
 const [drafts,setDrafts]=useState<Video[]>([]);
 const [title,setTitle]=useState('');
 const [kind,setKind]=useState<'video'|'short'>('video');
 const [selected,setSelected]=useState<Video|null>(null);
 const toggle=(items:string[],id:string)=>items.includes(id)?items.filter(x=>x!==id):[...items,id];
 const visible=selectFeed(samples,mode,new Set(following)).filter(v=>section!=='Shorts'||v.kind==='short');
 const button=(label:string,action:()=>void,key=label)=><TouchableOpacity key={key} accessibilityRole="button" style={s.button} onPress={action}><Text style={s.text}>{label}</Text></TouchableOpacity>;
 return <View style={s.panel}>
 <Text style={s.heading}>ASPEKT VIDEO & SHORTS</Text>
 <Text style={s.text}>Lokaler Prototyp: Beispieldaten, keine veröffentlichten Videos. Einstellungen und Entwürfe gelten nur für diese Ansicht.</Text>
 <View style={s.row}>{sections.map(x=>button(x,()=>{setSection(x);setSelected(null);}))}</View>
 <Text style={s.heading}>{section}</Text>
 {button('FREEDOM / TRUST & JUSTICE',onFreedom)}
 {(section==='Discover'||section==='Shorts')&&<>
 <Text style={s.text}>MY ALGORITHM: {mode==='chronological'?'Neueste zuerst':'Nur gefolgte Kanäle'}</Text>
 {button('Chronologisch',()=>setMode('chronological'))}{button('Gefolgt',()=>setMode('following'))}
 </>}
 {section==='Channels'&&Array.from(new Set(samples.map(v=>v.authorId))).map(id=>button(id+(following.includes(id)?' · Gefolgt':' · Folgen'),()=>setFollowing(old=>toggle(old,id)),id))}
 {section==='Studio'?<>
 <Text style={s.text}>Videoentwurf – privater Testupload im Web, Veröffentlichung deaktiviert.</Text>
 <PrivateVideo />
 <Text style={s.text}>Titel</Text><TextInput accessibilityLabel="Videotitel" style={s.input} value={title} maxLength={120} onChangeText={setTitle}/>
 {button('Format: '+kind,()=>setKind(k=>k==='video'?'short':'video'))}
 {button('Entwurf erstellen',()=>{if(!title.trim())return;setDrafts(old=>[...old,{id:'draft-'+Date.now()+'-'+old.length,authorId:'Lokaler Creator',createdAt:Date.now(),title:title.trim(),kind,draft:true}]);setTitle('');})}
 {drafts.map(v=><Text key={v.id} style={s.text}>{v.title} · Entwurf</Text>)}
 </>:section!=='Channels'&&<>
 {(section==='Library'?samples.filter(v=>saved.includes(v.id)):visible).map(v=><View key={v.id} style={s.panel}>
 <Text style={s.heading}>{v.title}</Text><Text style={s.text}>{v.authorId} · {v.kind} · Beispiel</Text>
 {button('Details',()=>setSelected(v))}{button(saved.includes(v.id)?'Aus Merkliste entfernen':'Merken',()=>setSaved(old=>toggle(old,v.id)))}
 </View>)}
 {selected&&<View style={s.panel}><Text style={s.heading}>{selected.title}</Text><Text style={s.text}>Player-Platzhalter: keine Mediendatei vorhanden.</Text>{button('Schließen',()=>setSelected(null))}</View>}
 </>}
 </View>;
}
const s=StyleSheet.create({panel:{padding:12,gap:10,borderWidth:1,borderColor:'#52525b',borderRadius:12,backgroundColor:'#18181b'},row:{flexDirection:'row',flexWrap:'wrap',gap:8},heading:{color:'#fda4af',fontSize:18,fontWeight:'700'},text:{color:'#f4f4f5',fontSize:14},button:{minHeight:44,justifyContent:'center',padding:10,backgroundColor:'#881337',borderRadius:8},input:{color:'#fff',borderColor:'#71717a',borderWidth:1,minHeight:44,padding:10,borderRadius:8}});
