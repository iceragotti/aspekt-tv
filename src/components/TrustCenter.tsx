import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
type Appeal = { decision_id: string; outcome: 'upheld' | 'overturned' | null; resolution: string | null };
type Decision = { id: string; subject_id: string; moderator_id: string; explanation: string; reason: string; action: string; policy_version: string; created_at: string };
// Only loopback test servers are allowed until a reviewed staging allowlist exists.
const testUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const enabled = process.env.EXPO_PUBLIC_TRUST_STAGING === 'true' && /^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(testUrl);
export default function TrustCenter() {
 const [uid,setUid] = useState<string | null>(null);
 const [revision,setRevision] = useState(0);
 useEffect(() => {
   if (!enabled || !isSupabaseConfigured) return;
   const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {
     setUid(session?.user.id ?? null);
     setRevision(v=>v+1);
   });
   return ()=>subscription.unsubscribe();
 },[]);
 if (!enabled || !isSupabaseConfigured) return <Text style={s.text}>JUSTICE CENTER – nur für freigegebene Testumgebungen. Serveranbindung deaktiviert.</Text>;
 if (!uid) return <Text style={s.text}>Bitte zuerst im Messenger mit deinem Supabase-Konto anmelden.</Text>;
 return <Cases key={uid+':'+revision} uid={uid}/>;
}
function Cases({uid}:{uid:string}) {
 const [rows,setRows]=useState<Decision[]>([]);
 const [appeals,setAppeals]=useState<Appeal[]>([]);
 const [staff,setStaff]=useState(false);
 const [status,setStatus]=useState('Lade Entscheidungen …');
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [draft,setDraft]=useState<Record<string,string>>({});
 const [version,setVersion]=useState(0);
 useEffect(()=>{
   let active=true;
   setReady(false);setRows([]);setAppeals([]);setStaff(false);setStatus('Lade Entscheidungen …');
   void (async()=>{
     try {
       const role=await supabase.rpc('trust_is_staff');
       if(role.error) throw role.error;
       const decisions=await supabase.from('trust_decisions').select('id,subject_id,moderator_id,explanation,reason,action,policy_version,created_at').order('created_at',{ascending:false}).limit(100);
       if(decisions.error) throw decisions.error;
       const ids=(decisions.data??[]).map(d=>d.id);
       const result=ids.length?await supabase.from('trust_appeals').select('decision_id,outcome,resolution').in('decision_id',ids):{data:[],error:null};
       if(result.error) throw result.error;
       if(active){setRows(decisions.data??[]);setAppeals(result.data??[]);setStaff(role.data===true);setReady(true);setStatus('Bis zu 100 aktuelle Fälle geladen.');}
     } catch {if(active)setStatus('Fälle konnten nicht geladen werden. Testserver und Berechtigungen prüfen.');}
   })();
   return ()=>{active=false;};
 },[uid,version]);
 async function submit(id:string,outcome?:'upheld'|'overturned'){
   if(busy||!ready)return;
   const explanation=(draft[id]??'').trim();
   if(explanation.length<10||explanation.length>4000){setStatus('Bitte 10 bis 4000 Zeichen eingeben.');return;}
   setBusy(true);
   try{
     const result=outcome?await supabase.rpc('trust_resolve_appeal',{p_decision:id,p_outcome:outcome,p_resolution:explanation}):await supabase.rpc('trust_submit_appeal',{p_decision:id,p_explanation:explanation});
     if(result.error)throw result.error;
     setReady(false);setDraft(old=>({...old,[id]:''}));setVersion(v=>v+1);
   }catch{setStatus('Aktion nicht bestätigt. Bitte aktualisieren und Berechtigungen prüfen.');}
   finally{setBusy(false);}
 }
 return <View style={s.panel}>
 <Text style={s.heading}>{staff?'TRUST DASHBOARD / JUSTICE':'JUSTICE CENTER'}</Text>
 <Text style={s.text}>Testbetrieb: Entscheidungen werden angezeigt, Inhaltssperren noch nicht durchgesetzt.</Text>
 <Text accessibilityLiveRegion="polite" style={s.text}>{status}</Text>
 <TouchableOpacity accessibilityRole="button" disabled={busy} style={s.button} onPress={()=>setVersion(v=>v+1)}><Text style={s.text}>Aktualisieren</Text></TouchableOpacity>
 <Text style={s.heading}>Benachrichtigungen – Fallstatus</Text>
 {rows.map(d=>{
 const a=appeals.find(x=>x.decision_id===d.id);
 const own=d.subject_id===uid;
 const review=staff&&!own&&d.moderator_id!==uid&&!!a&&!a.outcome;
 return <View key={d.id} style={s.panel}>
 <Text style={s.text}>{new Date(d.created_at).toLocaleString('de-AT')} · {d.action} · {d.reason}</Text>
 <Text style={s.text}>Regelversion: {d.policy_version}</Text><Text style={s.text}>{d.explanation}</Text>
 <Text style={s.text}>{!a?'Kein Einspruch':a.outcome==='overturned'?'Aufgehoben':a.outcome==='upheld'?'Bestätigt':'Einspruch offen'}</Text>
 {a?.resolution&&<Text style={s.text}>{a.resolution}</Text>}
 {ready&&((own&&!a)||review)&&<>
 <Text style={s.text}>{review?'Prüfbegründung':'Einspruchsbegründung'}</Text>
 <TextInput accessibilityLabel={review?'Prüfbegründung':'Einspruchsbegründung'} multiline maxLength={4000} style={s.input} value={draft[d.id]??''} onChangeText={v=>setDraft(old=>({...old,[d.id]:v}))}/>
 {review?<><TouchableOpacity disabled={busy} style={s.button} onPress={()=>void submit(d.id,'upheld')}><Text style={s.text}>Bestätigen</Text></TouchableOpacity><TouchableOpacity disabled={busy} style={s.button} onPress={()=>void submit(d.id,'overturned')}><Text style={s.text}>Aufheben</Text></TouchableOpacity></>:<TouchableOpacity disabled={busy} style={s.button} onPress={()=>void submit(d.id)}><Text style={s.text}>Einspruch einreichen</Text></TouchableOpacity>}
 </>}
 </View>;
 })}
 </View>;
}
const s=StyleSheet.create({panel:{padding:12,gap:10,borderWidth:1,borderColor:'#52525b',borderRadius:12,backgroundColor:'#18181b'},heading:{color:'#fda4af',fontSize:18,fontWeight:'700'},text:{color:'#f4f4f5',fontSize:14},button:{minHeight:44,justifyContent:'center',padding:10,backgroundColor:'#881337',borderRadius:8},input:{color:'#fff',borderColor:'#71717a',borderWidth:1,minHeight:88,padding:10,borderRadius:8}});
