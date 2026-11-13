const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
function browser({pending=true,fail=false,online=true,session=true}={}) {
 const f={checks:0,invocations:0,listeners:{},intervals:[],label:{textContent:''},session:session?{user:{id:'owner'}}:null,fail};
 const query={neq(){return this},lte(){return this},limit(){f.checks++;return Promise.resolve({data:pending?[{id:'job'}]:[],error:null});}};
 let resolveCall;
 const client={from:()=>({select:()=>query}),functions:{invoke:async()=>{f.invocations++;if(f.fail)return {error:new Error('offline')};if(f.invocations===1)await new Promise(r=>resolveCall=r);return {data:{processed:f.invocations===1?1:0}};}}};
 const window={DN_APP_API:{getClient:()=>client,getSession:()=>f.session},dispatchEvent(){},addEventListener:(name,fn)=>f.listeners[name]=fn};
 const document={hidden:false,querySelector:()=>f.label,addEventListener:(name,fn)=>f.listeners[name]=fn};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'dn-learning.js'),'utf8'),{window,document,navigator:{onLine:online},CustomEvent:class{},setInterval:fn=>f.intervals.push(fn)});
 f.api=window.DN_LEARNING;f.release=()=>resolveCall?.();return f;
}
test('save notifications coalesce into one worker loop and show status',async()=>{
 const f=browser();await new Promise(setImmediate);
 const p=f.api.kick(),q=f.api.kick();assert.equal(p,q);assert.equal(f.checks,1);assert.equal(f.invocations,1);
 f.release();await p;assert.equal(f.invocations,2);assert.equal(f.api.getState().status,'em_dia');assert.match(f.label.textContent,/em dia/);
});
test('empty queue does not invoke the Edge Function',async()=>{
 const f=browser({pending:false});await f.api.kick();assert.equal(f.invocations,0);assert.equal(f.api.getState().status,'em_dia');
});
test('offline and signed out sessions never read the queue or invoke a worker',async()=>{
 for(const options of [{online:false},{session:false}]) {const f=browser(options);await f.api.kick();assert.equal(f.checks,0);assert.equal(f.invocations,0);}
});
test('failure remains pending and next interval automatically retries',async()=>{
 const f=browser({fail:true});await f.api.kick();assert.equal(f.api.getState().status,'pendente');assert.match(f.label.textContent,/registros estão salvos/);
 await f.intervals[0]();await f.api.kick();assert.equal(f.invocations,2);
});
test('switching accounts stops an in-flight drain',async()=>{
 const f=browser();await new Promise(setImmediate);const pending=f.api.kick();f.session={user:{id:'other'}};f.release();await pending;assert.equal(f.invocations,1);
});
test('database trigger is the common boundary for app, Copilot, timeline and external imports',()=>{
 const sql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20261112220000_aprendizado_continuo.sql'),'utf8');
 for(const input of ['texto','ditado','audio_ia'])assert(sql.includes(`'${input}'`));
 assert(sql.includes('after insert on public.registros'));assert(sql.includes('on conflict do nothing'));assert(sql.includes('for update skip locked'));
 assert(!/insert into public\.(tarefas|tasks)/i.test(sql));
 const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');assert.equal((app.match(/new CustomEvent\('dn:record-saved'\)/g)||[]).length,2);
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');assert(html.includes('src="dn-learning.js?'));
});
test('human correction retains provenance and invalidates the old automatic classification',async()=>{
 const original={aspecto:'objeto:chave:local',valor:'mesa',aprendizado_automatico:true,extracao_id:'job'};let saved;
 const query={select(){return this},eq(){return this},update(patch){saved=patch;return this},single:async()=>({data:saved||{metadata_json:original},error:null})};
 const client={from:()=>query},window={DN_APP_API:{getClient:()=>client,getSession:()=>({user:{id:'owner'}})}};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(ROOT,'dn-memory.js'),'utf8'),{window,document});
 await window.DN_MEMORY.update('memory',{texto:'Minha chave fica na gaveta',metadata_json:{reason:'corrigido'}},'edicao_usuario');
 assert.equal(saved.origem,'correcao_explicitamente_lembrada');assert.equal(saved.confirmed_by_user,true);
 assert.equal(saved.metadata_json.extracao_id,'job');assert.equal(saved.metadata_json.aspecto,'objeto:chave:local');
 assert.equal(saved.metadata_json.aprendizado_automatico,undefined);assert.equal(saved.metadata_json.valor,undefined);assert.equal(saved.metadata_json.reason,'corrigido');
});
