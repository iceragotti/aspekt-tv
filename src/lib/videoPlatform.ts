import {supabase} from './supabase';
import {privateVideoEnabled} from './privateVideo';

export type VideoEntry={
 id:string;title:string;description:string;kind:'video'|'short';
 status:string;published:boolean;created_at:string;
};
export type PublicVideoEntry={
 id:string;title:string;description:string;kind:'video'|'short';
 channel_handle:string;channel_name:string;channel_description:string;published_at:string;
};
export type VideoChannel={owner_id:string;handle:string;display_name:string;description:string};

function assertStage(){if(!privateVideoEnabled)throw Error('Video Platform ist nur in der isolierten lokalen Testumgebung aktiviert');}
function unwrap<T>(result:{data:T|null;error:{message:string}|null}):T{
 if(result.error)throw Error(result.error.message);
 if(result.data===null)throw Error('Daten nicht verfügbar');
 return result.data;
}
export async function myVideoChannel():Promise<VideoChannel|null>{
 assertStage();
 const {data:user,error}=await supabase.auth.getUser();
 if(error||!user.user)throw Error('Bitte anmelden');
 const result=await supabase.from('video_channels').select('owner_id,handle,display_name,description')
  .eq('owner_id',user.user.id).maybeSingle();
 return unwrap(result)??null;
}
export async function saveVideoChannel(handle:string,displayName:string,description:string):Promise<void>{
 assertStage();
 if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(handle)
 ||!displayName.trim()||displayName.trim().length>80||description.length>500)
 throw Error('Kanalangaben ungültig');
 const {error}=await supabase.from('video_channels')
  .upsert({handle,display_name:displayName.trim(),description},{onConflict:'owner_id'});
 if(error)throw error;
}
export async function myVideoLibrary():Promise<VideoEntry[]>{
 assertStage();
 const {data,error}=await supabase.rpc('video_my_library');
 if(error)throw error;
 return (data??[]) as VideoEntry[];
}
export async function publicVideoCatalog():Promise<PublicVideoEntry[]>{
 assertStage();
 const {data,error}=await supabase.rpc('video_public_catalog');
 if(error)throw error;
 return (data??[]) as PublicVideoEntry[];
}
export async function updateVideoMetadata(id:string,title:string,description:string,kind:'video'|'short'):Promise<void>{
 assertStage();
 if(!title.trim()||title.trim().length>120||description.length>2000)throw Error('Videodaten ungültig');
 const {error}=await supabase.rpc('video_save_metadata',{
  p_review_id:id,p_title:title.trim(),p_description:description,p_kind:kind
 });
 if(error)throw error;
}
export async function approvedVideoPlayback(id:string):Promise<string>{
 assertStage();
 if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Ungültiges Video');
 // Never contact an arbitrary host; only local Supabase Edge Functions.
 const base=process.env.EXPO_PUBLIC_SUPABASE_URL!;
 const res=await fetch(base+'/functions/v1/video-playback?id='+encodeURIComponent(id),{
  method:'GET',headers:{'Accept':'application/json'}
 });
 if(!res.ok)throw Error('Video ist nicht freigegeben oder der Test-Player ist deaktiviert');
 const payload=await res.json() as {url?:string;expiresIn?:number};
 if(!payload.url || payload.expiresIn!==60)throw Error('Ungültige Wiedergabeantwort');
 const u=new URL(payload.url);
 const origin=new URL(base);
 if(u.origin!==origin.origin || !u.pathname.includes('/storage/v1/object/sign/aspekt-video-processed/'))
 throw Error('Wiedergabequelle nicht erlaubt');
 return u.toString();
}
