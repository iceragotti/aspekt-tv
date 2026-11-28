import {createClient} from 'npm:@supabase/supabase-js@2';
// Phase 6.6: local-only opt-in; never auto-deployed by CI.
const enabled=Deno.env.get('VIDEO_PUBLIC_DELIVERY_ENABLED')==='true';
const baseUrl=Deno.env.get('SUPABASE_URL')??'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const db=createClient(baseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

Deno.serve(async (request:Request):Promise<Response>=>{
 const headers={
  'Cache-Control':'no-store',
  'Content-Type':'application/json',
  'X-Content-Type-Options':'nosniff',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'apikey,authorization,content-type'
 };
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!enabled || request.method!=='GET')
  return new Response('{"error":"unavailable"}',{status:404,headers});
 try{
  const u=new URL(request.url);
  const id=u.searchParams.get('id')??'';
  const kind=u.searchParams.get('media')??'video';
  if(kind!=='video'&&kind!=='thumbnail')
   return new Response('{"error":"invalid_media"}',{status:400,headers});
  if(!/^[0-9a-f-]{36}$/.test(id))
   return new Response('{"error":"invalid_id"}',{status:400,headers});

  const {data:publication,error:publicationError}=await db
   .from('video_publications').select('review_id')
   .eq('review_id',id).is('revoked_at',null).maybeSingle();
  if(publicationError||!publication)
   return new Response('{"error":"unavailable"}',{status:404,headers});

  const {data:review,error:reviewError}=await db
   .from('video_review').select('state,processed_path,thumbnail_path')
   .eq('id',id).eq('state','approved').maybeSingle();
  if(reviewError||!review?.processed_path)
   return new Response('{"error":"unavailable"}',{status:404,headers});

  const isVideoPath=typeof review.processed_path==='string'
   &&new RegExp('^'+id+'/[0-9a-f-]{36}[.]mp4$').test(review.processed_path);
  const target=kind==='thumbnail'?review.thumbnail_path:review.processed_path;
  const isPosterPath=kind!=='thumbnail'
   ||(typeof target==='string'&&new RegExp('^'+id+'/[0-9a-f-]{36}[.]jpg$').test(target));
  if(!isVideoPath||!isPosterPath||typeof target!=='string')
   return new Response('{"error":"unavailable"}',{status:404,headers});

  const {data,error}=await db.storage.from('aspekt-video-processed')
   .createSignedUrl(target,60);
  if(error||!data?.signedUrl)
   return new Response('{"error":"unavailable"}',{status:404,headers});
  const signed=new URL(data.signedUrl);
  const allowed='/storage/v1/object/sign/aspekt-video-processed/';
  if(!signed.pathname.startsWith(allowed)||!signed.searchParams.has('token'))
   return new Response('{"error":"unavailable"}',{status:404,headers});
  return new Response(JSON.stringify({
   path:signed.pathname+signed.search,expiresIn:60
  }),{status:200,headers});
 }catch{
  return new Response('{"error":"unavailable"}',{status:404,headers});
 }
});
