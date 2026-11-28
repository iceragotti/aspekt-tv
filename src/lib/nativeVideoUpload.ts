import * as DocumentPicker from 'expo-document-picker';
import {File} from 'expo-file-system';
import {supabase} from './supabase';
import {privateVideoEnabled,PRIVATE_VIDEO_BUCKET} from './privateVideo';
import {updateVideoMetadata} from './videoPlatform';

export type NativeVideoSelection={
 uri:string;name:string;size:number;mime:'video/mp4'|'video/webm';
};
export const MAX_BETA_VIDEO_BYTES=20*1024*1024;

/** Reject extension/MIME confusion before reading into native JS memory. */
export function validateNativeVideoSelection(asset:{
 uri:string;name:string;size?:number;mimeType?:string|null;
}):NativeVideoSelection{
 const name=asset.name.trim();
 const ext=name.toLowerCase().split('.').pop();
 if(ext!=='mp4'&&ext!=='webm')throw Error('Nur MP4 oder WebM zulässig');
 const mime=ext==='mp4'?'video/mp4':'video/webm';
 if(asset.mimeType && asset.mimeType!==mime && asset.mimeType!=='application/octet-stream')
  throw Error('Dateityp und Endung stimmen nicht überein');
 if(!Number.isFinite(asset.size)||!(asset.size!>=12)||asset.size!>MAX_BETA_VIDEO_BYTES)
  throw Error('Video muss zwischen 12 Bytes und 20 MiB groß sein');
 if(!asset.uri.startsWith('file://'))throw Error('Kein lokaler Cache-Zugriff verfügbar');
 return {uri:asset.uri,name,size:asset.size!,mime};
}
export async function pickNativeVideo():Promise<NativeVideoSelection|null>{
 if(!privateVideoEnabled)throw Error('Lokale Supabase-Testumgebung erforderlich');
 const result=await DocumentPicker.getDocumentAsync({
  type:['video/mp4','video/webm'],copyToCacheDirectory:true,multiple:false
 });
 if(result.canceled)return null;
 const asset=result.assets[0];
 if(!asset)throw Error('Keine Videodatei gewählt');
 return validateNativeVideoSelection(asset);
}
export function sniffVideoHeader(bytes:Uint8Array,mime:string):boolean{
 if(bytes.length<12)return false;
 const mp4=String.fromCharCode(...bytes.subarray(4,8))==='ftyp';
 const webm=bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
 return mime==='video/mp4'?mp4:mime==='video/webm'&&webm;
}
export type UploadProgress={stage:'reading'|'uploading'|'quarantine'|'complete';percent:number};
export async function uploadNativeVideo(
 chosen:NativeVideoSelection,
 metadata:{title:string;description:string;kind:'video'|'short'},
 progress:(p:UploadProgress)=>void,
 signal?:AbortSignal
):Promise<string>{
 if(!privateVideoEnabled)throw Error('Nur lokaler Video-Testserver erlaubt');
 if(!metadata.title.trim()||metadata.title.trim().length>120||metadata.description.length>2000)
  throw Error('Titel oder Beschreibung ungültig');
 const accepted=validateNativeVideoSelection({
  uri:chosen.uri,name:chosen.name,size:chosen.size,mimeType:chosen.mime
 });
 if(signal?.aborted)throw Error('Upload abgebrochen');
 const {data:auth,error:authError}=await supabase.auth.getUser();
 if(authError||!auth.user)throw Error('Bitte anmelden');
 const {data:session,error:sessionError}=await supabase.auth.getSession();
 if(sessionError||!session.session?.access_token||session.session.user.id!==auth.user.id)
  throw Error('Anmeldung abgelaufen');
 progress({stage:'reading',percent:0});
 const local=new File(accepted.uri);
 if(!local.exists||local.size!==accepted.size||local.size>MAX_BETA_VIDEO_BYTES)
  throw Error('Dateigröße geändert; erneut auswählen');
 const bytes=await local.arrayBuffer();
 if(bytes.byteLength!==accepted.size||!sniffVideoHeader(new Uint8Array(bytes,0,Math.min(16,bytes.byteLength)),accepted.mime))
  throw Error('Videodatei ist beschädigt oder kein unterstütztes Format');
 if(signal?.aborted)throw Error('Upload abgebrochen');
 const fileName=globalThis.crypto?.randomUUID?.();
 if(!fileName)throw Error('Sichere Upload-ID nicht verfügbar');
 const path=auth.user.id+'/'+fileName+(accepted.mime==='video/mp4'?'.mp4':'.webm');
 const url=process.env.EXPO_PUBLIC_SUPABASE_URL!;
 const anon=process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
 // Storage API is the real upload target. Progress is measured from XHR bytes,
 // not simulated timers. RLS checks the owner folder and bucket.
 await new Promise<void>((resolve,reject)=>{
  const req=new XMLHttpRequest();
  let settled=false;
  const fail=(message:string)=>{
   if(settled)return;settled=true;reject(Error(message));
  };
  const cancel=()=>{req.abort();fail('Upload abgebrochen');};
  signal?.addEventListener('abort',cancel,{once:true});
  req.open('POST',url+'/storage/v1/object/'+PRIVATE_VIDEO_BUCKET+'/'+path);
  req.setRequestHeader('apikey',anon);
  req.setRequestHeader('Authorization','Bearer '+session.session!.access_token);
  req.setRequestHeader('Content-Type',accepted.mime);
  req.setRequestHeader('x-upsert','false');
  req.timeout=120000;
  req.upload.onprogress=(event)=>{
   if(event.lengthComputable&&event.total>0){
    progress({stage:'uploading',percent:Math.min(99,Math.floor(100*event.loaded/event.total))});
   }
  };
  req.onerror=()=>fail('Netzwerkfehler beim Upload');
  req.ontimeout=()=>fail('Upload-Zeitlimit erreicht');
  req.onabort=()=>fail('Upload abgebrochen');
  req.onload=()=>{
   signal?.removeEventListener('abort',cancel);
   if(settled)return;
   if(req.status<200||req.status>=300)fail('Speicherung fehlgeschlagen (HTTP '+req.status+')');
   else{settled=true;resolve();}
  };
  try{req.send(bytes);}catch{fail('Video konnte nicht hochgeladen werden');}
 });
 progress({stage:'quarantine',percent:100});
 // Quarantine registration and editable metadata never imply public release.
 const {data:reviewId,error:registeredError}=await supabase.rpc('video_register_upload',{p_path:path});
 if(registeredError||typeof reviewId!=='string')
  throw Error('Upload gespeichert, aber Quarantäne-Registrierung fehlgeschlagen. Bitte Support informieren.');
 await updateVideoMetadata(reviewId,metadata.title,metadata.description,metadata.kind);
 progress({stage:'complete',percent:100});
 return reviewId;
}
