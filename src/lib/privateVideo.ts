import {supabase, isSupabaseConfigured} from './supabase';

export const PRIVATE_VIDEO_BUCKET = 'aspekt-video-private';
export type PrivateVideoFile = {name:string;path:string};
const stageUrl = process.env.EXPO_PUBLIC_VIDEO_STAGING_URL;
export const privateVideoEnabled =
  process.env.EXPO_PUBLIC_VIDEO_STAGING === 'true' &&
  isSupabaseConfigured &&
  typeof stageUrl === 'string' && stageUrl.length > 0 &&
  stageUrl === process.env.EXPO_PUBLIC_SUPABASE_URL;
// Stage URL must be a dedicated non-production Supabase project, or loopback.
// This client flag is not a security boundary; RLS must enforce ownership.

async function userId():Promise<string>{
  if(!privateVideoEnabled) throw new Error('Video-Testserver nicht konfiguriert');
  const {data,error}=await supabase.auth.getUser();
  if(error||!data.user) throw new Error('Bitte anmelden');
  return data.user.id;
}
export async function listMyPrivateVideos():Promise<PrivateVideoFile[]>{
  const id=await userId();
  const {data,error}=await supabase.storage.from(PRIVATE_VIDEO_BUCKET).list(id,{
    limit:100,offset:0,sortBy:{column:'name',order:'desc'}
  });
  if(error)throw error;
  return (data??[]).filter(item=>
    /^[a-zA-Z0-9._-]+\.(mp4|webm)$/.test(item.name) && item.name!=='..'
  ).map(item=>({name:item.name,path:id+'/'+item.name}));
}
export async function signedPrivatePlayback(path:string):Promise<string>{
  const id=await userId();
  // Never sign arbitrary paths supplied by the caller.
  if(!/^[a-zA-Z0-9._-]+\.(mp4|webm)$/.test(path.slice(id.length+1)) ||
    !path.startsWith(id+'/') || path.split('/').length!==2) throw new Error('Ungültiger Pfad');
  const {data,error}=await supabase.storage.from(PRIVATE_VIDEO_BUCKET).createSignedUrl(path,300);
  if(error||!data?.signedUrl)throw error??new Error('Kein privater Link verfügbar');
  return data.signedUrl;
}
