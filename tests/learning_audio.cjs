// Executes the real importer with fake storage/STT/RPC. Never contacts a provider.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const owner='00000000-0000-0000-0000-000000000001';
function fixture(provider,{duplicate=false,failFinalize=false,failSTT=false}={}){
 const calls=[];let handler;
 const fetch=async(url,init={})=>{
  calls.push({url,init});
  if(url.includes('/rpc/')){
   const name=url.split('/').pop();
   if(name==='audio_notas_auth')return Response.json(owner);
   if(name==='audio_notas_reservar')return Response.json({ok:true,id:'audio-fixture',claim_id:'lease',novo:!duplicate,status:'transcrito',registro_id:'audio-record'});
   if(name==='audio_notas_finalizar')return Response.json({ok:!failFinalize,status:'transcrito',registro_id:'audio-record'});
   return Response.json(null);
  }
  if(url.includes('audio_transcricao_preferencias'))return Response.json([{provedor:provider}]);
  if(url.includes('/storage/'))return Response.json({});
  return Response.json({text:'Prefiro café'},{status:failSTT?429:200});
 };
 const env={SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-service',OPENAI_API_KEY:'x'.repeat(30),ELEVENLABS_API_KEY:'y'.repeat(30)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../supabase/functions/importar-audio-notas/index.ts'),'utf8'),{Request,Response,File,FormData,AbortSignal,crypto,TextEncoder,URL,fetch,Deno:{env:{get:k=>env[k]},serve:h=>{handler=h;}}});
 const run=()=>{const bytes=new Uint8Array(1200);bytes.set([73,68,51]);const form=new FormData();form.set('audio',new File([bytes],'note.mp3'));form.set('capturado_em','2026-11-01T12:00:00Z');return handler(new Request('https://edge.invalid',{method:'POST',headers:{'x-audio-token':'t'.repeat(50)},body:form}));};
 return {calls,run};
}
for(const provider of ['elevenlabs','openai'])test(`audio: ${provider} preserves transcript and server owner at finalization boundary`,async()=>{
 const f=fixture(provider),response=await f.run();assert.equal(response.status,200);assert.equal((await response.json()).registro_id,'audio-record');
 const args=JSON.parse(f.calls.find(c=>c.url.endsWith('/audio_notas_finalizar')).init.body);
 assert.equal(args.p_owner,owner);assert.equal(args.p_texto,'Prefiro café');assert.equal(args.p_claim_id,'lease');
 assert.equal(f.calls.filter(c=>c.url.includes('/storage/')).length,1);
 assert(f.calls.some(c=>c.url.includes(provider==='openai'?'api.openai.com':'api.elevenlabs.io')));
 assert(!f.calls.some(c=>c.url.includes('aprender-registro'))); // DB trigger owns durable enqueue, app may be closed.
});
test('audio: duplicate upload never retranscribes or finalizes again',async()=>{
 const f=fixture('openai',{duplicate:true});assert.equal((await f.run()).status,200);assert(!f.calls.some(c=>c.url.includes('/storage/')||c.url.includes('api.openai.com')||c.url.endsWith('/audio_notas_finalizar')));
});
for(const failure of ['failFinalize','failSTT'])test(`audio: ${failure} preserves original and reports failure`,async()=>{
 const f=fixture('openai',{[failure]:true}),response=await f.run();assert.equal(response.status,502);assert.equal((await response.json()).audio_preservado,true);assert(f.calls.some(c=>c.url.endsWith('/audio_notas_erro')));
});
