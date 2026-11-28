import {supabase} from './supabase';
import {privateVideoEnabled} from './privateVideo';

export async function loadVideoCreatorName():Promise<string>{
  if(!privateVideoEnabled)throw new Error('Nur lokale Video-Testumgebung');
  const {data:user,error:authError}=await supabase.auth.getUser();
  if(authError||!user.user)throw new Error('Anmeldung erforderlich');
  const {data,error}=await supabase.from('video_creator_profiles')
    .select('display_name').eq('owner_id',user.user.id).maybeSingle();
  if(error)throw error;
  return data?.display_name??'';
}

export async function saveVideoCreatorName(name:string):Promise<void>{
  if(!privateVideoEnabled)throw new Error('Nur lokale Video-Testumgebung');
  const displayName=name.trim();
  if(displayName.length<1||displayName.length>80)throw new Error('Creator-Name: 1 bis 80 Zeichen');
  const {data:user,error:authError}=await supabase.auth.getUser();
  if(authError||!user.user)throw new Error('Anmeldung erforderlich');
  // owner_id defaults to auth.uid() in SQL; clients are not granted permission to set it.
  const {error}=await supabase.from('video_creator_profiles')
    .upsert({display_name:displayName},{onConflict:'owner_id'});
  if(error)throw error;
}
