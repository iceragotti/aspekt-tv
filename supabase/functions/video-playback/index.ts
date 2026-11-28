import {createClient} from 'npm:@supabase/supabase-js@2';
// Explicit opt-in. This Edge Function is not deployed by CI.
const enabled=Deno.env.get('VIDEO_PUBLIC_DELIVERY_ENABLED')==='true';
const url=Deno.env.get('SUPABASE_URL')??'';
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async request=>{
 const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
 if(!enabled || request.method!=='GET')return new Response('{"error":"unavailable"}',{status:404,headers});
 try {
  const requestUrl=new URL(request.url);
  const id=requestUrl.searchParams.get('id')??'';
  if(!/^[0-9a-f-]{36}$/.test(id))return new Response('{"error":"invalid_id"}',{status:400,headers});
  const {data:publication,error:readError}=await db.from('video_publications')
   .select('review_id,revoked_at').eq('review_id',id).is('revoked_at',null).maybeSingle();
  if(readError||!publication)return new Response('{"error":"unavailable"}',{status:404,headers});
  const {data:review,error:reviewError}=await db.from('video_review')
   .select('state,processed_path').eq('id',id).eq('state','approved').maybeSingle();
  if(reviewError||!review?.processed_path)return new Response('{"error":"unavailable"}',{status:404,headers});
  if(!new RegExp('^'+id+'/[0-9a-f-]{36}[.]mp4$').test(review.processed_path))
   return new Response('{"error":"unavailable"}',{status:404,headers});
  const {data,error}=await db.storage.from('aspekt-video-processed').createSignedUrl(review.processed_path,60);
  if(error||!data?.signedUrl)return new Response('{"error":"unavailable"}',{status:404,headers});
  return new Response(JSON.stringify({url:data.signedUrl,expiresIn:60}),{status:200,headers});
 }catch{return new Response('{"error":"unavailable"}',{status:404,headers});}
});
