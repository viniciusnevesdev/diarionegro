/* No credentials, network, or remote database. Executes the real Edge Function. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const ROOT=path.resolve(__dirname,'..');
const SCHEDULER_SECRET='local-test-scheduler-private-token-abcdefghijklmnopqrstuvwxyz123456';
function loadWorker(fetch, env={}) {
  const cache={};
  const context=vm.createContext({Request,Response,AbortSignal,TextEncoder,crypto,structuredClone,fetch,
    Deno:{env:{get:name=>({...{SUPABASE_URL:'https://db.invalid',SUPABASE_SERVICE_ROLE_KEY:'service-secret',OPENAI_API_KEY:'fake-key',DN_CONTINUOUS_LEARNING_ENABLED:'true',DN_LEARNING_SCHEDULER_KEY:SCHEDULER_SECRET},...env})[name]},serve(){}}});
  function load(file) {
    if(cache[file]) return cache[file];
    let code=stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'strip'});
    code=code.replace(/^import "jsr:[^\n]+\n/gm,'').replace(/^import \{([^}]+)\} from "([^"]+)";/gm,(_,names,src)=>`const {${names}} = require(${JSON.stringify(path.resolve(path.dirname(file),src))});`);
    const names=[...code.matchAll(/export (?:async )?(?:const|function) (\w+)/g)].map(m=>m[1]);
    code=code.replace(/export /g,'');
    const fn=vm.runInContext(`(function(require){${code};return {${names.join(',')}};})`,context,{filename:file});
    return cache[file]=fn(load);
  }
  return load(path.join(ROOT,'supabase/functions/aprender-registro/index.ts')).handle;
}
const memory={texto:'Prefiro café',tipo:'preferencia',categoria:'Rotina',classificacao:'declaracao_clara',evidencia:'Prefiro café',justificativa:'Preferência declarada',confianca:.98,aspecto:'pessoa:preferencia:bebida',valor:'café'};
const result=()=>({resumo:'Preferência',intencao:'registro',categoria:'Rotina',memorias:[{...memory}],associacoes:[{sujeito:'café',relacao:'associado a',objeto:'foco',evidencia:'café me ajuda a focar',justificativa:'Associação declarada',confianca:.7}]});
function fixture() {
 const f={calls:[],ai:0,checkpoints:0,applied:0,failApply:false,failCheckpoint:false,failAI:false,
   job:{id:'job',user_id:'owner',record_id:'r1',texto:'Prefiro café, café me ajuda a focar',entrada:'audio_ia',registrado_em:'2026-11-12',lease_token:'lease',resultado:null}};
 f.fetch=async(url,options)=>{
  if(url.endsWith('/auth/v1/user')) return Response.json({id:'owner'});
  if(url.includes('api.openai.com')) {f.ai++; if(f.failAI) return Response.json({}, {status:429});return Response.json({output_text:JSON.stringify(f.output||result())});}
  const name=url.split('/').pop(), body=JSON.parse(options.body);f.calls.push({name,body});
  if(name==='dn_aprendizado_claim') return Response.json(f.job);
  if(name==='dn_aprendizado_reservar_cota') return Response.json(!f.quotaDenied);
  if(name==='dn_aprendizado_checkpoint') { f.checkpoints++; if(f.failCheckpoint) return Response.json({}, {status:500});f.job.resultado=body.p_resultado; }
  if(name==='dn_aprendizado_aplicar') {if(f.failApply) return Response.json({}, {status:500});f.applied++;f.job=null;}
  return Response.json(null);
 };
 return f;
}
function req(token='user-token',body={},scheduler='') {return new Request('https://edge.invalid',{method:'POST',headers:{Authorization:`Bearer ${token}`,...(scheduler?{'x-dn-scheduler':scheduler}:{})},body:JSON.stringify(body)});}
test('new audio note learns immediately; source is server owned and no task API is called',async()=>{
 const f=fixture(), handle=loadWorker(f.fetch);
 assert.equal((await handle(req('user-token',{texto:'injected',user_id:'other'}))).status,200);
 assert.equal(f.ai,1);assert.equal(f.applied,1);
 assert.equal(f.calls[0].body.p_user,'owner');
 const saved=f.calls.find(x=>x.name==='dn_aprendizado_checkpoint').body.p_resultado;
 assert.equal(saved.memorias[0].evidencia,'Prefiro café');assert.match(saved.associacoes[0].fingerprint,/^sha256-nfkc-v1:[a-f0-9]{64}$/);
 assert(f.calls.every(x=>x.name.startsWith('dn_aprendizado_')));
});
test('completed job is idempotent and does not pay for another extraction',async()=>{
 const f=fixture(),handle=loadWorker(f.fetch);await handle(req());await handle(req());assert.equal(f.ai,1);assert.equal(f.applied,1);
});
test('application failure resumes from checkpoint with zero extra AI calls',async()=>{
 const f=fixture(),handle=loadWorker(f.fetch);f.failApply=true;
 assert.equal((await handle(req())).status,503);assert(f.job.resultado);assert(f.calls.some(x=>x.name==='dn_aprendizado_falhou'));
 f.failApply=false;assert.equal((await handle(req())).status,200);assert.equal(f.ai,1);assert.equal(f.checkpoints,1);
});
test('checkpoint failure never applies unpersisted extraction',async()=>{
 const f=fixture();f.failCheckpoint=true;assert.equal((await loadWorker(f.fetch)(req())).status,503);assert.equal(f.applied,0);
});
test('provider failure backs off without writing a memory',async()=>{
 const f=fixture();f.failAI=true;assert.equal((await loadWorker(f.fetch)(req())).status,503);assert.equal(f.checkpoints,0);assert.equal(f.applied,0);
});
test('daily exhausted budget never calls the language model',async()=>{
 const f=fixture();f.quotaDenied=true;
 const res=await loadWorker(f.fetch)(req());
 assert.equal(res.status,503);
 assert.equal(f.ai,0);
 assert.equal(f.checkpoints,0);
 assert.equal(f.applied,0);
});
test('fabricated evidence cannot reach persistence',async()=>{
 const f=fixture();f.output=result();f.output.memorias[0].evidencia='never said';assert.equal((await loadWorker(f.fetch)(req())).status,503);assert.equal(f.checkpoints,0);
});
test('missing authorization and invalid session never claim or call AI',async()=>{
 const f=fixture();const h=loadWorker(f.fetch);assert.equal((await h(new Request('https://edge.invalid',{method:'POST'}))).status,401);assert.equal(f.calls.length,0);
 const bad=loadWorker(async()=>Response.json({}, {status:401}));assert.equal((await bad(req())).status,401);
});
test('private scheduler can drain all owners and kill switch prevents costs',async()=>{
 const f=fixture();await loadWorker(f.fetch)(req('public-anon-jwt',{},SCHEDULER_SECRET));assert.equal(f.calls[0].body.p_user,null);
 const noBypass=fixture();await loadWorker(noBypass.fetch)(req('service-secret'));assert.equal(noBypass.calls[0].body.p_user,'owner');
 const wrong=fixture();await loadWorker(wrong.fetch)(req('public-anon-jwt',{},'incorrect'));assert.equal(wrong.calls[0].body.p_user,'owner');
 const g=fixture();assert.equal((await loadWorker(g.fetch,{DN_CONTINUOUS_LEARNING_ENABLED:'false'})(req())).status,503);assert.equal(g.ai,0);assert.equal(g.calls.length,0);
 for(const flag of [undefined,'TRUE','1','invalid','']) {
  const h=fixture();assert.equal((await loadWorker(h.fetch,{DN_CONTINUOUS_LEARNING_ENABLED:flag})(req())).status,503);
  assert.equal(h.ai,0);assert.equal(h.calls.length,0);
 }
});
test('independent associations have independent fingerprints and remain without permission',async()=>{
 const f=fixture();f.output=result();f.output.associacoes.push({...f.output.associacoes[0],objeto:'energia'});
 await loadWorker(f.fetch)(req());const saved=f.calls.find(x=>x.name==='dn_aprendizado_checkpoint').body.p_resultado;
 assert.notEqual(saved.associacoes[0].fingerprint,saved.associacoes[1].fingerprint);
 assert(saved.associacoes.every(x=>!x.uso_permitido && !x.estado_humano));
});
